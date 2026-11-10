/* ============================================================
   Conferência da lista (Campo Mourão): antes do PDF, mostra o
   que pode estar errado — linha sem quem atende, sem data/hora/
   local, data fora do período, linha repetida, coleta em dia
   sem culto — e leva até a linha. Só lê a lista; não muda nada
   nem mexe no PDF.
   ============================================================ */
(function () {
  'use strict';
  if (typeof STATE === 'undefined' || typeof SECTION_TYPES === 'undefined') return;
  var ic = function (n) { return '<svg class="ic" aria-hidden="true"><use href="/assets/icons.svg#i-' + n + '"></use></svg>'; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var MESES = { JANEIRO: 1, FEVEREIRO: 2, 'MARÇO': 3, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 };
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); };
  var fd = function (d) { return d ? d.slice(8, 10) + '/' + d.slice(5, 7) : 'sem data'; };
  var cheio = function (v) { return Array.isArray(v) ? v.some(function (x) { return String(x || '').trim(); }) : (v && typeof v === 'object') ? !!((v.chips || []).length || String(v.texto || '').trim()) : !!String(v || '').trim(); };

  // período da lista -> do 1º dia até o fim do mês seguinte (a lista vai até a RMA/RLA do período seguinte)
  function periodo() {
    var p = (document.getElementById('meta_periodo') || {}).value || (STATE.meta && STATE.meta.periodo) || '';
    var m = p.toUpperCase().match(/([A-ZÇ]+(?:\s*\/\s*[A-ZÇ]+)*).*?(\d{4})/); if (!m) return null;
    var nomes = m[1].split('/').map(function (x) { return x.trim(); }), m1 = MESES[nomes[0]], m2 = MESES[nomes[nomes.length - 1]] || m1;
    if (!m1) return null;
    var ano = +m[2], ano2 = m2 < m1 ? ano + 1 : ano, mf = m2 + 1, af = ano2; if (mf > 12) { mf = 1; af++; }
    return { ini: ano + '-' + p2(m1) + '-01', fim: af + '-' + p2(mf) + '-' + p2(new Date(af, mf, 0).getDate()), nome: p.split(' - ')[0] };
  }

  var ATENDE = ['anciao', 'diaconos', 'atende'];
  function conferir() {
    var G = {};   // grupo -> { nivel, titulo, itens:[{id, onde}] }
    var add = function (ch, nivel, titulo, sec, e, extra) {
      var g = G[ch] || (G[ch] = { nivel: nivel, titulo: titulo, itens: [] });
      var def = SECTION_TYPES[sec.typeKey] || {}, d = e.data || {};
      g.itens.push({ id: e.id, onde: (def.label || '') + ' · ' + fd(d.data) + (d.local ? ' · ' + d.local : '') + (extra ? ' — ' + extra : '') });
    };
    var per = periodo();
    (STATE.sections || []).forEach(function (sec) {
      var def = SECTION_TYPES[sec.typeKey]; if (!def || def.isFreeText || !sec.entries) return;
      var tem = function (k) { return (def.fields || []).some(function (f) { return f.key === k; }); };
      var camposAt = ATENDE.filter(tem), vistos = {};
      sec.entries.forEach(function (e) {
        var d = e.data || {};
        if (!(def.fields || []).some(function (f) { return cheio(d[f.key]); })) { add('branco', 'alerta', 'em branco', sec, e); return; }
        if (tem('data') && !d.data) add('semdata', 'erro', 'sem data', sec, e);
        if (tem('hora') && !d.hora) add('semhora', 'alerta', 'sem hora', sec, e);
        if (tem('local') && !cheio(d.local)) add('semlocal', 'alerta', 'sem local', sec, e);
        if (camposAt.length && !camposAt.some(function (k) { return cheio(d[k]); })) add('sematende', 'alerta', 'sem quem atende', sec, e);
        if (per && d.data && (d.data < per.ini || d.data > per.fim)) add('fora', 'alerta', 'com data fora do período', sec, e);
        if (d.data && cheio(d.local)) {
          var ch = d.data + '|' + (d.hora || '') + '|' + norm(d.local) + '|' + norm(d.cidade);
          if (vistos[ch]) add('rep', 'alerta', 'repetida', sec, e); vistos[ch] = 1;
        }
        var SI = window.SugestoesIgrejas;
        if (SI && SI.analisar && SI.tabelasCulto && SI.tabelasCulto[sec.typeKey]) {
          var r = null; try { r = SI.analisar(sec, e); } catch (err) {}
          if (r && r.nivel === 'erro') add('culto', 'erro', 'de coleta em dia sem culto', sec, e, r.msg);
          else if (r && r.nivel === 'alerta') add('cultohora', 'alerta', 'de coleta com hora diferente do culto', sec, e, r.msg);
        }
      });
    });
    var ordem = ['culto', 'semdata', 'fora', 'sematende', 'semhora', 'semlocal', 'cultohora', 'rep', 'branco'];
    var lista = ordem.filter(function (k) { return G[k]; }).map(function (k) { var g = G[k]; g.ch = k; return g; });
    var folhas = (typeof PAGE_PLAN !== 'undefined' && PAGE_PLAN ? PAGE_PLAN.length : 0);
    return { grupos: lista, folhas: folhas, total: lista.reduce(function (a, g) { return a + g.itens.length; }, 0) + (folhas > 4 ? 1 : 0) };
  }

  /* ---------- ir até a linha ---------- */
  function irParaLinha(id) {
    var sec = (STATE.sections || []).find(function (s) { return (s.entries || []).some(function (e) { return e.id === id; }); });
    if (!sec) return false;
    if (typeof aba === 'function') aba('tab');
    if (!sec.isOpen) { sec.isOpen = true; if (typeof saveState === 'function') saveState(); if (typeof renderSections === 'function') renderSections(); }
    var lin = document.querySelector('.lin[data-entry-id="' + id + '"]'); if (!lin) return false;
    lin.scrollIntoView({ block: 'center', behavior: 'smooth' });
    lin.classList.remove('cf-pisca'); void lin.offsetWidth; lin.classList.add('cf-pisca');
    return true;
  }

  /* ---------- tela ---------- */
  var css = document.createElement('style');
  css.textContent = '@media screen{' +
    '#formPanel .cf-b{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;border-radius:999px;padding:3px 10px 3px 8px;min-height:0;box-shadow:none;transform:none;white-space:nowrap;cursor:pointer}' +
    '#formPanel .cf-b svg.ic{width:14px;height:14px}' +
    '#formPanel .cf-b.ok{background:#eef5ef;border:1px solid #cfe3d5;color:#3d7a57}' +
    '#formPanel .cf-b.alerta{background:#fdf3dc;border:1px solid #ecd49a;color:#8a5a0f}' +
    '#formPanel .cf-b.erro{background:#fbeae4;border:1px solid #efc4b8;color:#a23f30}' +
    '.cf-b em{font-style:normal;background:currentColor;border-radius:999px;font-size:11px;padding:0 6px;line-height:16px}.cf-b em span{color:#fff}' +
    '.resumo-lista{position:relative}' +
    '.cf{position:absolute;left:0;top:calc(100% + 6px);width:min(430px,100%);z-index:45;background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 26px 50px -18px rgba(27,42,65,.55);padding:14px 12px 8px;max-height:min(70vh,560px);overflow:auto}' +
    '.cf h5{margin:0 2px 2px;font-family:Fraunces,Georgia,serif;font-weight:600;font-size:17px;color:var(--primary)}' +
    '.cf > p{margin:0 2px 8px;font-size:12.5px;color:#7a7263}' +
    '#formPanel .cf .it{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;align-items:start;width:100%;text-align:left;padding:9px 6px;border:none;border-top:1px solid #f0e9d8;border-radius:0;background:none;box-shadow:none;transform:none;font-size:13.5px;color:#24304a;min-height:0;white-space:normal}' +
    '#formPanel .cf .it:hover{background:#faf6ea}' +
    '#formPanel .cf .it[disabled]{cursor:default;opacity:1}#formPanel .cf .it[disabled]:hover{background:none}' +
    '.cf .it b{font-weight:600}.cf .it small{display:block;color:#8a8371;font-size:12px;margin-top:1px;line-height:1.35}' +
    '.cf .it u{text-decoration:none;font-weight:700;color:var(--brass);font-size:12.5px;white-space:nowrap}' +
    '.cf .it svg.ic{width:17px;height:17px;margin-top:1px}' +
    '.cf .erro svg.ic{color:#b04b3c}.cf .alerta svg.ic{color:#a46a12}.cf .ok svg.ic{color:#3d7a57}.cf .ok b{color:#3d7a57}' +
    '.lin.cf-pisca{animation:cfPisca 1.6s ease}' +
    '@keyframes cfPisca{0%,55%{box-shadow:0 0 0 3px rgba(201,154,85,.6);background:#fdf6e3}100%{box-shadow:0 0 0 0 rgba(201,154,85,0)}}' +
    '}';
  document.head.appendChild(css);

  var barra = document.querySelector('.resumo-lista'), aposRes = document.getElementById('resLin');
  if (!barra || !aposRes) return;
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'cf-b ok'; btn.id = 'btnConferir';
  btn.title = 'Conferir a lista antes de gerar o PDF';
  aposRes.insertAdjacentElement('afterend', btn);
  var painel = null, ult = null, pos = {};

  function pintarBotao() {
    ult = conferir();
    var nivel = ult.grupos.some(function (g) { return g.nivel === 'erro'; }) || ult.folhas > 4 ? 'erro' : ult.total ? 'alerta' : 'ok';
    btn.className = 'cf-b ' + nivel;
    btn.innerHTML = ic(nivel === 'ok' ? 'check-circle' : 'alert') + (ult.total ? 'Conferir<em><span>' + ult.total + '</span></em>' : 'Tudo certo');
    if (painel) desenharPainel();
  }
  function desenharPainel() {
    var h = '<h5>Conferência da lista</h5><p>Antes de gerar o PDF. Toque num item para ir até a linha.</p>';
    ult.grupos.forEach(function (g) {
      var n = g.itens.length, i = (pos[g.ch] || 0) % n;
      h += '<button type="button" class="it ' + g.nivel + '" data-g="' + g.ch + '">' + ic('alert') + '<span><b>' + n + (n === 1 ? ' linha ' : ' linhas ') + esc(g.ch === 'rep' && n > 1 ? 'repetidas' : g.titulo) + '</b>' +
        '<small>' + g.itens.slice(0, 3).map(function (x) { return esc(x.onde); }).join('<br>') + (n > 3 ? '<br>e mais ' + (n - 3) + '…' : '') + '</small></span><u>' + (n > 1 ? 'ver ' + (i + 1) + ' de ' + n : 'ver linha') + '</u></button>';
    });
    var f = ult.folhas;
    if (f) h += '<button type="button" class="it ' + (f <= 3 ? 'ok' : f === 4 ? 'alerta' : 'erro') + '" disabled>' + ic(f <= 3 ? 'check-circle' : 'alert') + '<span><b>' + (f <= 4 ? 'Cabe em ' + f + (f === 1 ? ' folha' : ' folhas') : 'Passou de 4 folhas (' + f + ')') + '</b>' + (f === 4 ? '<small>o ideal são 3</small>' : '') + '</span><u></u></button>';
    if (!ult.grupos.length) h += '<button type="button" class="it ok" disabled>' + ic('check-circle') + '<span><b>Nenhuma pendência nas linhas</b><small>Datas, horas, locais e quem atende estão preenchidos.</small></span><u></u></button>';
    painel.innerHTML = h;
    painel.querySelectorAll('.it[data-g]').forEach(function (b) {
      b.onclick = function () {
        var g = ult.grupos.find(function (x) { return x.ch === b.dataset.g; }); if (!g) return;
        var i = (pos[g.ch] || 0) % g.itens.length; pos[g.ch] = i + 1;
        var estreito = window.matchMedia('(max-width:980px)').matches;
        if (estreito) fechar();
        irParaLinha(g.itens[i].id);
        if (!estreito) desenharPainel();
      };
    });
  }
  function fechar() { if (painel) { painel.remove(); painel = null; } }
  btn.onclick = function (e) {
    e.stopPropagation();
    if (painel) { fechar(); return; }
    painel = document.createElement('div'); painel.className = 'cf'; painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-label', 'Conferência da lista');
    painel.onclick = function (ev) { ev.stopPropagation(); };
    barra.appendChild(painel); pintarBotao();
  };
  document.addEventListener('click', function () { fechar(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });

  // acompanha a lista: o resumo (folhas/linhas) é refeito a cada mudança
  var orig = window.atualizarResumo;
  if (typeof orig === 'function') {
    var t = null;
    window.atualizarResumo = function () { var r = orig.apply(this, arguments); clearTimeout(t); t = setTimeout(pintarBotao, 120); return r; };
  }
  setTimeout(pintarBotao, 400);

  // vindo da busca da tela inicial: ?linha=<id>
  try {
    var alvo = new URLSearchParams(location.search).get('linha');
    if (alvo) setTimeout(function () { irParaLinha(alvo); }, 900);
  } catch (e) {}
  window.Conferencia = { conferir: conferir, irParaLinha: irParaLinha };
})();
