// Lista de Presença Musical "ao vivo": várias pessoas fazendo a chamada ao mesmo tempo.
//
// Um Durable Object (com SQLite) guarda a lista e é o único lugar que grava, um pedido
// de cada vez — por isso duas pessoas marcando ao mesmo tempo nunca se atropelam.
// Cada tela fica ligada por WebSocket e manda SÓ o que mudou ("fulano presente na chamada X"),
// e a sala repassa essa mudança para quem mais estiver com a lista aberta.
//
// Para gastar pouco:
// - WebSocket com hibernação: parado, a sala dorme e não conta tempo;
//   o "ping" de manter a ligação é respondido sem acordar a sala;
// - cada marcação é uma mensagem pequena (a Cloudflare conta 20 mensagens como 1 pedido);
// - a cópia no KV (a mesma de "Carregar da nuvem" e dos backups) é gravada no máximo
//   a cada 5 minutos, e só se algo mudou.
import { DurableObject } from 'cloudflare:workers';
import { salvarListaJSON, carregarListaJSON } from '../functions/_utils/listasStore.js';

const REGIAO = 'presencamusical';
const ARQ = '_presenca_musical';
const MAX_LOG = 3000;              // mudanças guardadas para quem volta (reconexão sem baixar tudo)
const BACKUP_MS = 5 * 60 * 1000;   // cópia no KV
const CAMPOS_I = ['nome', 'instrumento', 'cidade', 'bairro', 'cargo'];
const CAMPOS_C = ['data', 'ocasiao', 'local', 'obs'];

const txt = (v, max) => String(v == null ? '' : v).slice(0, max || 200);
const idOk = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);
function so(campos, lista) {
  const o = {};
  if (campos && typeof campos === 'object') lista.forEach(k => { if (k in campos) o[k] = txt(campos[k], k === 'obs' ? 500 : 200); });
  return o;
}

export class SalaPresencaMusical extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec('CREATE TABLE IF NOT EXISTS irmaos (id TEXT PRIMARY KEY, dados TEXT NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS chamadas (id TEXT PRIMARY KEY, dados TEXT NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS marcas (c TEXT NOT NULL, i TEXT NOT NULL, PRIMARY KEY (c, i))');
      this.sql.exec('CREATE TABLE IF NOT EXISTS log (seq INTEGER PRIMARY KEY, op TEXT NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
      if (!this.meta('iniciado')) {
        // primeira vez: começa com a lista que já estava salva na nuvem
        try { this.importar(JSON.parse(await carregarListaJSON(env, REGIAO, ARQ + '.json'))); } catch (e) { /* ainda não havia lista */ }
        this.setMeta('seq', '0');
        this.setMeta('iniciado', String(Date.now()));
      }
    });
    // "ping" de manter a ligação: respondido sem acordar a sala (não conta tempo)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  meta(k) { const r = this.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray(); return r.length ? r[0].v : null; }
  setMeta(k, v) { this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, String(v)); }
  seq() { return +(this.meta('seq') || 0); }

  importar(db) {
    db = db && typeof db === 'object' ? db : {};
    this.sql.exec('DELETE FROM irmaos'); this.sql.exec('DELETE FROM chamadas'); this.sql.exec('DELETE FROM marcas');
    (Array.isArray(db.irmaos) ? db.irmaos : []).forEach(i => {
      if (!i || !idOk(i.id)) return;
      this.sql.exec('INSERT OR REPLACE INTO irmaos (id, dados) VALUES (?, ?)', i.id, JSON.stringify(so(i, CAMPOS_I)));
    });
    (Array.isArray(db.chamadas) ? db.chamadas : []).forEach(c => {
      if (!c || !idOk(c.id)) return;
      this.sql.exec('INSERT OR REPLACE INTO chamadas (id, dados) VALUES (?, ?)', c.id, JSON.stringify(so(c, CAMPOS_C)));
      Object.keys(c.marcas || {}).forEach(i => { if (idOk(i) && c.marcas[i] === 'v') this.sql.exec('INSERT OR IGNORE INTO marcas (c, i) VALUES (?, ?)', c.id, i); });
    });
  }

  tudo() {
    const marcas = {};
    for (const r of this.sql.exec('SELECT c, i FROM marcas')) (marcas[r.c] = marcas[r.c] || {})[r.i] = 'v';
    const irmaos = [...this.sql.exec('SELECT id, dados FROM irmaos')].map(r => Object.assign({ id: r.id }, JSON.parse(r.dados)));
    const chamadas = [...this.sql.exec('SELECT id, dados FROM chamadas')].map(r => Object.assign({ id: r.id }, JSON.parse(r.dados), { marcas: marcas[r.id] || {} }));
    return { versao: 2, atualizado: +(this.meta('atualizado') || 0), irmaos, chamadas };
  }

  existe(tab, id) { return this.sql.exec(`SELECT 1 FROM ${tab} WHERE id = ?`, id).toArray().length > 0; }
  mesclar(tab, id, campos) {
    const r = this.sql.exec(`SELECT dados FROM ${tab} WHERE id = ?`, id).toArray();
    const dados = Object.assign(r.length ? JSON.parse(r[0].dados) : {}, campos);
    this.sql.exec(`INSERT INTO ${tab} (id, dados) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET dados = excluded.dados`, id, JSON.stringify(dados));
  }

  // Aplica uma mudança e devolve a versão "limpa" dela (ou null se não vale)
  aplicar(op) {
    if (!op || typeof op !== 'object') return null;
    switch (op.t) {
      case 'm': {   // marca / desmarca presente
        if (!idOk(op.c) || !idOk(op.i) || !this.existe('chamadas', op.c)) return null;
        if (op.v) this.sql.exec('INSERT OR IGNORE INTO marcas (c, i) VALUES (?, ?)', op.c, op.i);
        else this.sql.exec('DELETE FROM marcas WHERE c = ? AND i = ?', op.c, op.i);
        return { t: 'm', c: op.c, i: op.i, v: op.v ? 1 : 0 };
      }
      case 'mc': {  // todas as marcações de uma chamada (limpar / desfazer)
        if (!idOk(op.c) || !this.existe('chamadas', op.c)) return null;
        const lista = (Array.isArray(op.lista) ? op.lista : []).filter(idOk);
        this.sql.exec('DELETE FROM marcas WHERE c = ?', op.c);
        lista.forEach(i => this.sql.exec('INSERT OR IGNORE INTO marcas (c, i) VALUES (?, ?)', op.c, i));
        return { t: 'mc', c: op.c, lista };
      }
      case 'i': {   // irmão: novo ou só os campos que mudaram
        if (!idOk(op.id)) return null;
        const campos = so(op.campos, CAMPOS_I);
        this.mesclar('irmaos', op.id, campos);
        return { t: 'i', id: op.id, campos };
      }
      case 'i-': {
        if (!idOk(op.id)) return null;
        this.sql.exec('DELETE FROM irmaos WHERE id = ?', op.id);
        this.sql.exec('DELETE FROM marcas WHERE i = ?', op.id);
        return { t: 'i-', id: op.id };
      }
      case 'c': {   // chamada: nova ou só os campos que mudaram
        if (!idOk(op.id)) return null;
        const campos = so(op.campos, CAMPOS_C);
        this.mesclar('chamadas', op.id, campos);
        return { t: 'c', id: op.id, campos };
      }
      case 'c-': {
        if (!idOk(op.id)) return null;
        this.sql.exec('DELETE FROM chamadas WHERE id = ?', op.id);
        this.sql.exec('DELETE FROM marcas WHERE c = ?', op.id);
        return { t: 'c-', id: op.id };
      }
      case 'tudo': { // abrir backup / carregar arquivo: troca a lista inteira
        this.importar(op.db);
        return { t: 'tudo', db: this.tudo() };
      }
    }
    return null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const email = request.headers.get('X-Email') || 'alguém';
    if (url.pathname.endsWith('/estado')) return Response.json({ ok: true, seq: this.seq(), db: this.tudo() });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Esperava WebSocket', { status: 426 });
    const par = new WebSocketPair();
    const [cliente, servidor] = Object.values(par);
    this.ctx.acceptWebSocket(servidor);
    servidor.serializeAttachment({ email, cliente: txt(url.searchParams.get('cliente'), 40), desde: Date.now() });
    return new Response(null, { status: 101, webSocket: cliente });
  }

  gente(exceto) {
    return this.ctx.getWebSockets().filter(ws => ws !== exceto).map(ws => { try { return ws.deserializeAttachment() || {}; } catch (e) { return {}; } })
      .filter(a => a.email).map(a => ({ email: a.email, cliente: a.cliente, desde: a.desde }));
  }
  espalhar(msg, exceto) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) { if (ws === exceto) continue; try { ws.send(s); } catch (e) {} }
  }

  async webSocketMessage(ws, data) {
    let msg; try { msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)); } catch (e) { return; }
    const eu = (() => { try { return ws.deserializeAttachment() || {}; } catch (e) { return {}; } })();

    if (msg.t === 'ola') {
      // quem chega (ou volta): manda só o que mudou desde a última vez, ou a lista inteira
      const seq = this.seq(), desde = +msg.desde || 0;
      const menor = this.sql.exec('SELECT MIN(seq) AS s FROM log').toArray()[0].s;
      if (desde > 0 && desde <= seq && (desde === seq || (menor != null && desde >= menor - 1))) {
        const ops = [...this.sql.exec('SELECT op FROM log WHERE seq > ? ORDER BY seq', desde)].map(r => JSON.parse(r.op));
        ws.send(JSON.stringify({ t: 'mudou', ops, seq }));
      } else {
        ws.send(JSON.stringify({ t: 'tudo', db: this.tudo(), seq }));
      }
      this.espalhar({ t: 'gente', lista: this.gente() });
      return;
    }

    if (msg.t === 'ops' && Array.isArray(msg.ops)) {
      const feitas = [];
      let seq = this.seq();
      this.ctx.storage.transactionSync(() => {
        msg.ops.slice(0, 2000).forEach(op => {
          const ok = this.aplicar(op); if (!ok) return;
          seq++;
          const reg = Object.assign(ok, { seq, por: eu.email || '' });
          // a troca da lista inteira não fica no histórico (é grande): quem voltar recebe "tudo"
          this.sql.exec('INSERT INTO log (seq, op) VALUES (?, ?)', seq, JSON.stringify(ok.t === 'tudo' ? { t: 'nada', seq } : reg));
          feitas.push(reg);
        });
        if (feitas.some(o => o.t === 'tudo')) this.sql.exec('DELETE FROM log');
        this.setMeta('seq', seq);
        if (feitas.length) { this.setMeta('atualizado', Date.now()); this.setMeta('ultimoPor', eu.email || ''); }
        if (seq % 200 === 0) this.sql.exec('DELETE FROM log WHERE seq <= ?', seq - MAX_LOG);
      });
      // confirma para quem mandou (mesmo se nada valeu) e repassa para todos
      this.espalhar({ t: 'mudou', lote: msg.lote || null, cliente: eu.cliente || null, ops: feitas, seq });
      if (feitas.length && (await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + BACKUP_MS);
    }
  }

  async webSocketClose(ws) {
    try { ws.close(1000, 'tchau'); } catch (e) {}
    this.espalhar({ t: 'gente', lista: this.gente(ws) }, ws);
  }
  async webSocketError(ws) { this.webSocketClose(ws); }

  // cópia no KV (usada por "Carregar da nuvem", backups e por quem ainda estiver sem o modo ao vivo)
  async alarm() {
    const por = this.meta('ultimoPor') || '';
    await salvarListaJSON(this.env, REGIAO, ARQ, JSON.stringify(this.tudo()), por ? por + ' (ao vivo)' : 'ao vivo');
  }
}
