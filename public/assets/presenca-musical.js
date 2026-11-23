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
let FILTRO = { q: '', instr: '', so: '' }, BUSCA_IRM = '', RES_ANO = '';
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
    const n = Object.assign({ id: novoId(), data: '', ocasiao: '', local: '', obs: '', tipo: 'nomes', grupos: '', marcas: {}, locais: [], cidade: '', presidente: '', hino: '', capitulo: '', livro: '', regente: '', hinos: '' }, c);
    const m = n.marcas && typeof n.marcas === 'object' ? n.marcas : {};
    n.marcas = {};   // só "presente" é marcado; quem não está aqui é ausente
    Object.keys(m).forEach(k => { if (m[k] === 'v') n.marcas[k] = 'v'; });
    n.tipo = n.tipo === 'regional' ? 'regional' : 'nomes';
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
const maisRecente = () => { const l = DB.chamadas.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))); return l[0] ? l[0].id : null; };
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
    k.musicos = (c.locais || []).reduce((a, l) => a + totalLocal(l), 0);
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
function cliqueEstado() { if (!temSessao() || VIVO.modo === 'sessao') { location.href = '/login.html'; return; } if (aoVivo()) { VIVO.tent = 0; ligarVivo(); return; } if (PENDENTE) salvarNuvem(); else if (NOVA) carregarNuvem(true); }

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
  document.getElementById('abaCham').hidden = a !== 'cham';
  document.getElementById('abaIrm').hidden = a !== 'irm';
  document.getElementById('abaRes').hidden = a !== 'res';
  try { localStorage.setItem(KEY + '_aba', a); } catch (e) {}
  desenharTudo();
  if (window.AppBar && AppBar.atualizar) AppBar.atualizar();
}
function desenharTudo() {
  if (ABA === 'cham') { desenharLista(); desenharChamada(); }
  else if (ABA === 'irm') desenharIrmaos();
  else desenharResumo();
  mostrarEstado();
}
function desenharLista() {
  const el = document.getElementById('lista');
  const l = DB.chamadas.slice().sort((a, b) => String(b.data || '9').localeCompare(String(a.data || '9')));
  const sm = document.getElementById('selMovel');   // no celular a lista lateral vira esta caixa
  if (sm) sm.innerHTML = l.length ? `<select onchange="abrirChamada(this.value)" aria-label="Chamada">${l.map(c => `<option value="${c.id}"${c.id === SEL ? ' selected' : ''}>${esc(dataBR(c.data) || 'Sem data')} · ${esc(c.ocasiao || 'Chamada')}</option>`).join('')}</select><button type="button" class="primary" onclick="novaChamada()">${ICO('plus')}Nova</button>` : '';
  if (!l.length) { el.innerHTML = '<div class="vazio">Nenhuma chamada ainda.<br>Use “Nova chamada”.</div>'; return; }
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
  const ult = DB.chamadas.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
  const oc = ult ? ult.ocasiao : (DB.irmaos.some(i => i.grupo === 'Ministério') ? 'Ensaio Regional' : 'Ensaio Local');
  const c = normalizar({ chamadas: [{ data: hojeISO(), ocasiao: oc, local: ult ? ult.local : '', tipo: /ensaio regional/i.test(oc) ? 'regional' : 'nomes', grupos: ult && ult.tipo !== 'regional' ? ult.grupos : '' }] }).chamadas[0];
  DB.chamadas.push(c); SEL = c.id; guardar();
  if (ABA !== 'cham') mudarAba('cham'); else desenharTudo();
  if (!DB.irmaos.length) UI.toast('Chamada criada. Agora coloque os irmãos: importe o relatório em “Irmãos” ou acrescente um por um aqui.', 'info');
}
async function excluirChamada() {
  const c = CHAM(); if (!c) return;
  if (!(await UI.confirm('Excluir esta chamada?', `${dataLonga(c.data)} · ${c.ocasiao || 'Chamada'}. As marcações dela serão apagadas.`, { ok: 'Excluir', danger: true }))) return;
  const i = DB.chamadas.indexOf(c); DB.chamadas.splice(i, 1); SEL = maisRecente(); guardar(); desenharTudo();
  UI.toast('Chamada excluída.', { action: { label: 'Desfazer', icon: 'undo', fn: () => { DB.chamadas.splice(i, 0, c); SEL = c.id; guardar(); desenharTudo(); } } });
}

/* ---------- chamada ---------- */
function filtrar(lst, c) {
  const q = norm(FILTRO.q);
  return lst.filter(i => (!FILTRO.instr || i.instrumento === FILTRO.instr)
    && (!q || norm(i.nome + ' ' + i.cidade + ' ' + i.bairro + ' ' + i.instrumento).includes(q))
    && (!FILTRO.so || (FILTRO.so === 'v' ? c.marcas[i.id] === 'v' : c.marcas[i.id] !== 'v')));
}
const instrumentosUsados = () => [...new Set(DB.irmaos.map(i => i.instrumento).filter(Boolean))].sort((a, b) => { const ia = INSTRUMENTOS.indexOf(a), ib = INSTRUMENTOS.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'pt-BR'); });
function linhaHTML(i, n, c) {
  const p = c.marcas[i.id] === 'v';
  return `<div class="pm-row${p ? ' v' : ''}" data-id="${i.id}">
    <span class="pm-n">${n}</span>
    <div class="pm-nm"><b>${esc(i.nome)}</b><small>${esc(c.tipo === 'regional' ? (localTxt(i) || i.cargo) : [i.instrumento, localTxt(i)].filter(Boolean).join(' · ')) || '&nbsp;'}</small></div>
    <div class="pm-bt">${p ? '' : '<em class="pm-aus">Ausente</em>'}<button type="button" class="b-v${p ? ' on' : ''}" onclick="marcar('${i.id}')" aria-pressed="${p}">${ICO('check')}<span>Presente</span></button></div>
  </div>`;
}
function desenharChamada() {
  const el = document.getElementById('ed'), c = CHAM();
  if (!c) {
    el.innerHTML = `<div class="vazia"><b>${DB.chamadas.length ? 'Escolha uma chamada' : 'Nenhuma chamada ainda'}</b>Cada chamada é um ensaio ou reunião: escolha a data e marque quem está presente (quem não for marcado fica como ausente).${DB.irmaos.length ? '' : '<br>Antes, coloque os irmãos na aba <b>Irmãos</b> (dá para importar o relatório de membros em PDF).'}
      <div class="linha-b"><button type="button" class="primary" onclick="novaChamada()">${ICO('plus')}Nova chamada</button>${DB.irmaos.length ? '' : `<button type="button" onclick="mudarAba('irm')">${ICO('users')}Irmãos</button>`}</div></div>`;
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
      <div class="campo s4"><label>Tipo de lista</label><div class="pm-tipo" role="radiogroup">
        <label><input type="radio" name="pmTipo" value="nomes"${reg ? '' : ' checked'} onchange="mudarTipo('nomes')"><span><b>Nome por nome</b><small>Marca cada irmão dos grupos escolhidos (ensaio local, reunião…)</small></span></label>
        <label><input type="radio" name="pmTipo" value="regional"${reg ? ' checked' : ''} onchange="mudarTipo('regional')"><span><b>Ensaio Regional</b><small>Ministério e encarregados nome por nome; músicos contados por localidade</small></span></label>
      </div></div>
      ${reg ? '' : `<div class="campo s4"><label>Quem entra nesta chamada</label><div class="pm-chips">${grupos.map(g => `<button type="button" class="pm-chip${sel.includes(g) ? ' on' : ''}" onclick="alternarGrupo(this.dataset.g)" data-g="${esc(g)}" aria-pressed="${sel.includes(g)}">${sel.includes(g) ? ICO('check') : ''}${esc(g)} <em>${DB.irmaos.filter(i => i.grupo === g).length}</em></button>`).join('')}</div></div>`}
    </div>
  </section>
  ${reg ? blocoLink(c) : ''}
  <section class="bloco"><h3><span class="bi">${ICO('users')}</span><span>${reg ? 'Ministério e encarregados' : 'Irmãos'}<br><small>${reg ? 'Por cargo, em ordem alfabética · toque em Presente' : 'Por grupo, em ordem alfabética · toque em Presente; quem não for marcado fica como ausente'}</small></span><em id="emFiltro">${lst.length} de ${k.t}</em></h3>
    ${reg && !k.t ? `<div class="pm-imp">${ICO('users')}<div><b>Ainda não há ministério na lista</b><small>Puxe os anciães, diáconos, cooperadores e encarregados do Relatório de Igrejas (ou acrescente um por um).</small></div><button type="button" class="primary" onclick="puxarMinisterio()">${ICO('refresh')}Puxar do Relatório</button></div>` : ''}
    <div class="pm-filtros">
      <div class="pm-busca">${ICO('search')}<input id="busca" type="search" placeholder="Procurar nome, cidade, bairro…" value="${esc(FILTRO.q)}" oninput="FILTRO.q=this.value;desenharLinhas()"></div>
      ${instrs.length ? `<select id="fInstr" onchange="FILTRO.instr=this.value;desenharLinhas()"><option value="">Todos os instrumentos</option>${instrs.map(x => `<option${FILTRO.instr === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}
      <div class="pm-seg" role="group">${[['', 'Todos'], ['v', 'Presentes'], ['n', 'Ausentes']].map(([v, r]) => `<button type="button" class="${FILTRO.so === v ? 'on' : ''}" onclick="FILTRO.so='${v}';desenharLinhas()">${r}</button>`).join('')}</div>
    </div>
    <div class="pm-lista" id="linhas"></div>
    ${reg ? `<form class="pm-rapido" onsubmit="event.preventDefault();addMinisterio()" aria-label="Acrescentar alguém do ministério">
      <input id="rNome" placeholder="Nome de quem veio e não está na lista" autocomplete="off" aria-label="Nome">
      <select id="rCargo" aria-label="Cargo">${CARGOS_MIN.map(([cg]) => `<option${cg === (window.__ultCargo || 'Ancião') ? ' selected' : ''}>${esc(cg)}</option>`).join('')}</select>
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
  ${reg ? `<section class="bloco"><h3><span class="bi">${ICO('music')}</span><span>Músicos por localidade<br><small>Quantos de cada instrumento vieram de cada localidade · o total soma sozinho (ou digite)</small></span><em id="emLocs">${k.locs} ${k.locs === 1 ? 'localidade' : 'localidades'}</em></h3>
    <div class="pm-locs" id="locais"></div>
    <div class="linha-b"><button type="button" class="primary" onclick="addLocal()">${ICO('plus')}Acrescentar localidade</button></div>
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
  if (c && c.tipo === 'regional') return `<span class="c-v">${ICO('check')}<b>${k.v}</b> do ministério</span><span class="c-s">${ICO('music')}<b>${k.musicos}</b> ${k.musicos === 1 ? 'músico' : 'músicos'}</span><span class="c-s">${ICO('pin')}<b>${k.locs}</b> ${k.locs === 1 ? 'localidade' : 'localidades'}</span><span class="c-t">${k.t} no ministério e encarregados · ${pct}% presentes</span>
    <div class="pm-barra"><i style="width:${pct}%" class="bv"></i></div>`;
  return `<span class="c-v">${ICO('check')}<b>${k.v}</b> ${k.v === 1 ? 'presente' : 'presentes'}</span><span class="c-n">${ICO('x')}<b>${k.n}</b> ${k.n === 1 ? 'ausente' : 'ausentes'}</span><span class="c-t">${k.t} irmãos · ${pct}% de presença</span>
    <div class="pm-barra"><i style="width:${k.t ? k.v * 100 / k.t : 0}%" class="bv"></i></div>`;
}
function desenharLinhas() {
  const c = CHAM(), el = document.getElementById('linhas'); if (!c || !el) return;
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
  if (!(aoVivo() && VIVO.ws && VIVO.ws.readyState === 1 && VIVO.abriu)) { UI.toast('Para isso é preciso estar ao vivo (com internet).', 'error'); return false; }
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
      <button type="button" class="x" title="Tirar esta localidade" data-acao="tirarLocal" data-l="${l.id}">${ICO('trash')}</button></div>
    <div class="pm-insts">${insts.map(k => `<span class="pm-inst"><span>${esc(k)}</span><button type="button" data-acao="menos" data-l="${l.id}" data-k="${esc(k)}" aria-label="Menos ${esc(k)}">−</button><input data-li="${l.id}" data-k="${esc(k)}" inputmode="numeric" value="${l.inst[k]}" aria-label="${esc(k)}"><button type="button" data-acao="mais" data-l="${l.id}" data-k="${esc(k)}" aria-label="Mais ${esc(k)}">+</button></span>`).join('')}
      <select data-addinst="${l.id}" aria-label="Acrescentar instrumento"><option value="">+ Instrumento</option>${opc.map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
    <small class="pm-dif" data-dif="${l.id}"${dif ? '' : ' hidden'}>A soma dos instrumentos dá ${soma}.</small>
  </div>`;
}
function desenharLocais() {
  const c = CHAM(), el = document.getElementById('locais'); if (!c || !el) return;
  el.innerHTML = c.locais.length ? c.locais.map(localHTML).join('') : '<div class="vazio">Nenhuma localidade ainda. Use “Acrescentar localidade”.</div>';
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
  if (c.marcas[id] === 'v') delete c.marcas[id]; else c.marcas[id] = 'v';
  guardar();
  const row = document.querySelector(`.pm-row[data-id="${id}"]`);
  const i = DB.irmaos.find(x => x.id === id);
  if (row && i) {
    // com filtro "presentes"/"ausentes" a linha sai da lista depois de um instante
    const n = row.querySelector('.pm-n').textContent;
    const tmp = document.createElement('div'); tmp.innerHTML = linhaHTML(i, n, c); row.replaceWith(tmp.firstElementChild);
    if (FILTRO.so) setTimeout(desenharLinhas, 450);
  }
  atualizarContagem();
}
async function limparMarcas() {
  const c = CHAM(); if (!c || !Object.keys(c.marcas).length) return;
  if (!(await UI.confirm('Limpar as marcações?', 'Todos ficam como ausentes nesta chamada.', { ok: 'Limpar', danger: true }))) return;
  const antes = Object.assign({}, c.marcas); c.marcas = {}; guardar(); desenharLinhas(); atualizarContagem();
  UI.toast('Marcações limpas.', { action: { label: 'Desfazer', icon: 'undo', fn: () => { c.marcas = antes; guardar(); desenharLinhas(); atualizarContagem(); } } });
}
// Ensaio Regional: acrescenta alguém do ministério direto na chamada (só nome e cargo,
// sem localidade) e já marca presente; o campo fica pronto para o próximo
function addMinisterio() {
  const c = CHAM(), inp = document.getElementById('rNome'), sel = document.getElementById('rCargo'); if (!c || !inp) return;
  const nome = nomeBonito(inp.value); if (!nome) { inp.focus(); return; }
  const cargo = sel ? sel.value : 'Ancião'; window.__ultCargo = cargo;
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
    if (el.dataset.c === 'ocasiao' && /^ensaio regional$/i.test(el.value.trim()) && c.tipo !== 'regional' && !Object.keys(c.marcas).length) {
      c.tipo = 'regional'; guardar(); UI.toast('Lista trocada para Ensaio Regional: ministério nome por nome e músicos por localidade.', 'info');
      semPular(desenharChamada); desenharLista(); return;
    }
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
      body: `<p class="ui-modal__p">O relatório do ensaio (resumo por instrumento, ministério e hinos) ou a lista de presença com os nomes.</p>`,
      actions: [{ label: 'Cancelar', value: null }, { label: 'Lista em branco', value: 'branco', icon: 'file' }, { label: 'Lista de presença', value: 'chamada', icon: 'check' }, { label: 'Relatório do ensaio', value: 'rel', primary: true, icon: 'file' }]
    });
    if (!v) return;
    if (v === 'rel') return gerarRelatorioPDF();
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
function relDados(c) {
  const soma = {}; let org = 0, mus = 0;
  (c.locais || []).forEach(l => {
    let o = 0;
    Object.keys(l.inst || {}).forEach(k => { const n = +l.inst[k] || 0; if (norm(k) === 'orgao') o += n; else soma[norm(k)] = (soma[norm(k)] || 0) + n; });
    org += o; mus += Math.max(0, totalLocal(l) - o);
  });
  const usados = new Set();
  const inst = REL_INST.map(([rot, al, fam]) => { let n = 0; al.forEach(a => { const k = norm(a); if (soma[k] && !usados.has(k)) { n += soma[k]; usados.add(k); } }); return { rot, n, fam }; });
  Object.keys(soma).forEach(k => { if (!usados.has(k) && soma[k]) { const nome = (c.locais.flatMap(l => Object.keys(l.inst)).find(x => norm(x) === k) || k); inst.push({ rot: nome.toUpperCase(), n: soma[k], fam: '' }); } });
  const base = inst.reduce((a, r) => a + r.n, 0), fam = f => inst.filter(r => r.fam === f).reduce((a, r) => a + r.n, 0);
  const pct = f => base ? Math.round(fam(f) * 100 / base) + '%' : '';
  const pres = DB.irmaos.filter(i => c.marcas[i.id] === 'v');
  const min = REL_MIN.map(([rot, re, soma]) => ({ rot, soma, n: pres.filter(i => re.test(norm(i.cargo))).length }));
  const minT = min.reduce((a, r) => a + r.n, 0);
  return { inst, mus, org, tot: mus + org, min, minT, geral: mus + org + min.filter(r => r.soma).reduce((a, r) => a + r.n, 0), hinos: listaHinos(c), fam: { c: pct('c'), m: pct('m'), b: pct('b') } };
}
const REL_CSS = `
.rel{width:100%;border-collapse:collapse;table-layout:fixed;font-family:Arial,'Liberation Sans',Helvetica,sans-serif;color:#000;font-size:10.8pt;line-height:1.12}
.rel td{border:1px solid #000;padding:0 3px;height:5.35mm;vertical-align:middle}
.rel .t1 td,.rel .t2 td,.rel .t3 td{border-top:0;border-bottom:0;text-align:center;font-weight:700;font-style:italic;padding:1px 4px;height:auto;font-size:10.6pt}
.rel .t1 td{padding-top:5px}
.rel .t2 td{font-style:normal;font-weight:900;font-family:'Arial Black',Arial,sans-serif;font-size:10.6pt;text-decoration:underline}
.rel .t3 td{padding-bottom:4px}
.rel .sec td{background:#d9d9d9;text-align:center;font-weight:700;font-size:11pt}
.rel .sec td.hd{font-family:Calibri,Carlito,Arial,sans-serif;font-size:8.8pt}
.rel .txt td{font-size:9.6pt;line-height:1.22;padding:3px 3px 4px;height:auto}
.rel td.v,.rel td.r{text-align:center}
.rel td.rh{text-align:center;font-family:Calibri,Carlito,Arial,sans-serif;font-weight:700;font-size:8.8pt}
.rel td.r.p{font-family:Calibri,Carlito,Arial,sans-serif;font-size:8.8pt}
.rel td.th{text-align:center;vertical-align:top;font-family:Calibri,Carlito,Arial,sans-serif;font-weight:700;font-size:8.8pt;line-height:2.05;padding-top:1px}
.rel td.th b{display:block;font-size:9.6pt;line-height:1.3}
.rel tr.i td.l{font-weight:700}
.rel tr.g1 td.l,.rel tr.g1 td.v{background:#d9d9d9;font-weight:700}
.rel tr.g2 td.l,.rel tr.g2 td.v{background:#808080;font-weight:700}
.rel tr.gg td.l{text-align:center}
`;
(function () { const st = document.createElement('style'); st.textContent = REL_CSS.replace(/\.rel/g, '.pm-rel-wrap .rel'); document.head.appendChild(st); })();
function relTabelaHTML(c, cheio) {
  const d = relDados(c), v = n => cheio ? String(n) : '', p = iso => partes(iso);
  const dt = p(c.data), cid = (c.cidade || '').trim() || CIDADE_PADRAO;
  const titulo = `${cid}, ${dt ? `${dt.d} de ${MESES[dt.m - 1]} de ${dt.y}` : '____ de ____________ de ______'}`.toUpperCase();
  const f = (x, lg) => esc(String(x || '').trim()) || '_'.repeat(lg || 10);
  const txt = `Iniciou-se este Ensaio Regional Musical em Nome do Senhor Jesus com uma oração, sendo presidida pelo irmão ${f(c.presidente, 30)}, após cantar o hino ${f(c.hino, 4)}, Deus revelou sua Bendita Palavra no capítulo ${f(c.capitulo, 4)} do livro de ${f(c.livro, 12)}.<br>Regente: ${f(c.regente, 30)}`;
  // lado esquerdo
  const L = d.inst.map(r => ({ cls: 'i', rot: r.rot, v: v(r.n) }));
  const fixos = [{ cls: 'g1', rot: 'MÚSICOS (TOTAL)', v: v(d.mus) }, { cls: 'g1', rot: 'ORGANISTAS (TOTAL)', v: v(d.org) }, { cls: 'g2', rot: 'TOTAL (MÚSICOS E ORGANISTAS)', v: v(d.tot) }]
    .concat(d.min.map(r => ({ cls: '', rot: r.rot, v: v(r.n) })), [{ cls: 'g2', rot: 'MINISTÉRIO (TOTAL)', v: v(d.minT) }, { cls: 'g2 gg', rot: 'TOTAL GERAL', v: v(d.geral) }]);
  // lado direito: hinos, total de hinos (3 linhas), % famílias
  const vagas = Math.max(L.length - 3, d.hinos.length);
  const R = [];
  for (let k = 0; k < vagas; k++) R.push({ h: `<td class="r">${esc(d.hinos[k] || '')}</td>` });
  R.push({ h: `<td class="th" rowspan="3">TOTAL DE HINOS<b>${cheio && d.hinos.length ? d.hinos.length : '&nbsp;'}</b></td>`, n: 3 });
  const fam = [['CORDAS', d.fam.c], ['MADEIRAS', d.fam.m], ['METAIS', d.fam.b]];
  R.push({ h: '<td class="rh">% FAMÍLIAS</td>' });
  fam.forEach(([r, x]) => { R.push({ h: '<td class="r"></td>' }, { h: `<td class="rh">${r}</td>` }, { h: `<td class="r p">${cheio ? x : ''}</td>` }); });
  const usadas = R.reduce((a, x) => a + (x.n || 1), 0);
  while (L.length + fixos.length < usadas + 1) L.push({ cls: 'i', rot: '', v: '' });
  const E = L.concat(fixos), N = E.length;
  R.push({ h: `<td class="r" rowspan="${N - usadas}"></td>`, n: N - usadas });
  const ini = new Map(); let r0 = 0; R.forEach(x => { ini.set(r0, x.h); r0 += x.n || 1; });
  const corpo = E.map((e, k) => `<tr class="${e.cls}"><td class="l">${esc(e.rot)}</td><td class="v">${e.v}</td>${ini.get(k) || ''}</tr>`).join('');
  return `<table class="rel"><colgroup><col style="width:55.4%"><col style="width:11.4%"><col></colgroup><tbody>
<tr class="t1"><td colspan="3" style="border-top:1px solid #000">CONGREGAÇÃO CRISTÃ NO BRASIL</td></tr>
<tr class="t2"><td colspan="3">ENSAIO REGIONAL MUSICAL</td></tr>
<tr class="t3"><td colspan="3" style="border-bottom:1px solid #000">${esc(titulo)}</td></tr>
<tr class="sec"><td colspan="3">Atendimento</td></tr>
<tr class="txt"><td colspan="3">${txt}</td></tr>
<tr class="sec"><td colspan="2">Resumo</td><td class="hd">HINOS ENSAIADOS</td></tr>
${corpo}</tbody></table>`;
}
function relatorioRegionalHTML(c) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ensaio Regional ${esc(dataBR(c.data))}</title><style>
@page{size:A4 portrait;margin:17mm 22mm 14mm 17mm}
*{box-sizing:border-box}
body{margin:0;padding:1px 2px 0 1px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
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
const aoVivo = () => VIVO.modo !== 'manual';

// aplica uma mudança numa lista (DB ou ESPELHO), mexendo no próprio objeto
function aplicarOp(db, op) {
  const ch = id => db.chamadas.find(c => c.id === id), ir = id => db.irmaos.find(i => i.id === id);
  switch (op.t) {
    case 'm': { const c = ch(op.c); if (!c) return; if (op.v) c.marcas[op.i] = 'v'; else delete c.marcas[op.i]; return; }
    case 'mc': { const c = ch(op.c); if (!c) return; c.marcas = {}; (op.lista || []).forEach(i => { c.marcas[i] = 'v'; }); return; }
    case 'i': { let i = ir(op.id); if (!i) { i = { id: op.id, nome: '', instrumento: '', cidade: '', bairro: '', cargo: '', grupo: '' }; db.irmaos.push(i); } Object.assign(i, op.campos || {}); if (!i.grupo) i.grupo = grupoDoCargo(i.cargo); return; }
    case 'i-': { const k = db.irmaos.findIndex(i => i.id === op.id); if (k >= 0) db.irmaos.splice(k, 1); db.chamadas.forEach(c => { delete c.marcas[op.id]; }); return; }
    case 'c': { let c = ch(op.id); if (!c) { c = { id: op.id, data: '', ocasiao: '', local: '', obs: '', tipo: 'nomes', grupos: '', marcas: {}, locais: [] }; db.chamadas.push(c); } Object.assign(c, op.campos || {}); if (c.tipo !== 'regional') c.tipo = 'nomes'; return; }
    case 'l': {
      const c = ch(op.c); if (!c) return;
      let l = c.locais.find(x => x.id === op.id);
      if (!l) { l = { id: op.id, nome: '', total: '', inst: {}, ord: op.ord || Date.now() }; c.locais.push(l); c.locais.sort((a, b) => a.ord - b.ord); }
      Object.keys(op.campos || {}).forEach(k => { l[k] = String(op.campos[k] == null ? '' : op.campos[k]); });
      Object.keys(op.inst || {}).forEach(k => { const n = parseInt(op.inst[k], 10) || 0; if (n > 0) l.inst[k] = n; else delete l.inst[k]; });
      return;
    }
    case 'l-': { const c = ch(op.c); if (!c) return; const k = c.locais.findIndex(x => x.id === op.id); if (k >= 0) c.locais.splice(k, 1); return; }
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
  });
  aC.forEach((c, id) => { if (!bC.has(id)) ops.push({ t: 'c-', id }); });
  return ops;
}
function gravarFila() { try { localStorage.setItem(FILA_KEY, JSON.stringify(VIVO.fila)); } catch (e) {} }
// junta o que mudou na tela e manda (chamado logo depois de cada mudança, com um pequeno atraso)
function enviarAgora() {
  clearTimeout(VIVO.tEnvio); VIVO.tEnvio = null;
  if (!aoVivo() || !ESPELHO) return;
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
    if (op.t === 'm') { if (c && op.c === c.id) { linhasMarcar.add(op.i); contagem = true; } lista = true; res = true; }
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
  if (ABA === 'cham' && refazer) { semPular(desenharChamada); desenharLista(); if (dl) atualizarDatalists(); return; }
  if (ABA === 'cham') {
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
        const tmp = document.createElement('div'); tmp.innerHTML = linhaHTML(i, row.querySelector('.pm-n').textContent, cc);
        const nova = tmp.firstElementChild; nova.classList.add('remoto'); row.replaceWith(nova);
      });
    }
    if (contagem) { const cc = CHAM(), el = document.getElementById('contagem'); if (cc && el) el.innerHTML = contagemHTML(contar(cc), cc); }
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
    if (!CHAM()) SEL = maisRecente();
    semPular(() => { desenharTudo(); atualizarDatalists(); });
    if (junto) { agendarEnvio(); UI.toast('As alterações que estavam só neste aparelho foram juntadas à lista de todos.', 'ok'); }
    return;
  }
  if (msg.t === 'mudou') {
    const meu = msg.lote && VIVO.fila.some(l => l.lote === msg.lote);
    if (meu) VIVO.fila = VIVO.fila.filter(l => l.lote !== msg.lote);
    if (msg.seq) VIVO.seq = msg.seq;
    // do meu lote, só valem as correções: presença que eu tirei sem internet e que continua valendo
    const deOutros = meu ? (msg.ops || []).filter(op => op.corr) : (msg.ops || []);
    if (meu && deOutros.some(op => op.t === 'm' || op.t === 'mc')) {
      // junta num aviso só (podem vir vários lotes seguidos quando a internet volta)
      VIVO.corrigidos = (VIVO.corrigidos || 0) + deOutros.reduce((k, op) => k + (op.t === 'm' ? 1 : 0), 0);
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
  if (VIVO.ws && (VIVO.ws.readyState === 0 || VIVO.ws.readyState === 1)) return;
  clearTimeout(VIVO.tRec);
  let ws; try { ws = new WebSocket(urlSala()); } catch (e) { return religar(); }
  VIVO.ws = ws; VIVO.abriu = false; mostrarEstado();
  ws.onopen = () => {
    VIVO.abriu = true; VIVO.tent = 0; VIVO.falhas = 0; VIVO.modo = 'vivo';
    document.body.classList.add('ao-vivo');
    ws.send(JSON.stringify({ t: 'ola', desde: VIVO.primeira && PENDENTE ? 0 : VIVO.seq }));
    VIVO.fila.forEach(l => ws.send(JSON.stringify(Object.assign({ t: 'ops' }, l))));
    clearInterval(VIVO.tPing); VIVO.tPing = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 30000);
    mostrarEstado();
  };
  ws.onmessage = e => { if (e.data === 'pong') return; let m; try { m = JSON.parse(e.data); } catch (er) { return; } try { receber(m); } catch (er) { console.error('ao vivo:', er); } };
  ws.onclose = () => {
    clearInterval(VIVO.tPing);
    if (VIVO.ws !== ws) return;
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
function irParaManual() {
  VIVO.modo = 'manual'; clearTimeout(VIVO.tRec); clearTimeout(VIVO.tEnvio);
  document.body.classList.remove('ao-vivo');
  if (VIVO.fila.length || (ESPELHO && diferencas(ESPELHO, DB).length)) PENDENTE = true;
  VIVO.fila = []; gravarFila(); gravarLocal();
  mostrarEstado(); carregarNuvem(false);
}
window.addEventListener('online', () => { if (aoVivo() && !VIVO.ws) { VIVO.tent = 0; ligarVivo(); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && aoVivo() && !VIVO.ws) { VIVO.tent = 0; ligarVivo(); } });
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
try { const s = localStorage.getItem(KEY + '_sel'); SEL = DB.chamadas.some(c => c.id === s) ? s : maisRecente(); } catch (e) { SEL = maisRecente(); }
window.__aoEntrar = function () {
  if (window.__pmIniciado) return; window.__pmIniciado = true;
  const est = document.getElementById('estado');
  if (est) { est.addEventListener('click', cliqueEstado); est.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cliqueEstado(); } }); }
  let ab = 'cham'; try { const v = localStorage.getItem(KEY + '_aba'); if (['cham', 'irm', 'res'].includes(v)) ab = v; } catch (e) {}
  atualizarDatalists(); mudarAba(ab);
  if ('WebSocket' in window) ligarVivo(); else irParaManual();
};
if (window.__SESSAO || window.__SESSAO_PREVIA) window.__aoEntrar(window.__SESSAO || window.__SESSAO_PREVIA);
