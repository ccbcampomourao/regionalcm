/* =====================================================================
   Lista de Presença Musical
   - Irmãos: cadastro (nome, instrumento, cidade, bairro), importado do
     "Relatório de Membros" do sistema musical (PDF) ou digitado.
   - Chamadas: cada ensaio/reunião com data e ocasião; marca só quem está Presente
     (quem não foi marcado conta como Ausente).
   - Resumo: quantas vezes cada irmão esteve presente / ausente.
   - PDF: lista em branco para marcar à mão ou com as marcações da chamada.
   Salva neste aparelho na hora; na nuvem só quando você manda (como as Atas).
   ===================================================================== */
'use strict';
const KEY = 'ccb_presenca_musical';
const REGIAO = 'presencamusical';
const ARQ_NUVEM = '_presenca_musical';
const CIDADE_PADRAO = 'Campo Mourão';   // quem vem do relatório só com o bairro
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

const ICO = n => `<svg class="ic" aria-hidden="true"><use href="/assets/icons.svg#i-${n}"></use></svg>`;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const novoId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
// na ordem do relatório do Ensaio Regional
const INSTRUMENTOS = ['Violino', 'Viola', 'Violoncelo', 'Flauta', 'Clarinete', 'Clarinete Alto', 'Clarinete Baixo', 'Oboé', "Oboé d'Amore", 'Corne Inglês', 'Fagote', 'Saxofone Soprano', 'Saxofone Alto', 'Saxofone Tenor', 'Saxofone Barítono', 'Saxofone Baixo', 'Trompete', 'Cornet', 'Flugelhorn', 'Trompa', 'Trombone', 'Trombonito', 'Euphonium', 'Tuba', 'Acordeon', 'Órgão'];
const OCASIOES = ['Ensaio Regional', 'Ensaio Local', 'Reunião de Músicos', 'Reunião de Encarregados', 'Culto Oficial', 'Batismo', 'Santa Ceia', 'Teste de Músicos'];
/* subcategorias: cada irmão está num grupo; cada chamada diz quais grupos entram */
const GRUPOS = ['Ministério', 'Encarregados', 'Instrutores', 'Examinadoras', 'Organistas', 'Músicos'];
const GRUPOS_REGIONAL = ['Ministério', 'Encarregados', 'Examinadoras'];   // no Ensaio Regional, nome por nome só eles
const ordemGrupo = g => { const k = GRUPOS.indexOf(g); return k < 0 ? 50 : k; };
function grupoDoCargo(cargo) {
  const c = norm(cargo);
  if (/ancia|diacon|cooperador/.test(c)) return 'Ministério';
  if (/encarregad/.test(c)) return 'Encarregados';
  if (/instrutor/.test(c)) return 'Instrutores';
  if (/examinador/.test(c)) return 'Examinadoras';
  if (/organista/.test(c)) return 'Organistas';
  return 'Músicos';
}
// ordem do ministério no Ensaio Regional (subcategorias pelo cargo)
const CARGOS_MIN = [['Ancião', 'Anciães'], ['Diácono', 'Diáconos'], ['Cooperador do Ofício Ministerial', 'Cooperadores do Ofício Ministerial'], ['Cooperador de Jovens e Menores', 'Cooperadores de Jovens e Menores'], ['Encarregado Regional', 'Encarregados Regionais'], ['Encarregado Local', 'Encarregados Locais'], ['Examinadora', 'Examinadoras']];
const ordemCargo = cg => { const k = CARGOS_MIN.findIndex(([s]) => norm(s) === norm(cg)); return k < 0 ? 50 : k; };
const cargoPlural = cg => { const x = CARGOS_MIN.find(([s]) => norm(s) === norm(cg)); return x ? x[1] : (cg || 'Outros'); };
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const partes = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
const dataBR = iso => { const p = partes(iso); return p ? `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}` : ''; };
const dataLonga = iso => { const p = partes(iso); if (!p) return 'Sem data'; const dt = new Date(p.y, p.m - 1, p.d); return `${p.d} de ${MESES[p.m - 1]} de ${p.y}`; };
const diaSemana = iso => { const p = partes(iso); return p ? DIAS[new Date(p.y, p.m - 1, p.d).getDay()] : ''; };
const PART = new Set(['da', 'de', 'do', 'das', 'dos', 'e', "d'"]);
function nomeBonito(s) {
  s = String(s || '').replace(/´/g, "'").replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.toLowerCase().split(' ').map((w, i) => (i > 0 && PART.has(w)) ? w : w.replace(/^(\p{L})/u, c => c.toUpperCase()).replace(/'(\p{L})/u, (m, c) => "'" + c.toUpperCase())).join(' ').replace(/\bD'oeste\b/i, "D'Oeste");
}
const ordemNome = (a, b) => norm(a.nome).localeCompare(norm(b.nome), 'pt-BR');

/* ---------- dados ---------- */
let DB, ABA = 'cham', SEL = null, PENDENTE = false, NUVEM_EM = null;
let FILTRO = { q: '', instr: '', so: '', loc: '' }, BUSCA_IRM = '', RES_ANO = '';
function normalizar(d) {
  d = d && typeof d === 'object' ? d : {};
  const antiga = (d.versao || 1) < 2;
  const db = { versao: 2, atualizado: d.atualizado || 0, irmaos: [], chamadas: [] };
  db.irmaos = (Array.isArray(d.irmaos) ? d.irmaos : []).map(i => {
    const n = Object.assign({ id: novoId(), nome: '', instrumento: '', cidade: '', bairro: '', cargo: '' }, i);
    // versão 1: quem veio do relatório só com o bairro é de Campo Mourão
    if (antiga && !String(n.cidade || '').trim() && String(n.bairro || '').trim()) n.cidade = CIDADE_PADRAO;
    if (!String(n.grupo || '').trim()) n.grupo = grupoDoCargo(n.cargo);
    return n;
  });
  db.chamadas = (Array.isArray(d.chamadas) ? d.chamadas : []).map(c => {
    const n = Object.assign({ id: novoId(), data: '', ocasiao: '', local: '', obs: '', tipo: 'nomes', grupos: '', marcas: {}, locais: [], cidade: '', presidente: '', hino: '', capitulo: '', livro: '', regente: '', hinos: '', toca: {} }, c);
    const m = n.marcas && typeof n.marcas === 'object' ? n.marcas : {};
    n.marcas = {};   // só "presente" é marcado; quem não está aqui é ausente
    Object.keys(m).forEach(k => { if (m[k] === 'v') n.marcas[k] = 'v'; });
    n.tipo = n.tipo === 'regional' ? 'regional' : 'nomes';
    // quem marcou cada presença ("email|aparelho"; vem da sala, não é enviado por aqui)
    const d0 = n.donos && typeof n.donos === 'object' ? n.donos : {}; n.donos = {};
    Object.keys(d0).forEach(k => { if (n.marcas[k] && typeof d0[k] === 'string') n.donos[k] = d0[k]; });
    // Ensaio Regional: instrumento (e localidade) de quem é do ministério e tocou
    const t0 = n.toca && typeof n.toca === 'object' ? n.toca : {}; n.toca = {};
    Object.keys(t0).forEach(k => { const x = t0[k] || {}, inst = String(x.inst || '').trim(), loc = String(x.loc || '').trim(); if (inst || loc) n.toca[k] = { inst, loc }; });
    n.grupos = String(n.grupos || '');
    n.locais = (Array.isArray(n.locais) ? n.locais : []).map((l, k) => {
      const o = { id: (l && l.id) || novoId(), nome: String((l && l.nome) || ''), total: l && l.total != null && l.total !== '' ? String(l.total) : '', inst: {}, ord: (l && l.ord) || k + 1 };
      Object.keys((l && l.inst) || {}).forEach(i => { const v = parseInt(l.inst[i], 10) || 0; if (v > 0) o.inst[i] = v; });
      return o;
    }).sort((a, b) => a.ord - b.ord);
    return n;
  });
  return db;
}
function ler() { try { const t = localStorage.getItem(KEY); if (t) return normalizar(JSON.parse(t)); } catch (e) {} return normalizar({}); }
const CHAM = () => DB.chamadas.find(c => c.id === SEL) || null;
const irmaosOrdenados = () => DB.irmaos.slice().sort(ordemNome);
const EM_CHAM = () => ABA === 'cham' || ABA === 'reg';
const TIPO_ABA = () => ABA === 'reg' ? 'regional' : 'nomes';
const maisRecente = (t = TIPO_ABA()) => { const l = DB.chamadas.filter(c => c.tipo === t).slice().sort((a, b) => String(b.data).localeCompare(String(a.data))); return l[0] ? l[0].id : null; };
const gruposUsados = () => [...new Set(DB.irmaos.map(i => i.grupo || 'Músicos'))].sort((a, b) => ordemGrupo(a) - ordemGrupo(b) || a.localeCompare(b, 'pt-BR'));
// grupos que entram nesta chamada (vazio = todos, menos o Ministério)
const gruposDa = c => c.tipo === 'regional' ? GRUPOS_REGIONAL : (c.grupos ? c.grupos.split('|').filter(Boolean) : gruposUsados().filter(g => g !== 'Ministério'));
const participa = (c, i) => gruposDa(c).includes(i.grupo || 'Músicos');
// irmãos desta chamada, por subcategoria e em ordem alfabética dentro dela
function irmaosDa(c) {
  const lst = DB.irmaos.filter(i => participa(c, i));
  if (c.tipo === 'regional') return lst.sort((a, b) => ordemGrupo(a.grupo) - ordemGrupo(b.grupo) || ordemCargo(a.cargo) - ordemCargo(b.cargo) || ordemNome(a, b));
  return lst.sort((a, b) => ordemGrupo(a.grupo) - ordemGrupo(b.grupo) || String(a.grupo).localeCompare(String(b.grupo), 'pt-BR') || ordemNome(a, b));
}
const subcat = (c, i) => c.tipo === 'regional' ? cargoPlural(i.cargo) : (i.grupo || 'Músicos');
const somaInst = l => Object.values(l.inst || {}).reduce((a, b) => a + (+b || 0), 0);
const totalLocal = l => String(l.total || '').trim() !== '' && !isNaN(+l.total) ? +l.total : somaInst(l);
function contar(c) {
  let v = 0, t = 0;
  DB.irmaos.forEach(i => { if (!participa(c, i)) return; t++; if (c.marcas[i.id] === 'v') v++; });
  const k = { v, n: t - v, t };   // n = ausentes (todos os não marcados)
  if (c.tipo === 'regional') {
    const d = relDados(c); k.musicos = d.tot;
    k.locs = (c.locais || []).filter(l => l.nome.trim() || totalLocal(l)).length;
  }
  return k;
}
const localTxt = i => [i.cidade, i.bairro].filter(x => String(x || '').trim()).join(' · ');

/* ---------- salvar ----------
   Normalmente a lista é "ao vivo" (veja mais abaixo): cada mudança vai sozinha, só ela.
   Se o servidor ainda não tiver o modo ao vivo, vale o jeito de antes:
   neste aparelho na hora; na nuvem só quando você manda (Salvar na nuvem / Ctrl+S).
   Antes de salvar confere se outra pessoa salvou depois (e quem); presenca.js mostra quem
   mais está com a lista aberta. */
let _tSalvar = null, REV = 0, SALVANDO = false, ERRO_NUVEM = '', NOVA = null, ATUALIZADO_AO_ABRIR = 0;
const BASE_KEY = KEY + '_base';
const lerBase = () => { try { return +(localStorage.getItem(BASE_KEY) || 0) || 0; } catch (e) { return 0; } };
const gravarBase = v => { try { localStorage.setItem(BASE_KEY, String(v || 0)); } catch (e) {} };
const temSessao = () => { try { return !!localStorage.getItem('session_token'); } catch (e) { return false; } };
const porTxt = e => e ? String(e).split('@')[0] : '';
function gravarLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(DB)); localStorage.setItem(KEY + '_seq', String(typeof VIVO !== 'undefined' ? VIVO.seq : 0)); if (PENDENTE) localStorage.setItem(KEY + '_pend', '1'); else localStorage.removeItem(KEY + '_pend'); }
  catch (e) { UI.toast('O navegador não deixou guardar neste aparelho (falta espaço). Salve na nuvem para não perder.', 'error'); }
}
function guardar() {
  DB.atualizado = Date.now(); REV++;
  if (aoVivo()) {   // ao vivo: manda só o que mudou, sozinho
    agendarEnvio();
    clearTimeout(_tSalvar); _tSalvar = setTimeout(() => { _tSalvar = null; gravarLocal(); }, 250);
    mostrarEstado(); return;
  }
  PENDENTE = true;
  clearTimeout(_tSalvar); _tSalvar = setTimeout(() => { _tSalvar = null; gravarLocal(); }, 250);
  mostrarEstado();
}
function quandoTxt(ms) { if (!ms) return ''; const d = new Date(ms), h = new Date(); const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); return d.toDateString() === h.toDateString() ? 'hoje às ' + hora : d.toLocaleDateString('pt-BR') + ' às ' + hora; }
function mostrarEstado() {
  const el = document.getElementById('estado'); if (!el) return;
  const bp = document.getElementById('btnPausa');
  if (bp) { bp.hidden = !aoVivo() || VIVO.modo === 'sessao'; bp.innerHTML = VIVO.pausa ? `${ICO('refresh')}Ligar o tempo real (para todos)` : `${ICO('pause')}Desligar o tempo real (para todos)`; }
  if (aoVivo() && VIVO.pausa) {
    const n = ESPELHO ? diferencas(ESPELHO, DB).length + VIVO.fila.reduce((k, l) => k + l.ops.length, 0) : 0;
    el.className = 'estado pend';
    el.innerHTML = `${ICO('pause')}<span><b>Tempo real desligado</b>${n ? ` · ${n} ${n === 1 ? 'mudança' : 'mudanças'} para enviar` : ''} — toque para ligar</span>`;
    el.title = 'Desligado para todos (inclusive o link de convidado): o que você faz fica guardado neste aparelho e não gasta nada do servidor. Ao ligar de novo, vai tudo de uma vez e você recebe o que os outros mudaram.';
    el.setAttribute('role', 'button'); el.tabIndex = 0;
    return;
  }
  if (aoVivo()) {
    const aberto = VIVO.ws && VIVO.ws.readyState === 1 && VIVO.abriu, esp = VIVO.fila.reduce((n, l) => n + l.ops.length, 0);
    const nomes = [...new Set(VIVO.gente.map(g => porTxt(g.email)))];
    let cls, h, acao = false;
    if (VIVO.modo === 'sessao') { cls = 'pend'; h = `${ICO('alert')}<span><b>Sessão terminou</b> — toque para entrar de novo</span>`; acao = true; }
    else if (aberto) {
      cls = 'vivo';
      h = `<i class="pt" aria-hidden="true"></i>${nomes.length ? `<em class="nq" aria-hidden="true">+${nomes.length}</em>` : ''}<span><b>Ao vivo</b>${nomes.length ? ` <span class="quem">· com ${esc(nomes.slice(0, 3).join(', '))}${nomes.length > 3 ? ` e mais ${nomes.length - 3}` : ''}</span>` : ''}${esp ? ' <span class="quem">· enviando…</span>' : ''}</span>`;
      el.title = (nomes.length ? 'Também estão nesta lista: ' + nomes.join(', ') + '. ' : '') + 'O que cada um marca aparece na hora para todos e fica salvo sozinho.';
    } else if (VIVO.tent > 0 || VIVO.fila.length) {
      cls = 'lig'; acao = true;
      h = `<i class="pt" aria-hidden="true"></i><span><b>Sem conexão</b>${esp ? ` — ${esp} ${esp === 1 ? 'mudança esperando' : 'mudanças esperando'}` : ''} · vai sozinho quando voltar</span>`;
    } else { cls = 'lig'; h = `<i class="pt" aria-hidden="true"></i><span><b>Conectando…</b></span>`; }
    el.className = 'estado ' + cls; el.innerHTML = h;
    el.setAttribute('role', acao ? 'button' : 'status'); el.tabIndex = acao ? 0 : -1;
    return;
  }
  let cls = '', ic = 'check-circle', txt;
  if (SALVANDO) { cls = 'salv'; ic = 'spinner'; txt = '<b>Salvando na nuvem…</b>'; }
  else if (NOVA && !PENDENTE) { cls = 'pend'; ic = 'cloud-down'; txt = '<b>Há versão mais nova na nuvem</b> — toque para carregar'; }
  else if (PENDENTE && ERRO_NUVEM) { cls = 'pend'; ic = 'alert'; txt = '<b>Não salvou na nuvem</b> — toque para tentar de novo'; }
  else if (PENDENTE) { cls = 'pend'; ic = 'alert'; txt = '<b>Alterações só neste aparelho</b> — salve na nuvem'; }
  else txt = `<b>Salvo na nuvem</b>${NUVEM_EM ? ' · ' + quandoTxt(NUVEM_EM) : ''}`;
  el.className = 'estado' + (cls ? ' ' + cls : '');
  el.innerHTML = `${ICO(ic)}<span>${txt}</span>`;
  const acao = PENDENTE || NOVA;
  el.setAttribute('role', acao ? 'button' : 'status'); el.tabIndex = acao ? 0 : -1;
}
function cliqueEstado() { if (!temSessao() || VIVO.modo === 'sessao') { location.href = '/login.html'; return; } if (aoVivo() && VIVO.pausa) { pausarVivo(false); return; } if (aoVivo()) { VIVO.tent = 0; ligarVivo(); return; } if (PENDENTE) salvarNuvem(); else if (NOVA) carregarNuvem(true); }

async function api(rota, corpo) {
  const res = await fetch('/api/' + rota, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ token: localStorage.getItem('session_token'), regiao: REGIAO }, corpo || {})) });
  let d = {}; try { d = await res.json(); } catch (e) {}
  if (!res.ok) { const er = new Error(d.error || 'erro de comunicação com o servidor (' + res.status + ')'); er.status = res.status; throw er; }
  return d;
}
async function infoNuvem(entrar) {
  let i = null;
  if (window.Presenca) i = entrar ? await Presenca.entrar(REGIAO, ARQ_NUVEM) : await Presenca.info();
  if (i && i.modificado) return { existe: true, modificado: i.modificado, por: i.por };
  const lst = (await api('lista-list')).arquivos || [];
  const a = lst.find(x => x.nome === ARQ_NUVEM + '.json');
  return a ? { existe: true, modificado: a.modificado, por: a.por || null } : { existe: false };
}
async function trazerDaNuvem(info, avisar) {
  const d = await api('lista-load', { nome: ARQ_NUVEM + '.json' });
  const antes = JSON.stringify(DB);
  DB = normalizar(typeof d.conteudo === 'string' ? JSON.parse(d.conteudo) : d.conteudo);
  PENDENTE = false; ERRO_NUVEM = ''; NOVA = null; REV++;
  gravarBase(info && info.modificado); NUVEM_EM = info ? info.modificado : NUVEM_EM; gravarLocal();
  if (!CHAM()) SEL = maisRecente();
  desenharTudo();
  if (avisar) UI.toast('Lista carregada da nuvem.', { type: 'ok', action: { label: 'Desfazer', icon: 'undo', fn: () => { DB = normalizar(JSON.parse(antes)); guardar(); desenharTudo(); } } });
}
async function salvarNuvem() {
  if (aoVivo()) { UI.toast('Esta lista salva sozinha: o que cada um marca já aparece para todos.', 'info'); return; }
  if (SALVANDO) return;
  if (!temSessao()) { UI.toast('Sua sessão terminou. Entre de novo para salvar na nuvem.', { type: 'error', action: { label: 'Entrar', icon: 'arrow-right', fn: () => { location.href = '/login.html'; } } }); return; }
  const fim = UI.busy(document.getElementById('btnNuvemSalvar'), 'Salvando...');
  SALVANDO = true; mostrarEstado();
  const rev = REV;
  try {
    const info = await infoNuvem(false);
    const base = lerBase();
    const legado = !base && info.existe && ATUALIZADO_AO_ABRIR > info.modificado;
    if (info.existe && info.modificado > base && !legado) {
      SALVANDO = false; mostrarEstado();
      const quem = info.por ? `<b>${esc(info.por)}</b> salvou` : 'Alguém salvou';
      const v = await UI.dialog({
        title: 'Outra pessoa salvou a lista', icon: 'alert',
        body: `<p class="ui-modal__p">${quem} a lista de presença na nuvem <b>${esc(quandoTxt(info.modificado))}</b>, depois da versão que está neste aparelho.</p><p class="ui-modal__p">Se você salvar agora, o que essa pessoa salvou será substituído pelo que está aqui.</p>`,
        actions: [{ label: 'Cancelar', value: null }, { label: 'Carregar a da nuvem', value: 'nuvem', icon: 'cloud-down' }, { label: 'Substituir pela minha', value: 'aqui', primary: true, icon: 'cloud-up' }]
      });
      if (v === 'nuvem') { await trazerDaNuvem(info, true); return; }
      if (v !== 'aqui') return;
      SALVANDO = true; mostrarEstado();
    }
    const r = await api('lista-save', { nome: ARQ_NUVEM, conteudo: JSON.stringify(DB) });
    const mod = Math.max((r && r.modificado) || Date.now(), lerBase());
    NUVEM_EM = mod; gravarBase(mod); ERRO_NUVEM = ''; NOVA = null;
    if (REV === rev) PENDENTE = false;
    gravarLocal();
    const outros = window.Presenca ? Presenca.outros() : [];
    UI.toast('Lista de presença salva na nuvem.' + (outros.length ? ` Atenção: ${outros.map(o => porTxt(o.email)).join(', ')} também está com a lista aberta.` : ''), outros.length ? { type: 'info', duration: 9000 } : 'ok');
  } catch (e) {
    ERRO_NUVEM = e.message || 'erro';
    UI.toast('Não foi possível salvar na nuvem: ' + ERRO_NUVEM + ' O que está na tela continua guardado neste aparelho.', { type: 'error', action: { label: 'Tentar de novo', icon: 'refresh', fn: () => salvarNuvem() } });
  } finally { SALVANDO = false; fim(); mostrarEstado(); }
}
async function carregarNuvem(manual) {
  try {
    if (!temSessao()) { mostrarEstado(); return; }
    const info = await infoNuvem(!manual);
    if (!info.existe) { if (manual) UI.toast('Ainda não há lista salva na nuvem.', 'info'); NUVEM_EM = null; NOVA = null; mostrarEstado(); return; }
    NUVEM_EM = info.modificado || null;
    const vazio = !DB.irmaos.length && !DB.chamadas.length;
    if (!manual) {
      if (info.modificado <= lerBase()) { NOVA = null; mostrarEstado(); return; }
      if (vazio && !PENDENTE) { await trazerDaNuvem(info, false); return; }
      NOVA = info; mostrarEstado();
      UI.toast(`Há uma versão mais nova da lista na nuvem${info.por ? ', salva por ' + porTxt(info.por) : ''} ${quandoTxt(info.modificado)}.`, { type: 'info', duration: 15000, action: { label: 'Carregar', icon: 'cloud-down', fn: () => carregarNuvem(true) } });
      return;
    }
    if (PENDENTE && !(await UI.confirm('Trocar pelo que está na nuvem?', 'Este aparelho tem alterações que ainda não foram salvas na nuvem. Elas serão substituídas.', { ok: 'Trocar', danger: true }))) return;
    await trazerDaNuvem(info, true);
  } catch (e) { if (manual) UI.toast('Não foi possível acessar a nuvem: ' + e.message, 'error'); }
  mostrarEstado();
}
function aoSair() { if (_tSalvar) { clearTimeout(_tSalvar); _tSalvar = null; gravarLocal(); } }
window.addEventListener('pagehide', aoSair);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') aoSair(); });
window.addEventListener('beforeunload', e => { aoSair(); if (!aoVivo() && PENDENTE && temSessao()) { e.preventDefault(); e.returnValue = ''; } });
function baixarBackup() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(DB, null, 1)], { type: 'application/json' }));
  a.download = `presenca-musical-${hojeISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function abrirBackup(ev) {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result); if (!d || !Array.isArray(d.irmaos)) throw new Error('não é um backup da lista de presença');
      const antes = JSON.stringify(DB); DB = normalizar(d); SEL = maisRecente(); guardar(); desenharTudo();
      UI.toast(`Backup aberto: ${DB.irmaos.length} irmãos e ${DB.chamadas.length} chamadas.${aoVivo() ? ' Já foi para todos.' : ' Salve na nuvem para os outros verem.'}`, { type: 'ok', action: { label: 'Desfazer', icon: 'undo', fn: () => { DB = normalizar(JSON.parse(antes)); guardar(); desenharTudo(); } } });
    } catch (e) { UI.toast('Não foi possível abrir: ' + e.message, 'error'); }
  };
  r.readAsText(f);
}

/* ---------- importar o "Relatório de Membros" (PDF do sistema musical) ---------- */
async function leitorPDF() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((ok, err) => { const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js'; s.onload = ok; s.onerror = () => err(new Error('não consegui abrir o leitor de PDF (é preciso internet)')); document.head.appendChild(s); });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
  return window.pdfjsLib;
}
// separa "CENTRO - ARARUNA", "PEABIRU - CONJUNTO X", "BR 14-0172 CENTRO - CAMPO MOURÃO" e "Jardim Aurora"
function separarLocal(s) {
  s = String(s || '').replace(/´/g, "'").replace(/^BR\s*\d+-\d+\s*/i, '').trim();
  const m = s.match(/^(.+?)\s+-\s+(.+)$/);
  if (m) {
    const [a, b] = [m[1].trim(), m[2].trim()];
    if (/^centro$/i.test(a)) return { cidade: nomeBonito(b), bairro: 'Centro' };
    if (!/^(jardim|jd|vila|parque|conjunto|distrito|residencial|bairro|centro)\b/i.test(a)) return { cidade: nomeBonito(a), bairro: nomeBonito(b) };
  }
  return { cidade: CIDADE_PADRAO, bairro: nomeBonito(s) };   // só o bairro: é de Campo Mourão
}
async function lerRelatorioPDF(arquivo) {
  const lib = await leitorPDF();
  const pdf = await lib.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  const out = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    const its = tc.items.filter(i => String(i.str).trim()).map(i => ({ s: String(i.str).trim(), x: i.transform[4], y: i.transform[5] }));
    const cab = k => its.find(i => norm(i.s) === k);
    const hN = cab('nome'), hI = cab('instrumento'), hL = cab('localidade'), hC = its.find(i => /^cargo/.test(norm(i.s))), hV = its.find(i => /^nivel/.test(norm(i.s)));
    if (!hN || !hI || !hL) continue;
    const cols = [['nome', hN.x], ['instrumento', hI.x], ['local', hL.x], ['cargo', hC ? hC.x : 1e9], ['nivel', hV ? hV.x : 1e9]];
    const linhas = [];
    its.filter(i => i.y < hN.y - 2).forEach(i => { let l = linhas.find(l => Math.abs(l.y - i.y) < 3); if (!l) { l = { y: i.y, its: [] }; linhas.push(l); } l.its.push(i); });
    linhas.sort((a, b) => b.y - a.y).forEach(l => {
      const r = {};
      l.its.sort((a, b) => a.x - b.x).forEach(i => { let c = cols[0][0]; cols.forEach(([k, x]) => { if (i.x >= x - 3) c = k; }); r[c] = ((r[c] || '') + ' ' + i.s).trim(); });
      if (!r.nome || /^total\b/i.test(r.nome) || !r.instrumento) return;
      // localidade comprida "grudada" no cargo no PDF ("JARDIM CASTELO BRANCOMÚSICO")
      const gr = String(r.local || '').match(/^(.*?)\s*(M[ÚU]SICO|INSTRUTORA?|ENCARREGADO (?:LOCAL|REGIONAL)|ORGANISTA|EXAMINADORA)$/i);
      if (gr && !r.cargo) { r.local = gr[1]; r.cargo = gr[2]; }
      const loc = separarLocal(r.local);
      out.push({ nome: nomeBonito(r.nome), instrumento: nomeBonito(r.instrumento), cidade: loc.cidade, bairro: loc.bairro, cargo: nomeBonito(r.cargo || '') });
    });
  }
  return out;
}
async function importarPDF(ev) {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  let lst;
  try { UI.toast('Lendo o relatório…', 'info'); lst = await lerRelatorioPDF(f); }
  catch (e) { UI.toast('Não consegui ler o PDF: ' + e.message, 'error'); return; }
  if (!lst.length) { UI.toast('Não achei irmãos neste PDF. Ele precisa ser o “Relatório de Membros” do sistema musical (com as colunas Nome, Instrumento e Localidade).', 'error'); return; }
  const porNome = new Map(DB.irmaos.map(i => [norm(i.nome), i]));
  const vistos = new Set(); let novos = 0, mudou = 0;
  lst.forEach(r => { const k = norm(r.nome); if (vistos.has(k)) return; vistos.add(k); const i = porNome.get(k); if (!i) novos++; else if (['instrumento', 'cidade', 'bairro', 'cargo'].some(c => r[c] && r[c] !== i[c])) mudou++; });
  const fora = DB.irmaos.filter(i => !vistos.has(norm(i.nome))).length;
  const ok = await UI.confirm('Importar o relatório?',
    `${vistos.size} irmãos no PDF: ${novos} ${novos === 1 ? 'novo' : 'novos'}${mudou ? `, ${mudou} com instrumento ou localidade atualizados` : ''}.` + (fora ? ` ${fora} que já estavam aqui não aparecem no PDF e continuam na lista.` : '') + ' As marcações das chamadas não mudam.',
    { ok: 'Importar' });
  if (!ok) return;
  const antes = JSON.stringify(DB);
  const vis2 = new Set();
  lst.forEach(r => {
    const k = norm(r.nome); if (vis2.has(k)) return; vis2.add(k);
    const i = porNome.get(k);
    if (i) {
      const auto = !i.grupo || i.grupo === grupoDoCargo(i.cargo);
      ['instrumento', 'cidade', 'bairro', 'cargo'].forEach(c => { if (r[c]) i[c] = r[c]; });
      if (auto) i.grupo = grupoDoCargo(i.cargo);
    } else DB.irmaos.push(Object.assign({ id: novoId(), grupo: grupoDoCargo(r.cargo) }, r));
  });
  guardar(); desenharTudo();
  UI.toast(`Relatório importado: ${DB.irmaos.length} irmãos na lista.`, { type: 'ok', action: { label: 'Desfazer', icon: 'undo', fn: () => { DB = normalizar(JSON.parse(antes)); guardar(); desenharTudo(); } } });
}

/* ---------- Relatório de Igrejas: ministério, encarregados e localidades ---------- */
const REG_IGR = { campomourao: 'Campo Mourão', cianorte: 'Cianorte', ubirata: 'Ubiratã', pitanga: 'Pitanga', goioere: 'Goioerê', ivaipora: 'Ivaiporã' };
let REL_IGR = null, REL_DADOS = null, _relLendo = null;
// lê o relatório de cada região a que a pessoa tem acesso (do aparelho ou da nuvem, o mais novo)
async function lerRelatorios() {
  const out = [];
  for (const r of Object.keys(REG_IGR)) {
    let loc = null, nuv = null;
    try { loc = JSON.parse(localStorage.getItem('ccb_igrejas_' + r) || 'null'); } catch (e) {}
    if (temSessao()) { try { const d = await api('lista-load', { regiao: r, nome: '_igrejas.json' }); nuv = typeof d.conteudo === 'string' ? JSON.parse(d.conteudo) : d.conteudo; } catch (e) {} }
    const ok = d => d && Array.isArray(d.igrejas) && d.igrejas.length;
    const d = ok(loc) && (!ok(nuv) || (loc.atualizado || 0) >= (nuv.atualizado || 0)) ? loc : ok(nuv) ? nuv : null;
    if (d) out.push(...d.igrejas);
  }
  return out;
}
const nomeLocalidade = g => [nomeBonito(g.cidade || ''), nomeBonito(g.nome || '')].filter(Boolean).filter((x, k, l) => k === 0 || norm(x) !== norm(l[0])).join(' - ');
async function carregarRelatorio(forcar) {
  if (REL_DADOS && !forcar) return REL_DADOS;
  if (!_relLendo) _relLendo = lerRelatorios().then(igs => { REL_DADOS = igs; REL_IGR = igs.map(nomeLocalidade).filter(Boolean); atualizarDatalists(); return igs; }).finally(() => { _relLendo = null; });
  return _relLendo;
}
async function puxarMinisterio() {
  const igs = await carregarRelatorio(true);
  if (!igs.length) { UI.toast('Não achei o Relatório de Igrejas (nem neste aparelho, nem na nuvem). Abra o Relatório de Igrejas uma vez, ou peça acesso a ele.', 'error'); return; }
  const CAMPOS = [['anciaes', 'Ancião', 'Ministério'], ['diaconos', 'Diácono', 'Ministério'], ['coopOficio', 'Cooperador do Ofício Ministerial', 'Ministério'], ['coopJovens', 'Cooperador de Jovens e Menores', 'Ministério'], ['encRegionais', 'Encarregado Regional', 'Encarregados'], ['encLocais', 'Encarregado Local', 'Encarregados'], ['examinadoras', 'Examinadora', 'Examinadoras']];
  const achados = new Map();   // nome -> {cargo, grupo, cidade, bairro} (fica o cargo mais alto)
  igs.forEach(g => CAMPOS.forEach(([k, cargo, grupo], ord) => (g[k] || []).forEach(n => {
    n = nomeBonito(String(n || '').replace(/\s+/g, ' ').trim()); if (!n) return;
    const ant = achados.get(norm(n));
    if (!ant || ord < ant.ord) achados.set(norm(n), { nome: n, cargo, grupo, ord, cidade: nomeBonito(g.cidade || ''), bairro: nomeBonito(g.nome || '') });
  })));
  if (!achados.size) { UI.toast('O Relatório de Igrejas ainda não tem ministério nem encarregados.', 'info'); return; }
  const porNome = new Map(DB.irmaos.map(i => [norm(i.nome), i]));
  let novos = 0, mudou = 0;
  achados.forEach((a, k) => { const i = porNome.get(k); if (!i) novos++; else if (i.cargo !== a.cargo || i.grupo !== a.grupo) mudou++; });
  if (!novos && !mudou) { UI.toast(`O ministério já está igual ao Relatório de Igrejas (${achados.size}).`, 'ok'); return; }
  if (!(await UI.confirm('Puxar do Relatório de Igrejas?', `${achados.size} do ministério e encarregados no relatório: ${novos} ${novos === 1 ? 'novo' : 'novos'}${mudou ? `, ${mudou} com cargo ou grupo atualizado` : ''}. Ninguém é apagado.`, { ok: 'Puxar' }))) return;
  const antes = JSON.stringify(DB);
  achados.forEach((a, k) => {
    const i = porNome.get(k);
    if (i) { i.cargo = a.cargo; i.grupo = a.grupo; if (!i.cidade) i.cidade = a.cidade; if (!i.bairro) i.bairro = a.bairro; }
    else DB.irmaos.push({ id: novoId(), nome: a.nome, instrumento: '', cidade: a.cidade, bairro: a.bairro, cargo: a.cargo, grupo: a.grupo });
  });
  guardar(); semPular(desenharTudo); atualizarDatalists();
  UI.toast(`Ministério e encarregados puxados do Relatório de Igrejas: ${achados.size}.`, { type: 'ok', action: { label: 'Desfazer', icon: 'undo', fn: () => { DB = normalizar(JSON.parse(antes)); guardar(); desenharTudo(); } } });
}

/* ---------- abas e lista lateral ---------- */
function togMenu(ev, id) { ev.stopPropagation(); const m = document.getElementById(id); const ab = m.classList.contains('open'); document.querySelectorAll('.menu.open').forEach(x => x.classList.remove('open')); if (!ab) m.classList.add('open'); }
document.addEventListener('click', e => { document.querySelectorAll('.menu.open').forEach(m => { if (!m.contains(e.target) || e.target.closest('.menu-box button')) m.classList.remove('open'); }); });
function mudarAba(a) {
  ABA = a;
  document.querySelectorAll('.abas [data-aba]').forEach(b => b.classList.toggle('on', b.dataset.aba === a));
  document.getElementById('abaCham').hidden = !EM_CHAM();
  if (EM_CHAM()) { const c = CHAM(); if (!c || c.tipo !== TIPO_ABA()) SEL = maisRecente(); FILTRO.instr = ''; FILTRO.loc = ''; }
  document.getElementById('abaIrm').hidden = a !== 'irm';
  document.getElementById('abaRes').hidden = a !== 'res';
  try { localStorage.setItem(KEY + '_aba', a); } catch (e) {}
  desenharTudo();
  if (window.AppBar && AppBar.atualizar) AppBar.atualizar();
}
function desenharTudo() {
  if (EM_CHAM()) { desenharLista(); desenharChamada(); }
  else if (ABA === 'irm') desenharIrmaos();
  else desenharResumo();
  mostrarEstado();
}
function desenharLista() {
  const el = document.getElementById('lista');
  const reg = ABA === 'reg';
  const l = DB.chamadas.filter(c => c.tipo === TIPO_ABA()).sort((a, b) => String(b.data || '9').localeCompare(String(a.data || '9')));
  const bn = document.getElementById('btNova'); if (bn) bn.lastChild.textContent = reg ? 'Novo ensaio regional' : 'Nova chamada';
  const sm = document.getElementById('selMovel');   // no celular a lista lateral vira esta caixa
  if (sm) sm.innerHTML = l.length ? `<select onchange="abrirChamada(this.value)" aria-label="Chamada">${l.map(c => `<option value="${c.id}"${c.id === SEL ? ' selected' : ''}>${esc(dataBR(c.data) || 'Sem data')} · ${esc(c.ocasiao || 'Chamada')}</option>`).join('')}</select><button type="button" class="primary" onclick="novaChamada()">${ICO('plus')}Nova</button>` : '';
  if (!l.length) { el.innerHTML = reg ? '<div class="vazio">Nenhum ensaio regional ainda.<br>Use “Novo ensaio regional”.</div>' : '<div class="vazio">Nenhuma chamada nome por nome ainda.<br>Use “Nova chamada”.</div>'; return; }
  let h = '', ano = null;
  l.forEach(c => {
    const y = c.data ? c.data.slice(0, 4) : 'Sem data';
    if (y !== ano) { ano = y; h += `<div class="ano-h">${esc(y)}</div>`; }
    const k = contar(c), p = partes(c.data);
    h += `<button type="button" class="it${c.id === SEL ? ' on' : ''}" onclick="abrirChamada('${c.id}')"><span class="tp">${p ? String(p.d).padStart(2, '0') + '/' + String(p.m).padStart(2, '0') : '—'}</span><span class="it-n">${esc(c.ocasiao || 'Chamada')}</span><small>${c.tipo === 'regional' ? `${k.v} do ministério · ${k.musicos} ${k.musicos === 1 ? 'músico' : 'músicos'} · ${k.locs} ${k.locs === 1 ? 'localidade' : 'localidades'}` : `${k.v} ${k.v === 1 ? 'presente' : 'presentes'} · ${k.n} ${k.n === 1 ? 'ausente' : 'ausentes'}`}</small></button>`;
  });
  el.innerHTML = h;
}
function abrirChamada(id) { SEL = id; try { localStorage.setItem(KEY + '_sel', id); } catch (e) {} desenharTudo(); if (innerWidth < 980) window.scrollTo({ top: 0, behavior: 'smooth' }); }
function novaChamada() {
  if (!EM_CHAM()) ABA = 'cham';
  const tipo = TIPO_ABA();
  const ult = DB.chamadas.filter(c => c.tipo === tipo).sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
  const oc = tipo === 'regional' ? 'Ensaio Regional' : (ult ? ult.ocasiao : 'Ensaio Local');
  const c = normalizar({ chamadas: [{ data: hojeISO(), ocasiao: oc, local: ult ? ult.local : '', cidade: ult ? ult.cidade || '' : '', tipo, grupos: ult && tipo === 'nomes' ? ult.grupos : '' }] }).chamadas[0];
  DB.chamadas.push(c); SEL = c.id; guardar();
  mudarAba(ABA);
  if (!DB.irmaos.length) UI.toast('Chamada criada. Agora coloque os irmãos: importe o relatório em “Irmãos” ou acrescente um por um aqui.', 'info');
}
async function excluirChamada() {
  const c = CHAM(); if (!c) return;
  if (!(await UI.confirm('Excluir esta chamada?', `${dataLonga(c.data)} · ${c.ocasiao || 'Chamada'}. As marcações dela serão apagadas.`, { ok: 'Excluir', danger: true }))) return;
  const i = DB.chamadas.indexOf(c); DB.chamadas.splice(i, 1); SEL = maisRecente(); guardar(); desenharTudo();
  UI.toast('Chamada excluída.', { action: { label: 'Desfazer', icon: 'undo', fn: () => { DB.chamadas.splice(i, 0, c); SEL = c.id; guardar(); desenharTudo(); } } });
}

/* ---------- chamada ---------- */
// busca por palavras (em qualquer ordem) no nome, cargo, instrumento e localidade
const palavras = q => norm(q).replace(/[-–·,/]+/g, ' ').split(' ').filter(Boolean);
const casaBusca = (txt, ps) => { const t = norm(txt).replace(/[-–·,/]+/g, ' '); return ps.every(p => t.includes(p)); };
const locDoIrmao = (c, i) => (c && c.tipo === 'regional' && ((c.toca || {})[i.id] || {}).loc) || locPadrao(i);
function filtrar(lst, c) {
  const ps = palavras(FILTRO.q), fl = norm(FILTRO.loc);
  return lst.filter(i => (!FILTRO.instr || i.instrumento === FILTRO.instr)
    && (!fl || norm(locDoIrmao(c, i)) === fl)
    && (!ps.length || casaBusca([i.nome, i.cargo, i.instrumento, i.cidade, i.bairro, locDoIrmao(c, i)].join(' '), ps))
    && (!FILTRO.so || (FILTRO.so === 'v' ? c.marcas[i.id] === 'v' : c.marcas[i.id] !== 'v')));
}
const instrumentosUsados = () => [...new Set(DB.irmaos.map(i => i.instrumento).filter(Boolean))].sort((a, b) => { const ia = INSTRUMENTOS.indexOf(a), ib = INSTRUMENTOS.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'pt-BR'); });
// localidades de quem está na chamada (para filtrar e marcar por localidade)
function opcoesLoc(c) {
  const base = c.tipo === 'regional' ? DB.irmaos.filter(i => catDe(i) >= 0) : irmaosDa(c);
  const m = new Map(); base.forEach(i => { const l = locDoIrmao(c, i); if (l) { const k = norm(l); m.set(k, { nome: (m.get(k) || {}).nome || l, n: ((m.get(k) || {}).n || 0) + 1 }); } });
  const l = [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (FILTRO.loc && !m.has(norm(FILTRO.loc))) FILTRO.loc = '';
  return `<option value="">Todas as localidades</option>${l.map(x => `<option value="${esc(x.nome)}"${norm(x.nome) === norm(FILTRO.loc) ? ' selected' : ''}>${esc(x.nome)} (${x.n})</option>`).join('')}`;
}
const opcoesInst = sel => `<option value="">Não tocou</option>${[...new Set(INSTRUMENTOS.concat(instrumentosUsados(), sel ? [sel] : []))].map(x => `<option${x === sel ? ' selected' : ''}>${esc(x)}</option>`).join('')}`;
function linhaHTML(i, n, c) {
  const p = c.marcas[i.id] === 'v', trav = p && !podeMexer(c, i.id);
  const btP = `<button type="button" class="b-v${p ? ' on' : ''}${trav ? ' trav' : ''}" onclick="marcar('${i.id}')" aria-pressed="${p}"${trav ? ` title="Marcado por ${esc(quemMarcou(c, i.id))}"` : ''}>${ICO(trav ? 'lock' : 'check')}<span>Presente</span></button>`;
  if (c.tipo === 'regional') {
    const t = c.toca[i.id] || {};
    return `<div class="pm-row${p ? ' v' : ''}" data-id="${i.id}">
    <span class="pm-n">${n}</span>
    <div class="pm-nm"><b>${esc(i.nome)}</b><small>${esc(locPadrao(i) || i.cargo) || '&nbsp;'}</small></div>
    <div class="pm-bt">${p ? '' : '<em class="pm-aus">Ausente</em>'}${btP}</div>
    ${p ? `<div class="pm-toca"><select data-xi="${i.id}" aria-label="Instrumento de ${esc(i.nome)}"${trav ? ' disabled' : ''}>${opcoesInst(t.inst || '')}</select><input data-xl="${i.id}" list="dlLocalidades" value="${esc(t.loc || locPadrao(i))}" placeholder="Localidade" aria-label="Localidade de ${esc(i.nome)}"${trav ? ' disabled' : ''}>${trav ? `<span class="tag">${ICO('lock')}marcado por ${esc(quemMarcou(c, i.id))}</span>` : ''}</div>` : ''}
  </div>`;
  }
  return `<div class="pm-row${p ? ' v' : ''}" data-id="${i.id}">
    <span class="pm-n">${n}</span>
    <div class="pm-nm"><b>${esc(i.nome)}</b><small>${esc(c.tipo === 'regional' ? (localTxt(i) || i.cargo) : [i.instrumento, localTxt(i)].filter(Boolean).join(' · ')) || '&nbsp;'}</small></div>
    <div class="pm-bt">${p ? '' : '<em class="pm-aus">Ausente</em>'}${btP}</div>
  </div>`;
}
function desenharChamada() {
  const el = document.getElementById('ed'), c0 = CHAM(), c = c0 && c0.tipo === TIPO_ABA() ? c0 : null;
  if (!c) {
    const rg = ABA === 'reg', tem = DB.chamadas.some(x => x.tipo === TIPO_ABA());
    el.innerHTML = `<div class="vazia"><b>${tem ? (rg ? 'Escolha um ensaio' : 'Escolha uma chamada') : (rg ? 'Nenhum ensaio regional ainda' : 'Nenhuma chamada ainda')}</b>${rg ? 'No ensaio regional você marca a presença do ministério por cargo (e o instrumento de quem tocou) e lança os músicos e organistas por localidade.' : 'Cada chamada é um ensaio ou reunião: escolha a data e marque quem está presente (quem não for marcado fica como ausente).'}${DB.irmaos.length || rg ? '' : '<br>Antes, coloque os irmãos na aba <b>Irmãos</b> (dá para importar o relatório de membros em PDF).'}
      <div class="linha-b"><button type="button" class="primary" onclick="novaChamada()">${ICO('plus')}${rg ? 'Novo ensaio regional' : 'Nova chamada'}</button>${DB.irmaos.length ? '' : `<button type="button" onclick="mudarAba('irm')">${ICO('users')}Irmãos</button>`}</div></div>`;
    return;
  }
  const reg = c.tipo === 'regional';
  const k = contar(c), lst = filtrar(irmaosDa(c), c), instrs = reg ? [] : [...new Set(irmaosDa(c).map(i => i.instrumento).filter(Boolean))].sort((a, b) => { const ia = INSTRUMENTOS.indexOf(a), ib = INSTRUMENTOS.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'pt-BR'); });
  const grupos = gruposUsados(), sel = gruposDa(c);
  el.innerHTML = `
  <section class="heroi">
    <div class="h-l1"><div class="h-tit"><small>${esc(diaSemana(c.data))}</small><h2>${esc(dataLonga(c.data))}</h2><div class="h-sub">${esc([c.ocasiao, c.local].filter(Boolean).join(' · ') || 'Chamada')}</div></div>
      <div class="h-acoes"><button type="button" class="danger" onclick="excluirChamada()">${ICO('trash')}<span class="lbl-md">Excluir</span></button></div></div>
    <div class="pm-cont" id="contagem">${contagemHTML(k, c)}</div>
  </section>
  <section class="bloco"><h3><span class="bi">${ICO('calendar')}</span><span>Dados da chamada</span></h3>
    <div class="grid g4">
      <div class="campo"><label>Data</label><input type="date" data-c="data" value="${esc(c.data)}"></div>
      <div class="campo"><label>Ocasião</label><input data-c="ocasiao" list="dlOcasioes" value="${esc(c.ocasiao)}" placeholder="ex.: Ensaio Regional"></div>
      <div class="campo s2"><label>Local</label><input data-c="local" value="${esc(c.local)}" placeholder="ex.: Central de Campo Mourão"></div>
      <div class="campo s4"><label>Observação <small>(sai no PDF)</small></label><input data-c="obs" value="${esc(c.obs)}" placeholder="Opcional"></div>
      ${reg ? '' : `<div class="campo s4"><label>Quem entra nesta chamada</label><div class="pm-chips">${grupos.map(g => `<button type="button" class="pm-chip${sel.includes(g) ? ' on' : ''}" onclick="alternarGrupo(this.dataset.g)" data-g="${esc(g)}" aria-pressed="${sel.includes(g)}">${sel.includes(g) ? ICO('check') : ''}${esc(g)} <em>${DB.irmaos.filter(i => i.grupo === g).length}</em></button>`).join('')}</div></div>`}
    </div>
  </section>
  ${reg ? blocoLink(c) : ''}
  <section class="bloco"><h3><span class="bi">${ICO('users')}</span><span>${reg ? 'Ministério' : 'Irmãos'}<br><small>${reg ? 'Escolha o ministério, toque em Presente e, se o irmão tocou, escolha o instrumento' : 'Por grupo, em ordem alfabética · toque em Presente; quem não for marcado fica como ausente'}</small></span><em id="emFiltro">${lst.length} de ${k.t}</em></h3>
    ${reg && !k.t ? `<div class="pm-imp">${ICO('users')}<div><b>Ainda não há ministério na lista</b><small>Puxe os anciães, diáconos, cooperadores e encarregados do Relatório de Igrejas (ou acrescente um por um).</small></div><button type="button" class="primary" onclick="puxarMinisterio()">${ICO('refresh')}Puxar do Relatório</button></div>` : ''}
    ${reg ? '<div class="pm-cats" id="pmCats" role="tablist" aria-label="Ministério"></div>' : ''}
    <div class="pm-filtros">
      <div class="pm-busca">${ICO('search')}<input id="busca" type="search" placeholder="Procurar nome ou localidade…" value="${esc(FILTRO.q)}" oninput="FILTRO.q=this.value;desenharLinhas()"></div>
      <select id="fLoc" aria-label="Localidade" onchange="FILTRO.loc=this.value;desenharLinhas()">${opcoesLoc(c)}</select>
      ${instrs.length ? `<select id="fInstr" onchange="FILTRO.instr=this.value;desenharLinhas()"><option value="">Todos os instrumentos</option>${instrs.map(x => `<option${FILTRO.instr === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}
      <div class="pm-seg" role="group">${[['', 'Todos'], ['v', 'Presentes'], ['n', 'Ausentes']].map(([v, r]) => `<button type="button" class="${FILTRO.so === v ? 'on' : ''}" onclick="FILTRO.so='${v}';desenharLinhas()">${r}</button>`).join('')}</div>
    </div>
    <div class="pm-lista" id="linhas"></div>
    ${reg ? `<form class="pm-rapido" onsubmit="event.preventDefault();addMinisterio()" aria-label="Acrescentar alguém do ministério">
      <input id="rNome" placeholder="Nome de quem veio e não está na lista" autocomplete="off" aria-label="Nome">
      <select id="rCargo" aria-label="Cargo">${CATS_MIN.map(([, cg]) => `<option${cg === CATS_MIN[MIN_CAT][1] ? ' selected' : ''}>${esc(cg)}</option>`).join('')}</select>
      <input id="rCid" list="dlCidades" placeholder="Cidade" autocomplete="off" aria-label="Cidade">
      <input id="rBai" list="dlBairros" placeholder="Bairro" autocomplete="off" aria-label="Bairro">
      <button type="submit" class="primary">${ICO('check')}Acrescentar presente</button>
    </form>` : ''}
    <div class="linha-b">
      ${reg ? '' : `<button type="button" onclick="abrirNovoIrmao()">${ICO('plus')}Irmão que não está na lista</button>`}
      ${reg ? `<button type="button" onclick="puxarMinisterio()">${ICO('refresh')}Atualizar do Relatório de Igrejas</button>` : ''}
      <button type="button" onclick="limparMarcas()">${ICO('undo')}Limpar marcações</button>
    </div>
    <div class="pm-novo" id="novoIrmao" hidden>
      <div class="grid g4">
        <div class="campo s2"><label>Nome</label><input id="nNome" placeholder="Nome completo"></div>
        ${reg ? `<div class="campo"><label>Cargo</label><input id="nCargo" list="dlCargos" placeholder="ex.: Ancião"></div>` : `<div class="campo"><label>Instrumento</label><input id="nInstr" list="dlInstr" placeholder="ex.: Trompete"></div>`}
        <div class="campo"><label>Grupo</label><input id="nGrupo" list="dlGrupos" value="${reg ? 'Ministério' : esc(sel.includes('Músicos') ? 'Músicos' : (sel[0] || 'Músicos'))}"></div>
        <div class="campo"><label>Cidade</label><input id="nCid" list="dlCidades" placeholder="Campo Mourão"></div>
        <div class="campo"><label>Bairro / casa de oração</label><input id="nBai" list="dlBairros" placeholder="Opcional"></div>
        <div class="campo s2 pm-novo-b"><button type="button" class="primary" onclick="addIrmaoChamada()">${ICO('check')}Acrescentar e marcar presente</button><button type="button" onclick="document.getElementById('novoIrmao').hidden=true">Cancelar</button></div>
      </div>
      <div class="dica" style="margin:8px 0 0">Também entra no cadastro (aba Irmãos), para as próximas chamadas.</div>
    </div>
  </section>
  ${reg ? `<section class="bloco"><h3><span class="bi">${ICO('music')}</span><span>Músicos e organistas por localidade<br><small>Escolha a localidade e o instrumento e coloque quantos vieram · quem é do ministério e tocou não entra aqui (o instrumento dele é marcado no Ministério)</small></span><em id="emLocs">${k.locs} ${k.locs === 1 ? 'localidade' : 'localidades'}</em></h3>
    <form class="pm-lanc" onsubmit="event.preventDefault();lancar()" aria-label="Lançar músicos">
      <div class="campo"><label for="lLoc">Localidade</label><input id="lLoc" list="dlLocalidades" placeholder="ex.: Peabiru - Central" autocomplete="off"></div>
      <div class="campo"><label for="lInst">Instrumento</label><select id="lInst">${[...new Set(INSTRUMENTOS.concat(instrumentosUsados()))].map(x => `<option${x === window.__ultInst ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="campo"><label for="lQtd">Quantidade</label><input id="lQtd" type="number" min="1" max="999" value="1" inputmode="numeric"></div>
      <button type="submit" class="primary">${ICO('plus')}Lançar</button>
    </form>
    <div class="pm-busca" style="margin:0 0 10px">${ICO('search')}<input id="buscaLocais" type="search" placeholder="Procurar localidade lançada…" value="${esc(FILTRO.locMus || '')}" oninput="FILTRO.locMus=this.value;desenharLocais()" aria-label="Procurar localidade"></div>
    <div class="pm-locs" id="locais"></div>
    <div class="linha-b"><button type="button" onclick="gerarLocaisPDF()">${ICO('print')}Relatório por localidade</button><button type="button" onclick="addLocal()">${ICO('plus')}Localidade em branco</button></div>
  </section>
  <section class="bloco"><h3><span class="bi">${ICO('file')}</span><span>Relatório do ensaio<br><small>Os números vêm das presenças e das localidades · complete o atendimento e os hinos</small></span><button type="button" class="primary" style="margin-left:auto" onclick="gerarRelatorioPDF()">${ICO('print')}<span class="lbl-md">Gerar relatório</span></button></h3>
    <div class="grid g4 pm-ata">
      <div class="campo"><label>Cidade</label><input data-c="cidade" list="dlCidades" value="${esc(c.cidade)}" placeholder="${esc(CIDADE_PADRAO)}"></div>
      <div class="campo s3"><label>Presidido pelo irmão</label><input data-c="presidente" list="dlPresidente" value="${esc(c.presidente)}" placeholder="ex.: ancião Daniel Castanheira Lopes da Silva"></div>
      <div class="campo"><label>Hino cantado</label><input data-c="hino" inputmode="numeric" value="${esc(c.hino)}" placeholder="ex.: 1"></div>
      <div class="campo"><label>Capítulo</label><input data-c="capitulo" inputmode="numeric" value="${esc(c.capitulo)}" placeholder="ex.: 1"></div>
      <div class="campo s2"><label>Livro</label><input data-c="livro" list="dlLivros" value="${esc(c.livro)}" placeholder="ex.: Josué"></div>
      <div class="campo s4"><label>Regente</label><input data-c="regente" value="${esc(c.regente)}" placeholder="ex.: Jonas Mafra - Ribeirão Preto"></div>
      <div class="campo s4"><label>Hinos ensaiados <small>(na ordem, separados por espaço ou vírgula)</small></label><input data-c="hinos" value="${esc(c.hinos)}" placeholder="ex.: 374 63 257 17"></div>
    </div>
    <div class="pm-rel-wrap" id="pmTotais"></div></section>` : ''}`;
  desenharLinhas();
  if (reg) { desenharLocais(); atualizarTotais(); carregarRelatorio(false); }
}
function contagemHTML(k, c) {
  const pct = k.t ? Math.round(k.v * 100 / k.t) : 0;
  if (c && c.tipo === 'regional') return `<span class="c-v">${ICO('check')}<b>${k.v}</b> do ministério</span><span class="c-s">${ICO('music')}<b>${k.musicos}</b> ${k.musicos === 1 ? 'músico ou organista' : 'músicos e organistas'}</span><span class="c-s">${ICO('pin')}<b>${k.locs}</b> ${k.locs === 1 ? 'localidade' : 'localidades'}</span><span class="c-t">${k.t} no ministério e encarregados · ${pct}% presentes</span>
    <div class="pm-barra"><i style="width:${pct}%" class="bv"></i></div>`;
  return `<span class="c-v">${ICO('check')}<b>${k.v}</b> ${k.v === 1 ? 'presente' : 'presentes'}</span><span class="c-n">${ICO('x')}<b>${k.n}</b> ${k.n === 1 ? 'ausente' : 'ausentes'}</span><span class="c-t">${k.t} irmãos · ${pct}% de presença</span>
    <div class="pm-barra"><i style="width:${k.t ? k.v * 100 / k.t : 0}%" class="bv"></i></div>`;
}
/* ---------- Ensaio Regional: ministério por cargo ---------- */
const CATS_MIN = [['Anciães', 'Ancião'], ['Diáconos', 'Diácono'], ['Cooperadores do Ofício', 'Cooperador do Ofício Ministerial'], ['Cooperadores de Jovens', 'Cooperador de Jovens e Menores'], ['Encarregados Regionais', 'Encarregado Regional'], ['Encarregados Locais', 'Encarregado Local'], ['Examinadoras', 'Examinadora']];
let MIN_CAT = 0;
const catDe = i => REL_MIN.findIndex(([, re]) => re.test(norm(i.cargo)));
const daCat = k => DB.irmaos.filter(i => catDe(i) === k).sort(ordemNome);
const locPadrao = i => [i.cidade, i.bairro].map(x => String(x || '').trim()).filter(Boolean).join(' - ');
function desenharCats() {
  const c = CHAM(), el = document.getElementById('pmCats'); if (!c || !el) return;
  el.innerHTML = CATS_MIN.map(([nm], k) => { const t = daCat(k), v = t.filter(i => c.marcas[i.id] === 'v').length; return `<button type="button" role="tab" class="pm-cat${k === MIN_CAT ? ' on' : ''}" aria-selected="${k === MIN_CAT}" onclick="escolherCat(${k})"><span>${esc(nm)}</span><em>${v} de ${t.length}</em></button>`; }).join('');
}
function escolherCat(k) {
  MIN_CAT = k; FILTRO.q = ''; FILTRO.loc = ''; const b = document.getElementById('busca'); if (b) b.value = ''; const fl = document.getElementById('fLoc'); if (fl) fl.value = '';
  const sel = document.getElementById('rCargo'); if (sel) sel.value = CATS_MIN[k][1];
  desenharLinhas();
}
function setToca(id, campo, val) {
  const c = CHAM(); if (!c) return;
  if (!podeMexer(c, id)) { UI.toast(`Presença marcada por ${quemMarcou(c, id)}. Só quem marcou (ou um administrador) troca o instrumento.`, 'info'); semPular(desenharLinhas); return; }
  const t = Object.assign({ inst: '', loc: '' }, c.toca[id] || {}); t[campo] = String(val || '').trim();
  if (t.inst || t.loc) c.toca[id] = t; else delete c.toca[id];
  guardar(); atualizarTotais(); desenharLista();
  if (campo === 'loc') { const f = document.getElementById('fLoc'); if (f && f !== document.activeElement) f.innerHTML = opcoesLoc(c); }
}
document.addEventListener('change', e => { const el = e.target; if (el.dataset && el.dataset.xi) { setToca(el.dataset.xi, 'inst', el.value); if (el.value) window.__ultInstMin = el.value; } });
document.addEventListener('input', e => { const el = e.target; if (el.dataset && el.dataset.xl) setToca(el.dataset.xl, 'loc', el.value); });
function desenharLinhas() {
  const c = CHAM(), el = document.getElementById('linhas'); if (!c || !el) return;
  if (c.tipo === 'regional') {
    // procurando (nome ou localidade): mostra de todos os ministérios, separados por cargo
    const geral = !!(palavras(FILTRO.q).length || FILTRO.loc);
    const todos = geral ? DB.irmaos.filter(i => catDe(i) >= 0).sort((a, b) => catDe(a) - catDe(b) || ordemNome(a, b)) : daCat(MIN_CAT);
    const num = new Map(todos.map((i, n) => [i.id, n + 1])), lst = filtrar(todos, c);
    let h = '', g0 = -1;
    lst.forEach(i => { const k = catDe(i); if (geral && k !== g0) { g0 = k; const nesta = lst.filter(x => catDe(x) === k); h += `<div class="pm-gh">${esc(CATS_MIN[k][0])} <em>${nesta.filter(x => c.marcas[x.id] === 'v').length} de ${nesta.length} presentes</em></div>`; } h += linhaHTML(i, num.get(i.id), c); });
    el.innerHTML = lst.length ? h : `<div class="vazio">${todos.length ? 'Ninguém com essa busca.' + (geral ? ' Acrescente abaixo quem veio e não está na lista.' : '') : `Nenhum irmão em ${esc(CATS_MIN[MIN_CAT][0])} no cadastro. Puxe do Relatório de Igrejas ou acrescente abaixo.`}</div>`;
    const em = document.getElementById('emFiltro'); if (em) em.textContent = geral ? `${lst.length} encontrados em todos os ministérios` : `${lst.length} de ${todos.length}`;
    const cs = document.getElementById('pmCats'); if (cs) cs.classList.toggle('busca', geral);
    document.querySelectorAll('.pm-seg button').forEach((b, i) => b.classList.toggle('on', ['', 'v', 'n'][i] === FILTRO.so));
    desenharCats(); return;
  }
  const todos = irmaosDa(c), num = new Map(todos.map((i, n) => [i.id, n + 1]));
  const tot = {}; todos.forEach(i => { const g = subcat(c, i); tot[g] = (tot[g] || 0) + 1; });
  const lst = filtrar(todos, c);
  let h = '', g0 = null;
  lst.forEach(i => {
    const g = subcat(c, i);
    if (g !== g0) { g0 = g; const nesta = lst.filter(x => subcat(c, x) === g).length; h += `<div class="pm-gh">${esc(g)} <em>${nesta === tot[g] ? tot[g] : nesta + ' de ' + tot[g]}</em></div>`; }
    h += linhaHTML(i, num.get(i.id), c);
  });
  el.innerHTML = lst.length ? h : `<div class="vazio">${todos.length ? 'Ninguém com esse filtro.' : (c.tipo === 'regional' ? 'Ninguém do ministério ainda. Puxe do Relatório de Igrejas ou acrescente abaixo.' : DB.irmaos.length ? 'Nenhum irmão nos grupos escolhidos.' : 'Nenhum irmão cadastrado ainda. Importe o relatório na aba Irmãos ou acrescente abaixo.')}</div>`;
  const em = document.getElementById('emFiltro'); if (em) em.textContent = `${lst.length} de ${todos.length}`;
  document.querySelectorAll('.pm-seg button').forEach((b, i) => b.classList.toggle('on', ['', 'v', 'n'][i] === FILTRO.so));
}
/* ---------- link da chamada (para quem não tem cadastro) ----------
   Quem abre o link (sem login) só consegue: marcar presença do ministério, desmarcar o que
   ele mesmo marcou, acrescentar alguém do ministério (sem mudar quem já está) e contar os
   músicos por localidade. A sala (src/sala-presenca.js) confere tudo isso. */
const urlLink = c => location.origin + '/presenca-link#' + c.link;
function blocoLink(c) {
  const ao = aoVivo() && VIVO.ws && VIVO.ws.readyState === 1;
  return `<section class="bloco"><h3><span class="bi">${ICO('pin')}</span><span>Link para quem não tem cadastro<br><small>Sem login: marca presença do ministério, acrescenta quem não está na lista e conta os músicos. Não muda nem apaga quem já está.</small></span></h3>
    ${c.link ? `<div class="pm-link"><input readonly value="${esc(urlLink(c))}" aria-label="Link da chamada" onfocus="this.select()">
      <button type="button" class="primary" onclick="copiarLink()">${ICO('copy')}Copiar</button>
      ${navigator.share ? `<button type="button" onclick="compartilharLink()">${ICO('arrow-right')}Enviar</button>` : ''}
      <button type="button" class="danger" onclick="desativarLink()">${ICO('x')}Desativar</button></div>
      <div class="dica" style="margin:8px 0 0">Quem estiver com o link aberto aparece em “Ao vivo” como “pelo link”. Desativando, o link para de funcionar na hora.</div>`
    : `<div class="linha-b" style="margin-top:0"><button type="button" class="primary" onclick="criarLink()"${ao ? '' : ' disabled title="Precisa estar ao vivo (com internet)"'}>${ICO('plus')}Criar link desta chamada</button></div>`}
  </section>`;
}
function enviarOpsDiretas(ops) {
  if (!(aoVivo() && VIVO.ws && VIVO.ws.readyState === 1 && VIVO.abriu)) { UI.toast(VIVO.pausa ? 'Para isso ligue o tempo real (está desligado).' : 'Para isso é preciso estar ao vivo (com internet).', 'error'); return false; }
  enviarAgora();
  const lote = { lote: novoId(), ops, off: false };
  VIVO.fila.push(lote); gravarFila(); VIVO.ws.send(JSON.stringify(Object.assign({ t: 'ops' }, lote)));
  return true;
}
function criarLink() { const c = CHAM(); if (c) enviarOpsDiretas([{ t: 'link', c: c.id }]); }
async function desativarLink() {
  const c = CHAM(); if (!c || !c.link) return;
  if (!(await UI.confirm('Desativar o link?', 'Quem estiver com ele aberto não consegue mais marcar nada. Dá para criar outro depois (com outro endereço).', { ok: 'Desativar', danger: true }))) return;
  enviarOpsDiretas([{ t: 'link-', c: c.id }]);
}
async function copiarLink() {
  const c = CHAM(); if (!c || !c.link) return;
  try { await navigator.clipboard.writeText(urlLink(c)); UI.toast('Link copiado. Mande para quem vai ajudar na chamada.', 'ok'); }
  catch (e) { const i = document.querySelector('.pm-link input'); if (i) { i.focus(); i.select(); } UI.toast('Selecione o link e copie.', 'info'); }
}
function compartilharLink() {
  const c = CHAM(); if (!c || !c.link) return;
  navigator.share({ title: 'Lista de presença · ' + (c.ocasiao || 'Ensaio Regional'), text: `Lista de presença do ${c.ocasiao || 'Ensaio Regional'} (${dataBR(c.data)}):`, url: urlLink(c) }).catch(() => {});
}

/* ---------- tipo de lista e grupos da chamada ---------- */
function mudarTipo(t) {
  const c = CHAM(); if (!c || c.tipo === t) return;
  c.tipo = t; guardar(); FILTRO.instr = '';
  semPular(desenharChamada); desenharLista();
}
function alternarGrupo(g) {
  const c = CHAM(); if (!c) return;
  const atual = gruposDa(c);
  const novo = atual.includes(g) ? atual.filter(x => x !== g) : atual.concat(g);
  if (!novo.length) { UI.toast('Deixe pelo menos um grupo na chamada.', 'info'); return; }
  c.grupos = novo.sort((a, b) => ordemGrupo(a) - ordemGrupo(b)).join('|'); guardar();
  semPular(desenharChamada); desenharLista();
}
/* ---------- Ensaio Regional: músicos por localidade ---------- */
const LOC = id => { const c = CHAM(); return c && c.locais.find(l => l.id === id); };
const ordInst = (a, b) => { const ia = INSTRUMENTOS.indexOf(a), ib = INSTRUMENTOS.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'pt-BR'); };
function localHTML(l) {
  const soma = somaInst(l), insts = Object.keys(l.inst).sort(ordInst);
  const usados = new Set(insts), opc = [...new Set(INSTRUMENTOS.concat(instrumentosUsados()))].filter(x => !usados.has(x));
  const dif = String(l.total).trim() !== '' && insts.length && +l.total !== soma;
  return `<div class="pm-loc" data-l="${l.id}">
    <div class="pm-loc-h"><input data-lc="${l.id}:nome" list="dlLocalidades" value="${esc(l.nome)}" placeholder="Localidade (ex.: Peabiru - Central)" aria-label="Localidade">
      <label class="pm-loc-t">Total <input data-lc="${l.id}:total" inputmode="numeric" value="${esc(l.total)}" placeholder="${soma}" aria-label="Total de músicos"></label>
      <button type="button" class="x" title="Relatório desta localidade" data-acao="pdfLocal" data-l="${l.id}">${ICO('print')}</button><button type="button" class="x" title="Tirar esta localidade" data-acao="tirarLocal" data-l="${l.id}">${ICO('trash')}</button></div>
    <div class="pm-insts">${insts.map(k => `<span class="pm-inst"><span>${esc(k)}</span><button type="button" data-acao="menos" data-l="${l.id}" data-k="${esc(k)}" aria-label="Menos ${esc(k)}">−</button><input data-li="${l.id}" data-k="${esc(k)}" inputmode="numeric" value="${l.inst[k]}" aria-label="${esc(k)}"><button type="button" data-acao="mais" data-l="${l.id}" data-k="${esc(k)}" aria-label="Mais ${esc(k)}">+</button></span>`).join('')}
      <select data-addinst="${l.id}" aria-label="Acrescentar instrumento"><option value="">+ Instrumento</option>${opc.map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
    <small class="pm-dif" data-dif="${l.id}"${dif ? '' : ' hidden'}>A soma dos instrumentos dá ${soma}.</small>
  </div>`;
}
function desenharLocais() {
  const c = CHAM(), el = document.getElementById('locais'); if (!c || !el) return;
  const ps = palavras(FILTRO.locMus || ''), lst = c.locais.filter(l => !ps.length || casaBusca(l.nome, ps));
  el.innerHTML = lst.length ? lst.map(localHTML).join('') : `<div class="vazio">${c.locais.length ? 'Nenhuma localidade lançada com esse nome. Lance acima para criar.' : 'Nenhuma localidade ainda. Lance os músicos acima.'}</div>`;
}
function atualizarTotais() {
  const c = CHAM(), el = document.getElementById('pmTotais'); if (!c || !el || c.tipo !== 'regional') return;
  const k = contar(c);
  el.innerHTML = relTabelaHTML(c, true);
  let pres = document.getElementById('dlPresidente');
  if (!pres) { pres = document.createElement('datalist'); pres.id = 'dlPresidente'; document.body.appendChild(pres); }
  if (pres) pres.innerHTML = DB.irmaos.filter(i => c.marcas[i.id] === 'v' && /ancia|diacon|cooperador/.test(norm(i.cargo))).sort((a, b) => ordemCargo(a.cargo) - ordemCargo(b.cargo) || ordemNome(a, b)).map(i => `<option value="${esc(norm(i.cargo).startsWith('cooperador') ? 'cooperador ' + i.nome : i.cargo.toLowerCase() + ' ' + i.nome)}">`).join('');
  const em = document.getElementById('emLocs'); if (em) em.textContent = `${k.locs} ${k.locs === 1 ? 'localidade' : 'localidades'}`;
  const ct = document.getElementById('contagem'); if (ct) ct.innerHTML = contagemHTML(k, c);
}
function atualizarDifLocal(l) {
  const d = document.querySelector(`[data-dif="${l.id}"]`), soma = somaInst(l);
  if (d) { const dif = String(l.total).trim() !== '' && Object.keys(l.inst).length && +l.total !== soma; d.hidden = !dif; d.textContent = `A soma dos instrumentos dá ${soma}.`; }
  const t = document.querySelector(`[data-lc="${l.id}:total"]`); if (t) t.placeholder = soma;
}
// formulário: localidade + instrumento + quantidade -> soma na localidade (cria se não houver)
function lancar() {
  const c = CHAM(), li = document.getElementById('lLoc'), si = document.getElementById('lInst'), qi = document.getElementById('lQtd'); if (!c || !li) return;
  const nome = li.value.trim().replace(/\s+/g, ' ');
  if (!nome) { li.focus(); UI.toast('Escreva a localidade.', 'info'); return; }
  const inst = si.value, q = Math.max(1, Math.min(999, parseInt(qi.value, 10) || 1));
  let l = c.locais.find(x => norm(x.nome) === norm(nome));
  const novo = !l;
  if (!l) { l = { id: novoId(), nome: nomeBonito(nome), total: '', inst: {}, ord: Date.now() }; c.locais.push(l); }
  l.inst[inst] = (l.inst[inst] || 0) + q;
  if (String(l.total).trim() !== '') l.total = String((+l.total || 0) + q);
  window.__ultInst = inst; guardar();
  semPular(desenharLocais); atualizarTotais(); desenharLista();
  const box = document.querySelector(`.pm-loc[data-l="${l.id}"]`); if (box) box.classList.add('novo');
  qi.value = 1; si.focus();
}
function addLocal() {
  const c = CHAM(); if (!c) return;
  const l = { id: novoId(), nome: '', total: '', inst: {}, ord: Date.now() };
  c.locais.push(l); guardar(); desenharLocais(); atualizarTotais(); desenharLista();
  const f = document.querySelector(`[data-lc="${l.id}:nome"]`); if (f) { f.focus(); f.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}
async function tirarLocal(id) {
  const c = CHAM(), l = LOC(id); if (!c || !l) return;
  const k = c.locais.indexOf(l);
  if ((totalLocal(l) || l.nome.trim()) && !(await UI.confirm('Tirar esta localidade?', `${l.nome || 'Sem nome'} · ${totalLocal(l)} ${totalLocal(l) === 1 ? 'músico' : 'músicos'}.`, { ok: 'Tirar', danger: true }))) return;
  c.locais.splice(k, 1); guardar(); semPular(desenharLocais); atualizarTotais(); desenharLista();
  UI.toast('Localidade tirada.', { action: { label: 'Desfazer', icon: 'undo', fn: () => { c.locais.splice(k, 0, l); guardar(); desenharLocais(); atualizarTotais(); desenharLista(); } } });
}
function mudarInst(id, inst, n) {
  const l = LOC(id); if (!l) return;
  n = Math.max(0, Math.min(9999, n | 0));
  const tinha = inst in l.inst;
  if (n) l.inst[inst] = n; else delete l.inst[inst];
  guardar();
  const inp = document.querySelector(`[data-li="${id}"][data-k="${CSS.escape(inst)}"]`);
  if (!n || !tinha || !inp) { semPular(() => { const box = document.querySelector(`.pm-loc[data-l="${id}"]`); if (box) { const t = document.createElement('div'); t.innerHTML = localHTML(l); box.replaceWith(t.firstElementChild); } }); }
  else if (inp !== document.activeElement) inp.value = n;
  atualizarDifLocal(l); atualizarTotais(); desenharLista();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-acao]'); if (!b) return;
  const id = b.dataset.l, k = b.dataset.k, l = LOC(id);
  if (b.dataset.acao === 'mais' && l) mudarInst(id, k, (l.inst[k] || 0) + 1);
  else if (b.dataset.acao === 'menos' && l) mudarInst(id, k, (l.inst[k] || 0) - 1);
  else if (b.dataset.acao === 'tirarLocal') tirarLocal(id);
  else if (b.dataset.acao === 'pdfLocal' && l) gerarLocaisPDF(l.nome);
});
document.addEventListener('change', e => {
  const s = e.target.closest && e.target.closest('[data-addinst]'); if (!s || !s.value) return;
  const id = s.dataset.addinst, inst = s.value; s.value = '';
  const l = LOC(id); if (!l) return;
  if (!(inst in l.inst)) mudarInst(id, inst, 1);
  const inp = document.querySelector(`[data-li="${id}"][data-k="${CSS.escape(inst)}"]`); if (inp) { inp.focus(); inp.select(); }
});
function atualizarContagem() {
  const c = CHAM(); if (!c) return;
  const el = document.getElementById('contagem'); if (el) el.innerHTML = contagemHTML(contar(c), c);
  if (c.tipo === 'regional') atualizarTotais();
  desenharLista();
}
function marcar(id) {
  const c = CHAM(); if (!c) return;
  if (c.marcas[id] === 'v' && !podeMexer(c, id)) { UI.toast(`Presença marcada por ${quemMarcou(c, id)}. Só quem marcou (ou um administrador) pode tirar.`, 'info'); return; }
  c.donos = c.donos || {};
  if (c.marcas[id] === 'v') { delete c.marcas[id]; delete c.donos[id]; } else { c.marcas[id] = 'v'; c.donos[id] = meuDono(); }
  guardar();
  const row = document.querySelector(`.pm-row[data-id="${id}"]`);
  const i = DB.irmaos.find(x => x.id === id);
  if (row && i) {
    // com filtro "presentes"/"ausentes" a linha sai da lista depois de um instante
    const n = row.querySelector('.pm-n').textContent;
    const tmp = document.createElement('div'); tmp.innerHTML = linhaHTML(i, n, c); row.replaceWith(tmp.firstElementChild);
    if (FILTRO.so) setTimeout(desenharLinhas, 450);
    // procurando em todos os ministérios: atualiza também a contagem de cada cargo
    else if (c.tipo === 'regional' && (palavras(FILTRO.q).length || FILTRO.loc)) semPular(desenharLinhas);
  }
  atualizarContagem();
}
async function limparMarcas() {
  const c = CHAM(); if (!c || !Object.keys(c.marcas).length) return;
  const minhas = Object.keys(c.marcas).filter(id => podeMexer(c, id)), outras = Object.keys(c.marcas).length - minhas.length;
  if (!minhas.length) { UI.toast('As presenças desta chamada foram marcadas por outras pessoas. Só elas (ou um administrador) podem tirar.', 'info'); return; }
  if (!(await UI.confirm('Limpar as marcações?', outras ? `As ${minhas.length} presenças que você marcou ficam como ausentes. As ${outras} marcadas por outras pessoas continuam.` : 'Todos ficam como ausentes nesta chamada.', { ok: 'Limpar', danger: true }))) return;
  const antes = Object.assign({}, c.marcas), antesD = Object.assign({}, c.donos || {});
  minhas.forEach(id => { delete c.marcas[id]; if (c.donos) delete c.donos[id]; }); guardar(); desenharLinhas(); atualizarContagem();
  UI.toast('Marcações limpas.', { action: { label: 'Desfazer', icon: 'undo', fn: () => { c.marcas = antes; c.donos = antesD; guardar(); desenharLinhas(); atualizarContagem(); } } });
}
// Ensaio Regional: acrescenta alguém do ministério direto na chamada (só nome e cargo,
// sem localidade) e já marca presente; o campo fica pronto para o próximo
function addMinisterio() {
  const c = CHAM(), inp = document.getElementById('rNome'), sel = document.getElementById('rCargo'); if (!c || !inp) return;
  const nome = nomeBonito(inp.value); if (!nome) { inp.focus(); return; }
  const cargo = sel ? sel.value : 'Ancião'; window.__ultCargo = cargo;
  const kc = CATS_MIN.findIndex(x => x[1] === cargo); if (kc >= 0) MIN_CAT = kc;
  const val = id => { const x = document.getElementById(id); return x ? nomeBonito(x.value) : ''; };
  const cidade = val('rCid'), bairro = val('rBai');
  let i = DB.irmaos.find(x => norm(x.nome) === norm(nome));
  if (i) { if (!GRUPOS_REGIONAL.includes(i.grupo)) { i.grupo = grupoDoCargo(cargo); i.cargo = cargo; } if (cidade) i.cidade = cidade; if (bairro) i.bairro = bairro; }
  else { i = { id: novoId(), nome, instrumento: '', cidade, bairro, cargo, grupo: grupoDoCargo(cargo) }; DB.irmaos.push(i); }
  c.marcas[i.id] = 'v'; guardar();
  inp.value = ''; ['rCid', 'rBai'].forEach(id => { const x = document.getElementById(id); if (x) x.value = ''; }); FILTRO.q = ''; const b = document.getElementById('busca'); if (b) b.value = '';
  semPular(desenharLinhas); atualizarContagem(); atualizarTotais(); atualizarDatalists();
  const row = document.querySelector(`.pm-row[data-id="${i.id}"]`); if (row) row.classList.add('remoto');
  inp.focus();
  UI.toast(`${i.nome} (${i.cargo}) acrescentado e marcado presente.`, 'ok');
}
function abrirNovoIrmao() { const b = document.getElementById('novoIrmao'); b.hidden = false; const n = document.getElementById('nNome'); n.value = FILTRO.q || ''; n.focus(); b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
function addIrmaoChamada() {
  const nome = nomeBonito(document.getElementById('nNome').value); if (!nome) { document.getElementById('nNome').focus(); return; }
  const ja = DB.irmaos.find(i => norm(i.nome) === norm(nome));
  const c = CHAM();
  if (ja) {
    if (c) c.marcas[ja.id] = 'v';
    if (c && !participa(c, ja)) { if (c.tipo === 'regional') ja.grupo = 'Ministério'; else c.grupos = gruposDa(c).concat(ja.grupo).join('|'); }
    guardar(); UI.toast(`${ja.nome} já estava no cadastro: marcado como presente.`, 'info');
  }
  else {
    const v = id => { const x = document.getElementById(id); return x ? x.value : ''; };
    const cargo = nomeBonito(v('nCargo'));
    const i = { id: novoId(), nome, instrumento: nomeBonito(v('nInstr')), cidade: nomeBonito(v('nCid')) || CIDADE_PADRAO, bairro: nomeBonito(v('nBai')), cargo, grupo: v('nGrupo').trim() || grupoDoCargo(cargo) };
    DB.irmaos.push(i); if (c) { c.marcas[i.id] = 'v'; if (!participa(c, i) && c.tipo !== 'regional') c.grupos = gruposDa(c).concat(i.grupo).join('|'); } guardar();
    UI.toast(`${nome} acrescentado e marcado como presente.`, 'ok');
  }
  FILTRO.q = ''; desenharChamada(); atualizarDatalists();
}
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset && el.dataset.lc) {
    const [id, campo] = el.dataset.lc.split(':'), l = LOC(id); if (!l) return;
    l[campo] = campo === 'total' ? el.value.replace(/\D/g, '').slice(0, 4) : el.value;
    if (campo === 'total' && el.value !== l.total) el.value = l.total;
    guardar(); atualizarDifLocal(l); atualizarTotais(); desenharLista(); return;
  }
  if (el.dataset && el.dataset.li) {
    const l = LOC(el.dataset.li), k = el.dataset.k; if (!l) return;
    const n = Math.min(9999, parseInt(el.value.replace(/\D/g, ''), 10) || 0);
    if (n) l.inst[k] = n; else if (el.value === '') delete l.inst[k]; else l.inst[k] = 0;
    if (!l.inst[k]) delete l.inst[k];
    guardar(); atualizarDifLocal(l); atualizarTotais(); desenharLista(); return;
  }
  if (el.dataset && el.dataset.c) {
    const c = CHAM(); if (!c) return;
    c[el.dataset.c] = el.value; guardar();
    if (c.tipo === 'regional') atualizarTotais();
    if (el.dataset.c === 'data' || el.dataset.c === 'ocasiao' || el.dataset.c === 'local') {
      const h = document.querySelector('.heroi'); if (h) { h.querySelector('.h-tit small').textContent = diaSemana(c.data); h.querySelector('h2').textContent = dataLonga(c.data); h.querySelector('.h-sub').textContent = [c.ocasiao, c.local].filter(Boolean).join(' · ') || 'Chamada'; }
      desenharLista();
    }
  }
  if (el.dataset && el.dataset.i) {
    const [id, campo] = el.dataset.i.split(':'); const i = DB.irmaos.find(x => x.id === id); if (!i) return;
    i[campo] = el.value; guardar();
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.i) {
    const [id, campo] = el.dataset.i.split(':'); const i = DB.irmaos.find(x => x.id === id);
    if (i && campo === 'nome') { i.nome = nomeBonito(i.nome); el.value = i.nome; guardar(); }
    if (i && campo === 'grupo') { i.grupo = nomeBonito(i.grupo) || grupoDoCargo(i.cargo); el.value = i.grupo; guardar(); }
    atualizarDatalists();
  }
});

/* ---------- irmãos (cadastro) ---------- */
let BUSCA_GRUPO = '';
const filtroIrm = () => { const q = norm(BUSCA_IRM); return irmaosOrdenados().filter(i => (!BUSCA_GRUPO || i.grupo === BUSCA_GRUPO) && (!q || norm(i.nome + ' ' + i.instrumento + ' ' + i.cidade + ' ' + i.bairro + ' ' + i.grupo + ' ' + i.cargo).includes(q))); };
function desenharIrmaos() {
  const el = document.getElementById('irm');
  const grupos = gruposUsados();
  el.innerHTML = `<section class="bloco"><h3><span class="bi">${ICO('music')}</span><span>Irmãos da parte musical<br><small>Em ordem alfabética · as mudanças valem para todas as chamadas</small></span><em>${DB.irmaos.length} irmãos</em></h3>
    <div class="pm-imp">${ICO('upload')}<div><b>Importar o “Relatório de Membros” (PDF)</b><small>O PDF do sistema musical, com Nome, Instrumento e Localidade. Quem já está aqui é atualizado; os novos entram; ninguém é apagado.</small></div><button type="button" class="primary" onclick="document.getElementById('arqPDF').click()">${ICO('upload')}Escolher PDF</button></div>
    <div class="pm-imp">${ICO('users')}<div><b>Ministério e encarregados do Relatório de Igrejas</b><small>Anciães, diáconos, cooperadores e encarregados regionais e locais entram no grupo certo (Ministério ou Encarregados), com a localidade. Usado na chamada do Ensaio Regional.</small></div><button type="button" onclick="puxarMinisterio()">${ICO('refresh')}Puxar do Relatório</button></div>
    <div class="pm-filtros"><div class="pm-busca">${ICO('search')}<input type="search" placeholder="Procurar…" value="${esc(BUSCA_IRM)}" oninput="BUSCA_IRM=this.value;desenharIrmaosLinhas()"></div></div>
    <div class="pm-chips" style="margin:0 0 10px"><button type="button" class="pm-chip${BUSCA_GRUPO ? '' : ' on'}" onclick="BUSCA_GRUPO='';desenharIrmaos()">Todos <em>${DB.irmaos.length}</em></button>${grupos.map(g => `<button type="button" class="pm-chip${BUSCA_GRUPO === g ? ' on' : ''}" data-g="${esc(g)}" onclick="BUSCA_GRUPO=this.dataset.g;desenharIrmaos()">${esc(g)} <em>${DB.irmaos.filter(i => i.grupo === g).length}</em></button>`).join('')}</div>
    <div class="pm-tab" id="irmLinhas"></div>
    <div class="linha-b"><button type="button" class="primary" onclick="novoIrmao()">${ICO('plus')}Acrescentar irmão</button></div></section>`;
  desenharIrmaosLinhas();
}
function desenharIrmaosLinhas() {
  const el = document.getElementById('irmLinhas'); if (!el) return;
  const lst = filtroIrm();
  el.innerHTML = lst.length ? `<div class="pm-th"><span>Nome</span><span>Instrumento / cargo</span><span>Grupo</span><span>Cidade</span><span>Bairro</span><span></span></div>` + lst.map(i => `<div class="pm-tr" data-id="${i.id}">
      <input data-i="${i.id}:nome" value="${esc(i.nome)}" placeholder="Nome" aria-label="Nome">
      ${GRUPOS_REGIONAL.includes(i.grupo) && !i.instrumento ? `<input data-i="${i.id}:cargo" value="${esc(i.cargo)}" list="dlCargos" placeholder="Cargo" aria-label="Cargo">` : `<input data-i="${i.id}:instrumento" value="${esc(i.instrumento)}" list="dlInstr" placeholder="Instrumento" aria-label="Instrumento">`}
      <input data-i="${i.id}:grupo" value="${esc(i.grupo)}" list="dlGrupos" placeholder="Grupo" aria-label="Grupo">
      <input data-i="${i.id}:cidade" value="${esc(i.cidade)}" list="dlCidades" placeholder="Cidade" aria-label="Cidade">
      <input data-i="${i.id}:bairro" value="${esc(i.bairro)}" list="dlBairros" placeholder="Bairro" aria-label="Bairro">
      <button type="button" class="x" title="Tirar da lista" onclick="removerIrmao('${i.id}')">${ICO('trash')}</button></div>`).join('')
    : `<div class="vazio">${DB.irmaos.length ? 'Ninguém com essa busca.' : 'Nenhum irmão ainda. Importe o relatório em PDF ou acrescente um por um.'}</div>`;
}
function novoIrmao() {
  const i = { id: novoId(), nome: '', instrumento: '', cidade: '', bairro: '', cargo: '', grupo: BUSCA_GRUPO || 'Músicos' };
  DB.irmaos.push(i); guardar(); BUSCA_IRM = ''; desenharIrmaos();
  // irmão sem nome fica no começo da ordem alfabética
  const f = document.querySelector(`.pm-tr[data-id="${i.id}"] input`); if (f) { f.focus(); f.scrollIntoView({ block: 'center' }); }
}
function removerIrmao(id) {
  const ix = DB.irmaos.findIndex(i => i.id === id); if (ix < 0) return;
  const [i] = DB.irmaos.splice(ix, 1);
  const marcas = DB.chamadas.map(c => [c, c.marcas[id]]).filter(([, m]) => m);
  marcas.forEach(([c]) => delete c.marcas[id]);
  guardar(); desenharIrmaosLinhas();
  UI.toast(`${i.nome || 'Irmão'} tirado da lista.`, { action: { label: 'Desfazer', icon: 'undo', fn: () => { DB.irmaos.splice(ix, 0, i); marcas.forEach(([c, m]) => { c.marcas[id] = m; }); guardar(); desenharTudo(); } } });
}

/* ---------- resumo ---------- */
function desenharResumo() {
  const el = document.getElementById('res');
  const anos = [...new Set(DB.chamadas.map(c => (c.data || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const chs = DB.chamadas.filter(c => !RES_ANO || (c.data || '').startsWith(RES_ANO));
  const lst = irmaosOrdenados().map(i => { let v = 0, t = 0; chs.forEach(c => { if (!participa(c, i)) return; t++; if (c.marcas[i.id] === 'v') v++; }); const n = t - v; return { i, v, n, p: t ? Math.round(v * 100 / t) : null }; }).filter(r => r.v + r.n > 0);
  el.innerHTML = `<section class="bloco"><h3><span class="bi">${ICO('grid')}</span><span>Resumo de presença<br><small>Quantas vezes cada irmão esteve presente nas chamadas</small></span><em>${chs.length} ${chs.length === 1 ? 'chamada' : 'chamadas'}</em></h3>
    <div class="pm-filtros"><select onchange="RES_ANO=this.value;desenharResumo()"><option value="">Todas as chamadas</option>${anos.map(a => `<option${RES_ANO === a ? ' selected' : ''}>${a}</option>`).join('')}</select></div>
    ${chs.length ? `<div class="pm-res"><div class="pm-rh"><span>Nome</span><span>Instrumento</span><span>Presente</span><span>Ausente</span><span>Presença</span></div>${lst.map(r => `<div class="pm-rr"><b>${esc(r.i.nome)}</b><span>${esc(r.i.instrumento)}</span><span class="c-v">${r.v}</span><span class="c-n">${r.n}</span><span class="pm-pc">${r.p == null ? '—' : `<i style="--p:${r.p}%"></i>${r.p}%`}</span></div>`).join('')}</div>` : '<div class="vazio">Ainda não há chamadas.</div>'}</section>`;
}

/* ---------- PDF ---------- */
function abrirImpressao(html) {
  const w = window.open('', '_blank'); if (!w) { UI.toast('O navegador bloqueou a janela do PDF. Permita janelas deste site.', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 600);
}
function gerarRelatorioPDF() { const c = CHAM(); if (c) abrirImpressao(relatorioRegionalHTML(c)); }
async function gerarPDF() {
  const c = CHAM();
  if (c && c.tipo === 'regional') {
    const v = await UI.dialog({
      title: 'Gerar PDF do Ensaio Regional', icon: 'print',
      body: `<p class="ui-modal__p">O relatório do ensaio (resumo por instrumento, ministério e hinos), o relatório de cada localidade ou a lista de presença com os nomes.</p>`,
      actions: [{ label: 'Cancelar', value: null }, { label: 'Lista em branco', value: 'branco', icon: 'file' }, { label: 'Lista de presença', value: 'chamada', icon: 'check' }, { label: 'Por localidade', value: 'loc', icon: 'pin' }, { label: 'Relatório do ensaio', value: 'rel', primary: true, icon: 'file' }]
    });
    if (!v) return;
    if (v === 'rel') return gerarRelatorioPDF();
    if (v === 'loc') return gerarLocaisPDF();
    return abrirImpressao(documentoRegionalHTML(c, v === 'chamada'));
  }
  if (!DB.irmaos.length) { UI.toast('Coloque os irmãos primeiro (aba Irmãos).', 'info'); return; }
  const tem = c && Object.keys(c.marcas).length;
  const v = await UI.dialog({
    title: 'Gerar PDF da lista de presença', icon: 'print',
    body: `<p class="ui-modal__p">Em ordem alfabética, com cidade e bairro${c ? '' : ''}.</p>`,
    actions: [{ label: 'Cancelar', value: null }, { label: 'Em branco, para marcar à mão', value: 'branco', icon: 'file' }].concat(c ? [{ label: tem ? 'Com as marcações desta chamada' : 'Desta chamada (com data e ocasião)', value: 'chamada', primary: true, icon: 'check' }] : [])
  });
  if (!v) return;
  const w = window.open('', '_blank'); if (!w) { UI.toast('O navegador bloqueou a janela do PDF. Permita janelas deste site.', 'error'); return; }
  const base = c || { tipo: 'nomes', grupos: '', marcas: {}, locais: [] };
  w.document.open(); w.document.write(base.tipo === 'regional' ? documentoRegionalHTML(base, v === 'chamada') : documentoHTML(base, v === 'chamada')); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 600);
}
function documentoHTML(base, comDados) {
  if (comDados === undefined) comDados = !!base;
  base = base || { tipo: 'nomes', grupos: '', marcas: {}, locais: [] };
  const lst = irmaosDa(base), EXTRA = 24, c = comDados ? base : null;
  const X = m => `<span class="cx">${m ? '✕' : ''}</span>`;
  const varios = new Set(lst.map(i => i.grupo)).size > 1;
  let g0 = null;
  let linhas = lst.map((i, n) => { const m = c ? c.marcas[i.id] : ''; const gh = varios && i.grupo !== g0 ? `<tr class="sep gr"><td></td><td colspan="5">${esc((g0 = i.grupo))}</td></tr>` : ''; return gh + `<tr><td class="n">${n + 1}</td><td class="nm">${esc(i.nome)}</td><td>${esc(i.instrumento)}</td><td>${esc(i.cidade)}</td><td>${esc(i.bairro)}</td><td class="ck">${X(m === 'v')}</td></tr>`; }).join('');
  linhas += `<tr class="sep"><td></td><td colspan="5">Irmãos que não estão na lista</td></tr>`;
  for (let j = 0; j < EXTRA; j++) linhas += `<tr><td class="n">${lst.length + j + 1}</td><td></td><td></td><td></td><td></td><td class="ck">${X(false)}</td></tr>`;
  const k = c ? contar(c) : null;
  const campo = (r, v) => `<div><b>${r}:</b> ${esc(v || '')}</div>`;
  const qual = gruposDa(base).join(', ');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lista de presença${c ? ' ' + dataBR(c.data) : ''}</title><style>
@page{size:A4 landscape;margin:9mm 10mm 10mm}
*{box-sizing:border-box}
body{margin:0;font-family:Arial,'Liberation Sans',sans-serif;color:#1d2433;font-size:9.4pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cab{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1b2a41;padding-bottom:6px;margin-bottom:8px}
.cab h1{margin:0;font-size:17pt;color:#1b2a41;letter-spacing:.02em}
.cab .sub{font-size:8.6pt;color:#5b6475;margin-top:2px}
.cab .tot{text-align:right;font-size:8.6pt;color:#5b6475}
.campos{display:grid;grid-template-columns:1fr 1.6fr 1.6fr;gap:6px 14px;margin:0 0 9px}
.campos div{font-size:9pt;color:#3a4256;border-bottom:1px solid #9aa3b5;padding:9px 0 2px;min-height:22px}
.campos b{color:#1b2a41}
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead{display:table-header-group}
thead th{background:#1b2a41;color:#fff;font-weight:700;font-size:8pt;text-transform:uppercase;letter-spacing:.05em;padding:5px 6px;text-align:left;white-space:nowrap}
thead th.ck{text-align:center;padding:5px 2px}
tbody td{border-bottom:.6pt solid #c9cfda;padding:.6mm 6px;height:6.6mm;vertical-align:middle;white-space:normal;overflow-wrap:anywhere;line-height:1.15}
tbody tr:nth-child(even) td{background:#f3f5f9}
td.n{color:#7b8496;font-size:7.8pt;text-align:right;padding-right:6px}
td.nm{font-weight:700}
td.ck{text-align:center;border-left:.6pt solid #c9cfda;line-height:0}
.cx{display:inline-flex;vertical-align:middle;align-items:center;justify-content:center;width:4.2mm;height:4.2mm;border:1pt solid #4a5468;border-radius:1pt;background:#fff;font-size:9pt;font-weight:700;line-height:1;color:#1b2a41}
tr{break-inside:avoid}
tr.sep td{background:#fff!important;border:0;height:9mm;vertical-align:bottom;font-weight:700;color:#1b2a41;padding-bottom:3px}
tr.sep.gr td{height:8mm;font-size:10pt;border-bottom:1.2pt solid #1b2a41}
.res{margin-top:7mm;display:flex;gap:8mm;font-size:10pt;break-inside:avoid}
.res span{border:1px solid #c9cfda;border-radius:6px;padding:6px 12px}
.fim{margin-top:12mm;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10mm;break-inside:avoid}
.fim div{border-top:1px solid #4a5468;padding-top:3px;font-size:9pt;color:#3a4256;text-align:center}
</style></head><body>
<div class="cab"><div><h1>LISTA DE PRESENÇA</h1><div class="sub">${esc(qual)} · em ordem alfabética · marque um X em “Presente” · quem não for marcado está ausente</div></div><div class="tot">${lst.length} irmãos<br>+ ${EXTRA} linhas para acrescentar</div></div>
<div class="campos">${campo('Data', c ? dataBR(c.data) : '')}${campo('Ocasião', c ? c.ocasiao : '')}${campo('Local', c ? c.local : '')}</div>
${c && c.obs ? `<div style="font-size:9pt;margin:-3px 0 8px"><b>Observação:</b> ${esc(c.obs)}</div>` : ''}
<table><colgroup><col style="width:10mm"><col><col style="width:34mm"><col style="width:46mm"><col style="width:66mm"><col style="width:20mm"></colgroup>
<thead><tr><th style="text-align:right">Nº</th><th>Nome</th><th>Instrumento</th><th>Cidade</th><th>Bairro</th><th class="ck">Presente</th></tr></thead>
<tbody>${linhas}</tbody></table>
<div class="res"><span><b>Presentes:</b> ${k ? k.v : '______'}</span><span><b>Ausentes:</b> ${k ? k.n : '______'}</span><span><b>Total:</b> ${k ? k.t : '______'}</span></div>
<div class="fim"><div>Encarregado</div><div>Secretário</div><div>Conferido por</div></div>
</body></html>`;
}

// Ensaio Regional: ministério nome por nome + músicos por localidade (total e cada instrumento)
function documentoRegionalHTML(base, comDados) {
  const c = comDados ? base : null, X = m => `<span class="cx">${m ? '✕' : ''}</span>`;
  const min = irmaosDa(base);
  let g0 = null;
  const lMin = min.map((i, n) => { const g = cargoPlural(i.cargo); const gh = g !== g0 ? `<tr class="sep gr"><td></td><td colspan="4">${esc((g0 = g))}</td></tr>` : ''; return gh + `<tr><td class="n">${n + 1}</td><td class="nm">${esc(i.nome)}</td><td>${esc(i.cargo)}</td><td>${esc(localTxt(i))}</td><td class="ck">${X(c && c.marcas[i.id] === 'v')}</td></tr>`; }).join('')
    ;   // sem linhas sobrando: quem não está na lista é acrescentado direto na chamada
  const usados = c ? [...new Set(c.locais.flatMap(l => Object.keys(l.inst)))].sort(ordInst) : [];
  const cols = usados.length ? usados : ['Violino', 'Viola', 'Violoncelo', 'Flauta', 'Clarinete', 'Saxofone', 'Trompete', 'Trombone', 'Euphonium', 'Tuba', 'Órgão'];
  const CURTO = { Violoncelo: 'Cello', Euphonium: 'Eufônio', 'Saxofone Soprano': 'Sax sop.', 'Saxofone Alto': 'Sax alto', 'Saxofone Tenor': 'Sax tenor', 'Saxofone Barítono': 'Sax barít.', Saxofone: 'Sax', Flugelhorn: 'Flugel', 'Corne Inglês': 'C. inglês', Trombonito: 'Trombon.' };
  const locs = c ? c.locais.filter(l => l.nome.trim() || totalLocal(l)) : [];
  const vaz = Math.max(0, (c ? 4 : 17) - locs.length);
  const lLoc = locs.map(l => `<tr><td class="nm">${esc(l.nome)}</td>${cols.map(k => `<td class="q">${l.inst[k] || ''}</td>`).join('')}${usados.length ? '' : '<td class="q"></td>'}<td class="q t">${totalLocal(l)}</td></tr>`).join('')
    + Array.from({ length: vaz }, () => `<tr><td></td>${cols.map(() => '<td class="q"></td>').join('')}${usados.length ? '' : '<td class="q"></td>'}<td class="q t"></td></tr>`).join('');
  const soma = k => locs.reduce((a, l) => a + (l.inst[k] || 0), 0);
  const kk = c ? contar(c) : null;
  const tot = c ? `<tr class="tt"><td class="nm">Total</td>${cols.map(k => `<td class="q">${soma(k) || ''}</td>`).join('')}<td class="q t">${kk.musicos}</td></tr>` : `<tr class="tt"><td class="nm">Total</td>${cols.map(() => '<td class="q"></td>').join('')}<td class="q"></td><td class="q t"></td></tr>`;
  const campo = (r, v) => `<div><b>${r}:</b> ${esc(v || '')}</div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ensaio Regional${c ? ' ' + dataBR(c.data) : ''}</title><style>
@page{size:A4 landscape;margin:9mm 10mm 10mm}
*{box-sizing:border-box}
body{margin:0;font-family:Arial,'Liberation Sans',sans-serif;color:#1d2433;font-size:9.4pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cab{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1b2a41;padding-bottom:6px;margin-bottom:8px}
.cab h1{margin:0;font-size:17pt;color:#1b2a41;letter-spacing:.02em}
.cab .sub{font-size:8.6pt;color:#5b6475;margin-top:2px}
.campos{display:grid;grid-template-columns:1fr 1.6fr 1.6fr;gap:6px 14px;margin:0 0 9px}
.campos div{font-size:9pt;color:#3a4256;border-bottom:1px solid #9aa3b5;padding:9px 0 2px;min-height:22px}
.campos b{color:#1b2a41}
h2{font-size:11pt;color:#1b2a41;margin:10px 0 5px;letter-spacing:.03em}
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead{display:table-header-group}
thead th{background:#1b2a41;color:#fff;font-weight:700;font-size:7.6pt;text-transform:uppercase;letter-spacing:.04em;padding:5px 4px;text-align:left}
thead th.q,thead th.ck{text-align:center;padding:5px 1px;font-size:6.8pt;letter-spacing:0;overflow-wrap:anywhere}
tbody td{border-bottom:.6pt solid #c9cfda;padding:.6mm 5px;height:6.6mm;vertical-align:middle;overflow-wrap:anywhere;line-height:1.15}
tbody tr:nth-child(even) td{background:#f3f5f9}
td.n{color:#7b8496;font-size:7.8pt;text-align:right}
td.nm{font-weight:700}
td.q{text-align:center;border-left:.6pt solid #c9cfda;font-weight:700}
td.t{background:#eef1f6!important}
td.ck{text-align:center;border-left:.6pt solid #c9cfda;line-height:0}
tr.tt td{border-top:1.4pt solid #1b2a41;font-weight:700;background:#e8ecf3!important}
.cx{display:inline-flex;vertical-align:middle;align-items:center;justify-content:center;width:4.2mm;height:4.2mm;border:1pt solid #4a5468;border-radius:1pt;background:#fff;font-size:9pt;font-weight:700;line-height:1;color:#1b2a41}
tr{break-inside:avoid}
tr.sep td{background:#fff!important;border:0;height:8mm;vertical-align:bottom;font-weight:700;color:#1b2a41;padding-bottom:3px}
tr.sep.gr td{border-bottom:1.2pt solid #1b2a41}
.res{margin-top:6mm;display:flex;gap:6mm;font-size:10pt;break-inside:avoid}
.res span{border:1px solid #c9cfda;border-radius:6px;padding:6px 12px}
.fim{margin-top:12mm;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10mm;break-inside:avoid}
.fim div{border-top:1px solid #4a5468;padding-top:3px;font-size:9pt;color:#3a4256;text-align:center}
h2.quebra{break-after:avoid;margin-top:14px}
</style></head><body>
<div class="cab"><div><h1>ENSAIO REGIONAL · LISTA DE PRESENÇA</h1><div class="sub">Ministério e encarregados nome por nome · músicos contados por localidade</div></div></div>
<div class="campos">${campo('Data', c ? dataBR(c.data) : '')}${campo('Ocasião', c ? c.ocasiao : 'Ensaio Regional')}${campo('Local', c ? c.local : '')}</div>
${c && c.obs ? `<div style="font-size:9pt;margin:-3px 0 8px"><b>Observação:</b> ${esc(c.obs)}</div>` : ''}
<h2>Ministério e encarregados</h2>
<table><colgroup><col style="width:10mm"><col><col style="width:62mm"><col style="width:80mm"><col style="width:20mm"></colgroup>
<thead><tr><th style="text-align:right">Nº</th><th>Nome</th><th>Cargo</th><th>Localidade</th><th class="ck">Presente</th></tr></thead><tbody>${lMin}</tbody></table>
<h2 class="quebra">Músicos por localidade</h2>
<table><colgroup><col style="width:58mm">${cols.map(() => '<col>').join('')}${usados.length ? '' : '<col>'}<col style="width:16mm"></colgroup>
<thead><tr><th>Localidade</th>${cols.map(k => `<th class="q">${esc(CURTO[k] || k)}</th>`).join('')}${usados.length ? '' : '<th class="q">Outros</th>'}<th class="q">Total</th></tr></thead><tbody>${lLoc}${tot}</tbody></table>
<div class="res"><span><b>Ministério presente:</b> ${kk ? kk.v : '______'}</span><span><b>Músicos:</b> ${kk ? kk.musicos : '______'}</span><span><b>Localidades:</b> ${kk ? kk.locs : '______'}</span></div>
<div class="fim"><div>Encarregado regional</div><div>Secretário</div><div>Conferido por</div></div>
</body></html>`;
}

/* ---------- Relatório do Ensaio Regional (igual ao modelo em papel) ----------
   Instrumentos na ordem do relatório; cada linha junta os nomes que contam nela.
   Órgão conta como organista. Total geral = músicos e organistas + anciães, diáconos e
   cooperadores (encarregados e examinadoras já estão entre os músicos e organistas). */
const LIVROS = ['Gênesis', 'Êxodo', 'Levítico', 'Números', 'Deuteronômio', 'Josué', 'Juízes', 'Rute', '1 Samuel', '2 Samuel', '1 Reis', '2 Reis', '1 Crônicas', '2 Crônicas', 'Esdras', 'Neemias', 'Ester', 'Jó', 'Salmos', 'Provérbios', 'Eclesiastes', 'Cantares', 'Isaías', 'Jeremias', 'Lamentações', 'Ezequiel', 'Daniel', 'Oséias', 'Joel', 'Amós', 'Obadias', 'Jonas', 'Miquéias', 'Naum', 'Habacuque', 'Sofonias', 'Ageu', 'Zacarias', 'Malaquias', 'Mateus', 'Marcos', 'Lucas', 'João', 'Atos', 'Romanos', '1 Coríntios', '2 Coríntios', 'Gálatas', 'Efésios', 'Filipenses', 'Colossenses', '1 Tessalonicenses', '2 Tessalonicenses', '1 Timóteo', '2 Timóteo', 'Tito', 'Filemom', 'Hebreus', 'Tiago', '1 Pedro', '2 Pedro', '1 João', '2 João', '3 João', 'Judas', 'Apocalipse'];
const REL_INST = [
  ['VIOLINO', ['Violino'], 'c'], ['VIOLA', ['Viola'], 'c'], ['VIOLONCELO', ['Violoncelo'], 'c'],
  ['FLAUTA', ['Flauta'], 'm'], ['CLARINETE', ['Clarinete'], 'm'], ['CLARINETE ALTO', ['Clarinete Alto'], 'm'], ['CLARINETE BAIXO', ['Clarinete Baixo', 'Clarone'], 'm'],
  ["OBOÉ / OBOÉ D' AMORE", ['Oboé', "Oboé d'Amore", 'Oboé d Amore'], 'm'], ['CORNE INGLÊS', ['Corne Inglês'], 'm'], ['FAGOTE', ['Fagote'], 'm'],
  ['SAXOFONE SOPRANO', ['Saxofone Soprano', 'Sax Soprano'], 'm'], ['SAXOFONE ALTO', ['Saxofone Alto', 'Sax Alto', 'Saxofone'], 'm'], ['SAXOFONE TENOR', ['Saxofone Tenor', 'Sax Tenor'], 'm'],
  ['SAXOFONE BARÍTONO', ['Saxofone Barítono', 'Sax Barítono'], 'm'], ['SAXOFONE BAIXO', ['Saxofone Baixo', 'Sax Baixo'], 'm'],
  ['TROMPETE / CORNET', ['Trompete', 'Cornet'], 'b'], ['FLUGELHORN', ['Flugelhorn'], 'b'], ['TROMPA', ['Trompa'], 'b'], ['TROMBONE / TROMBONITO', ['Trombone', 'Trombonito'], 'b'],
  ['EUPHONIO / BARÍTONO DE PISTO', ['Euphonium', 'Euphonio', 'Eufônio', 'Barítono', 'Barítono de Pisto'], 'b'], ['TUBA', ['Tuba'], 'b'], ['ACORDEON', ['Acordeon', 'Acordeão'], '']
];
const REL_MIN = [['ANCIÃES', /ancia/, 1], ['DIÁCONOS', /diacon/, 1], ['COOPERADORES CULTO OFICIAL', /cooperador.*(oficio|culto)/, 1], ['COOPERADORES DE JOVENS E MENORES', /cooperador.*jove/, 1], ['ENCARREGADOS REGIONAIS', /encarregad.*regional/, 0], ['ENCARREGADOS LOCAIS', /encarregad.*local/, 0], ['EXAMINADORAS', /examinador/, 0]];
const listaHinos = c => String(c.hinos || '').split(/[\s,;/]+/).map(x => x.trim()).filter(Boolean);
// presentes do ministério (os 7 cargos do relatório), com o instrumento que tocou (se tocou)
const minPresentes = c => DB.irmaos.filter(i => c.marcas[i.id] === 'v' && catDe(i) >= 0).map(i => ({ i, inst: ((c.toca || {})[i.id] || {}).inst || '', loc: ((c.toca || {})[i.id] || {}).loc || locPadrao(i) }));
// junta contagens de instrumentos nas linhas do relatório (REL_INST); o que não casar vira linha própria
function relLinhas(soma, nomes) {
  const usados = new Set();
  const inst = REL_INST.map(([rot, al, fam]) => { let n = 0; al.forEach(a => { const k = norm(a); if (soma[k] && !usados.has(k)) { n += soma[k]; usados.add(k); } }); return { rot, n, fam }; });
  Object.keys(soma).forEach(k => { if (!usados.has(k) && soma[k]) inst.push({ rot: (nomes[k] || k).toUpperCase(), n: soma[k], fam: '' }); });
  return inst;
}
function relDados(c) {
  const soma = {}, nomes = {}; let org = 0, mus = 0;
  const conta = (k, n) => { const z = norm(k); soma[z] = (soma[z] || 0) + n; nomes[z] = nomes[z] || k; };
  (c.locais || []).forEach(l => {
    let o = 0;
    Object.keys(l.inst || {}).forEach(k => { const n = +l.inst[k] || 0; if (norm(k) === 'orgao') o += n; else conta(k, n); });
    org += o; mus += Math.max(0, totalLocal(l) - o);
  });
  // quem é do ministério e tocou entra no instrumento (e conta uma vez só no total geral)
  const pres = minPresentes(c); let semInst = 0;
  pres.forEach(p => { if (!p.inst) { semInst++; return; } if (norm(p.inst) === 'orgao') org++; else { conta(p.inst, 1); mus++; } });
  const inst = relLinhas(soma, nomes);
  const base = inst.reduce((a, r) => a + r.n, 0), fam = f => inst.filter(r => r.fam === f).reduce((a, r) => a + r.n, 0);
  const pct = f => base ? Math.round(fam(f) * 100 / base) + '%' : '';
  const min = REL_MIN.map(([rot], k) => ({ rot, n: pres.filter(p => catDe(p.i) === k).length }));
  const minT = pres.length;
  return { inst, mus, org, tot: mus + org, min, minT, geral: mus + org + semInst, hinos: listaHinos(c), fam: { c: pct('c'), m: pct('m'), b: pct('b') } };
}
// Relatório por localidade: músicos e organistas lançados + quem é do ministério (pela localidade dele)
function locDados(c) {
  const mapa = new Map();
  const pega = nome => { nome = String(nome || '').trim() || 'Sem localidade'; const k = norm(nome); if (!mapa.has(k)) mapa.set(k, { nome, soma: {}, nomes: {}, mus: 0, org: 0, min: [] }); return mapa.get(k); };
  const conta = (x, k, n) => { const z = norm(k); x.soma[z] = (x.soma[z] || 0) + n; x.nomes[z] = x.nomes[z] || k; };
  (c.locais || []).forEach(l => {
    if (!l.nome.trim() && !totalLocal(l)) return;
    const x = pega(l.nome); let o = 0;
    Object.keys(l.inst || {}).forEach(k => { const n = +l.inst[k] || 0; if (norm(k) === 'orgao') o += n; else conta(x, k, n); });
    x.org += o; x.mus += Math.max(0, totalLocal(l) - o);
  });
  minPresentes(c).forEach(p => {
    const x = pega(p.loc); x.min.push(p);
    if (p.inst) { if (norm(p.inst) === 'orgao') x.org++; else { conta(x, p.inst, 1); x.mus++; } }
  });
  return [...mapa.values()].map(x => Object.assign(x, { inst: relLinhas(x.soma, x.nomes).filter(r => r.n), semInst: x.min.filter(p => !p.inst).length }))
    .map(x => Object.assign(x, { total: x.mus + x.org + x.semInst }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
// ícones das famílias (preto, para imprimir): violino e trombone a partir das imagens enviadas; clarinete desenhado
const REL_ICO = {
  c: '<svg viewBox="0 0 267 360" aria-hidden="true"><path fill="#000" fill-rule="evenodd" d="M66.4 357.0C38.3 350.7 15.6 332.0 5.2 306.8C3.2 301.8 2.5 298.4 2.2 290.5C1.7 277.3 2.0 276.8 12.5 276.9C25.7 276.9 35.6 280.1 45.3 287.5C55.6 295.4 60.1 304.4 62.6 322.3C64.4 335.0 66.0 339.3 72.5 348.5C76.8 354.5 77.9 358.0 75.5 358.6C75.0 358.7 70.8 358.0 66.4 357.0ZM88.6 357.0C84.9 355.9 72.5 343.8 69.9 338.7C68.7 336.5 67.3 330.3 66.4 323.2C64.8 310.2 63.9 306.8 60.2 299.5C52.4 284.0 29.1 271.7 10.4 273.2C4.1 273.7 4.1 273.5 6.6 264.9C10.7 251.2 20.2 240.0 34.9 231.5C39.5 228.8 43.4 226.1 43.7 225.4C44.3 223.7 44.8 220.9 44.9 218.4C45.0 217.2 45.9 215.1 47.0 213.7L49.1 211.1L55.4 214.5C62.3 218.3 67.3 218.9 71.9 216.6C77.1 213.9 85.7 203.3 90.4 194.0C97.2 180.4 97.8 171.9 92.0 169.8C87.6 168.3 88.4 165.3 94.2 161.6C96.2 160.3 97.2 158.3 98.6 152.8C102.5 136.8 112.9 122.0 124.7 115.7C131.7 112.0 142.9 109.7 150.0 110.5C153.0 110.9 158.8 112.3 162.8 113.7C166.9 115.0 170.3 116.0 170.4 115.8C170.6 115.7 180.9 100.1 193.3 81.2L215.9 47.0L207.6 41.6C198.5 35.7 197.7 34.9 198.6 32.6C199.5 30.2 200.8 30.6 210.5 36.4L219.5 41.8L222.2 37.7L224.9 33.6L219.7 30.3C215.1 27.5 214.3 27.3 212.9 28.6C210.6 30.7 208.4 30.3 206.1 27.4C202.1 22.3 204.3 16.0 210.6 14.4C214.0 13.5 218.5 16.8 218.5 20.1C218.5 22.0 219.7 23.1 223.7 25.3L228.8 28.0L231.8 23.2C234.6 18.5 234.7 18.3 232.9 17.2C230.7 15.8 230.4 11.3 232.4 8.8C233.3 7.6 235.1 7.0 238.0 7.0C241.6 7.0 242.8 6.5 244.9 3.9C247.2 1.2 247.8 1.0 250.1 1.8C251.5 2.4 253.4 3.6 254.4 4.5C255.9 6.1 255.9 6.4 253.8 10.1L251.6 14.0L254.5 17.0C257.4 20.0 257.4 20.0 255.7 23.5C253.7 27.7 251.8 28.7 248.5 27.2C246.4 26.2 245.9 26.4 245.0 28.1C243.6 30.6 244.1 31.3 249.6 34.4L254.2 37.0L256.0 34.7L257.8 32.5L260.5 35.0C264.7 38.9 266.3 42.6 264.9 45.3C263.4 48.1 262.1 49.0 259.2 49.0C256.6 49.0 256.5 49.2 258.6 53.2C260.7 57.2 259.7 60.6 255.8 62.6C250.4 65.4 244.0 63.0 244.0 58.1C244.0 56.0 243.0 54.9 238.9 52.7C236.1 51.1 233.6 50.1 233.2 50.4C232.9 50.8 223.1 68.5 211.4 89.8L190.2 128.5L192.9 130.5C205.1 139.8 210.7 146.5 214.4 156.0C216.8 162.1 217.6 174.4 216.0 181.1C213.2 193.0 203.9 206.5 192.9 214.6C189.3 217.2 188.0 218.8 188.0 220.6C188.0 222.0 187.3 224.5 186.4 226.2L184.8 229.2L182.6 227.1C179.5 224.2 175.1 224.4 170.4 227.9C158.0 237.0 147.0 254.6 147.0 265.1C147.0 269.7 147.4 270.5 151.7 275.1C154.3 277.9 157.7 280.8 159.3 281.6L162.1 283.1L158.6 287.1C156.3 289.5 155.0 292.0 155.0 293.8C154.9 300.4 151.6 311.2 146.5 321.8C139.4 336.2 130.6 345.7 119.0 351.4C107.9 356.8 95.6 359.1 88.6 357.0ZM101.0 270.5C109.4 258.9 117.4 248.0 118.8 246.2C120.1 244.5 120.8 243.0 120.4 243.0C119.3 243.1 116.8 246.5 98.8 271.4C91.2 281.9 85.0 290.9 85.0 291.4C85.0 292.6 83.7 294.4 101.0 270.5ZM95.4 264.1C104.6 249.6 111.9 237.5 111.6 237.3C111.1 236.8 109.4 239.2 91.1 268.2C83.9 279.6 78.0 289.5 78.0 290.1C78.0 291.8 77.0 293.2 95.4 264.1ZM85.5 265.8C92.0 253.5 98.6 241.1 100.3 238.2C101.9 235.4 102.8 233.0 102.3 233.0C101.8 233.0 97.2 240.8 92.2 250.2C87.1 259.7 80.5 272.1 77.5 277.8C74.5 283.4 72.4 288.0 72.9 288.0C73.3 288.0 79.0 278.0 85.5 265.8ZM142.1 276.1C144.1 274.5 144.3 273.8 143.5 271.4C142.7 269.3 141.8 268.5 140.0 268.5C137.9 268.5 137.4 269.0 137.2 271.8C136.8 275.6 135.0 276.0 131.9 272.9C130.1 271.1 129.8 270.0 130.3 265.9C131.2 258.7 134.1 253.0 140.3 246.2C147.3 238.6 149.3 234.7 149.4 228.8C149.4 221.1 143.8 217.3 139.5 222.0C138.0 223.6 138.0 224.2 139.0 225.5C140.8 227.7 141.9 227.4 143.0 224.4C144.4 220.8 146.5 222.0 146.4 226.2C146.3 228.6 144.3 233.1 139.8 240.6C130.5 256.0 128.9 259.6 128.4 265.4C127.8 271.3 129.3 274.8 133.0 276.7C136.5 278.5 139.4 278.3 142.1 276.1ZM131.0 240.6C131.7 239.6 131.8 238.5 131.2 237.5C130.2 235.6 104.4 220.0 102.3 220.0C101.6 220.0 100.6 221.0 99.9 222.1C99.1 223.8 99.1 224.5 100.2 225.5C102.5 227.9 126.4 241.9 128.1 241.9C129.0 242.0 130.3 241.3 131.0 240.6ZM77.8 235.1C83.6 232.1 87.1 228.2 95.0 216.4C103.0 204.4 104.3 203.0 107.7 203.0C110.1 203.0 110.9 204.5 108.8 205.2C107.0 205.8 108.8 209.2 110.7 208.8C112.9 208.4 113.7 203.5 111.9 201.4C110.3 199.5 104.0 199.6 101.0 201.7C97.2 204.3 96.2 205.7 91.5 215.6C86.5 226.2 82.5 231.1 76.6 233.9C71.3 236.5 70.5 236.5 68.0 234.0C65.7 231.7 66.1 230.0 69.0 230.0C71.2 230.0 72.4 227.2 70.9 225.4C69.3 223.4 65.6 223.7 63.6 225.9C60.1 229.8 65.0 237.0 71.2 237.0C72.8 237.0 75.7 236.1 77.8 235.1ZM136.1 216.2C139.8 209.8 149.6 192.3 158.0 177.5C166.4 162.7 182.1 134.8 193.0 115.5C213.8 78.7 242.9 27.0 243.7 25.7C243.9 25.3 243.7 25.0 243.1 25.0C242.6 25.0 238.6 31.4 234.2 39.3C229.8 47.1 219.4 65.7 211.0 80.5C202.6 95.3 189.8 118.1 182.5 131.0C175.2 143.9 160.5 170.1 149.7 189.1C126.3 230.6 127.7 228.0 128.7 228.0C129.1 228.0 132.5 222.7 136.1 216.2ZM145.3 182.5C210.2 74.9 240.9 23.6 240.5 23.2C239.8 22.5 240.5 21.3 224.2 48.5C211.8 69.2 141.9 185.3 124.8 213.5C120.5 220.7 118.6 225.0 120.8 222.4C121.3 221.9 132.3 203.9 145.3 182.5ZM130.0 191.0C160.3 143.9 219.6 50.0 227.0 37.5C238.8 17.4 203.8 72.1 142.3 169.6C116.3 210.8 116.2 211.0 117.8 209.5C118.3 208.9 123.9 200.6 130.0 191.0ZM250.6 44.6C250.1 42.4 243.0 37.0 240.7 37.0C239.6 37.0 236.7 43.4 237.6 43.7C238.1 43.9 240.8 45.4 243.5 47.0C247.7 49.5 248.7 49.7 249.9 48.5C250.7 47.7 251.0 46.2 250.6 44.6Z"/></svg>',
  m: '<svg viewBox="0 0 48 48" aria-hidden="true"><g transform="rotate(-32 24 24)"><path d="M23.3 1.6h1.4l.6 4.4h-2.6z" fill="#000"/><rect x="22.4" y="6" width="3.2" height="1.4" fill="#000" stroke="#fff" stroke-width=".3"/><path d="M22.5 7.4h3l.3 3h-3.6z" fill="#000"/><path d="M22.4 10.4h3.2v28.4h-3.2z" fill="#000"/><path d="M22.4 38.8c-.2 2.4-1.6 4.6-3.6 6.6h10.4c-2-2-3.4-4.2-3.6-6.6z" fill="#000"/><path d="M18.8 45.4h10.4" stroke="#000" stroke-width="1"/><path d="M22.4 10.4h3.2M22.4 22.6h3.2M22.4 23.6h3.2M22.4 38.8h3.2" stroke="#fff" stroke-width=".35"/><g fill="none" stroke="#fff" stroke-width=".4"><circle cx="24" cy="13.6" r=".7"/><circle cx="24" cy="16.2" r=".7"/><circle cx="24" cy="18.8" r=".7"/><circle cx="24" cy="26.6" r=".7"/><circle cx="24" cy="29.2" r=".7"/><circle cx="24" cy="31.8" r=".7"/></g><path d="M25.6 12.4h1.1v8.4h-1.1M25.6 25.4h1.1v9.6h-1.1" fill="none" stroke="#000" stroke-width=".6"/><path d="M21.4 15v4.8M21.4 28.2v5.2" stroke="#000" stroke-width=".8" stroke-linecap="round"/></g></svg>',
  b: '<svg viewBox="0 0 205 520" aria-hidden="true"><path fill="#000" fill-rule="evenodd" d="M51.9 518.3C48.9 517.5 44.8 516.5 42.8 516.1C36.2 514.6 29.1 508.4 25.8 501.1C24.0 497.2 23.8 494.0 23.4 472.1C23.2 458.6 22.8 436.2 22.6 422.5C22.3 408.8 22.1 383.2 22.1 365.7C22.0 334.7 21.9 333.8 20.0 333.3C18.1 332.8 17.5 331.3 18.0 328.0C18.1 327.0 17.5 327.3 16.1 328.8C13.7 331.7 12.0 330.9 12.0 326.9C12.0 324.1 12.9 323.2 14.4 324.7C15.9 326.2 18.0 325.7 18.0 323.9C18.0 322.6 18.7 322.0 20.2 322.0C22.2 322.0 22.3 321.8 21.7 312.2C21.3 306.9 20.7 300.7 20.4 298.5C20.0 296.3 20.1 294.8 20.5 295.2C20.9 295.6 21.6 298.3 22.0 301.2C22.7 306.3 22.8 306.4 22.9 302.4C23.0 297.9 21.3 292.0 19.9 292.0C19.5 292.0 19.3 292.7 19.7 293.6C20.2 295.0 20.0 295.1 18.1 294.0C16.1 293.0 15.5 293.1 13.5 295.0C10.6 297.8 9.2 295.9 11.5 292.3C13.0 290.1 13.7 289.8 17.6 290.3C21.9 290.7 22.0 290.7 22.0 287.8C22.0 285.0 21.8 284.8 18.7 285.3C16.3 285.6 14.8 285.1 12.7 283.4C9.6 280.8 5.0 280.2 5.0 282.4C5.0 283.9 2.6 285.2 1.6 284.3C0.3 283.0 1.0 275.2 2.5 274.6C3.4 274.3 4.0 274.6 4.0 275.5C4.0 277.7 8.9 277.4 12.9 274.9C15.0 273.6 17.2 273.1 18.6 273.4C20.4 273.9 21.0 273.6 21.0 272.4C21.0 271.3 20.2 270.9 18.2 271.1C15.7 271.4 13.7 270.2 9.5 266.2C7.6 264.4 6.1 264.7 4.1 267.2C3.1 268.4 1.8 269.0 1.2 268.6C-0.4 267.7 -0.3 262.7 1.2 261.2C2.9 259.5 4.0 259.7 4.0 261.6C4.0 263.0 4.8 263.2 8.2 262.7C10.5 262.4 12.9 261.4 13.6 260.6C14.2 259.7 16.1 259.0 17.9 259.0C19.6 259.0 21.0 258.6 21.0 258.0C21.0 257.4 19.6 257.0 17.9 257.0C14.8 257.0 8.5 252.8 9.7 251.6C10.1 251.3 9.1 251.0 7.6 251.0C6.0 251.0 5.1 251.4 5.5 252.0C5.8 252.5 5.6 253.0 5.1 253.0C4.5 253.0 4.0 253.7 4.0 254.5C4.0 256.5 1.4 256.4 0.6 254.4C-0.5 251.5 -0.0 247.3 1.6 246.0C2.9 244.9 3.2 245.0 3.7 246.8C4.5 250.1 9.1 249.7 13.1 245.9C15.5 243.7 17.0 243.0 18.7 243.5L21.1 244.1L21.0 201.6C20.9 178.2 21.1 158.6 21.5 158.0C22.5 156.4 21.2 143.6 19.4 137.3C18.6 134.3 17.1 131.4 15.8 130.6C11.7 127.7 14.8 126.8 25.9 127.5C36.5 128.3 37.8 129.1 34.1 132.4C32.1 134.2 30.9 138.6 30.4 145.5C30.3 147.7 29.8 151.0 29.5 152.7C29.1 154.5 29.1 156.8 29.5 157.7C30.0 158.7 30.2 162.0 30.1 165.1L29.8 170.7L36.1 171.3C45.8 172.4 51.3 172.1 54.4 170.5C57.3 169.0 59.2 169.1 66.8 171.6C69.2 172.4 71.6 172.7 72.2 172.4C72.8 172.0 75.4 171.8 78.1 171.9C83.7 172.0 85.1 170.4 83.0 166.6C82.0 164.7 82.1 163.7 83.4 161.2C84.7 158.6 84.9 155.9 84.4 145.3C83.5 126.6 83.9 48.0 85.0 37.5C86.6 22.4 88.2 18.5 95.9 10.9C104.7 2.2 109.4 0.5 124.5 0.5C134.4 0.5 136.1 0.8 141.5 3.3C148.7 6.6 156.3 13.7 159.5 20.1C160.9 22.7 162.4 27.7 162.9 31.1C163.4 34.6 164.1 66.1 164.4 101.0C165.5 220.6 166.1 249.5 167.5 267.0C168.2 276.6 169.2 288.8 169.5 294.0C170.6 309.7 173.7 323.7 177.6 330.7C181.7 338.1 185.4 341.4 194.0 345.2C197.6 346.8 201.5 349.1 202.8 350.2C205.6 352.9 205.7 357.5 203.1 359.0C200.6 360.3 199.7 360.3 200.5 359.0C200.9 358.3 200.3 358.3 198.6 359.0C197.2 359.5 191.3 360.9 185.3 362.0C171.1 364.8 144.4 365.1 132.7 362.6C124.3 360.8 116.5 357.8 113.7 355.3C112.3 354.0 112.0 354.0 112.0 355.1C112.0 356.9 119.6 360.6 128.0 363.0C135.4 365.1 134.7 365.6 126.8 363.9C113.5 361.0 106.9 355.8 110.3 350.7C112.2 347.8 117.7 345.0 121.7 345.0C125.1 344.9 131.3 339.6 135.7 333.0C142.8 322.4 145.6 308.6 148.4 269.5C150.2 245.8 152.0 203.4 152.0 187.1L152.0 176.2L145.8 175.6C129.8 173.9 127.7 172.8 120.7 162.2C114.7 153.1 112.0 151.6 101.5 151.6L93.5 151.5L92.9 155.5C92.0 160.9 92.6 162.0 96.1 161.3C99.4 160.7 101.1 163.1 99.3 165.9C98.1 167.6 97.7 167.6 94.6 166.4C92.8 165.7 92.7 166.4 93.6 191.1C94.1 205.1 94.3 223.6 94.1 232.3C93.8 246.4 94.0 248.3 95.6 250.1C97.2 251.8 97.2 252.1 95.8 253.3C93.7 254.8 92.9 263.8 94.7 264.5C96.6 265.2 96.3 267.1 94.2 267.6C92.9 268.0 92.5 269.2 92.5 273.0C92.5 276.8 92.9 278.0 94.2 278.4C96.3 278.9 96.6 282.0 94.6 282.0C93.6 282.0 93.1 283.5 92.8 287.0C92.5 291.4 92.7 292.0 94.8 292.5C97.6 293.2 97.6 294.8 94.9 295.8C92.8 296.6 92.8 297.2 92.8 313.6C93.0 364.6 94.2 477.7 94.5 478.8C94.8 479.4 95.3 480.0 95.7 480.0C96.1 480.0 96.3 475.9 96.1 470.9C95.9 463.6 96.1 461.9 97.1 462.2C99.7 463.1 101.4 479.2 99.9 487.9C98.1 498.0 97.1 500.1 94.6 499.4C92.7 499.0 92.1 499.5 90.5 503.0C85.3 514.5 66.6 521.9 51.9 518.3ZM70.5 515.5C79.0 513.2 82.3 510.8 85.7 504.3C89.3 497.4 91.1 487.0 88.6 487.0C87.6 487.0 86.9 488.6 86.4 492.7C84.4 508.8 75.6 514.9 55.1 514.3C43.4 513.9 35.7 509.9 31.0 501.8C29.4 498.9 28.0 495.3 28.0 493.8C28.0 492.2 27.6 491.0 27.0 491.0C24.5 491.0 26.8 499.3 31.1 505.5C37.4 514.9 55.4 519.4 70.5 515.5ZM70.8 508.5C82.6 505.0 85.5 499.1 85.5 478.5C85.5 470.8 85.2 463.7 84.8 462.7C84.1 461.1 82.1 461.0 58.3 461.2L32.5 461.5L32.5 477.0C32.5 495.1 33.8 500.1 39.7 504.6C46.4 509.7 60.6 511.5 70.8 508.5ZM96.2 489.4C96.4 487.5 96.2 485.6 95.7 485.3C94.5 484.5 94.0 485.3 93.3 489.4C92.9 492.2 93.1 493.0 94.3 493.0C95.3 493.0 95.9 491.8 96.2 489.4ZM27.5 489.0C27.8 488.4 27.6 488.0 27.1 488.0C26.5 488.0 26.0 488.4 26.0 489.0C26.0 489.6 26.2 490.0 26.4 490.0C26.7 490.0 27.2 489.6 27.5 489.0ZM27.0 467.0C27.0 455.7 26.6 449.0 26.0 449.0C25.4 449.0 25.0 455.1 25.0 465.4C25.0 480.2 25.4 485.0 26.6 485.0C26.8 485.0 27.0 476.9 27.0 467.0ZM89.6 472.4C89.6 463.0 89.4 461.3 88.4 463.1C87.7 464.5 87.4 468.9 87.6 474.9C87.9 486.4 87.8 485.5 88.8 484.6C89.2 484.2 89.5 478.7 89.6 472.4ZM88.0 458.5C88.0 456.6 87.5 454.8 87.0 454.5C86.4 454.1 86.0 455.7 86.0 458.5C86.0 461.3 86.4 462.9 87.0 462.5C87.5 462.2 88.0 460.4 88.0 458.5ZM39.0 459.0C39.0 458.4 37.6 458.0 36.0 458.0C34.4 458.0 33.0 458.4 33.0 459.0C33.0 459.6 34.4 460.0 36.0 460.0C37.6 460.0 39.0 459.6 39.0 459.0ZM74.9 459.5C74.6 459.3 66.8 458.9 57.5 458.6C48.1 458.4 42.3 458.6 44.5 459.0C48.9 459.8 75.6 460.3 74.9 459.5ZM84.5 459.0C83.8 457.8 78.0 458.0 78.0 459.2C78.0 459.6 79.6 460.0 81.6 460.0C83.7 460.0 84.9 459.6 84.5 459.0ZM85.0 452.4C85.6 451.0 85.7 449.3 85.3 448.7C84.9 448.0 84.7 442.7 84.9 436.9L85.2 426.3L78.3 425.7C74.6 425.3 62.9 425.0 52.4 425.0C36.9 425.0 33.0 425.3 32.0 426.5C31.2 427.5 31.0 431.5 31.4 440.7C31.6 447.7 31.9 453.6 31.9 453.7C32.1 454.1 42.8 454.5 62.8 454.8L84.0 455.0L85.0 452.4ZM89.5 451.8C89.0 449.3 88.2 448.4 87.4 449.3C86.4 450.2 87.9 455.2 89.0 454.5C89.5 454.2 89.7 453.0 89.5 451.8ZM26.5 430.8C25.4 406.5 25.2 298.0 26.1 298.0C26.6 298.0 27.0 296.2 27.0 294.0C27.0 291.8 26.6 290.0 26.0 290.0C25.4 290.0 25.0 288.9 25.0 287.5C25.0 286.1 24.7 285.0 24.2 285.0C23.8 285.0 23.5 292.5 23.4 301.8C23.3 311.0 23.0 321.1 22.6 324.4C22.1 328.1 22.2 330.0 22.8 329.6C23.6 329.1 24.5 380.5 24.5 436.3C24.5 444.6 24.8 447.0 25.9 447.0C27.0 447.0 27.1 444.1 26.5 430.8ZM89.7 435.4C89.8 426.1 89.7 424.8 88.5 426.3C87.8 427.3 87.0 427.7 86.8 427.3C86.5 426.9 86.5 427.1 86.7 427.8C86.8 428.6 87.0 433.2 87.0 438.2C87.0 444.8 87.3 447.1 88.2 446.8C89.1 446.5 89.5 443.0 89.7 435.4ZM85.0 423.5C85.0 422.8 83.7 422.6 81.5 422.8C77.0 423.3 77.0 424.5 81.5 424.6C83.5 424.6 85.0 424.2 85.0 423.5ZM37.5 423.0C37.2 422.4 35.8 422.0 34.4 422.0C33.1 422.0 32.0 422.4 32.0 423.0C32.0 423.6 33.4 424.0 35.1 424.0C36.8 424.0 37.9 423.6 37.5 423.0ZM75.0 423.0C75.0 422.4 68.5 422.0 57.4 422.0C46.0 422.0 40.1 422.3 40.5 423.0C41.3 424.4 75.0 424.4 75.0 423.0ZM87.1 418.7C86.3 417.9 86.0 418.3 86.0 420.1C86.0 423.4 87.4 424.8 87.8 422.0C88.0 420.8 87.7 419.3 87.1 418.7ZM89.7 420.8C89.4 420.0 89.1 420.3 89.1 421.4C89.0 422.5 89.3 423.1 89.6 422.7C89.9 422.4 90.0 421.5 89.7 420.8ZM84.8 400.9L85.0 383.3L79.7 383.8C71.0 384.5 66.9 381.6 64.0 372.7L62.3 367.5L46.4 367.5L30.5 367.5L30.2 373.5C30.0 376.8 30.1 388.2 30.5 398.9L31.2 418.2L35.1 417.6C37.3 417.3 39.1 417.4 39.5 418.0C39.9 418.7 48.0 418.9 62.3 418.8L84.5 418.5L84.8 400.9ZM88.9 393.5C88.8 380.1 88.4 369.2 88.1 369.4C87.8 369.6 87.5 367.5 87.4 364.7C87.4 361.4 87.6 360.3 88.1 361.6C88.6 362.6 88.9 358.4 88.8 352.1C88.8 340.1 88.4 337.6 86.8 338.6C85.9 339.2 86.7 415.7 87.7 417.2C87.9 417.7 88.3 418.0 88.6 418.0C88.8 418.0 89.0 407.0 88.9 393.5ZM74.0 381.5C74.0 381.3 73.0 380.5 71.8 379.9C69.7 378.8 69.6 378.8 70.9 380.3C72.2 381.9 74.0 382.6 74.0 381.5ZM85.0 381.1C85.0 380.6 84.1 380.4 83.0 380.7C81.9 381.0 81.0 381.4 81.0 381.6C81.0 381.8 81.9 382.0 83.0 382.0C84.1 382.0 85.0 381.6 85.0 381.1ZM67.1 375.7C66.1 374.8 66.0 374.9 66.6 376.3C66.9 377.3 67.5 377.8 67.8 377.5C68.1 377.2 67.8 376.4 67.1 375.7ZM83.8 374.8C85.1 373.5 85.4 369.4 84.2 368.7C83.8 368.4 80.8 368.0 77.5 367.9C72.4 367.6 71.5 367.8 71.2 369.3C71.0 370.3 71.6 372.2 72.4 373.5C73.7 375.5 74.9 376.0 78.3 376.0C80.7 376.0 83.1 375.5 83.8 374.8ZM67.4 368.5C67.8 367.5 67.3 367.0 66.0 367.0C64.7 367.0 64.2 367.5 64.6 368.5C65.0 369.3 65.6 370.0 66.0 370.0C66.4 370.0 67.0 369.3 67.4 368.5ZM84.0 366.1C84.0 365.6 82.4 365.0 80.5 364.8C77.8 364.5 77.3 364.7 78.2 365.7C79.4 367.2 84.0 367.5 84.0 366.1ZM140.0 366.2C138.1 365.8 145.7 365.5 157.0 365.5C174.4 365.5 178.9 365.2 187.0 363.3C192.2 362.1 197.4 360.9 198.5 360.5C199.8 360.1 199.7 360.4 198.0 361.3C191.9 364.9 183.8 366.1 163.5 366.5C152.5 366.7 141.9 366.6 140.0 366.2ZM37.0 365.0C37.0 364.4 35.6 364.0 33.9 364.0C32.2 364.0 31.1 364.4 31.5 365.0C31.8 365.6 33.2 366.0 34.6 366.0C35.9 366.0 37.0 365.6 37.0 365.0ZM75.5 365.1C75.1 364.4 68.4 364.0 56.9 364.0C47.0 364.0 39.1 364.4 39.4 364.8C39.7 365.3 48.1 365.8 58.0 365.9C70.6 366.0 76.0 365.8 75.5 365.1ZM84.6 358.3C85.7 352.7 84.3 326.1 82.9 324.3C81.7 322.9 72.8 318.0 71.5 318.0C71.1 318.0 71.0 327.8 71.1 339.8L71.4 361.5L77.7 361.6L84.0 361.7L84.6 358.3ZM62.6 355.8C62.3 352.9 62.0 349.3 62.0 347.9C62.0 345.4 61.6 345.2 56.1 344.6C49.3 343.8 31.9 345.8 30.8 347.4C29.8 348.8 29.8 359.4 30.7 360.3C31.0 360.7 38.5 361.0 47.3 361.0L63.3 361.0L62.6 355.8ZM65.7 353.5C65.7 350.5 65.4 348.3 64.9 348.6C63.8 349.3 63.7 359.0 64.8 359.0C65.3 359.0 65.7 356.5 65.7 353.5ZM149.8 346.7C151.0 345.6 152.0 343.9 152.0 342.9C152.0 340.8 154.0 339.2 154.1 341.2C154.1 341.9 154.6 341.0 155.1 339.3C155.6 337.5 156.6 336.1 157.3 336.3C158.2 336.4 158.5 334.1 158.6 327.8C158.7 322.9 159.0 318.4 159.3 317.5C159.7 316.7 159.5 315.8 159.1 315.6C158.3 315.0 158.6 284.6 159.5 282.2C159.7 281.6 159.4 281.0 158.8 281.0C157.9 281.0 157.9 280.7 158.7 279.9C159.4 279.2 159.5 277.5 158.9 275.2C158.4 272.9 158.5 271.1 159.2 270.3C160.0 269.3 160.0 268.3 159.2 266.5C158.4 264.8 158.4 263.2 159.1 261.3C159.7 259.5 159.7 258.5 159.1 258.0C158.4 257.6 158.1 244.6 158.3 220.2C158.5 183.6 158.5 183.0 156.5 183.0C154.6 183.0 154.5 183.7 154.3 211.3C154.2 226.8 153.8 245.1 153.4 252.0C153.1 258.9 152.6 268.1 152.4 272.5C152.0 282.3 151.4 288.7 150.6 292.0C149.4 297.1 149.2 299.0 149.8 299.0C150.2 299.0 150.5 301.0 150.6 303.4C150.6 305.9 150.4 307.7 150.1 307.5C149.7 307.3 149.5 309.2 149.6 311.6C149.6 314.0 149.3 316.0 148.8 316.0C148.4 316.0 148.0 317.2 148.0 318.8C148.0 323.7 147.7 325.5 146.6 326.2C145.8 326.8 145.8 327.0 146.6 327.0C147.4 327.0 147.2 328.1 146.2 330.4C145.3 332.3 144.4 333.7 144.1 333.5C143.8 333.4 143.4 336.4 143.3 340.2C143.1 344.1 142.5 347.9 141.9 348.6C140.0 350.9 147.1 349.1 149.8 346.7ZM65.8 342.5C66.0 340.4 65.6 338.2 65.0 337.6C64.2 336.8 64.0 337.3 64.1 339.5C64.3 341.2 64.0 343.6 63.6 344.9C63.0 346.6 63.1 347.1 64.1 346.8C64.9 346.5 65.6 344.6 65.8 342.5ZM187.0 345.7C187.0 345.5 185.3 343.8 183.2 341.9L179.5 338.5L182.9 342.2C186.2 345.7 187.0 346.5 187.0 345.7ZM61.7 338.7C61.9 338.4 62.2 329.6 62.3 319.0L62.6 299.8L56.6 300.4C53.4 300.7 49.2 301.0 47.4 301.0C42.7 301.0 39.8 304.0 40.7 308.1C41.2 310.6 41.0 311.2 39.9 310.8C38.1 310.2 37.5 304.7 39.0 302.0C39.8 300.5 39.8 300.0 38.9 300.0C38.2 300.0 37.2 299.3 36.6 298.6C36.0 297.8 34.3 296.8 32.8 296.4L30.0 295.8L30.0 316.3C30.0 327.6 30.3 337.6 30.7 338.6C31.3 340.1 32.7 340.2 46.3 339.7C54.5 339.3 61.5 338.9 61.7 338.7ZM88.5 332.9C88.5 329.5 86.2 322.9 84.2 320.7C83.3 319.6 79.7 317.5 76.3 315.8C71.9 313.7 69.8 312.1 68.8 310.0C67.7 307.5 65.0 305.8 65.0 307.5C65.0 310.2 68.7 314.0 74.2 316.8C84.6 322.2 85.1 322.8 85.7 329.8C86.1 333.7 86.7 335.9 87.4 335.7C88.0 335.5 88.5 334.3 88.5 332.9ZM65.6 324.1C65.6 318.6 65.2 313.8 64.8 313.4C64.3 313.0 64.1 317.5 64.1 323.3C64.2 329.2 64.6 334.0 65.0 334.0C65.4 334.0 65.7 329.5 65.6 324.1ZM21.0 328.0C21.0 325.8 20.6 324.0 20.0 324.0C18.9 324.0 18.6 330.3 19.7 331.3C20.8 332.5 21.0 332.1 21.0 328.0ZM23.1 326.4C23.1 325.3 23.4 325.0 23.7 325.8C24.0 326.5 23.9 327.4 23.6 327.7C23.3 328.1 23.0 327.5 23.1 326.4ZM84.8 307.2L84.5 300.5L78.2 300.2L72.0 299.9L72.0 304.5C72.0 309.1 72.0 309.1 77.2 311.5C85.0 315.1 85.1 315.1 84.8 307.2ZM87.8 306.5C88.0 303.5 87.7 301.0 87.2 301.0C86.7 301.0 86.2 303.5 86.1 306.5C86.0 309.5 86.3 312.0 86.7 312.0C87.1 312.0 87.6 309.5 87.8 306.5ZM67.0 302.5C67.0 300.4 66.5 299.0 65.7 299.0C65.0 299.0 64.5 300.4 64.4 302.5C64.4 304.8 64.8 306.0 65.7 306.0C66.5 306.0 67.0 304.8 67.0 302.5ZM86.2 298.0C86.6 298.0 86.7 297.4 86.4 296.7C86.1 295.7 84.5 295.4 81.2 295.7C78.6 296.0 73.6 295.8 70.0 295.3C66.4 294.8 61.8 294.7 59.8 295.1C57.7 295.4 56.0 295.4 56.0 295.0C56.0 294.7 53.1 294.3 49.5 294.2C44.5 294.0 43.0 294.3 43.0 295.4C43.0 297.4 44.9 297.9 52.1 297.4C55.6 297.2 61.4 297.3 65.0 297.7C70.1 298.3 79.8 298.5 86.2 298.0ZM88.7 292.3C88.5 290.7 88.3 291.8 88.3 294.5C88.3 297.2 88.5 298.5 88.7 297.3C88.9 296.0 88.9 293.8 88.7 292.3ZM91.5 296.0C91.8 295.4 91.6 295.0 91.1 295.0C90.5 295.0 90.0 295.4 90.0 296.0C90.0 296.6 90.2 297.0 90.4 297.0C90.7 297.0 91.2 296.6 91.5 296.0ZM34.7 293.8C34.4 293.0 34.1 293.3 34.1 294.4C34.0 295.5 34.3 296.1 34.6 295.7C34.9 295.4 35.0 294.5 34.7 293.8ZM36.7 293.8C36.4 293.0 36.1 293.3 36.1 294.4C36.0 295.5 36.3 296.1 36.6 295.7C36.9 295.4 37.0 294.5 36.7 293.8ZM31.2 294.3C30.6 294.1 29.4 294.1 28.8 294.3C28.1 294.6 28.6 294.8 30.0 294.8C31.4 294.8 31.9 294.6 31.2 294.3ZM31.2 291.8C30.3 290.9 29.7 290.9 28.8 291.8C27.9 292.7 28.1 293.0 30.0 293.0C31.9 293.0 32.1 292.7 31.2 291.8ZM18.3 291.3C17.6 291.1 16.2 291.1 15.3 291.3C14.3 291.6 14.8 291.8 16.5 291.8C18.1 291.8 18.9 291.6 18.3 291.3ZM71.0 286.5C71.0 285.1 70.5 284.0 70.0 284.0C69.5 284.0 69.0 284.7 69.0 285.6C69.0 286.7 68.5 287.0 67.2 286.5C66.3 286.1 62.2 285.6 58.1 285.3C52.0 284.8 50.8 284.9 51.2 286.1C51.5 287.1 54.1 287.7 60.1 288.1C64.7 288.4 69.1 288.7 69.8 288.8C70.5 288.9 71.0 287.9 71.0 286.5ZM47.3 287.1C47.8 287.1 47.8 286.6 47.5 286.0C47.2 285.4 43.4 285.0 39.2 285.0C32.7 285.1 31.8 285.3 33.2 286.4C34.6 287.4 43.1 287.9 47.3 287.1ZM80.0 287.1C80.0 286.0 77.4 284.9 76.6 285.7C75.4 286.9 76.1 288.0 78.0 288.0C79.1 288.0 80.0 287.6 80.0 287.1ZM85.0 287.0C85.0 286.4 84.6 286.0 84.1 286.0C83.5 286.0 82.8 286.4 82.5 287.0C82.2 287.6 82.6 288.0 83.4 288.0C84.3 288.0 85.0 287.6 85.0 287.0ZM17.0 280.0C17.0 277.9 16.6 275.8 16.0 275.5C15.4 275.1 15.0 276.8 15.0 280.0C15.0 283.2 15.4 284.9 16.0 284.5C16.6 284.2 17.0 282.1 17.0 280.0ZM85.7 282.3C85.4 282.0 76.9 281.6 66.8 281.4C56.7 281.2 47.5 280.7 46.2 280.5C44.7 280.1 44.0 280.4 44.0 281.5C44.0 282.7 45.6 283.0 52.8 283.1C71.8 283.3 84.1 283.8 84.8 284.5C85.2 284.8 85.6 284.6 85.8 284.0C86.0 283.4 86.0 282.6 85.7 282.3ZM89.0 280.5C89.0 277.0 88.7 276.2 87.5 276.6C85.8 277.3 85.4 280.0 87.0 280.0C87.5 280.0 88.0 281.1 88.0 282.5C88.0 283.9 88.2 285.0 88.5 285.0C88.8 285.0 89.0 283.0 89.0 280.5ZM38.9 274.6C38.4 274.0 38.0 274.4 38.0 275.6C38.0 277.3 37.0 277.8 31.6 278.8C28.1 279.5 24.1 280.0 22.6 280.0C21.0 280.0 20.0 280.5 20.0 281.5C20.0 282.6 21.9 283.0 29.2 283.2L38.5 283.5L39.1 279.5C39.5 277.3 39.4 275.1 38.9 274.6ZM2.7 279.8C2.4 279.0 2.1 279.3 2.1 280.4C2.0 281.5 2.3 282.1 2.6 281.7C2.9 281.4 3.0 280.5 2.7 279.8ZM13.6 279.4C13.1 278.0 12.7 277.9 11.7 278.9C10.8 279.8 10.8 280.3 12.0 281.0C13.8 282.1 14.4 281.6 13.6 279.4ZM9.2 279.3C8.6 279.1 7.4 279.1 6.8 279.3C6.1 279.6 6.6 279.8 8.0 279.8C9.4 279.8 9.9 279.6 9.2 279.3ZM67.0 272.5C67.0 271.1 66.5 270.0 66.0 270.0C64.9 270.0 64.6 273.3 65.7 274.3C66.8 275.4 67.0 275.1 67.0 272.5ZM48.0 272.0C48.0 271.4 44.5 271.0 39.5 271.0C34.5 271.0 31.0 271.4 31.0 272.0C31.0 272.6 34.5 273.0 39.5 273.0C44.5 273.0 48.0 272.6 48.0 272.0ZM53.5 272.0C53.2 271.4 52.5 271.0 51.9 271.0C51.4 271.0 51.0 271.4 51.0 272.0C51.0 272.6 51.7 273.0 52.6 273.0C53.4 273.0 53.8 272.6 53.5 272.0ZM17.0 265.0C17.0 262.2 16.6 260.0 16.0 260.0C15.4 260.0 15.0 262.2 15.0 265.0C15.0 267.8 15.4 270.0 16.0 270.0C16.6 270.0 17.0 267.8 17.0 265.0ZM38.9 264.8C38.8 259.9 38.8 259.7 37.9 262.7L37.0 265.8L29.0 265.5C21.9 265.3 21.0 265.4 21.0 267.0C21.0 268.2 21.6 268.6 23.2 268.3C25.0 268.0 37.6 269.3 38.8 269.9C38.9 269.9 39.0 267.6 38.9 264.8ZM86.0 268.5C86.0 267.7 85.9 267.0 85.8 266.9C85.6 266.9 77.2 266.7 67.0 266.4C56.8 266.2 47.5 265.8 46.4 265.5C44.2 265.0 42.2 267.4 43.9 268.5C44.4 268.7 52.3 268.9 61.4 268.8C70.6 268.8 78.3 269.0 78.7 269.4C79.0 269.7 80.8 270.0 82.7 270.0C85.0 270.0 86.0 269.5 86.0 268.5ZM88.7 263.8C88.5 262.5 88.3 263.5 88.3 266.0C88.3 268.5 88.5 269.5 88.7 268.2C88.9 267.0 88.9 265.0 88.7 263.8ZM71.0 257.4C71.0 256.6 70.5 256.0 70.0 256.0C69.5 256.0 69.0 256.9 69.0 258.1C69.0 259.2 69.5 259.8 70.0 259.5C70.5 259.2 71.0 258.2 71.0 257.4ZM79.1 258.7C79.0 257.5 77.6 257.8 77.2 259.1C76.9 259.7 77.3 260.1 78.0 259.9C78.6 259.6 79.1 259.1 79.1 258.7ZM85.0 257.9C85.0 257.4 84.5 257.0 84.0 257.0C83.5 257.0 83.0 257.7 83.0 258.6C83.0 259.4 83.5 259.8 84.0 259.5C84.5 259.2 85.0 258.5 85.0 257.9ZM47.5 258.1C47.8 257.6 47.7 256.9 47.3 256.7C45.9 255.9 31.0 257.2 31.0 258.1C31.0 259.3 46.7 259.2 47.5 258.1ZM58.0 258.0C58.0 257.4 57.5 257.0 57.0 257.0C56.5 257.0 56.0 257.4 56.0 258.0C56.0 258.6 56.5 259.0 57.0 259.0C57.5 259.0 58.0 258.6 58.0 258.0ZM67.0 258.0C67.0 257.4 66.5 257.0 66.0 257.0C65.5 257.0 65.0 257.4 65.0 258.0C65.0 258.6 65.5 259.0 66.0 259.0C66.5 259.0 67.0 258.6 67.0 258.0ZM17.0 251.0C17.0 248.2 16.6 246.0 16.0 246.0C15.4 246.0 15.0 247.4 15.0 249.1C15.0 250.8 14.6 251.9 14.0 251.5C13.4 251.2 13.0 251.4 13.0 251.9C13.0 252.5 13.4 253.0 14.0 253.0C14.6 253.0 15.0 253.7 15.0 254.5C15.0 255.3 15.4 256.0 16.0 256.0C16.6 256.0 17.0 253.8 17.0 251.0ZM39.0 251.0C39.0 248.2 38.6 246.0 38.1 246.0C37.6 246.0 37.4 246.8 37.7 247.8C38.0 249.0 37.3 250.3 35.6 251.4C33.6 252.6 33.0 252.7 33.0 251.7C33.0 250.7 31.5 250.5 27.2 250.8C24.1 251.0 21.1 251.5 20.6 252.0C18.7 253.9 21.4 254.7 29.0 254.3C33.9 254.1 37.0 254.4 37.0 255.0C37.0 255.5 37.5 256.0 38.0 256.0C38.5 256.0 39.0 253.8 39.0 251.0ZM90.0 251.1C90.0 248.3 89.5 245.8 89.0 245.5C88.4 245.1 88.0 247.0 88.0 250.4C88.0 253.5 88.5 256.0 89.0 256.0C89.5 256.0 90.0 253.8 90.0 251.1ZM86.7 253.5C86.9 252.9 85.0 252.5 82.2 252.5C79.6 252.5 71.9 252.3 65.0 252.0C48.8 251.5 43.0 251.8 43.0 253.0C43.0 254.8 86.1 255.3 86.7 253.5ZM2.7 250.8C2.4 250.1 2.2 250.6 2.2 252.0C2.2 253.4 2.4 253.9 2.7 253.2C2.9 252.6 2.9 251.4 2.7 250.8ZM47.8 249.3C48.3 247.5 45.0 246.4 44.0 248.1C43.5 248.8 43.4 249.8 43.7 250.3C44.4 251.5 47.2 250.8 47.8 249.3ZM71.0 238.6C71.0 228.8 69.7 225.2 68.6 231.9C67.9 236.6 68.9 248.0 70.1 248.0C70.6 248.0 71.0 243.8 71.0 238.6ZM24.2 245.3C23.6 245.1 22.4 245.1 21.8 245.3C21.1 245.6 21.6 245.8 23.0 245.8C24.4 245.8 24.9 245.6 24.2 245.3ZM30.8 245.3C29.8 245.1 28.2 245.1 27.2 245.3C26.3 245.6 27.1 245.8 29.0 245.8C30.9 245.8 31.7 245.6 30.8 245.3ZM83.0 242.8C84.1 241.0 85.0 240.1 85.0 240.8C85.0 242.5 86.7 242.3 87.4 240.5C87.8 239.4 87.4 239.0 86.4 239.2C85.0 239.5 84.7 237.8 84.3 227.5C83.9 218.3 83.4 214.8 82.0 212.5C81.1 210.8 80.5 208.9 80.7 208.3C81.0 207.4 80.3 207.1 78.6 207.2L76.0 207.4L76.0 223.2C76.0 238.4 76.8 243.3 79.5 245.2C80.9 246.3 80.8 246.3 83.0 242.8ZM46.8 244.1C49.5 244.0 49.9 240.0 47.4 237.9C43.9 235.0 43.0 231.3 43.0 219.1C43.0 212.1 42.6 206.9 42.0 206.5C40.3 205.4 34.8 210.1 32.9 214.4C31.4 217.7 31.0 221.0 31.0 231.2L31.0 243.9L35.8 244.2C38.4 244.4 41.4 244.4 42.5 244.3C43.6 244.2 45.5 244.1 46.8 244.1ZM58.9 241.2C58.3 239.5 57.5 238.1 57.2 238.2C54.7 238.7 47.0 232.7 47.0 230.4C47.0 228.8 45.3 227.7 44.6 228.8C43.5 230.7 47.6 236.2 52.4 239.1C55.2 240.8 57.9 242.9 58.3 243.7C59.7 246.1 60.1 244.5 58.9 241.2ZM67.0 241.8C67.0 239.3 66.7 238.9 66.0 240.0C64.7 242.0 64.7 245.0 66.0 245.0C66.5 245.0 67.0 243.5 67.0 241.8ZM24.9 223.2C24.8 214.0 24.4 205.2 24.0 203.5C23.6 201.8 23.2 209.0 23.1 220.2C23.0 232.8 23.4 240.0 24.0 240.0C24.6 240.0 25.0 233.8 24.9 223.2ZM87.8 222.7C88.0 215.3 87.7 211.0 87.1 210.5C86.3 210.1 86.0 214.1 86.0 223.2C86.0 239.2 87.4 238.9 87.8 222.7ZM66.2 233.4C66.7 233.1 67.0 225.8 67.0 217.1L67.0 201.3L61.5 201.1L56.0 200.9L56.2 217.2C56.3 227.6 56.7 233.8 57.4 234.3C58.4 235.0 64.6 234.4 66.2 233.4ZM47.3 220.2C48.3 208.5 47.7 193.7 46.2 193.2C45.1 192.9 44.9 194.3 45.3 200.6C45.7 205.8 45.6 207.3 45.0 205.0C44.3 202.0 44.3 202.2 44.6 206.5C44.8 209.2 45.0 215.0 45.0 219.2C45.0 223.5 45.4 227.0 45.9 227.0C46.3 227.0 47.0 224.0 47.3 220.2ZM71.1 224.8C71.5 216.8 71.0 193.7 70.4 192.8C70.0 192.1 70.1 192.0 70.8 192.4C71.6 192.9 72.0 192.1 72.0 190.0C72.0 187.5 71.6 186.9 70.2 187.2C68.8 187.5 68.5 188.5 68.6 192.5C68.7 195.3 68.8 204.1 68.9 212.2C68.9 221.3 69.4 227.0 70.0 227.0C70.5 227.0 71.0 226.0 71.1 224.8ZM50.9 209.0C50.4 208.2 50.1 211.0 50.2 215.5L50.3 223.5L51.0 217.0C51.4 213.4 51.3 209.8 50.9 209.0ZM83.4 210.6C83.1 209.7 82.4 209.0 81.9 209.0C81.4 209.0 81.5 209.9 82.2 211.0C83.6 213.2 84.3 213.0 83.4 210.6ZM35.2 208.0C36.4 206.9 36.9 206.0 36.3 206.0C35.8 206.0 34.5 206.9 33.5 208.0C32.5 209.1 32.0 210.0 32.4 210.0C32.8 210.0 34.0 209.1 35.2 208.0ZM88.4 206.9C89.6 205.1 89.7 204.2 88.6 201.7C87.1 197.9 84.3 196.6 85.4 200.1C86.3 203.1 86.3 203.9 85.5 206.8C84.6 209.6 86.4 209.7 88.4 206.9ZM84.9 204.4C85.9 203.5 84.3 203.3 80.8 203.8C78.7 204.0 77.0 204.6 77.0 205.2C77.0 206.0 83.8 205.3 84.9 204.4ZM42.8 204.4C41.7 203.4 30.0 203.0 30.0 204.0C30.0 204.6 33.0 205.0 36.7 205.0C40.3 205.0 43.1 204.7 42.8 204.4ZM38.8 198.2C43.0 195.8 43.0 195.8 43.0 190.2C43.0 186.7 43.8 182.8 45.0 180.2C46.5 176.9 46.6 176.0 45.5 176.0C44.7 176.0 43.8 176.4 43.5 177.0C43.2 177.6 40.0 178.0 36.4 178.0L30.0 178.0L30.0 189.3C30.0 195.6 30.3 200.9 30.6 201.3C31.4 202.0 33.5 201.2 38.8 198.2ZM84.2 191.2C83.8 187.9 80.0 184.0 77.3 184.0C76.4 184.0 76.0 183.4 76.4 182.5C76.7 181.6 76.4 181.0 75.5 181.0C74.4 181.0 74.3 181.7 75.1 184.2C75.7 186.0 76.1 189.8 76.1 192.6C76.0 197.4 76.2 197.9 79.2 199.7L82.5 201.7L83.6 198.1C84.2 196.1 84.5 193.0 84.2 191.2ZM67.0 199.1C67.0 198.6 65.7 198.0 64.0 197.8C62.4 197.5 61.0 197.7 61.0 198.1C61.0 198.5 62.2 199.1 63.8 199.3C65.3 199.5 66.6 199.8 66.8 199.9C66.9 199.9 67.0 199.6 67.0 199.1ZM25.0 182.6C25.0 170.4 25.3 166.0 26.2 165.7C26.9 165.4 26.4 165.1 25.0 165.1L22.5 165.0L22.8 182.0C23.0 191.9 23.5 199.0 24.0 199.0C24.6 199.0 25.0 192.3 25.0 182.6ZM51.3 193.9C50.7 193.3 50.6 194.2 50.9 196.2C51.3 199.0 51.5 199.1 51.8 197.1C52.0 195.8 51.8 194.4 51.3 193.9ZM59.4 198.2C59.7 197.7 59.4 197.3 58.7 197.3C58.0 197.3 56.9 197.1 56.1 196.9C55.4 196.7 54.5 197.1 54.3 197.8C53.8 199.2 58.5 199.5 59.4 198.2ZM87.8 188.5C87.8 183.8 87.5 180.2 87.2 180.4C86.8 180.6 86.6 179.0 86.8 176.8C87.1 174.2 86.9 173.0 86.2 173.4C84.9 174.2 84.1 179.9 85.2 180.6C85.6 180.9 86.0 184.7 86.0 189.1C86.0 193.4 86.4 197.0 86.9 197.0C87.3 197.0 87.8 193.2 87.8 188.5ZM66.8 184.8C66.1 183.4 65.5 183.2 63.2 184.1C61.7 184.7 59.7 185.9 58.8 186.7C57.6 187.8 57.0 187.9 57.0 187.1C57.0 186.4 56.5 186.2 55.9 186.6C55.1 187.1 55.1 187.5 56.0 188.0C56.9 188.6 56.9 189.3 56.1 190.9C55.0 192.8 55.2 193.0 58.2 193.1C60.0 193.2 62.6 193.5 64.0 193.9C66.3 194.6 66.5 194.3 67.0 190.6C67.3 188.3 67.2 185.7 66.8 184.8ZM48.0 191.1C48.0 190.6 48.3 189.5 48.6 188.6C49.1 187.4 48.6 187.0 46.7 187.0C44.7 187.0 44.2 187.5 44.4 189.5C44.5 191.2 45.1 192.0 46.2 192.0C47.2 192.0 48.0 191.6 48.0 191.1ZM51.6 181.9C55.6 178.0 56.1 177.8 60.2 178.4C63.6 178.9 65.0 179.7 66.9 182.5C68.2 184.4 69.6 186.0 70.1 186.0C71.6 186.0 71.1 183.1 69.2 180.9C63.1 173.6 51.3 174.6 47.1 182.7C44.7 187.4 46.3 187.1 51.6 181.9ZM55.2 181.6C56.2 179.7 56.0 179.8 53.6 181.9C52.2 183.3 51.0 184.8 51.0 185.3C51.0 186.6 53.9 184.1 55.2 181.6ZM82.0 183.6C82.0 183.4 81.3 182.9 80.4 182.6C79.6 182.3 79.2 182.4 79.5 183.0C80.1 184.0 82.0 184.4 82.0 183.6ZM161.5 180.1C158.6 179.5 158.5 179.3 158.2 172.7L157.9 166.0L161.2 165.9C164.4 165.7 164.4 165.7 160.5 165.1C155.5 164.3 154.6 164.9 156.0 168.4C157.4 172.1 157.3 175.0 155.6 178.2L154.1 181.0L159.3 180.9C163.4 180.8 163.9 180.6 161.5 180.1ZM155.4 175.5C156.1 172.6 155.2 168.0 153.9 168.0C153.4 168.0 153.1 170.2 153.3 173.0C153.5 178.4 154.4 179.5 155.4 175.5ZM36.0 176.0C36.0 175.4 34.9 175.0 33.5 175.0C32.1 175.0 31.0 175.4 31.0 176.0C31.0 176.6 32.1 177.0 33.5 177.0C34.9 177.0 36.0 176.6 36.0 176.0ZM41.2 176.3C40.6 176.1 39.4 176.1 38.8 176.3C38.1 176.6 38.6 176.8 40.0 176.8C41.4 176.8 41.9 176.6 41.2 176.3ZM84.0 176.0C84.0 175.4 82.2 175.0 80.0 175.0C77.8 175.0 76.0 175.4 76.0 176.0C76.0 176.6 77.8 177.0 80.0 177.0C82.2 177.0 84.0 176.6 84.0 176.0ZM151.8 173.5C150.8 172.4 143.9 172.0 144.5 173.0C144.8 173.5 146.7 174.0 148.7 174.0C150.7 174.0 152.1 173.8 151.8 173.5ZM136.9 172.6C136.7 172.5 135.0 171.8 133.2 171.2C129.6 170.0 128.8 170.6 132.2 172.0C134.5 172.9 137.7 173.3 136.9 172.6ZM88.0 170.0C88.0 169.4 87.5 169.0 87.0 169.0C86.5 169.0 86.0 169.4 86.0 170.0C86.0 170.6 86.5 171.0 87.0 171.0C87.5 171.0 88.0 170.6 88.0 170.0ZM126.4 166.5C123.8 163.1 122.2 161.8 123.6 164.2C124.5 165.8 128.2 170.0 128.7 170.0C128.9 170.0 127.9 168.4 126.4 166.5ZM152.0 166.6C152.5 165.2 153.0 134.4 153.2 96.3L153.5 28.5L151.3 24.5C148.7 19.7 142.8 13.9 138.0 11.4C135.9 10.4 131.4 9.5 126.9 9.2C116.2 8.6 107.4 11.5 101.0 17.9C93.6 25.4 93.7 24.4 93.1 85.5C92.7 115.2 92.7 140.7 92.8 142.1C93.2 144.6 93.4 144.6 101.3 144.8C111.4 145.1 117.0 147.6 121.7 154.1C131.7 167.5 133.5 168.7 144.8 168.9C150.5 169.0 151.1 168.8 152.0 166.6ZM89.8 166.6C88.8 165.9 88.0 164.8 88.0 164.2C88.0 163.6 88.8 162.6 89.8 162.1C91.2 161.2 90.9 161.1 88.2 161.0C85.2 161.0 85.0 161.2 85.0 164.5C85.0 167.8 85.2 168.0 88.2 168.0C91.2 167.9 91.3 167.8 89.8 166.6ZM98.5 164.0C98.5 163.3 98.0 162.5 97.3 162.3C96.6 162.0 96.2 162.7 96.3 163.9C96.4 166.2 98.5 166.2 98.5 164.0ZM24.5 163.0C24.8 162.4 24.4 162.0 23.6 162.0C22.7 162.0 22.0 162.4 22.0 163.0C22.0 163.6 22.4 164.0 22.9 164.0C23.5 164.0 24.2 163.6 24.5 163.0ZM121.4 159.0C120.4 157.4 119.4 156.2 119.2 156.4C118.8 156.9 122.0 162.0 122.7 162.0C122.9 162.0 122.3 160.7 121.4 159.0ZM157.8 144.5C158.0 135.2 158.6 126.8 159.1 125.8C159.7 124.7 159.7 124.0 159.1 124.0C157.6 124.0 157.7 100.4 159.2 98.0C160.1 96.6 160.2 95.7 159.4 95.2C158.7 94.7 158.3 84.1 158.2 64.1C158.0 44.4 157.5 32.2 156.8 29.6C155.0 23.4 149.0 14.5 144.2 11.1C133.4 3.2 113.3 3.8 101.6 12.2C99.5 13.7 97.2 15.0 96.5 15.0C94.6 15.0 90.3 22.2 88.5 28.3C87.3 32.5 86.8 39.7 86.5 57.2C86.0 81.2 85.8 106.6 85.9 120.2L86.0 128.0L88.8 127.9C90.7 127.8 90.9 127.6 89.5 127.3C87.5 126.9 87.5 126.4 88.3 83.2C89.2 33.2 89.1 36.8 90.0 35.5C90.4 35.0 91.1 32.7 91.5 30.5C93.1 21.7 98.4 15.6 108.9 10.7C114.9 7.8 116.4 7.5 125.0 7.6C132.1 7.6 135.4 8.0 138.2 9.4C143.1 11.8 150.4 19.4 153.3 25.0L155.5 29.5L155.3 95.8C155.1 148.2 155.3 162.1 156.3 161.7C157.2 161.4 157.6 156.8 157.8 144.5ZM25.2 160.3C24.6 160.1 23.4 160.1 22.8 160.3C22.1 160.6 22.6 160.8 24.0 160.8C25.4 160.8 25.9 160.6 25.2 160.3ZM87.9 145.0C87.8 136.8 87.4 129.8 86.9 129.4C86.4 129.1 86.0 135.3 86.0 144.4C86.0 153.8 86.4 160.0 87.0 160.0C87.6 160.0 87.9 154.0 87.9 145.0ZM25.0 150.4C23.6 146.7 22.6 148.1 23.5 152.7C24.0 155.7 24.4 156.1 25.1 154.8C25.7 153.8 25.6 152.1 25.0 150.4ZM98.5 149.0C98.2 148.4 97.2 148.0 96.4 148.0C95.6 148.0 95.0 148.4 95.0 149.0C95.0 149.6 95.9 150.0 97.1 150.0C98.2 150.0 98.8 149.6 98.5 149.0ZM25.6 138.3C25.8 132.1 23.8 128.9 19.8 129.1C17.6 129.1 17.6 129.2 19.5 130.0C20.6 130.5 21.0 130.9 20.4 130.9C19.6 131.0 19.8 132.9 21.1 137.1C24.2 147.1 25.4 147.4 25.6 138.3Z"/></svg>'
};
const REL_FAM = { c: 'Cordas', m: 'Madeiras', b: 'Metais' };
/* tudo dentro de .rel, para servir no PDF e na prévia da tela */
const REL_CSS = `
.rel{font-family:Arial,'Liberation Sans',Helvetica,sans-serif;color:#000;font-size:9.6pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rel *{box-sizing:border-box}
.rel .cab{display:flex;align-items:center;gap:4mm;padding-bottom:2.4mm;border-bottom:2.2pt solid #000;position:relative;margin-bottom:3.4mm}
.rel .cab:after{content:"";position:absolute;left:0;right:0;bottom:-2mm;border-top:.6pt solid #000}
.rel .cab-tx{flex:1}
.rel .org{font-weight:700;font-size:11.5pt;letter-spacing:.22em}
.rel h1{margin:1.2mm 0 0;font-size:17pt;font-weight:900;letter-spacing:.01em;line-height:1.15}
.rel .selo{background:#000;color:#fff;border-radius:2mm;padding:2mm 4mm;text-align:center;line-height:1.25}
.rel .selo span{display:block;font-size:8pt;letter-spacing:.16em;font-weight:700}
.rel .selo b{font-size:11.5pt;white-space:nowrap}
.rel .tab{display:inline-block;background:#000;color:#fff;font-weight:700;font-size:8.6pt;letter-spacing:.14em;text-transform:uppercase;padding:1.1mm 5mm .8mm 3mm;border-radius:2mm 2mm 0 0}
.rel .bx{margin-top:3.2mm}
.rel .at{border:1px solid #2e2e2e;border-radius:0 2mm 2mm 2mm;padding:2mm 3mm;line-height:1.45}
.rel .at p{margin:0}
.rel .at .br{display:inline-block;border-bottom:1px solid #000;font-style:normal}
.rel .at .reg{margin-top:1.4mm;padding-top:1.4mm;border-top:1px solid #a9a9a9}
.rel .at .reg span{font-size:7.6pt;letter-spacing:.14em;text-transform:uppercase;font-weight:700;margin-right:2.5mm;color:#444}
.rel .hd{display:flex;justify-content:space-between}
.rel table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;border:1px solid #2e2e2e;border-radius:0 0 2mm 2mm;overflow:hidden}
.rel td{border-bottom:1px solid #c9c9c9;border-right:1px solid #c9c9c9;padding:0 2.4mm;height:5.05mm;font-size:9pt}
.rel td:last-child{border-right:0}
.rel tr:last-child td{border-bottom:0}
.rel tr.gs td.l,.rel tr.gs td.v{border-top:1px solid #2e2e2e}
.rel td.fv{border-right:1px solid #2e2e2e;padding:0;background:#f2f2f2;text-align:center;vertical-align:middle}
.rel td.fv span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:7pt;letter-spacing:.2em;font-weight:700;text-transform:uppercase}
.rel td.fv.nf{background:#fff}
.rel tr.i td.l,.rel tr.mi td.l{font-size:8.6pt;letter-spacing:.02em}
.rel td.v{text-align:center;font-variant-numeric:tabular-nums;font-weight:700;border-right:1px solid #2e2e2e}
.rel tr.t1 td.l,.rel tr.t1 td.v{background:#e6e6e6;font-weight:700;text-transform:uppercase;font-size:8.6pt;letter-spacing:.06em}
.rel tr.t2 td.l,.rel tr.t2 td.v{background:#000;color:#fff;font-weight:700;text-transform:uppercase;font-size:8.6pt;letter-spacing:.06em;border-bottom-color:#000}
.rel tr.tg td{background:#000;color:#fff;font-weight:900;text-transform:uppercase;letter-spacing:.14em;height:7mm;font-size:10.5pt;border:0}
.rel tr.tg td.v{font-size:12.5pt;letter-spacing:0}
.rel td.h{text-align:center;font-size:9.4pt;font-variant-numeric:tabular-nums;position:relative}
.rel td.h i{position:absolute;left:2mm;top:50%;transform:translateY(-50%);font-style:normal;font-size:6.8pt;color:#777}
.rel td.th{text-align:center;vertical-align:middle;background:#f2f2f2}
.rel td.th span{display:block;font-size:7.4pt;letter-spacing:.16em;text-transform:uppercase;font-weight:700}
.rel td.th b{display:block;font-size:20pt;line-height:1.05;margin-top:1mm;min-height:6mm}
.rel td.fh{text-align:center;font-size:7.4pt;letter-spacing:.16em;text-transform:uppercase;font-weight:700;background:#e6e6e6}
.rel td.fm{padding:0 3.5mm 0 3mm;vertical-align:middle}
.rel .fm-in{display:flex;align-items:center;gap:2.6mm}
.rel .fm-in svg{width:13mm;height:13mm;flex:none}
.rel .fm-in span{flex:1;font-size:8.6pt;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.rel .fm-in span small{display:block;font-weight:400;letter-spacing:0;text-transform:none;font-size:7.8pt;color:#555;margin-top:.4mm}
.rel .fm-in b{font-size:14pt;font-variant-numeric:tabular-nums;min-width:12mm;text-align:right}
`;
(function () { const st = document.createElement('style'); st.textContent = REL_CSS.replace(/\.rel/g, '.pm-rel-wrap .rel'); document.head.appendChild(st); })();
function relTabelaHTML(c, cheio) {
  const d = relDados(c), v = n => cheio ? String(n) : '';
  const dt = partes(c.data), cid = (c.cidade || '').trim() || CIDADE_PADRAO;
  const f = (x, lg) => String(x || '').trim() ? `<b>${esc(String(x).trim())}</b>` : `<i class="br">${'&nbsp;'.repeat(lg)}</i>`;
  // esquerda: instrumentos (agrupados por família), totais, ministério
  const inst = d.inst.map(r => ({ cls: 'i', rot: r.rot, v: v(r.n), fam: r.fam }));
  const vagas = Math.max(inst.length - 3, d.hinos.length);
  while (inst.length < vagas + 3) inst.push({ cls: 'i', rot: '', v: '', fam: '' });
  const corridas = []; inst.forEach((r, k) => { if (!k || r.fam !== inst[k - 1].fam) { corridas.push({ ini: k, n: 1, fam: r.fam }); if (k) r.cls += ' gs'; } else corridas[corridas.length - 1].n++; });
  const fixos = [{ cls: 't1 gs', rot: 'Músicos', v: v(d.mus) }, { cls: 't1', rot: 'Organistas', v: v(d.org) }, { cls: 't2', rot: 'Total de músicos e organistas', v: v(d.tot) }]
    .concat(d.min.map((r, k) => ({ cls: 'mi', rot: r.rot, v: v(r.n) })), [{ cls: 't1 gs', rot: 'Ministério', v: v(d.minT) }]);
  // direita: hinos numerados, total de hinos, % das famílias com ícone
  const R = [];
  for (let k = 0; k < vagas; k++) R.push(`<td class="h">${d.hinos[k] ? `<i>${k + 1}</i>${esc(d.hinos[k])}` : ''}</td>`);
  R.push(`<td class="th" rowspan="3"><span>Total de hinos</span><b>${cheio && d.hinos.length ? d.hinos.length : ''}</b></td>`, '', '');
  R.push('<td class="fh">% das famílias</td>');
  ['c', 'm', 'b'].forEach(k => {
    const soma = d.inst.filter(r => r.fam === k).reduce((a, r) => a + r.n, 0);
    R.push(`<td class="fm" rowspan="3"><div class="fm-in">${REL_ICO[k]}<span>${REL_FAM[k]}${cheio ? `<small>${soma} ${soma === 1 ? 'músico' : 'músicos'}</small>` : ''}</span><b>${cheio ? d.fam[k] : ''}</b></div></td>`, '', '');
  });
  R.push(`<td class="h" rowspan="${fixos.length - 10}"></td>`); for (let k = 1; k < fixos.length - 10; k++) R.push('');
  const E = inst.concat(fixos);
  const fv = new Map(corridas.map(x => [x.ini, `<td class="fv${x.fam ? '' : ' nf'}" rowspan="${x.n}">${x.fam ? `<span>${REL_FAM[x.fam]}</span>` : ''}</td>`]));
  fv.set(inst.length, `<td class="fv nf" rowspan="${fixos.length}"></td>`);
  const corpo = E.map((e, k) => `<tr class="${e.cls}">${fv.get(k) || ''}<td class="l">${esc(e.rot)}</td><td class="v">${e.v}</td>${R[k] || ''}</tr>`).join('')
    + `<tr class="tg"><td colspan="2" class="l">Total geral</td><td class="v">${v(d.geral)}</td><td></td></tr>`;
  return `<div class="rel">
<header class="cab"><div class="cab-tx"><div class="org">CONGREGAÇÃO CRISTÃ NO BRASIL</div><h1>Ensaio Regional Musical</h1></div>
<div class="selo"><span>${esc(cid.toUpperCase())}</span><b>${dt ? `${dt.d} de ${MESES[dt.m - 1]} de ${dt.y}` : '____ de __________ de ____'}</b></div></header>
<section class="bx"><div class="tab">Atendimento</div><div class="at">
<p>Iniciou-se este Ensaio Regional Musical em Nome do Senhor Jesus com uma oração, sendo presidida pelo irmão ${f(c.presidente, 40)}, após cantar o hino ${f(c.hino, 6)}, Deus revelou sua Bendita Palavra no capítulo ${f(c.capitulo, 6)} do livro de ${f(c.livro, 18)}.</p>
<p class="reg"><span>Regente</span>${f(c.regente, 40)}</p></div></section>
<section class="bx"><div class="hd"><div class="tab">Resumo</div><div class="tab">Hinos ensaiados</div></div>
<table><colgroup><col style="width:6mm"><col style="width:52%"><col style="width:12%"><col></colgroup><tbody>${corpo}</tbody></table></section></div>`;
}
// Relatório por localidade (todas, ou só uma)
function locaisHTML(c, so) {
  let ls = locDados(c); if (so) ls = ls.filter(x => norm(x.nome) === norm(so));
  const dt = partes(c.data), cid = (c.cidade || '').trim() || CIDADE_PADRAO;
  const cards = ls.map(x => {
    let linhas = '';
    [['c'], ['m'], ['b'], ['']].forEach(([f]) => {
      const rs = x.inst.filter(r => r.fam === f); if (!rs.length) return;
      const tot = rs.reduce((a, r) => a + r.n, 0);
      linhas += `<tr class="lf"><td>${f ? `<span class="lf-in">${REL_ICO[f]}${REL_FAM[f]}</span>` : '<span class="lf-in">Outros</span>'}</td><td>${tot}</td></tr>` + rs.map(r => `<tr><td>${esc(r.rot)}</td><td>${r.n}</td></tr>`).join('');
    });
    if (x.org) linhas += `<tr class="lf"><td><span class="lf-in">Órgão (organistas)</span></td><td>${x.org}</td></tr>`;
    const mins = x.min.slice().sort((a, b) => catDe(a.i) - catDe(b.i) || ordemNome(a.i, b.i));
    return `<section class="lc"><div class="tab">${esc(x.nome)}</div><div class="lc-box">
  <div class="lc-num"><div><span>Músicos</span><b>${x.mus}</b></div><div><span>Organistas</span><b>${x.org}</b></div><div><span>Ministério</span><b>${x.min.length}</b></div><div class="g"><span>Total</span><b>${x.total}</b></div></div>
  <div class="lc-cols">${linhas ? `<table class="lc-t"><colgroup><col><col style="width:14mm"></colgroup>${linhas}</table>` : '<p class="lc-vz">Nenhum músico ou organista lançado.</p>'}
  <div class="lc-min"><h4>Ministério presente</h4>${mins.length ? `<ul>${mins.map(p => `<li><b>${esc(p.i.nome)}</b><span>${esc(p.i.cargo)}${p.inst ? ' · ' + esc(p.inst) : ''}</span></li>`).join('')}</ul>` : '<p class="lc-vz">Ninguém do ministério desta localidade.</p>'}</div></div>
</div></section>`;
  }).join('');
  const css = REL_CSS + `
.rel .sub{font-size:10pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-top:1mm}
.rel .lc{margin-top:4mm;break-inside:avoid}
.rel .lc-box{border:1px solid #2e2e2e;border-radius:0 2mm 2mm 2mm;padding:3mm}
.rel .lc-num{display:grid;grid-template-columns:repeat(4,1fr);gap:2.4mm;margin-bottom:3mm}
.rel .lc-num div{border:1px solid #bdbdbd;border-radius:1.6mm;padding:1.4mm 2.4mm;display:flex;justify-content:space-between;align-items:baseline}
.rel .lc-num span{font-size:7.4pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.rel .lc-num b{font-size:14pt}
.rel .lc-num .g{background:#000;color:#fff;border-color:#000}
.rel .lc-cols{display:grid;grid-template-columns:1fr 1fr;gap:4mm;align-items:start}
.rel table.lc-t{border:1px solid #2e2e2e;border-radius:1.6mm}
.rel .lc-t td{height:4.6mm;font-size:8.6pt;padding:0 2.2mm;border-right:0}
.rel .lc-t td:last-child{text-align:center;font-weight:700;border-left:1px solid #c9c9c9}
.rel .lc-t tr.lf td{background:#e6e6e6;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:7.8pt;height:5.6mm}
.rel .lf-in{display:inline-flex;align-items:center;gap:1.6mm}.rel .lf-in svg{width:6mm;height:6mm}
.rel .lc-min h4{margin:0 0 1.6mm;font-size:7.6pt;letter-spacing:.14em;text-transform:uppercase}
.rel .lc-min ul{list-style:none;margin:0;padding:0}
.rel .lc-min li{display:flex;justify-content:space-between;gap:3mm;border-bottom:1px solid #d6d6d6;padding:1mm 0;font-size:8.6pt}
.rel .lc-min li span{color:#444;text-align:right}
.rel .lc-vz{margin:0;font-size:8.6pt;color:#555}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ensaio Regional ${esc(dataBR(c.data))} · localidades</title><style>
@page{size:A4 portrait;margin:13mm 14mm 12mm}
body{margin:0}
${css}
</style></head><body><div class="rel">
<header class="cab"><div class="cab-tx"><div class="org">CONGREGAÇÃO CRISTÃ NO BRASIL</div><h1>Ensaio Regional Musical</h1><div class="sub">${so ? 'Relatório da localidade' : 'Relatório por localidade'}</div></div>
<div class="selo"><span>${esc(cid.toUpperCase())}</span><b>${dt ? `${dt.d} de ${MESES[dt.m - 1]} de ${dt.y}` : '____ de __________ de ____'}</b></div></header>
${cards || '<p>Nenhuma localidade lançada ainda.</p>'}</div></body></html>`;
}
function gerarLocaisPDF(so) {
  const c = CHAM(); if (!c) return;
  if (!locDados(c).length) { UI.toast('Nenhuma localidade lançada ainda.', 'info'); return; }
  abrirImpressao(locaisHTML(c, so));
}
function relatorioRegionalHTML(c) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ensaio Regional ${esc(dataBR(c.data))}</title><style>
@page{size:A4 portrait;margin:13mm 14mm 12mm}
body{margin:0}
${REL_CSS}
.rel tr{break-inside:avoid}
</style></head><body>${relTabelaHTML(c, true)}</body></html>`;
}

/* ---------- listas de sugestões ---------- */
function atualizarDatalists() {
  const set = (id, vals) => { let d = document.getElementById(id); if (!d) { d = document.createElement('datalist'); d.id = id; document.body.appendChild(d); } d.innerHTML = vals.map(v => `<option value="${esc(v)}">`).join(''); };
  const uniq = k => [...new Set(DB.irmaos.map(i => String(i[k] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  set('dlInstr', [...new Set(INSTRUMENTOS.concat(uniq('instrumento')))]);
  set('dlCidades', uniq('cidade')); set('dlBairros', uniq('bairro'));
  set('dlGrupos', [...new Set(GRUPOS.concat(uniq('grupo')))]);
  set('dlLivros', LIVROS);
  set('dlCargos', CARGOS_MIN.map(x => x[0]).concat(['Instrutor', 'Instrutora', 'Examinadora', 'Organista', 'Músico']));
  const locs = new Set();
  (REL_IGR || []).forEach(g => locs.add(g));
  DB.chamadas.forEach(c => (c.locais || []).forEach(l => { if (l.nome.trim()) locs.add(l.nome.trim()); }));
  set('dlLocalidades', [...locs].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  set('dlOcasioes', [...new Set(OCASIOES.concat(DB.chamadas.map(c => c.ocasiao).filter(Boolean)))]);
}

/* ---------- ao vivo: várias pessoas na mesma lista ----------
   A lista fica numa "sala" no servidor (src/sala-presenca.js). Cada tela manda SÓ o que
   mudou — "fulano presente", "nome do irmão X", "data da chamada Y" — e recebe na hora o
   que os outros mudaram. Não regrava a lista inteira e ninguém sobrescreve ninguém:
   cada marcação é uma coisa separada (duas pessoas marcando irmãos diferentes nunca se atropelam).
   Como funciona aqui:
   - ESPELHO é a lista como a sala conhece (mais o que já mandamos). O que mudou na tela
     é a diferença entre DB e ESPELHO: vira mudanças pequenas e vai para a FILA;
   - a FILA fica guardada no aparelho até a sala confirmar; sem internet, a pessoa continua
     marcando e tudo vai quando a ligação voltar;
   - o que chega dos outros é aplicado só nas linhas que mudaram (sem redesenhar a tela,
     sem piscar, sem mexer na rolagem nem no campo que a pessoa está digitando).
   Se o servidor ainda não tiver a sala (deploy antigo), volta sozinho para o modo de antes
   (salvar na nuvem quando você manda). */
const VIVO = { modo: 'ligando', ws: null, seq: 0, fila: [], gente: [], tent: 0, abriu: false, falhas: 0, tRec: null, tEnvio: null, tPing: null, primeira: true };
const SEQ_KEY = KEY + '_seq', FILA_KEY = KEY + '_fila';
const CLIENTE = (() => { try { let c = sessionStorage.getItem('pm_cliente'); if (!c) { c = novoId(); sessionStorage.setItem('pm_cliente', c); } return c; } catch (e) { return novoId(); } })();
const CAMPOS_I = ['nome', 'instrumento', 'cidade', 'bairro', 'cargo', 'grupo'], CAMPOS_C = ['data', 'ocasiao', 'local', 'obs', 'tipo', 'grupos', 'cidade', 'presidente', 'hino', 'capitulo', 'livro', 'regente', 'hinos'];
let ESPELHO = null;
const copia = o => JSON.parse(JSON.stringify(o));
// Quem marcou a presença é o "dono" dela (guardado pela sala). Aqui todo mundo está logado,
// e quem tem acesso ao sistema mexe em tudo; a trava por dono vale só pelo link (sem cadastro).
// (a função fica para, se um dia for preciso, travar também aqui)
const meuDono = () => (VIVO.eu ? VIVO.eu.email : '') + '|' + CLIENTE;
function podeMexer(c, id) {
  if (!c || !c.marcas[id] || !aoVivo() || !VIVO.eu || VIVO.eu.email) return true;
  const d = (c.donos || {})[id]; if (!d) return true;
  const k = d.indexOf('|'); if (k < 0) return false;   // marcado pelo link
  const email = d.slice(0, k), apar = d.slice(k + 1);
  return (!!email && email === VIVO.eu.email) || apar === CLIENTE;
}
const quemMarcou = (c, id) => { const d = (c.donos || {})[id] || ''; const k = d.indexOf('|'); const e = k < 0 ? '' : d.slice(0, k); return e ? e.split('@')[0] : 'alguém pelo link'; };
const aoVivo = () => VIVO.modo !== 'manual';

// aplica uma mudança numa lista (DB ou ESPELHO), mexendo no próprio objeto
function aplicarOp(db, op) {
  const ch = id => db.chamadas.find(c => c.id === id), ir = id => db.irmaos.find(i => i.id === id);
  switch (op.t) {
    case 'm': { const c = ch(op.c); if (!c) return; c.donos = c.donos || {}; if (op.v) { c.marcas[op.i] = 'v'; if (op.pc != null) { if (op.pc) c.donos[op.i] = op.pc; else delete c.donos[op.i]; } else if (!c.donos[op.i]) c.donos[op.i] = meuDono(); } else { delete c.marcas[op.i]; delete c.donos[op.i]; } return; }
    case 'mc': { const c = ch(op.c); if (!c) return; c.marcas = {}; (op.lista || []).forEach(i => { c.marcas[i] = 'v'; }); if (op.donos) c.donos = Object.assign({}, op.donos); else { c.donos = c.donos || {}; Object.keys(c.donos).forEach(i => { if (!c.marcas[i]) delete c.donos[i]; }); (op.lista || []).forEach(i => { if (!c.donos[i]) c.donos[i] = meuDono(); }); } return; }
    case 'i': { let i = ir(op.id); if (!i) { i = { id: op.id, nome: '', instrumento: '', cidade: '', bairro: '', cargo: '', grupo: '' }; db.irmaos.push(i); } Object.assign(i, op.campos || {}); if (!i.grupo) i.grupo = grupoDoCargo(i.cargo); return; }
    case 'i-': { const k = db.irmaos.findIndex(i => i.id === op.id); if (k >= 0) db.irmaos.splice(k, 1); db.chamadas.forEach(c => { delete c.marcas[op.id]; if (c.toca) delete c.toca[op.id]; }); return; }
    case 'c': { let c = ch(op.id); if (!c) { c = { id: op.id, data: '', ocasiao: '', local: '', obs: '', tipo: 'nomes', grupos: '', marcas: {}, donos: {}, locais: [], toca: {} }; db.chamadas.push(c); } Object.assign(c, op.campos || {}); if (c.tipo !== 'regional') c.tipo = 'nomes'; return; }
    case 'l': {
      const c = ch(op.c); if (!c) return;
      let l = c.locais.find(x => x.id === op.id);
      if (!l) { l = { id: op.id, nome: '', total: '', inst: {}, ord: op.ord || Date.now() }; c.locais.push(l); c.locais.sort((a, b) => a.ord - b.ord); }
      Object.keys(op.campos || {}).forEach(k => { l[k] = String(op.campos[k] == null ? '' : op.campos[k]); });
      Object.keys(op.inst || {}).forEach(k => { const n = parseInt(op.inst[k], 10) || 0; if (n > 0) l.inst[k] = n; else delete l.inst[k]; });
      return;
    }
    case 'l-': { const c = ch(op.c); if (!c) return; const k = c.locais.findIndex(x => x.id === op.id); if (k >= 0) c.locais.splice(k, 1); return; }
    case 'x': { const c = ch(op.c); if (!c) return; c.toca = c.toca || {}; if (op.inst || op.loc) c.toca[op.i] = { inst: op.inst || '', loc: op.loc || '' }; else delete c.toca[op.i]; return; }
    case 'link': { const c = ch(op.c); if (c) c.link = op.code; return; }
    case 'link-': { const c = ch(op.c); if (c) delete c.link; return; }
    case 'c-': { const k = db.chamadas.findIndex(c => c.id === op.id); if (k >= 0) db.chamadas.splice(k, 1); return; }
  }
}
// o que mudou entre a lista da sala (ESPELHO) e a da tela (DB): só as diferenças
function diferencas(de, para) {
  const ops = [];
  const aI = new Map(de.irmaos.map(i => [i.id, i])), bI = new Map(para.irmaos.map(i => [i.id, i]));
  bI.forEach((i, id) => {
    const o = aI.get(id), campos = {};
    CAMPOS_I.forEach(k => { const v = i[k] == null ? '' : String(i[k]); if (!o || (o[k] == null ? '' : String(o[k])) !== v) campos[k] = v; });
    if (!o || Object.keys(campos).length) ops.push({ t: 'i', id, campos });
  });
  aI.forEach((i, id) => { if (!bI.has(id)) ops.push({ t: 'i-', id }); });
  const aC = new Map(de.chamadas.map(c => [c.id, c])), bC = new Map(para.chamadas.map(c => [c.id, c]));
  bC.forEach((c, id) => {
    const o = aC.get(id), campos = {};
    CAMPOS_C.forEach(k => { const v = c[k] == null ? '' : String(c[k]); if (!o || (o[k] == null ? '' : String(o[k])) !== v) campos[k] = v; });
    if (!o || Object.keys(campos).length) ops.push({ t: 'c', id, campos });
    const ma = o ? o.marcas : {}, mb = c.marcas, mud = [];
    Object.keys(mb).forEach(i => { if (!ma[i]) mud.push({ t: 'm', c: id, i, v: 1 }); });
    Object.keys(ma).forEach(i => { if (!mb[i]) mud.push({ t: 'm', c: id, i, v: 0 }); });
    // chamada nova: vai com todas as marcações de uma vez; chamada que já existe: marca por marca
    // (assim ninguém apaga, de uma vez só, o que os outros marcaram)
    if (!o && mud.length) ops.push({ t: 'mc', c: id, lista: Object.keys(mb) });
    else ops.push(...mud);
    // Ensaio Regional: localidade por localidade, só o que mudou (nome, total, cada instrumento)
    const la = new Map(((o && o.locais) || []).map(l => [l.id, l]));
    (c.locais || []).forEach(l => {
      const x = la.get(l.id), campos = {}, inst = {};
      ['nome', 'total'].forEach(k => { const v = String(l[k] == null ? '' : l[k]); if (!x || String(x[k] == null ? '' : x[k]) !== v) campos[k] = v; });
      const ia = x ? x.inst : {};
      Object.keys(l.inst).forEach(k => { if (ia[k] !== l.inst[k]) inst[k] = l.inst[k]; });
      Object.keys(ia).forEach(k => { if (!(k in l.inst)) inst[k] = 0; });
      if (!x || Object.keys(campos).length || Object.keys(inst).length) ops.push({ t: 'l', c: id, id: l.id, campos, inst, ord: l.ord });
    });
    la.forEach((l, lid) => { if (!(c.locais || []).some(x => x.id === lid)) ops.push({ t: 'l-', c: id, id: lid }); });
    // instrumento de quem é do ministério: um por um
    const ta = (o && o.toca) || {}, tb = c.toca || {};
    Object.keys(tb).forEach(i => { const x = ta[i] || {}, y = tb[i]; if ((x.inst || '') !== (y.inst || '') || (x.loc || '') !== (y.loc || '')) ops.push({ t: 'x', c: id, i, inst: y.inst || '', loc: y.loc || '' }); });
    Object.keys(ta).forEach(i => { if (!tb[i]) ops.push({ t: 'x', c: id, i, inst: '', loc: '' }); });
  });
  aC.forEach((c, id) => { if (!bC.has(id)) ops.push({ t: 'c-', id }); });
  return ops;
}
function gravarFila() { try { localStorage.setItem(FILA_KEY, JSON.stringify(VIVO.fila)); } catch (e) {} }
// junta o que mudou na tela e manda (chamado logo depois de cada mudança, com um pequeno atraso)
function enviarAgora() {
  clearTimeout(VIVO.tEnvio); VIVO.tEnvio = null;
  if (!aoVivo() || !ESPELHO || VIVO.pausa) { if (VIVO.pausa) mostrarEstado(); return; }
  const ops = diferencas(ESPELHO, DB);
  if (!ops.length) return;
  ops.forEach(op => aplicarOp(ESPELHO, op));
  // feito sem internet? então na sala só vale para ACRESCENTAR presença (veja src/sala-presenca.js)
  const ligado = !!(VIVO.ws && VIVO.ws.readyState === 1 && VIVO.abriu);
  const lote = { lote: novoId(), ops, off: !ligado };
  VIVO.fila.push(lote); gravarFila();
  if (VIVO.ws && VIVO.ws.readyState === 1 && VIVO.abriu) VIVO.ws.send(JSON.stringify(Object.assign({ t: 'ops' }, lote)));
  mostrarEstado();
}
function agendarEnvio() { clearTimeout(VIVO.tEnvio); VIVO.tEnvio = setTimeout(enviarAgora, 180); }

// guarda rolagem e o campo em que a pessoa está, redesenha, e devolve tudo como estava
function semPular(fn) {
  const y = window.scrollY, a = document.activeElement;
  const chave = a && a.dataset ? (a.dataset.i ? '[data-i="' + a.dataset.i + '"]' : a.dataset.c ? '[data-c="' + a.dataset.c + '"]' : a.id ? '#' + a.id : null) : null;
  let s0 = null, s1 = null; try { s0 = a.selectionStart; s1 = a.selectionEnd; } catch (e) {}
  fn();
  if (chave) { const n = document.querySelector(chave); if (n && n !== document.activeElement) { n.focus({ preventScroll: true }); try { if (s0 != null) n.setSelectionRange(s0, s1); } catch (e) {} } }
  if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
}
const focado = el => el && el === document.activeElement;

// mostra na tela o que os outros mudaram, mexendo só no necessário
function mostrarMudancas(ops) {
  const c = CHAM();
  let lista = false, linhas = false, contagem = false, irm = false, irmLinhas = false, res = false, heroi = false, apagada = null, dl = false, refazer = false, locaisTudo = false, totais = false;
  const locaisCampos = [];
  const linhasMarcar = new Set();
  ops.forEach(op => {
    if (op.t === 'm') { if (c && op.c === c.id) { linhasMarcar.add(op.i); contagem = true; if (c.tipo === 'regional') totais = true; } lista = true; res = true; }
    else if (op.t === 'x') { if (c && op.c === c.id) { linhasMarcar.add(op.i); totais = true; contagem = true; } lista = true; }
    else if (op.t === 'mc') { if (c && op.c === c.id) { linhas = true; contagem = true; } lista = true; res = true; }
    else if (op.t === 'i') {
      const novo = !document.querySelector(`.pm-tr[data-id="${op.id}"]`);
      if (c) { if (document.querySelector(`.pm-row[data-id="${op.id}"]`) && !['nome', 'grupo', 'cargo'].some(k => k in (op.campos || {}))) linhasMarcar.add(op.id); else linhas = true; contagem = true; }
      if (ABA === 'irm') { if (novo || 'nome' in (op.campos || {})) irmLinhas = true; else irm = op; }
      res = true; dl = true;
    }
    else if (op.t === 'i-') { linhas = true; contagem = true; irmLinhas = true; res = true; lista = true; }
    else if (op.t === 'c') { lista = true; if (c && op.id === c.id) { heroi = op; if ('tipo' in (op.campos || {}) || 'grupos' in (op.campos || {})) refazer = true; } res = true; dl = true; }
    else if (op.t === 'link' || op.t === 'link-') { if (c && op.c === c.id) refazer = true; }
    else if (op.t === 'l' || op.t === 'l-') {
      lista = true;
      if (c && op.c === c.id && c.tipo === 'regional') {
        const box = document.querySelector(`.pm-loc[data-l="${op.id}"]`);
        const novoInst = op.t === 'l' && box && Object.keys(op.inst || {}).some(k => !box.querySelector(`[data-li="${op.id}"][data-k="${CSS.escape(k)}"]`) || !(op.inst[k] > 0));
        if (op.t === 'l-' || !box || novoInst) locaisTudo = true; else locaisCampos.push(op);
        totais = true;
      }
      dl = true;
    }
    else if (op.t === 'c-') { lista = true; res = true; if (SEL === op.id) apagada = op; }
    else if (op.t === 'tudo') { apagada = apagada || null; lista = linhas = contagem = irmLinhas = res = true; }
  });
  if (apagada || !CHAM() && SEL) {
    SEL = maisRecente();
    semPular(desenharTudo);
    if (apagada) UI.toast(`${porTxt(apagada.por) || 'Alguém'} apagou a chamada que estava aberta.`, 'info');
    return;
  }
  if (EM_CHAM() && refazer) { semPular(desenharChamada); desenharLista(); if (dl) atualizarDatalists(); return; }
  if (EM_CHAM()) {
    if (lista) desenharLista();
    if (locaisTudo) semPular(desenharLocais);
    else locaisCampos.forEach(op => {
      const l = LOC(op.id); if (!l) return;
      Object.keys(op.campos || {}).forEach(k => { const inp = document.querySelector(`[data-lc="${op.id}:${k}"]`); if (inp && !focado(inp)) inp.value = l[k]; });
      Object.keys(op.inst || {}).forEach(k => { const inp = document.querySelector(`[data-li="${op.id}"][data-k="${CSS.escape(k)}"]`); if (inp && !focado(inp)) inp.value = l.inst[k] || ''; });
      atualizarDifLocal(l);
    });
    if (totais) atualizarTotais();
    if (heroi) {
      const cc = CHAM(), h = document.querySelector('.heroi');
      if (cc && h) { h.querySelector('.h-tit small').textContent = diaSemana(cc.data); h.querySelector('h2').textContent = dataLonga(cc.data); h.querySelector('.h-sub').textContent = [cc.ocasiao, cc.local].filter(Boolean).join(' · ') || 'Chamada'; }
      Object.keys(heroi.campos || {}).forEach(k => { const inp = document.querySelector(`[data-c="${k}"]`); if (inp && !focado(inp) && cc) inp.value = cc[k] || ''; });
      if (!totais) atualizarTotais();
    }
    if (linhas) semPular(desenharLinhas);
    else if (linhasMarcar.size) {
      const cc = CHAM();
      linhasMarcar.forEach(id => {
        const row = document.querySelector(`.pm-row[data-id="${id}"]`), i = DB.irmaos.find(x => x.id === id);
        if (!row || !i || !cc) return;
        if (row.contains(document.activeElement)) { const s = row.querySelector('[data-xi]'); if (s && s !== document.activeElement) s.value = (cc.toca[id] || {}).inst || ''; return; }
        const tmp = document.createElement('div'); tmp.innerHTML = linhaHTML(i, row.querySelector('.pm-n').textContent, cc);
        const nova = tmp.firstElementChild; nova.classList.add('remoto'); row.replaceWith(nova);
      });
    }
    if (contagem) { const cc = CHAM(), el = document.getElementById('contagem'); if (cc && el) el.innerHTML = contagemHTML(contar(cc), cc); if (cc && cc.tipo === 'regional') desenharCats(); }
  } else if (ABA === 'irm') {
    if (irmLinhas) semPular(desenharIrmaosLinhas);
    else if (irm) {
      const i = DB.irmaos.find(x => x.id === irm.id);
      if (i) Object.keys(irm.campos || {}).forEach(k => { const inp = document.querySelector(`[data-i="${irm.id}:${k}"]`); if (inp && !focado(inp)) inp.value = i[k] || ''; });
    }
  } else if (ABA === 'res' && res) semPular(desenharResumo);
  if (dl) atualizarDatalists();
}

function receber(msg) {
  if (msg.t === 'pausa') { if (!VIVO.pausa) entrarPausa(msg.por || ''); return; }
  if (msg.t === 'eu') { const antes = JSON.stringify(VIVO.eu || null); VIVO.eu = { email: msg.email || '', admin: !!msg.admin }; if (antes !== JSON.stringify(VIVO.eu) && DB && EM_CHAM()) semPular(desenharLinhas); return; }
  if (msg.t === 'gente') { VIVO.gente = (msg.lista || []).filter(g => g.cliente !== CLIENTE); mostrarEstado(); return; }
  if (msg.t === 'tudo') {
    enviarAgora();   // o que ainda não foi mandado entra na fila antes de trocar
    const daSala = normalizar(msg.db);
    let junto = 0;
    if (VIVO.primeira && PENDENTE && (DB.irmaos.length || DB.chamadas.length)) {
      // primeira vez ao vivo com alterações que nunca foram para a nuvem: junta (sem apagar nada de ninguém)
      const ids = new Set(daSala.irmaos.map(i => i.id)), cids = new Set(daSala.chamadas.map(c => c.id));
      const extra = copia(daSala);
      DB.irmaos.forEach(i => { if (!ids.has(i.id)) { extra.irmaos.push(copia(i)); junto++; } });
      DB.chamadas.forEach(c => {
        if (!cids.has(c.id)) { extra.chamadas.push(copia(c)); junto++; return; }
        const o = extra.chamadas.find(x => x.id === c.id);
        Object.keys(c.marcas).forEach(i => { if (!o.marcas[i]) { o.marcas[i] = 'v'; junto++; } });
      });
      ESPELHO = daSala; DB = extra;
    } else {
      ESPELHO = daSala; DB = copia(daSala);
    }
    VIVO.fila.forEach(l => l.ops.forEach(op => { aplicarOp(ESPELHO, op); aplicarOp(DB, op); }));
    VIVO.seq = msg.seq || 0; VIVO.primeira = false; PENDENTE = false;
    gravarFila(); gravarLocal();
    let trocaAba = null;
    if (!CHAM()) {
      // volta para a chamada que estava aberta (e para a aba dela)
      let s0 = null; try { s0 = localStorage.getItem(KEY + '_sel'); } catch (e) {}
      const c0 = DB.chamadas.find(c => c.id === s0);
      if (c0) { SEL = c0.id; if (EM_CHAM() && c0.tipo !== TIPO_ABA()) trocaAba = c0.tipo === 'regional' ? 'reg' : 'cham'; }
      else { SEL = maisRecente(); if (!SEL && EM_CHAM()) { const o = ABA === 'reg' ? 'nomes' : 'regional'; if (maisRecente(o)) { trocaAba = o === 'regional' ? 'reg' : 'cham'; } } }
    }
    if (trocaAba) { ABA = trocaAba; const s1 = SEL; semPular(() => { mudarAba(trocaAba); if (s1 && CHAM() && CHAM().id !== s1 && DB.chamadas.some(c => c.id === s1 && c.tipo === TIPO_ABA())) { SEL = s1; desenharTudo(); } atualizarDatalists(); }); }
    else semPular(() => { desenharTudo(); atualizarDatalists(); });
    if (junto) { agendarEnvio(); UI.toast('As alterações que estavam só neste aparelho foram juntadas à lista de todos.', 'ok'); }
    return;
  }
  if (msg.t === 'mudou') {
    const meu = msg.lote && VIVO.fila.some(l => l.lote === msg.lote);
    if (meu) VIVO.fila = VIVO.fila.filter(l => l.lote !== msg.lote);
    if (msg.seq) VIVO.seq = msg.seq;
    // do meu lote, só valem as correções: presença que eu tirei sem internet e que continua valendo
    const deOutros = meu ? (msg.ops || []).filter(op => op.corr) : (msg.ops || []);
    if (meu && deOutros.some(op => op.dono)) UI.toast('Só quem marcou essa presença (ou um administrador) pode tirar a presença ou trocar o instrumento.', { type: 'info', duration: 7000 });
    if (meu && deOutros.some(op => (op.t === 'm' || op.t === 'mc') && !op.dono)) {
      // junta num aviso só (podem vir vários lotes seguidos quando a internet volta)
      VIVO.corrigidos = (VIVO.corrigidos || 0) + deOutros.reduce((k, op) => k + (op.t === 'm' && !op.dono ? 1 : 0), 0);
      clearTimeout(VIVO.tCorr); VIVO.tCorr = setTimeout(() => {
        const n = VIVO.corrigidos; VIVO.corrigidos = 0;
        UI.toast((n ? `${n === 1 ? '1 irmão que você desmarcou' : n + ' irmãos que você desmarcou'} sem internet ${n === 1 ? 'continua' : 'continuam'} como presente` : 'As presenças marcadas pelos outros continuam valendo')
          + ': sem internet só dá para acrescentar presença, nunca tirar. Se for engano, desmarque de novo agora.', { type: 'info', duration: 12000 });
      }, 800);
    }
    const troca = deOutros.find(op => op.t === 'tudo');
    if (troca) { receber({ t: 'tudo', db: troca.db, seq: msg.seq }); return; }
    if (deOutros.length) {
      enviarAgora();   // o que eu mexi e ainda não mandei vai antes (e fica valendo por cima)
      deOutros.forEach(op => { if (op.t === 'nada') return; aplicarOp(ESPELHO, op); aplicarOp(DB, op); });
      // o que eu mandei e a sala ainda não confirmou vale por cima do que chegou antes dele
      VIVO.fila.forEach(l => l.ops.forEach(op => { aplicarOp(ESPELHO, op); aplicarOp(DB, op); }));
      mostrarMudancas(deOutros);
    }
    gravarFila(); clearTimeout(_tSalvar); _tSalvar = setTimeout(() => { _tSalvar = null; gravarLocal(); }, 400);
    mostrarEstado();
  }
}

function urlSala() {
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/presenca-musical/ws?cliente=' + encodeURIComponent(CLIENTE) + '&token=' + encodeURIComponent(localStorage.getItem('session_token') || '');
}
function ligarVivo() {
  if (VIVO.modo === 'manual' || !temSessao()) { if (!temSessao()) mostrarEstado(); return; }
  if (VIVO.pausa) { mostrarEstado(); return; }
  if (VIVO.ws && (VIVO.ws.readyState === 0 || VIVO.ws.readyState === 1)) return;
  clearTimeout(VIVO.tRec);
  let ws; try { ws = new WebSocket(urlSala()); } catch (e) { return religar(); }
  VIVO.ws = ws; VIVO.abriu = false; mostrarEstado();
  ws.onopen = () => {
    VIVO.abriu = true; VIVO.tent = 0; VIVO.falhas = 0; VIVO.modo = 'vivo';
    document.body.classList.add('ao-vivo');
    ws.send(JSON.stringify({ t: 'ola', desde: VIVO.primeira && PENDENTE ? 0 : VIVO.seq }));
    VIVO.fila.forEach(l => ws.send(JSON.stringify(Object.assign({ t: 'ops' }, l))));
    enviarAgora();   // o que mudou enquanto estava pausado (ou antes de ligar)
    clearInterval(VIVO.tPing); VIVO.tPing = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 30000);
    mostrarEstado();
  };
  ws.onmessage = e => { if (e.data === 'pong') return; let m; try { m = JSON.parse(e.data); } catch (er) { return; } try { receber(m); } catch (er) { console.error('ao vivo:', er); } };
  ws.onclose = () => {
    clearInterval(VIVO.tPing);
    if (VIVO.ws !== ws || VIVO.pausa) return;
    VIVO.ws = null;
    if (!VIVO.abriu) VIVO.falhas++;
    religar();
  };
  ws.onerror = () => {};
}
async function religar() {
  // nunca abriu: confere se o servidor tem a sala (deploy antigo -> modo de antes) ou se a sessão acabou
  if (VIVO.falhas >= 1 && VIVO.modo === 'ligando') {
    try {
      const r = await fetch('/api/presenca-musical/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: localStorage.getItem('session_token') }) });
      if (r.status === 404) return irParaManual();
      if (r.status === 401) { VIVO.modo = 'sessao'; mostrarEstado(); return; }
      if (r.status === 403) return irParaManual();
    } catch (e) { /* sem internet: continua tentando */ }
  }
  mostrarEstado();
  const espera = Math.min(30000, 1000 * Math.pow(2, VIVO.tent++));
  clearTimeout(VIVO.tRec); VIVO.tRec = setTimeout(ligarVivo, espera);
}
/* ---------- ligar/desligar o tempo real (para todos) ----------
   Desligado: a sala fecha a ligação de todo mundo (aplicativo e link de convidado) e não grava
   nada; ninguém gasta o servidor. Cada aparelho continua mexendo e guarda o que fez; a "foto" de
   como a sala estava (ESPELHO) fica guardada para, ao ligar de novo, mandar só o que mudou — de uma
   vez — e receber o que os outros mudaram. Enquanto está desligado, cada tela aberta só confere a
   cada 5 minutos se já ligaram de novo (uma consulta pequena). */
const PAUSA_KEY = KEY + '_pausa', ESPELHO_KEY = KEY + '_espelho';
async function apiVivo(acao, v) {
  try {
    const r = await fetch('/api/presenca-musical/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: localStorage.getItem('session_token'), acao, v: v ? 1 : 0 }) });
    if (!r.ok) return null; return await r.json();
  } catch (e) { return null; }
}
function entrarPausa(por) {
  VIVO.pausa = true;
  try { localStorage.setItem(PAUSA_KEY, '1'); localStorage.setItem(ESPELHO_KEY, JSON.stringify(ESPELHO)); } catch (e) {}
  clearTimeout(VIVO.tRec); clearTimeout(VIVO.tEnvio); clearInterval(VIVO.tPing);
  const ws = VIVO.ws; VIVO.ws = null; VIVO.abriu = false; VIVO.gente = [];
  if (ws) { try { ws.close(1000, 'pausa'); } catch (e) {} }
  document.body.classList.remove('ao-vivo'); document.body.classList.add('pausado');
  vigiarPausa(); mostrarEstado();
  if (por !== undefined) UI.toast(`${por ? porTxt(por) + ' desligou' : 'O tempo real foi desligado'} o tempo real para todos. Pode continuar mexendo: fica guardado neste aparelho e vai quando ligar de novo.`, { type: 'info', duration: 9000 });
}
function sairPausa(aviso) {
  VIVO.pausa = false; clearInterval(VIVO.tVigia);
  try { localStorage.removeItem(PAUSA_KEY); localStorage.removeItem(ESPELHO_KEY); } catch (e) {}
  document.body.classList.remove('pausado');
  VIVO.tent = 0; VIVO.modo = VIVO.modo === 'vivo' ? 'vivo' : 'ligando';
  ligarVivo();
  if (aviso) UI.toast(aviso, 'ok');
}
// desligado: confere de vez em quando se alguém ligou de novo
function vigiarPausa() {
  clearInterval(VIVO.tVigia);
  VIVO.tVigia = setInterval(conferirPausa, 5 * 60 * 1000);
}
async function conferirPausa() {
  if (!VIVO.pausa || document.visibilityState !== 'visible' || Date.now() - (VIVO.ultConf || 0) < 60000) return;
  VIVO.ultConf = Date.now();
  const r = await apiVivo('status');
  if (r && r.ok && !r.pausa && VIVO.pausa) sairPausa('O tempo real foi ligado de novo: suas mudanças foram enviadas e as dos outros chegaram.');
}
async function pausarVivo(pausar) {
  if (VIVO.modo === 'manual') return;
  if (pausar) {
    if (!(await UI.confirm('Desligar o tempo real para todos?', 'Ninguém fica ao vivo (nem quem está pelo link de convidado) e o servidor não é usado. Cada um continua marcando no próprio aparelho; quando alguém ligar de novo, tudo é enviado e juntado.', { ok: 'Desligar' }))) return;
    enviarAgora();
    for (let k = 0; k < 15 && VIVO.fila.length && VIVO.ws && VIVO.ws.readyState === 1; k++) await new Promise(r => setTimeout(r, 100));   // espera o que já foi mandado ser confirmado
    const r = await apiVivo('pausa', 1);
    if (!r || !r.ok) { UI.toast('Não foi possível desligar agora (sem internet?). Tente de novo.', 'error'); return; }
    entrarPausa(); 
    UI.toast('Tempo real desligado para todos. Pode mexer à vontade: fica guardado neste aparelho. Ligue de novo para enviar.', { type: 'info', duration: 8000 });
  } else {
    const r = await apiVivo('pausa', 0);
    if (!r || !r.ok) { UI.toast('Não foi possível ligar agora (sem internet?). O que você fez continua guardado neste aparelho.', 'error'); return; }
    sairPausa('Tempo real ligado para todos: suas mudanças foram enviadas e as dos outros chegaram.');
  }
}
function irParaManual() {
  VIVO.modo = 'manual'; clearTimeout(VIVO.tRec); clearTimeout(VIVO.tEnvio);
  document.body.classList.remove('ao-vivo');
  if (VIVO.fila.length || (ESPELHO && diferencas(ESPELHO, DB).length)) PENDENTE = true;
  VIVO.fila = []; gravarFila(); gravarLocal();
  mostrarEstado(); carregarNuvem(false);
}
window.addEventListener('online', () => { if (aoVivo() && !VIVO.ws && !VIVO.pausa) { VIVO.tent = 0; ligarVivo(); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && aoVivo() && !VIVO.ws && !VIVO.pausa) { VIVO.tent = 0; ligarVivo(); } if (document.visibilityState === 'visible' && VIVO.pausa) conferirPausa(); });
window.addEventListener('pagehide', () => { if (aoVivo()) enviarAgora(); });

/* ---------- atalhos ---------- */
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || document.querySelector('.ui-modal')) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); salvarNuvem(); }
  else if (k === 'p') { e.preventDefault(); gerarPDF(); }
});

/* ---------- início ---------- */
DB = ler();
ATUALIZADO_AO_ABRIR = DB.atualizado || 0;
try { PENDENTE = localStorage.getItem(KEY + '_pend') === '1'; } catch (e) {}
try { VIVO.seq = +(localStorage.getItem(SEQ_KEY) || 0) || 0; VIVO.fila = JSON.parse(localStorage.getItem(FILA_KEY) || '[]') || []; } catch (e) { VIVO.seq = 0; VIVO.fila = []; }
VIVO.primeira = !VIVO.seq;
ESPELHO = copia(DB);
try { if (localStorage.getItem(PAUSA_KEY) === '1') { VIVO.pausa = true; const e = localStorage.getItem(ESPELHO_KEY); if (e) ESPELHO = normalizar(JSON.parse(e)); document.body.classList.add('pausado'); } } catch (e) {}
try { const s = localStorage.getItem(KEY + '_sel'); SEL = DB.chamadas.some(c => c.id === s) ? s : maisRecente('regional') || maisRecente('nomes'); } catch (e) { SEL = maisRecente('regional') || maisRecente('nomes'); }
window.__aoEntrar = function () {
  if (window.__pmIniciado) return; window.__pmIniciado = true;
  const est = document.getElementById('estado');
  if (est) { est.addEventListener('click', cliqueEstado); est.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cliqueEstado(); } }); }
  let ab = null; try { const v = localStorage.getItem(KEY + '_aba'); if (['cham', 'reg', 'irm', 'res'].includes(v)) ab = v; } catch (e) {}
  const s0 = DB.chamadas.find(c => c.id === SEL);
  if (!ab || (ab === 'cham' && s0 && s0.tipo === 'regional')) ab = s0 && s0.tipo === 'nomes' ? 'cham' : 'reg';
  atualizarDatalists(); mudarAba(ab);
  if ('WebSocket' in window) { ligarVivo(); if (VIVO.pausa) { vigiarPausa(); conferirPausa(); } } else irParaManual();
};
if (window.__SESSAO || window.__SESSAO_PREVIA) window.__aoEntrar(window.__SESSAO || window.__SESSAO_PREVIA);
