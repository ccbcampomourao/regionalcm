/* ============================================================
   Lista de presença pelo LINK da chamada (sem login).
   Só dá para: marcar presença do ministério (e desmarcar o que este aparelho marcou),
   acrescentar alguém do ministério que não está na lista (sem mudar quem já está)
   e contar os músicos por localidade. O servidor confere tudo (src/sala-presenca.js).
   Cada toque manda só aquela mudança; o que os outros fazem chega na hora.
   ============================================================ */
(function () {
  'use strict';
  const CODIGO = (location.hash || '').replace(/^#/, '').trim();
  const ICO = n => `<svg class="ic" aria-hidden="true"><use href="/assets/icons.svg#i-${n}"></use></svg>`;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const novoId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const PART = new Set(['da', 'de', 'do', 'das', 'dos', 'e', "d'"]);
  const bonito = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase().split(' ').map((p, k) => (k && PART.has(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const CARGOS = [['Ancião', 'Anciães'], ['Diácono', 'Diáconos'], ['Cooperador do Ofício Ministerial', 'Cooperadores do Ofício Ministerial'], ['Cooperador de Jovens e Menores', 'Cooperadores de Jovens e Menores'], ['Encarregado Regional', 'Encarregados Regionais'], ['Encarregado Local', 'Encarregados Locais'], ['Examinadora', 'Examinadoras']];
  const INSTRUMENTOS = ['Violino', 'Viola', 'Violoncelo', 'Flauta', 'Clarinete', 'Clarinete Alto', 'Clarinete Baixo', 'Oboé', "Oboé d'Amore", 'Corne Inglês', 'Fagote', 'Saxofone Soprano', 'Saxofone Alto', 'Saxofone Tenor', 'Saxofone Barítono', 'Saxofone Baixo', 'Trompete', 'Cornet', 'Flugelhorn', 'Trompa', 'Trombone', 'Trombonito', 'Euphonium', 'Tuba', 'Acordeon', 'Órgão'];
  const ordCargo = c => { const k = CARGOS.findIndex(([s]) => norm(s) === norm(c)); return k < 0 ? 50 : k; };
  const plural = c => { const x = CARGOS.find(([s]) => norm(s) === norm(c)); return x ? x[1] : (c || 'Outros'); };
  const ordInst = (a, b) => { const ia = INSTRUMENTOS.indexOf(a), ib = INSTRUMENTOS.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'pt-BR'); };
  const soma = l => Object.values(l.inst || {}).reduce((a, b) => a + (+b || 0), 0);
  const total = l => String(l.total || '').trim() !== '' && !isNaN(+l.total) ? +l.total : soma(l);
  const dataLonga = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}` : ''; };
  const diaSem = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? DIAS[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] : ''; };
  const app = () => document.getElementById('app');
  const toast = (m, t) => { if (window.UI && UI.toast) UI.toast(m, t || 'ok'); };

  // este aparelho (para poder desmarcar só o que ele mesmo marcou, mesmo depois de recarregar)
  const CLIENTE = (() => { try { let c = localStorage.getItem('pm_link_cliente'); if (!c) { c = novoId() + novoId(); localStorage.setItem('pm_link_cliente', c); } return c.slice(0, 40); } catch (e) { return novoId(); } })();
  const FILA_KEY = 'pm_link_fila_' + CODIGO;

  let S = null, ABA = 'min', BUSCA = '', ws = null, aberto = false, tent = 0, tRec = null, tPing = null, fim = false, gente = 0;
  let fila = []; try { fila = JSON.parse(localStorage.getItem(FILA_KEY) || '[]') || []; } catch (e) { fila = []; }
  try { const a = localStorage.getItem('pm_link_aba'); if (a === 'mus') ABA = a; } catch (e) {}
  const gravarFila = () => { try { localStorage.setItem(FILA_KEY, JSON.stringify(fila)); } catch (e) {} };

  /* ---------- aplica uma mudança no estado ---------- */
  function aplicar(op) {
    if (!S) return;
    const ir = id => S.irmaos.find(i => i.id === id);
    switch (op.t) {
      case 'm':
        if (op.c !== S.chamada.id) return;
        // meu = marcado por este aparelho (pode desmarcar); corr = a sala não deixou desmarcar
        if (op.v) S.marcas[op.i] = op.meu || S.marcas[op.i] === 'meu' ? 'meu' : 'v';
        else delete S.marcas[op.i];
        return;
      case 'mc': if (op.c !== S.chamada.id) return; { const ant = S.marcas, meus = op.meus ? new Set(op.meus) : null; S.marcas = {}; (op.lista || []).forEach(i => { S.marcas[i] = (meus ? meus.has(i) : ant[i] === 'meu') ? 'meu' : 'v'; }); } return;
      case 'i': { if (!['Ministério', 'Encarregados'].includes((op.campos || {}).grupo)) { S.irmaos = S.irmaos.filter(i => i.id !== op.id); return; } let i = ir(op.id); if (!i) { i = { id: op.id }; S.irmaos.push(i); } Object.assign(i, op.campos); return; }
      case 'i-': S.irmaos = S.irmaos.filter(i => i.id !== op.id); delete S.marcas[op.id]; return;
      case 'c': Object.assign(S.chamada, op.campos || {}); return;
      case 'l': {
        if (op.c !== S.chamada.id) return;
        let l = S.locais.find(x => x.id === op.id);
        if (!l) { l = { id: op.id, nome: '', total: '', inst: {}, ord: op.ord || Date.now() }; S.locais.push(l); S.locais.sort((a, b) => (a.ord || 0) - (b.ord || 0)); }
        Object.keys(op.campos || {}).forEach(k => { l[k] = String(op.campos[k] == null ? '' : op.campos[k]); });
        Object.keys(op.inst || {}).forEach(k => { const n = parseInt(op.inst[k], 10) || 0; if (n > 0) l.inst[k] = n; else delete l.inst[k]; });
        return;
      }
      case 'l-': S.locais = S.locais.filter(x => x.id !== op.id); return;
      case 'x': if (op.c !== S.chamada.id) return; if (op.inst || op.loc) S.toca[op.i] = { inst: op.inst || '', loc: op.loc || '' }; else delete S.toca[op.i]; return;
    }
  }

  /* ---------- ligação com a sala ---------- */
  function enviar(ops) {
    const lote = { lote: novoId(), ops, off: !(ws && ws.readyState === 1 && aberto) };
    fila.push(lote); gravarFila();
    if (ws && ws.readyState === 1 && aberto) ws.send(JSON.stringify(Object.assign({ t: 'ops' }, lote)));
    mostrarVivo();
  }
  function ligar() {
    if (fim || !CODIGO) return;
    if (ws && ws.readyState < 2) return;
    clearTimeout(tRec);
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/presenca-musical/ws?link=' + encodeURIComponent(CODIGO) + '&cliente=' + encodeURIComponent(CLIENTE);
    let w; try { w = new WebSocket(url); } catch (e) { return religar(false); }
    ws = w; aberto = false;
    w.onopen = () => {
      aberto = true; tent = 0;
      w.send(JSON.stringify({ t: 'ola' }));
      fila.forEach(l => w.send(JSON.stringify(Object.assign({ t: 'ops' }, l))));
      clearInterval(tPing); tPing = setInterval(() => { if (w.readyState === 1) w.send('ping'); }, 30000);
      mostrarVivo();
    };
    w.onmessage = e => { if (e.data === 'pong') return; let m; try { m = JSON.parse(e.data); } catch (er) { return; } receber(m); };
    w.onclose = ev => {
      clearInterval(tPing);
      if (ws !== w) return;
      const abriu = aberto; ws = null; aberto = false;
      if (ev.code === 4410) return acabou();
      religar(abriu);
    };
    w.onerror = () => {};
  }
  async function religar(jaAbriu) {
    if (!jaAbriu) {
      // nunca abriu: o link ainda vale?
      try { const r = await fetch('/api/presenca-musical/ws?link=' + encodeURIComponent(CODIGO)); if (r.status === 410 || r.status === 404) return acabou(); } catch (e) {}
    }
    mostrarVivo();
    clearTimeout(tRec); tRec = setTimeout(ligar, Math.min(30000, 1000 * Math.pow(2, tent++)));
  }
  function acabou() {
    fim = true; clearTimeout(tRec); clearInterval(tPing);
    try { localStorage.removeItem(FILA_KEY); } catch (e) {}
    app().innerHTML = `<div class="fim"><h1>Este link não está mais ativo</h1><p>Quem está cuidando da lista desativou o link ou apagou a chamada. Peça um link novo, se for preciso.</p></div>`;
  }
  window.addEventListener('online', () => { if (!ws) { tent = 0; ligar(); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !ws) { tent = 0; ligar(); } });

  function receber(m) {
    if (m.t === 'fim') return acabou();
    if (m.t === 'gente') { gente = Math.max(0, (m.n || 1) - 1); mostrarVivo(); return; }
    if (m.t === 'tudo') {
      const primeira = !S;
      S = { chamada: m.chamada, irmaos: m.irmaos || [], marcas: m.marcas || {}, toca: m.toca || {}, locais: (m.locais || []).map(l => Object.assign({ nome: '', total: '', inst: {} }, l)) };
      fila.forEach(l => l.ops.forEach(aplicar));   // o que ainda não foi confirmado continua valendo na tela
      if (primeira) montar(); else semPular(desenhar);
      return;
    }
    if (m.t === 'mudou') {
      if (m.lote) { fila = fila.filter(l => l.lote !== m.lote); gravarFila(); }
      (m.ops || []).forEach(aplicar);
      if ((m.ops || []).some(op => op.corr && op.dono)) toast('Essa presença foi marcada por outra pessoa: só ela (ou um administrador) pode tirar ou trocar o instrumento.', 'info');
      else if ((m.ops || []).some(op => op.corr && op.t === 'm')) toast('Sem internet só dá para acrescentar presença; quem já estava presente continua.', 'info');
      atualizar(m.ops || []);
      mostrarVivo();
    }
  }

  /* ---------- tela ---------- */
  function semPular(fn) {
    const y = window.scrollY, a = document.activeElement;
    const sel = a && a.dataset ? (a.dataset.f ? `[data-f="${a.dataset.f}"]` : a.id ? '#' + a.id : null) : null;
    let s0 = null, s1 = null; try { s0 = a.selectionStart; s1 = a.selectionEnd; } catch (e) {}
    fn();
    if (sel) { const n = document.querySelector(sel); if (n && n !== document.activeElement) { n.focus({ preventScroll: true }); try { if (s0 != null) n.setSelectionRange(s0, s1); } catch (e) {} } }
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
  }
  const ministerio = () => S.irmaos.slice().sort((a, b) => ordCargo(a.cargo) - ordCargo(b.cargo) || norm(a.nome).localeCompare(norm(b.nome), 'pt-BR'));
  const presentes = () => S.irmaos.filter(i => S.marcas[i.id]).length;
  const musicos = () => S.locais.reduce((a, l) => a + total(l), 0);
  const nLocs = () => S.locais.filter(l => String(l.nome).trim() || total(l)).length;
  function mostrarVivo() {
    const el = document.getElementById('vivo'); if (!el) return;
    const ok = ws && ws.readyState === 1 && aberto, esp = fila.reduce((n, l) => n + l.ops.length, 0);
    el.className = 'vivo' + (ok ? '' : ' off');
    el.innerHTML = `<i></i>${ok ? (gente ? `ao vivo · +${gente}` : 'ao vivo') : esp ? `sem conexão · ${esp} esperando` : 'conectando…'}`;
  }
  function montar() {
    const c = S.chamada;
    app().innerHTML = `
    <header class="topo"><div class="l1"><div><small>${esc(diaSem(c.data))}</small><h1>${esc(c.ocasiao || 'Ensaio Regional')}</h1><div class="sub" id="sub"></div></div><span class="vivo off" id="vivo" aria-live="polite"><i></i>conectando…</span></div>
      <nav class="abas" role="tablist"><button type="button" role="tab" data-aba="min">${ICO('users')}Ministério <em id="nMin"></em></button><button type="button" role="tab" data-aba="mus">${ICO('music')}Músicos <em id="nMus"></em></button></nav></header>
    <main id="corpo"></main>`;
    app().querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => { ABA = b.dataset.aba; try { localStorage.setItem('pm_link_aba', ABA); } catch (e) {} desenhar(); window.scrollTo(0, 0); }));
    desenhar(); mostrarVivo();
  }
  function cabecalho() {
    const c = S.chamada;
    const sub = document.getElementById('sub'); if (sub) sub.textContent = [dataLonga(c.data), c.local].filter(Boolean).join(' · ');
    const h1 = document.querySelector('.topo h1'); if (h1) h1.textContent = c.ocasiao || 'Ensaio Regional';
    const nm = document.getElementById('nMin'); if (nm) nm.textContent = presentes();
    const nu = document.getElementById('nMus'); if (nu) nu.textContent = musicos();
    app().querySelectorAll('[data-aba]').forEach(b => { b.classList.toggle('on', b.dataset.aba === ABA); b.setAttribute('aria-selected', b.dataset.aba === ABA); });
  }
  function desenhar() {
    cabecalho();
    const el = document.getElementById('corpo'); if (!el) return;
    if (ABA === 'min') {
      el.innerHTML = `<div class="cont" id="contMin"></div>
        <div class="busca">${ICO('search')}<input id="busca" type="search" placeholder="Procurar nome ou cidade" value="${esc(BUSCA)}" autocomplete="off"></div>
        <div class="lista" id="lista"></div>
        <form class="novo" id="novo"><h2>Não está na lista? Acrescente</h2>
          <input class="s2" id="nNome" placeholder="Nome" autocomplete="off" required aria-label="Nome">
          <select class="s2" id="nCargo" aria-label="Cargo">${CARGOS.map(([cg]) => `<option${cg === (window.__ultCargo || 'Ancião') ? ' selected' : ''}>${esc(cg)}</option>`).join('')}</select>
          <input id="nCid" placeholder="Cidade" autocomplete="off" list="dlCid" aria-label="Cidade">
          <input id="nBai" placeholder="Bairro" autocomplete="off" list="dlBai" aria-label="Bairro">
          <select class="s2" id="nInst" aria-label="Instrumento"><option value="">Não tocou (sem instrumento)</option>${INSTRUMENTOS.map(x => `<option>${esc(x)}</option>`).join('')}</select>
          <button type="submit" class="primary s2">${ICO('check')}Acrescentar presente</button></form>
        <p class="dica">Toque em <b>Presente</b> em quem veio e, se o irmão tocou, escolha o instrumento. Quem marcou a presença de um irmão é o único que pode tirar a presença ou trocar o instrumento dele; e não dá para mudar quem já está na lista.</p>
        <datalist id="dlCid">${[...new Set(S.irmaos.map(i => i.cidade).filter(Boolean))].map(v => `<option value="${esc(v)}">`).join('')}</datalist>
        <datalist id="dlBai">${[...new Set(S.irmaos.map(i => i.bairro).filter(Boolean))].map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
      document.getElementById('busca').addEventListener('input', e => { BUSCA = e.target.value; desenharLista(); });
      document.getElementById('novo').addEventListener('submit', e => { e.preventDefault(); acrescentar(); });
      desenharLista();
    } else {
      el.innerHTML = `<div class="cont" id="contMus"></div><div id="locais"></div>
        <button type="button" class="primary" id="addLoc" style="width:100%">${ICO('plus')}Acrescentar localidade</button>
        <div class="dica" id="tots"></div>
        <datalist id="dlLoc">${[...new Set(S.locais.map(l => l.nome).filter(Boolean))].map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
      document.getElementById('addLoc').addEventListener('click', addLocal);
      desenharLocais(); desenharTotais();
    }
  }
  function linha(i) {
    const m = S.marcas[i.id], loc = [i.cidade, i.bairro].filter(Boolean).join(' · ');
    const bt = m === 'meu' ? `<button type="button" class="bt on" data-m="${i.id}" aria-pressed="true">${ICO('check')}Presente</button>`
      : m ? `<span class="bt trav" title="Marcado por outra pessoa">${ICO('check')}Presente</span>`
      : `<button type="button" class="bt" data-m="${i.id}" aria-pressed="false">${ICO('check')}Presente</button>`;
    const tc = S.toca[i.id] || {}, ins = tc.inst || '';
    // presente: escolhe o instrumento, se ele tocou (o que outra pessoa já escolheu só ela muda)
    const toca = !m ? '' : m === 'meu'
      ? `<label class="toca">${ICO('music')}<select data-xi="${i.id}" data-f="xi:${i.id}" aria-label="Instrumento de ${esc(i.nome)}"><option value="">Não tocou</option>${INSTRUMENTOS.concat(ins && !INSTRUMENTOS.includes(ins) ? [ins] : []).map(x => `<option${x === ins ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`
      : `<span class="toca trav">${ICO('music')}${esc(ins || 'Não tocou')}</span>`;
    return `<div class="row${m ? ' v' : ''}" data-id="${i.id}"><div><b>${esc(i.nome)}</b><small>${esc(loc || i.cargo || '')}</small></div>${bt}${toca}</div>`;
  }
  function desenharLista() {
    const el = document.getElementById('lista'); if (!el) return;
    const q = norm(BUSCA), todos = ministerio();
    const lst = todos.filter(i => !q || norm(i.nome + ' ' + i.cidade + ' ' + i.bairro + ' ' + i.cargo).includes(q));
    let h = '', g0 = null;
    lst.forEach(i => { const g = plural(i.cargo); if (g !== g0) { g0 = g; h += `<div class="gh">${esc(g)} <em>${todos.filter(x => plural(x.cargo) === g).length}</em></div>`; } h += linha(i); });
    el.innerHTML = h || `<div class="vazio">${todos.length ? 'Ninguém com essa busca. Acrescente abaixo.' : 'Ninguém na lista ainda. Acrescente abaixo quem veio.'}</div>`;
    contMin();
  }
  function contMin() {
    const el = document.getElementById('contMin'); if (el) el.innerHTML = `<span><b>${presentes()}</b>presentes</span><span><b>${S.irmaos.length}</b>na lista</span>`;
    cabecalho();
  }
  function localHTML(l) {
    const insts = Object.keys(l.inst).sort(ordInst), usados = new Set(insts), sm = soma(l);
    const dif = String(l.total).trim() !== '' && insts.length && +l.total !== sm;
    return `<div class="loc" data-l="${l.id}">
      <div class="loc-h"><div><label for="ln-${l.id}">Localidade</label><input id="ln-${l.id}" data-f="ln:${l.id}" data-ln="${l.id}" list="dlLoc" value="${esc(l.nome)}" placeholder="ex.: Peabiru - Central" autocomplete="off"></div>
        <div class="tot"><label for="lt-${l.id}">Total</label><input id="lt-${l.id}" data-f="lt:${l.id}" data-lt="${l.id}" inputmode="numeric" value="${esc(l.total)}" placeholder="${sm}"></div></div>
      <div class="insts">${insts.map(k => `<span class="inst"><span>${esc(k)}</span><button type="button" data-menos="${l.id}" data-k="${esc(k)}" aria-label="Menos ${esc(k)}">−</button><input data-f="li:${l.id}:${esc(k)}" data-li="${l.id}" data-k="${esc(k)}" inputmode="numeric" value="${l.inst[k]}" aria-label="${esc(k)}"><button type="button" data-mais="${l.id}" data-k="${esc(k)}" aria-label="Mais ${esc(k)}">+</button></span>`).join('')}
        <select data-add="${l.id}" aria-label="Acrescentar instrumento"><option value="">+ Instrumento</option>${INSTRUMENTOS.filter(x => !usados.has(x)).map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
      <small class="dif" data-dif="${l.id}"${dif ? '' : ' hidden'}>A soma dos instrumentos dá ${sm}.</small></div>`;
  }
  function desenharLocais() {
    const el = document.getElementById('locais'); if (!el) return;
    el.innerHTML = S.locais.length ? S.locais.map(localHTML).join('') : '<div class="vazio">Nenhuma localidade ainda. Acrescente a primeira.</div>';
  }
  function desenharTotais() {
    const inst = {}; S.locais.forEach(l => Object.keys(l.inst).forEach(k => { inst[k] = (inst[k] || 0) + l.inst[k]; }));
    const c = document.getElementById('contMus'); if (c) c.innerHTML = `<span><b>${musicos()}</b>músicos</span><span><b>${nLocs()}</b>localidades</span>`;
    const t = document.getElementById('tots'); if (t) t.innerHTML = Object.keys(inst).length ? `<div class="tots">${Object.keys(inst).sort(ordInst).map(k => `<span>${esc(k)} <b>${inst[k]}</b></span>`).join('')}</div>` : '';
    cabecalho();
  }
  // mudanças que chegaram: só o necessário
  function atualizar(ops) {
    if (!S) return;
    if (ops.some(op => op.t === 'c')) cabecalho();
    if (ABA === 'min') {
      if (ops.some(op => op.t === 'i' || op.t === 'i-' || op.t === 'mc')) semPular(desenharLista);
      else ops.filter(op => op.t === 'm' || op.t === 'x').forEach(op => {
        const row = document.querySelector(`.row[data-id="${op.i}"]`), i = S.irmaos.find(x => x.id === op.i);
        if (row && row.contains(document.activeElement)) return;
        if (row && i) { const t = document.createElement('div'); t.innerHTML = linha(i); const n = t.firstElementChild; if (!op.meu) n.classList.add('novo-r'); row.replaceWith(n); }
      });
      contMin();
    } else {
      const ls = ops.filter(op => op.t === 'l' || op.t === 'l-');
      const estrutura = ls.some(op => { const box = document.querySelector(`.loc[data-l="${op.id}"]`); return op.t === 'l-' || !box || Object.keys(op.inst || {}).some(k => !box.querySelector(`[data-li="${op.id}"][data-k="${CSS.escape(k)}"]`) || !(op.inst[k] > 0)); });
      if (estrutura) semPular(desenharLocais);
      else ls.forEach(op => {
        const l = S.locais.find(x => x.id === op.id); if (!l) return;
        Object.keys(op.campos || {}).forEach(k => { const inp = document.querySelector(k === 'nome' ? `[data-ln="${op.id}"]` : `[data-lt="${op.id}"]`); if (inp && inp !== document.activeElement) inp.value = l[k]; });
        Object.keys(op.inst || {}).forEach(k => { const inp = document.querySelector(`[data-li="${op.id}"][data-k="${CSS.escape(k)}"]`); if (inp && inp !== document.activeElement) inp.value = l.inst[k] || ''; });
        difLocal(l);
      });
      desenharTotais();
    }
    if (ops.some(op => op.t === 'm' || op.t === 'mc' || op.t === 'i' || op.t === 'i-')) cabecalho();
  }
  function difLocal(l) {
    const d = document.querySelector(`[data-dif="${l.id}"]`), sm = soma(l);
    if (d) { d.hidden = !(String(l.total).trim() !== '' && Object.keys(l.inst).length && +l.total !== sm); d.textContent = `A soma dos instrumentos dá ${sm}.`; }
    const t = document.querySelector(`[data-lt="${l.id}"]`); if (t) t.placeholder = sm;
  }

  /* ---------- ações ---------- */
  function marcar(id) {
    const m = S.marcas[id];
    if (m && m !== 'meu') return;   // marcado por outra pessoa: não muda
    if (m === 'meu') delete S.marcas[id]; else S.marcas[id] = 'meu';
    enviar([{ t: 'm', c: S.chamada.id, i: id, v: m ? 0 : 1 }]);
    const row = document.querySelector(`.row[data-id="${id}"]`), i = S.irmaos.find(x => x.id === id);
    if (row && i) { const t = document.createElement('div'); t.innerHTML = linha(i); row.replaceWith(t.firstElementChild); }
    contMin();
  }
  function acrescentar() {
    const nome = bonito(document.getElementById('nNome').value); if (!nome) return;
    const cargo = document.getElementById('nCargo').value; window.__ultCargo = cargo;
    const cidade = bonito(document.getElementById('nCid').value), bairro = bonito(document.getElementById('nBai').value);
    let i = S.irmaos.find(x => norm(x.nome) === norm(nome)), ops = [];
    if (!i) {
      i = { id: novoId(), nome, cargo, cidade, bairro, grupo: /encarregad/i.test(cargo) ? 'Encarregados' : 'Ministério' };
      S.irmaos.push(i); ops.push({ t: 'i', id: i.id, campos: { nome, cargo, cidade, bairro } });
    }
    if (!S.marcas[i.id]) { S.marcas[i.id] = 'meu'; ops.push({ t: 'm', c: S.chamada.id, i: i.id, v: 1 }); }
    const inst = document.getElementById('nInst').value;
    if (inst && S.marcas[i.id] === 'meu') { S.toca[i.id] = Object.assign({ loc: '' }, S.toca[i.id] || {}, { inst }); ops.push({ t: 'x', c: S.chamada.id, i: i.id, inst }); }
    if (ops.length) enviar(ops);
    ['nNome', 'nCid', 'nBai', 'nInst'].forEach(id => { document.getElementById(id).value = ''; });
    BUSCA = ''; document.getElementById('busca').value = '';
    semPular(desenharLista);
    const row = document.querySelector(`.row[data-id="${i.id}"]`); if (row) { row.classList.add('novo-r'); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    document.getElementById('nNome').focus({ preventScroll: true });
    toast(ops.some(o => o.t === 'i') ? `${i.nome} acrescentado e marcado presente.` : `${i.nome} já estava na lista: marcado presente.`);
  }
  function addLocal() {
    const l = { id: novoId(), nome: '', total: '', inst: {}, ord: Date.now() };
    S.locais.push(l); enviar([{ t: 'l', c: S.chamada.id, id: l.id, campos: { nome: '', total: '' }, inst: {}, ord: l.ord }]);
    desenharLocais(); desenharTotais();
    const f = document.querySelector(`[data-ln="${l.id}"]`); if (f) { f.focus(); f.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  function mudarInst(id, k, n) {
    const l = S.locais.find(x => x.id === id); if (!l) return;
    n = Math.max(0, Math.min(9999, n | 0));
    const tinha = k in l.inst;
    if (n) l.inst[k] = n; else delete l.inst[k];
    enviar([{ t: 'l', c: S.chamada.id, id, campos: {}, inst: { [k]: n } }]);
    if (!n || !tinha) semPular(desenharLocais); else { const inp = document.querySelector(`[data-li="${id}"][data-k="${CSS.escape(k)}"]`); if (inp && inp !== document.activeElement) inp.value = n; }
    difLocal(l); desenharTotais();
  }
  // digitar: junta e manda depois de uma pausa curta
  const tCampo = {};
  function digitou(chave, fn) { clearTimeout(tCampo[chave]); tCampo[chave] = setTimeout(fn, 400); }
  document.addEventListener('click', e => {
    const m = e.target.closest('[data-m]'); if (m) return marcar(m.dataset.m);
    const a = e.target.closest('[data-mais]'), b = e.target.closest('[data-menos]');
    if (a) { const l = S.locais.find(x => x.id === a.dataset.mais); if (l) mudarInst(l.id, a.dataset.k, (l.inst[a.dataset.k] || 0) + 1); }
    if (b) { const l = S.locais.find(x => x.id === b.dataset.menos); if (l) mudarInst(l.id, b.dataset.k, (l.inst[b.dataset.k] || 0) - 1); }
  });
  document.addEventListener('change', e => {
    const x = e.target.closest && e.target.closest('[data-xi]');
    if (x && S) { const id = x.dataset.xi; if (!S.marcas[id]) return; if (S.marcas[id] !== 'meu') return; if (x.value) S.toca[id] = Object.assign({ loc: '' }, S.toca[id] || {}, { inst: x.value }); else if (S.toca[id]) S.toca[id].inst = ''; enviar([{ t: 'x', c: S.chamada.id, i: id, inst: x.value }]); return; }
    const s = e.target.closest && e.target.closest('[data-add]'); if (!s || !s.value) return;
    const id = s.dataset.add, k = s.value; s.value = '';
    const l = S.locais.find(x => x.id === id); if (!l) return;
    if (!(k in l.inst)) mudarInst(id, k, 1);
    const inp = document.querySelector(`[data-li="${id}"][data-k="${CSS.escape(k)}"]`); if (inp) { inp.focus(); inp.select(); }
  });
  document.addEventListener('input', e => {
    const el = e.target; if (!S || !el.dataset) return;
    if (el.dataset.ln) { const l = S.locais.find(x => x.id === el.dataset.ln); if (!l) return; l.nome = el.value; digitou('ln' + l.id, () => enviar([{ t: 'l', c: S.chamada.id, id: l.id, campos: { nome: l.nome }, inst: {} }])); desenharTotais(); }
    else if (el.dataset.lt) { const l = S.locais.find(x => x.id === el.dataset.lt); if (!l) return; l.total = el.value.replace(/\D/g, '').slice(0, 4); if (el.value !== l.total) el.value = l.total; digitou('lt' + l.id, () => enviar([{ t: 'l', c: S.chamada.id, id: l.id, campos: { total: l.total }, inst: {} }])); difLocal(l); desenharTotais(); }
    else if (el.dataset.li) { const l = S.locais.find(x => x.id === el.dataset.li), k = el.dataset.k; if (!l) return; const n = Math.min(9999, parseInt(el.value.replace(/\D/g, ''), 10) || 0); if (n) l.inst[k] = n; else delete l.inst[k]; digitou('li' + l.id + k, () => enviar([{ t: 'l', c: S.chamada.id, id: l.id, campos: {}, inst: { [k]: n } }])); difLocal(l); desenharTotais(); }
  });

  /* ---------- início ---------- */
  if (!CODIGO) { app().innerHTML = '<div class="fim"><h1>Link incompleto</h1><p>Abra o link inteiro que você recebeu.</p></div>'; return; }
  ligar();
})();
