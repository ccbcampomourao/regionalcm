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
const CAMPOS_I = ['nome', 'instrumento', 'cidade', 'bairro', 'cargo', 'grupo'];
const CAMPOS_C = ['data', 'ocasiao', 'local', 'obs', 'tipo', 'grupos', 'cidade', 'presidente', 'hino', 'capitulo', 'livro', 'regente', 'hinos'];
const CAMPOS_L = ['nome', 'total'];

// Link da chamada (para quem não tem cadastro): o que essa pessoa pode fazer
const CARGOS_LINK = ['Ancião', 'Diácono', 'Cooperador do Ofício Ministerial', 'Cooperador de Jovens e Menores', 'Encarregado Regional', 'Encarregado Local', 'Examinadora'];
const GRUPOS_MIN = ['Ministério', 'Encarregados', 'Examinadoras'];
const normal0 = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// mesmo critério da tela (presenca-musical.js): grupo pelo cargo, quando não foi escolhido
function grupoDoCargo(cargo) {
  const c = normal0(cargo);
  if (/ancia|diacon|cooperador/.test(c)) return 'Ministério';
  if (/encarregad/.test(c)) return 'Encarregados';
  if (/instrutor/.test(c)) return 'Instrutores';
  if (/examinador/.test(c)) return 'Examinadoras';
  if (/organista/.test(c)) return 'Organistas';
  return 'Músicos';
}
const grupoDe = d => d.grupo || grupoDoCargo(d.cargo);
const normal = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const txt = (v, max) => String(v == null ? '' : v).slice(0, max || 200);
const idOk = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);
function so(campos, lista) {
  const o = {};
  if (campos && typeof campos === 'object') lista.forEach(k => { if (k in campos) o[k] = txt(campos[k], k === 'obs' || k === 'hinos' ? 500 : 200); });
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
      // Ensaio Regional: músicos contados por localidade (total e quantidade de cada instrumento)
      this.sql.exec('CREATE TABLE IF NOT EXISTS locais (c TEXT NOT NULL, id TEXT NOT NULL, dados TEXT NOT NULL, PRIMARY KEY (c, id))');
      // links de chamada para quem não tem cadastro (código -> chamada)
      this.sql.exec('CREATE TABLE IF NOT EXISTS links (code TEXT PRIMARY KEY, c TEXT NOT NULL, criado INTEGER)');
      // quem marcou (pelo link): só quem marcou pelo link pode desmarcar a própria marcação
      try { this.sql.exec("ALTER TABLE marcas ADD COLUMN por TEXT DEFAULT ''"); } catch (e) { /* já tem */ }
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
    this.sql.exec('DELETE FROM irmaos'); this.sql.exec('DELETE FROM chamadas'); this.sql.exec('DELETE FROM marcas'); this.sql.exec('DELETE FROM locais');
    (Array.isArray(db.irmaos) ? db.irmaos : []).forEach(i => {
      if (!i || !idOk(i.id)) return;
      this.sql.exec('INSERT OR REPLACE INTO irmaos (id, dados) VALUES (?, ?)', i.id, JSON.stringify(so(i, CAMPOS_I)));
    });
    (Array.isArray(db.chamadas) ? db.chamadas : []).forEach(c => {
      if (!c || !idOk(c.id)) return;
      this.sql.exec('INSERT OR REPLACE INTO chamadas (id, dados) VALUES (?, ?)', c.id, JSON.stringify(so(c, CAMPOS_C)));
      Object.keys(c.marcas || {}).forEach(i => { if (idOk(i) && c.marcas[i] === 'v') this.sql.exec('INSERT OR IGNORE INTO marcas (c, i) VALUES (?, ?)', c.id, i); });
      (Array.isArray(c.locais) ? c.locais : []).forEach((l, n) => { if (l && idOk(l.id)) this.gravarLocal(c.id, l.id, so(l, CAMPOS_L), l.inst, n); });
    });
  }

  tudo() {
    const marcas = {};
    for (const r of this.sql.exec('SELECT c, i FROM marcas')) (marcas[r.c] = marcas[r.c] || {})[r.i] = 'v';
    const irmaos = [...this.sql.exec('SELECT id, dados FROM irmaos')].map(r => Object.assign({ id: r.id }, JSON.parse(r.dados)));
    const locais = {};
    for (const r of this.sql.exec('SELECT c, id, dados FROM locais')) (locais[r.c] = locais[r.c] || []).push(Object.assign({ id: r.id }, JSON.parse(r.dados)));
    Object.values(locais).forEach(l => l.sort((a, b) => (a.ord || 0) - (b.ord || 0)));
    const links = {};
    for (const r of this.sql.exec('SELECT code, c FROM links')) links[r.c] = r.code;
    const chamadas = [...this.sql.exec('SELECT id, dados FROM chamadas')].map(r => Object.assign({ id: r.id }, JSON.parse(r.dados), { marcas: marcas[r.id] || {}, locais: locais[r.id] || [] }, links[r.id] ? { link: links[r.id] } : {}));
    return { versao: 2, atualizado: +(this.meta('atualizado') || 0), irmaos, chamadas };
  }

  // o que quem entra pelo link vê: só aquela chamada e o ministério (nada dos músicos por nome)
  tudoLink(c, cliente) {
    const r = this.sql.exec('SELECT dados FROM chamadas WHERE id = ?', c).toArray();
    if (!r.length) return null;
    const ch = JSON.parse(r[0].dados);
    const irmaos = [...this.sql.exec('SELECT id, dados FROM irmaos')].map(x => Object.assign({ id: x.id }, JSON.parse(x.dados)))
      .filter(i => GRUPOS_MIN.includes(grupoDe(i)))
      .map(i => ({ id: i.id, nome: i.nome, cargo: i.cargo || '', cidade: i.cidade || '', bairro: i.bairro || '', grupo: grupoDe(i) }));
    const marcas = {};
    for (const m of this.sql.exec('SELECT i, por FROM marcas WHERE c = ?', c)) marcas[m.i] = m.por && m.por === cliente ? 'meu' : 'v';
    const locais = [...this.sql.exec('SELECT id, dados FROM locais WHERE c = ?', c)].map(x => Object.assign({ id: x.id }, JSON.parse(x.dados))).sort((a, b) => (a.ord || 0) - (b.ord || 0));
    return { chamada: { id: c, data: ch.data || '', ocasiao: ch.ocasiao || '', local: ch.local || '', tipo: ch.tipo || 'nomes' }, irmaos, marcas, locais };
  }

  // pelo link só vale: marcar presença (desmarcar só o que o próprio aparelho marcou),
  // acrescentar alguém do ministério (sem mudar quem já está) e contar músicos por localidade
  permitidoLink(op, eu, troca) {
    if (!op || typeof op !== 'object') return null;
    if (op.t === 'm') {
      const i = troca[op.i] || op.i;
      if (op.c !== eu.c || !idOk(i)) return null;
      if (!op.v) {
        const m = this.sql.exec('SELECT por FROM marcas WHERE c = ? AND i = ?', op.c, i).toArray();
        if (!m.length || m[0].por !== eu.cliente) return m.length ? { t: 'm', c: op.c, i, v: 1, corr: 1 } : null;
      }
      return { t: 'm', c: op.c, i, v: op.v ? 1 : 0 };
    }
    if (op.t === 'i') {
      if (!idOk(op.id) || this.existe('irmaos', op.id)) return null;   // quem já está não muda
      const cp = op.campos || {}, nome = txt(cp.nome, 120).replace(/\s+/g, ' ').trim();
      if (!nome) return null;
      const cargo = CARGOS_LINK.includes(cp.cargo) ? cp.cargo : 'Ancião';
      // mesmo nome já cadastrado: usa quem já está
      for (const x of this.sql.exec('SELECT id, dados FROM irmaos')) { if (normal(JSON.parse(x.dados).nome) === normal(nome)) { troca[op.id] = x.id; return null; } }
      return { t: 'i', id: op.id, campos: { nome, cargo, grupo: grupoDoCargo(cargo), instrumento: '', cidade: txt(cp.cidade, 80), bairro: txt(cp.bairro, 80) } };
    }
    if (op.t === 'l') { if (op.c !== eu.c) return null; return op; }
    return null;
  }
  // o que repassar para quem está pelo link
  paraLink(ops, eu) {
    const out = [];
    let fechar = false;
    ops.forEach(op => {
      if ((op.t === 'm' || op.t === 'mc' || op.t === 'l' || op.t === 'l-') && op.c === eu.c) out.push(op.t === 'm' ? Object.assign({}, op, { meu: op.pc && op.pc === eu.cliente ? 1 : 0 }) : op);
      else if (op.t === 'c' && op.id === eu.c) out.push({ t: 'c', id: op.id, campos: so(op.campos, ['data', 'ocasiao', 'local', 'tipo']) });
      else if (op.t === 'i') {
        const r = this.sql.exec('SELECT dados FROM irmaos WHERE id = ?', op.id).toArray();
        if (r.length) { const d = JSON.parse(r[0].dados); out.push(GRUPOS_MIN.includes(grupoDe(d)) ? { t: 'i', id: op.id, campos: { nome: d.nome || '', cargo: d.cargo || '', cidade: d.cidade || '', bairro: d.bairro || '', grupo: grupoDe(d) } } : { t: 'i-', id: op.id }); }
      } else if (op.t === 'i-') out.push(op);
      else if ((op.t === 'c-' && op.id === eu.c) || (op.t === 'link-' && op.c === eu.c)) fechar = true;
      else if (op.t === 'tudo') fechar = 'tudo';
    });
    return { out, fechar };
  }

  // uma localidade do Ensaio Regional: junta só o que veio (nome, total, e os instrumentos que mudaram)
  gravarLocal(c, id, campos, inst, ord) {
    const r = this.sql.exec('SELECT dados FROM locais WHERE c = ? AND id = ?', c, id).toArray();
    const d = r.length ? JSON.parse(r[0].dados) : { nome: '', total: '', inst: {}, ord: ord != null ? ord : Date.now() };
    Object.assign(d, campos || {});
    d.inst = d.inst || {};
    if (inst && typeof inst === 'object') Object.keys(inst).slice(0, 80).forEach(k => {
      const nome = txt(k, 40).trim(); if (!nome) return;
      const n = Math.max(0, Math.min(9999, parseInt(inst[k], 10) || 0));
      if (n) d.inst[nome] = n; else delete d.inst[nome];
    });
    this.sql.exec('INSERT INTO locais (c, id, dados) VALUES (?, ?, ?) ON CONFLICT(c, id) DO UPDATE SET dados = excluded.dados', c, id, JSON.stringify(d));
  }

  existe(tab, id) { return this.sql.exec(`SELECT 1 FROM ${tab} WHERE id = ?`, id).toArray().length > 0; }
  mesclar(tab, id, campos) {
    const r = this.sql.exec(`SELECT dados FROM ${tab} WHERE id = ?`, id).toArray();
    const dados = Object.assign(r.length ? JSON.parse(r[0].dados) : {}, campos);
    this.sql.exec(`INSERT INTO ${tab} (id, dados) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET dados = excluded.dados`, id, JSON.stringify(dados));
  }

  // Aplica uma mudança e devolve a versão "limpa" dela (ou null se não vale).
  // semRede: a mudança foi feita com o aparelho SEM internet. Nesse caso ela só pode
  // ACRESCENTAR presença: tirar alguém de presente (ou limpar a chamada) não vale, porque
  // a pessoa não estava vendo o que os outros marcaram. A sala devolve a presença certa
  // para esse aparelho (op com corr: 1), para a tela dele voltar a ficar igual à de todos.
  aplicar(op, semRede, eu) {
    eu = eu || {};
    if (!op || typeof op !== 'object') return null;
    switch (op.t) {
      case 'm': {   // marca / desmarca presente
        if (!idOk(op.c) || !idOk(op.i) || !this.existe('chamadas', op.c)) return null;
        if (!op.v && semRede) {
          const tem = this.sql.exec('SELECT 1 FROM marcas WHERE c = ? AND i = ?', op.c, op.i).toArray().length > 0;
          return tem ? { t: 'm', c: op.c, i: op.i, v: 1, corr: 1 } : null;
        }
        const pc = eu.link ? eu.cliente : '';
        if (op.v) this.sql.exec("INSERT OR IGNORE INTO marcas (c, i, por) VALUES (?, ?, ?)", op.c, op.i, pc);
        else this.sql.exec('DELETE FROM marcas WHERE c = ? AND i = ?', op.c, op.i);
        // pc = quem fica como "dono" da marcação (o primeiro que marcou pelo link)
        const dono = op.v ? ((this.sql.exec('SELECT por FROM marcas WHERE c = ? AND i = ?', op.c, op.i).toArray()[0] || {}).por || '') : '';
        return { t: 'm', c: op.c, i: op.i, v: op.v ? 1 : 0, pc: dono };
      }
      case 'mc': {  // todas as marcações de uma chamada (limpar / desfazer)
        if (!idOk(op.c) || !this.existe('chamadas', op.c)) return null;
        const lista = (Array.isArray(op.lista) ? op.lista : []).filter(idOk);
        if (semRede) {   // sem internet: só acrescenta; devolve como a chamada ficou
          lista.forEach(i => this.sql.exec('INSERT OR IGNORE INTO marcas (c, i) VALUES (?, ?)', op.c, i));
          const atual = [...this.sql.exec('SELECT i FROM marcas WHERE c = ?', op.c)].map(x => x.i);
          return { t: 'mc', c: op.c, lista: atual, corr: 1 };
        }
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
        this.sql.exec('DELETE FROM locais WHERE c = ?', op.id);
        this.sql.exec('DELETE FROM links WHERE c = ?', op.id);
        return { t: 'c-', id: op.id };
      }
      case 'l': {   // localidade do Ensaio Regional: nome, total e instrumentos (só o que mudou)
        if (!idOk(op.c) || !idOk(op.id) || !this.existe('chamadas', op.c)) return null;
        const campos = so(op.campos, CAMPOS_L);
        const inst = {};
        if (op.inst && typeof op.inst === 'object') Object.keys(op.inst).slice(0, 80).forEach(k => { inst[txt(k, 40)] = Math.max(0, Math.min(9999, parseInt(op.inst[k], 10) || 0)); });
        this.gravarLocal(op.c, op.id, campos, inst, op.ord);
        return { t: 'l', c: op.c, id: op.id, campos, inst, ord: op.ord };
      }
      case 'l-': {
        if (!idOk(op.c) || !idOk(op.id)) return null;
        this.sql.exec('DELETE FROM locais WHERE c = ? AND id = ?', op.c, op.id);
        return { t: 'l-', c: op.c, id: op.id };
      }
      case 'link': {  // cria (ou devolve) o link desta chamada
        if (eu.link || !idOk(op.c) || !this.existe('chamadas', op.c)) return null;
        let r = this.sql.exec('SELECT code FROM links WHERE c = ?', op.c).toArray();
        let code = r.length ? r[0].code : null;
        if (!code) { code = crypto.randomUUID().replace(/-/g, '').slice(0, 22); this.sql.exec('INSERT INTO links (code, c, criado) VALUES (?, ?, ?)', code, op.c, Date.now()); }
        return { t: 'link', c: op.c, code, corr: 1 };
      }
      case 'link-': {
        if (eu.link || !idOk(op.c)) return null;
        this.sql.exec('DELETE FROM links WHERE c = ?', op.c);
        return { t: 'link-', c: op.c, corr: 1 };
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
    const codigo = request.headers.get('X-Link');
    let c = null;
    if (codigo) {   // link da chamada: confere antes de tudo (410 = desativado)
      const r = this.sql.exec('SELECT c FROM links WHERE code = ?', codigo).toArray();
      if (!r.length) return new Response('Link desativado', { status: 410 });
      c = r[0].c;
    } else if (url.pathname.endsWith('/estado')) return Response.json({ ok: true, seq: this.seq(), db: this.tudo() });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Esperava WebSocket', { status: 426 });
    const par = new WebSocketPair();
    const [cliente, servidor] = Object.values(par);
    this.ctx.acceptWebSocket(servidor);
    servidor.serializeAttachment(codigo
      ? { email: 'pelo link', link: codigo, c, cliente: txt(url.searchParams.get('cliente'), 40), desde: Date.now() }
      : { email, cliente: txt(url.searchParams.get('cliente'), 40), desde: Date.now() });
    return new Response(null, { status: 101, webSocket: cliente });
  }

  gente(exceto) {
    return this.ctx.getWebSockets().filter(ws => ws !== exceto).map(ws => { try { return ws.deserializeAttachment() || {}; } catch (e) { return {}; } })
      .filter(a => a.email).map(a => ({ email: a.email, cliente: a.cliente, desde: a.desde }));
  }
  espalhar(msg, exceto) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exceto) continue;
      let a = {}; try { a = ws.deserializeAttachment() || {}; } catch (e) {}
      try {
        if (!a.link) { ws.send(s); continue; }
        if (msg.t === 'gente') { ws.send(JSON.stringify({ t: 'gente', n: msg.lista.length })); continue; }
        if (msg.t !== 'mudou') continue;
        const { out, fechar } = this.paraLink(msg.ops || [], a);
        if (fechar === 'tudo') { const d = this.tudoLink(a.c, a.cliente); if (d) ws.send(JSON.stringify(Object.assign({ t: 'tudo' }, d))); else ws.close(4410, 'link'); continue; }
        if (fechar) { ws.send(JSON.stringify({ t: 'fim' })); ws.close(4410, 'link'); continue; }
        if (out.length || (msg.cliente && msg.cliente === a.cliente)) ws.send(JSON.stringify({ t: 'mudou', lote: msg.cliente === a.cliente ? msg.lote : null, ops: out }));
      } catch (e) {}
    }
  }

  async webSocketMessage(ws, data) {
    let msg; try { msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)); } catch (e) { return; }
    const eu = (() => { try { return ws.deserializeAttachment() || {}; } catch (e) { return {}; } })();

    if (eu.link) {
      // pelo link: confere se o link ainda vale
      const ok = this.sql.exec('SELECT c FROM links WHERE code = ?', eu.link).toArray();
      if (!ok.length) { ws.send(JSON.stringify({ t: 'fim' })); ws.close(4410, 'link'); return; }
      if (msg.t === 'ola') {
        const d = this.tudoLink(eu.c, eu.cliente);
        if (!d) { ws.send(JSON.stringify({ t: 'fim' })); ws.close(4410, 'link'); return; }
        ws.send(JSON.stringify(Object.assign({ t: 'tudo' }, d)));
        this.espalhar({ t: 'gente', lista: this.gente() });
        return;
      }
      if (msg.t === 'ops' && Array.isArray(msg.ops)) {
        const troca = {}, limpas = [];
        msg.ops.slice(0, 200).forEach(op => { const x = this.permitidoLink(op, eu, troca); if (x) limpas.push(x); });
        msg = { t: 'ops', lote: msg.lote, off: msg.off, ops: limpas };
      } else return;
    }

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
          const ok = op.corr ? op : this.aplicar(op, !!msg.off, eu); if (!ok) return;
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
      // quem criou/desativou o link só interessa a quem tem cadastro
      this.espalhar({ t: 'mudou', lote: msg.lote || null, cliente: eu.cliente || null, ops: feitas, seq });
      if (feitas.some(o => o.t === 'link-')) {
        const fora = feitas.filter(o => o.t === 'link-').map(o => o.c);
        for (const w of this.ctx.getWebSockets()) { let a = {}; try { a = w.deserializeAttachment() || {}; } catch (e) {} if (a.link && fora.includes(a.c)) { try { w.send(JSON.stringify({ t: 'fim' })); w.close(4410, 'link'); } catch (e) {} } }
      }
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
