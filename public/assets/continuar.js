/* ============================================================
   Tela inicial: "Continuar de onde parou" e situação de cada
   cartão, com o que está salvo NESTE aparelho. Só lê; não muda
   nenhuma lista. Chamar Continuar.montar() depois que os
   cartões estiverem na página.
   ============================================================ */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  function ler(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function pl(n, um, mais) { return n + ' ' + (n === 1 ? um : mais); }
  function titulo(p) { return String(p || '').toLowerCase().replace(/(^|[\s\/-])([a-zà-ÿ])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  function quando(ms) {
    if (!ms) return '';
    var d = new Date(ms), hoje = new Date();
    var dias = Math.round((new Date(hoje.toDateString()) - new Date(d.toDateString())) / 864e5);
    var h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
    if (dias <= 0) return 'hoje, ' + h;
    if (dias === 1) return 'ontem';
    if (dias < 7) return 'há ' + dias + ' dias';
    if (dias < 60) return 'há ' + Math.round(dias / 7) + ' semanas';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function lista(rot, k) {
    return function () {
      var s = ler(k); if (!s) return null;
      var secs = s.sections || s.secoes || s.tabelas || [];
      var linhas = Array.isArray(secs) ? secs.reduce(function (a, x) { return a + ((x.entries || x.linhas || x.itens || []).length || 0); }, 0) : 0;
      if (!linhas) return null;
      var per = s.meta && s.meta.periodo ? String(s.meta.periodo) : '';
      if (/^\d{4}-\d{2}/.test(per)) per = '';
      return { sobre: rot, tit: per ? titulo(per) : 'Lista em andamento', det: pl(secs.length, 'tabela', 'tabelas') + ' · ' + pl(linhas, 'linha', 'linhas'), curto: per ? titulo(per).replace(/([A-Za-zÀ-ÿ]{3})[a-zà-ÿ]+/g, '$1') : '' };
    };
  }
  var REG = { campomourao: 'Campo Mourão', cianorte: 'Cianorte', ubirata: 'Ubiratã', pitanga: 'Pitanga', goioere: 'Goioerê', ivaipora: 'Ivaiporã' };
  var ITENS = [
    { url: '/listaregional.html', k: 'ccb_lista_state_regional', f: lista('Lista · Regional', 'ccb_lista_state_regional') },
    { url: '/listacampomourao.html', k: 'ccb_lista_state_campomourao', f: lista('Lista · Campo Mourão', 'ccb_lista_state_campomourao') },
    { url: '/listacianorte.html', k: 'ccb_generator_state_v2', f: lista('Lista · Cianorte', 'ccb_generator_state_v2') },
    { url: '/listaubirata.html', k: 'ccb_lista_simples_state', f: lista('Lista · Ubiratã', 'ccb_lista_simples_state') },
    { url: '/listapitanga.html', k: 'ccb_lista_pitanga_state', f: lista('Lista · Pitanga', 'ccb_lista_pitanga_state') },
    { url: '/listagoioere.html', k: 'ccb_lista_goioere_state', f: lista('Lista · Goioerê', 'ccb_lista_goioere_state') },
    { url: '/listaivaipora.html', k: 'ccb_lista_ivaipora_state', f: lista('Lista · Ivaiporã', 'ccb_lista_ivaipora_state') },
    { url: '/calendario-reunioes.html', k: 'ccb_calendario_reunioes_anual', f: function () {
        var s = ler('ccb_calendario_reunioes_anual'); if (!s || !s.dias) return null;
        var n = Object.keys(s.dias).reduce(function (a, k) { return a + (s.dias[k] || []).length; }, 0); if (!n) return null;
        var ano = s.meta && s.meta.ano ? s.meta.ano : '';
        return { sobre: 'Calendário Anual', tit: 'Reuniões' + (ano ? ' de ' + ano : ''), det: pl(n, 'serviço lançado', 'serviços lançados'), curto: ano ? String(ano) : '' };
      } },
    { url: '/calendario-ensaios.html', k: 'ccb_calendario_ensaios_state', f: function () {
        var s = ler('ccb_calendario_ensaios_state'); if (!s || !(s.secoes || []).length) return null;
        var loc = s.secoes.reduce(function (a, x) { return a + (x.localidades || []).length; }, 0);
        var ano = s.meta && s.meta.ano ? s.meta.ano : '';
        return { sobre: 'Calendário dos Ensaios', tit: 'Ensaios' + (ano ? ' de ' + ano : ''), det: pl(s.secoes.length, 'seção', 'seções') + ' · ' + pl(loc, 'localidade', 'localidades'), curto: ano ? String(ano) : '' };
      } },
    { url: '/relatorio-igrejas.html', k: null, f: function () {
        var r = null; try { r = localStorage.getItem('ccb_igrejas_ultima'); } catch (e) {}
        var regs = (r ? [r] : []).concat(Object.keys(REG)), d = null, reg = null;
        for (var i = 0; i < regs.length && !d; i++) { var x = ler('ccb_igrejas_' + regs[i]); if (x && (x.igrejas || []).length) { d = x; reg = regs[i]; } }
        if (!d) return null;
        var pend = false; try { pend = localStorage.getItem('ccb_igrejas_' + reg + '_pend') === '1'; } catch (e) {}
        return { sobre: 'Relatório de Igrejas', tit: REG[reg] || 'Igrejas', det: pl(d.igrejas.length, 'igreja', 'igrejas'), t: d.atualizado || 0, aviso: pend ? 'Falta salvar na nuvem' : '', curto: '' };
      } }
  ];
  var CSS = '.cont{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}' +
    '.cont a{display:block;text-decoration:none;background:#fff;border:1px solid var(--line,#e4dcc9);border-left:4px solid var(--brass,#a97d3d);border-radius:14px;padding:14px 16px;box-shadow:0 8px 20px -16px rgba(27,42,65,.55);transition:transform .15s,border-color .15s}' +
    '.cont a:hover{transform:translateY(-2px);border-color:var(--brass-lt,#c99a55)}' +
    '.cont small{display:block;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brass,#a97d3d);margin-bottom:4px}' +
    '.cont b{display:block;font-family:var(--font-display,Fraunces,Georgia,serif);font-weight:600;font-size:17px;color:var(--ink,#1b2a41);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.cont span{display:block;font-size:12.5px;color:#7a7263;margin-top:3px}' +
    '.cont i{display:inline-block;font-style:normal;font-size:11px;font-weight:700;background:#eef5ef;color:#3d7a57;border-radius:999px;padding:2px 9px;margin-top:9px}' +
    '.cont i.p{background:#fdf3dc;color:#a46a12}' +
    '.lds em.sit{font-style:normal;color:var(--brass,#a97d3d);font-weight:600}' +
    '@media(max-width:760px){.cont{grid-template-columns:1fr;gap:8px}.cont a{padding:12px 14px}}';

  function montar() {
    var antigo = document.getElementById('blkContinuar'); if (antigo) antigo.remove();
    var mex = ler('ccb_mexido') || {};
    var achados = [];
    ITENS.forEach(function (it) {
      var a = document.querySelector('a[href="' + it.url + '"]'); if (!a) return;   // só o que a conta pode abrir
      var r = null; try { r = it.f(); } catch (e) {}
      if (!r) return;
      r.url = it.url; r.t = r.t || (it.k && mex[it.k]) || 0;
      achados.push(r);
      var ds = a.querySelector('.lds, .ftx p');
      var sit = [r.curto, r.t ? quando(r.t) : 'em andamento neste aparelho'].filter(Boolean).join(' · ');
      if (ds && a.classList.contains('lcard') && !/relatorio|calendario/.test(it.url)) ds.innerHTML = '<em class="sit">' + esc(sit) + '</em>';
    });
    if (!achados.length) return;
    achados.sort(function (a, b) { return b.t - a.t; });
    if (!document.getElementById('cssContinuar')) { var st = document.createElement('style'); st.id = 'cssContinuar'; st.textContent = CSS; document.head.appendChild(st); }
    var sec = document.createElement('section'); sec.className = 'blk'; sec.id = 'blkContinuar';
    sec.innerHTML = '<div class="blk-head"><h3>Continuar de onde parou</h3></div><div class="cont">' + achados.slice(0, 3).map(function (r) {
      return '<a href="' + r.url + '"><small>' + esc(r.sobre) + '</small><b>' + esc(r.tit) + '</b><span>' + esc(r.det) + '</span>' +
        (r.aviso ? '<i class="p">' + esc(r.aviso) + '</i>' : r.t ? '<i>Última alteração: ' + esc(quando(r.t)) + '</i>' : '<i>Salva neste aparelho</i>') + '</a>';
    }).join('') + '</div>';
    var primeiro = document.querySelector('main.cat .blk');
    if (primeiro) primeiro.parentNode.insertBefore(sec, primeiro);
  }

  /* ============================================================
     Busca geral: procura um nome ou um local no que está salvo
     neste aparelho (listas, calendário anual e relatório de igrejas)
     ============================================================ */
  var TIPOS_LISTA = { batismo: 'Batismos', reuniao_mocidade: 'Reunião para Mocidade', culto_mocidade: 'Culto para Mocidade', culto_ensinamento_pais_filhos: 'Culto p/ Pais e Filhos',
    culto_ensinamento: 'Culto de Ensinamento', ensaio_regional: 'Ensaio Regional', ensaio_geral_categoria: 'Ensaio por Categoria', santa_ceia: 'Santa Ceia', santa_ceia_extra: 'Santa Ceia',
    reuniaodiversa: 'Reuniões Diversas', reuniaodiversa_cozinha: 'Reuniões Diversas', evangelizacao: 'Evangelização', coleta_reforco_caixa: 'Coletas', abertura_casa_oracao: 'Abertura de Casa de Oração',
    reabertura_casa_oracao: 'Reabertura de Casa de Oração', culto_busca_dons: 'Culto com Busca de Dons', avisos: 'Avisos' };
  var PAPEIS = { anciaes: 'Ancião', diaconos: 'Diácono', coopOficio: 'Coop. do Ofício', coopJovens: 'Coop. de Jovens', encLocais: 'Enc. local', encRegionais: 'Enc. regional', examinadoras: 'Examinadora' };
  var nrm = function (t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var dm = function (d) { return /^\d{4}-\d{2}-\d{2}/.test(d || '') ? d.slice(8, 10) + '/' + d.slice(5, 7) : ''; };
  function textos(o) {   // todos os textos de um registro (campos, listas de nomes, convocados)
    var out = [];
    Object.keys(o || {}).forEach(function (k) {
      var v = o[k];
      if (typeof v === 'string') out.push(v);
      else if (Array.isArray(v)) v.forEach(function (x) { if (typeof x === 'string') out.push(x); });
      else if (v && typeof v === 'object' && typeof v.texto === 'string') out.push(v.texto);
    });
    return out.filter(function (x) { return x && !/^\d{4}-\d{2}-\d{2}$/.test(x) && !/^\d{1,2}:\d{2}$/.test(x); });
  }
  var INDICE = null;
  function indexar() {
    var grupos = [];
    var pode = function (url) { return !!document.querySelector('a[href="' + url + '"]'); };
    ITENS.forEach(function (it) {
      if (!it.k || !/lista|generator/.test(it.k) || !pode(it.url)) return;
      var s = ler(it.k); if (!s) return;
      var secs = s.sections || s.secoes || s.tabelas || []; if (!Array.isArray(secs)) return;
      var per = s.meta && s.meta.periodo && !/^\d{4}-/.test(s.meta.periodo) ? titulo(s.meta.periodo).replace(/([A-Za-zÀ-ÿ]{3})[a-zà-ÿ]+/g, '$1') : '';
      var nome = (it.f() || {}).sobre || 'Lista';
      var itens = [];
      secs.forEach(function (sec) {
        (sec.entries || sec.linhas || sec.itens || []).forEach(function (e) {
          var d = e.data && typeof e.data === 'object' ? e.data : e, ts = textos(d); if (!ts.length) return;
          itens.push({ n: nrm(ts.join(' | ')), ts: ts, esq: dm(d.data) || '—', tit: d.local || d.cidade || ts[0], dir: TIPOS_LISTA[sec.typeKey] || sec.titulo || sec.label || '',
            url: it.url + (it.k === 'ccb_lista_state_campomourao' && e.id ? '?linha=' + encodeURIComponent(e.id) : '') });
        });
      });
      if (itens.length) grupos.push({ nome: nome + (per ? ' · ' + per : ''), itens: itens });
    });
    if (pode('/calendario-reunioes.html')) {
      var c = ler('ccb_calendario_reunioes_anual');
      if (c && c.dias) {
        var its = [];
        Object.keys(c.dias).sort().forEach(function (k) {
          (c.dias[k] || []).forEach(function (e) {
            var ts = textos(e).filter(function (x) { return x !== e.t && x !== e.h; }); if (!ts.length) return;
            its.push({ n: nrm(ts.join(' | ')), ts: ts, esq: k.slice(3, 5) + '/' + k.slice(0, 2), tit: e.x || ts[0], dir: e.h || '', url: '/calendario-reunioes.html?dia=' + k });
          });
        });
        if (its.length) grupos.push({ nome: 'Calendário Anual' + (c.meta && c.meta.ano ? ' · ' + c.meta.ano : ''), itens: its });
      }
    }
    if (pode('/relatorio-igrejas.html')) {
      var its2 = [];
      Object.keys(REG).forEach(function (r) {
        var d = ler('ccb_igrejas_' + r); if (!d || !d.igrejas) return;
        d.igrejas.forEach(function (ig) {
          var url = '/relatorio-igrejas.html?regiao=' + r + '&igreja=' + encodeURIComponent(ig.id || '');
          var casa = [ig.cidade, ig.nome].filter(Boolean).join(' · ');
          its2.push({ n: nrm([ig.cidade, ig.nome, ig.codigo, ig.endereco].join(' | ')), ts: [casa, ig.endereco || '', ig.codigo || ''], esq: 'Igreja', tit: casa, dir: REG[r], url: url, so: 1 });
          Object.keys(PAPEIS).forEach(function (p) { (ig[p] || []).forEach(function (nm) { if (String(nm || '').trim()) its2.push({ n: nrm(nm), ts: [nm, casa], esq: PAPEIS[p], tit: nm, sub: casa, dir: REG[r], url: url, so: 1 }); }); });
        });
      });
      if (its2.length) grupos.push({ nome: 'Relatório de Igrejas', itens: its2 });
    }
    return grupos;
  }
  function marcar(texto, q) {
    var t = String(texto || ''), i = nrm(t).indexOf(q);
    if (i < 0 || nrm(t).length !== t.length) return esc(t);
    return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
  }
  var CSS_B = '.bg{position:relative;margin:0 0 24px}' +
    '.bg .cx{display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid var(--line,#e4dcc9);border-radius:14px;padding:0 14px;transition:border-color .15s,box-shadow .15s}' +
    '.bg .cx:focus-within{border-color:var(--brass-lt,#c99a55);box-shadow:0 0 0 4px rgba(201,154,85,.16)}' +
    '.bg .cx svg{width:19px;height:19px;color:var(--brass,#a97d3d);flex:none}' +
    '.bg .cx input{flex:1;min-width:0;border:none;outline:none;background:transparent;box-shadow:none;padding:13px 0;font:500 15.5px Inter,system-ui,sans-serif;color:var(--ink,#1b2a41)}' +
    '.bg .cx kbd{font:600 11px Inter,sans-serif;color:#8a8371;background:#f1ebdc;border-radius:6px;padding:3px 7px;white-space:nowrap}' +
    '.bg .rs{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:30;background:#fff;border:1px solid var(--line,#e4dcc9);border-radius:14px;box-shadow:0 22px 44px -18px rgba(27,42,65,.5);padding:6px;max-height:min(62vh,520px);overflow:auto}' +
    '.bg .rs[hidden]{display:none}' +
    '.bg .rs h6{margin:8px 10px 4px;font:700 10.5px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--brass,#a97d3d)}' +
    '.bg .rs a{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:10px;align-items:baseline;padding:9px 10px;border-radius:9px;font:500 13.5px Inter,sans-serif;color:#24304a;text-decoration:none}' +
    '.bg .rs a:hover,.bg .rs a.on{background:#f8f3e6}' +
    '.bg .rs a b{font-weight:700;color:var(--ink,#1b2a41);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.bg .rs a span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.bg .rs a small{color:#8a8371;font-size:12px}.bg .rs a > small{white-space:nowrap}' +
    '.bg .rs mark{background:#fbe9c2;color:inherit;border-radius:3px;padding:0 1px}' +
    '.bg .rs .nada{padding:14px 12px;font:500 13.5px Inter,sans-serif;color:#7a7263}' +
    '.bg .rs .mais{padding:4px 10px 8px;font:500 12px Inter,sans-serif;color:#8a8371}' +
    '@media(max-width:760px){.bg .cx kbd{display:none}.bg .cx input{font-size:16px}.bg .rs a{grid-template-columns:64px minmax(0,1fr)}.bg .rs a > small{display:none}.bg .rs a span{white-space:normal}}';
  function busca() {
    var main = document.querySelector('main.cat'), primeiro = main && main.querySelector('.blk');
    if (!main || !primeiro || document.getElementById('buscaGeral')) return;
    if (!indexar().length) return;   // nada salvo neste aparelho ainda
    var st = document.createElement('style'); st.textContent = CSS_B; document.head.appendChild(st);
    var box = document.createElement('div'); box.className = 'bg'; box.id = 'buscaGeral';
    box.innerHTML = '<label class="cx"><svg class="ic" aria-hidden="true"><use href="/assets/icons.svg#i-search"></use></svg>' +
      '<input type="search" id="bgCampo" placeholder="Buscar um nome ou um local nas listas, no calendário e nas igrejas" autocomplete="off" aria-label="Buscar em tudo"><kbd>Ctrl K</kbd></label><div class="rs" id="bgRes" hidden></div>';
    primeiro.parentNode.insertBefore(box, primeiro);
    var campo = box.querySelector('input'), res = box.querySelector('.rs');
    function procurar() {
      var q = nrm(campo.value).trim();
      if (q.length < 2) { res.hidden = true; res.innerHTML = ''; return; }
      INDICE = INDICE || indexar();
      var h = '', total = 0;
      INDICE.forEach(function (g) {
        var ach = g.itens.filter(function (x) { return x.n.indexOf(q) !== -1; }); if (!ach.length) return;
        total += ach.length;
        h += '<h6>' + esc(g.nome) + '</h6>' + ach.slice(0, 6).map(function (x) {
          var onde = x.ts.filter(function (t) { return nrm(t).indexOf(q) !== -1 && t !== x.tit; })[0];
          return '<a href="' + x.url + '"><b>' + esc(x.esq) + '</b><span>' + marcar(x.tit, q) + (x.sub ? ' <small>· ' + esc(x.sub) + '</small>' : onde ? ' <small>· ' + marcar(onde, q) + '</small>' : '') + '</span><small>' + esc(x.dir || '') + '</small></a>';
        }).join('') + (ach.length > 6 ? '<div class="mais">e mais ' + (ach.length - 6) + ' — abra para ver todos</div>' : '');
      });
      res.innerHTML = h || '<div class="nada">Nada encontrado para “' + esc(campo.value.trim()) + '” no que está salvo neste aparelho.</div>';
      res.hidden = false;
      var a = res.querySelector('a'); if (a) a.classList.add('on');
    }
    campo.addEventListener('input', procurar);
    campo.addEventListener('focus', function () { INDICE = null; procurar(); });
    campo.addEventListener('keydown', function (e) {
      var links = Array.prototype.slice.call(res.querySelectorAll('a')), i = links.findIndex(function (a) { return a.classList.contains('on'); });
      if (e.key === 'Escape') { campo.value = ''; procurar(); campo.blur(); }
      else if (e.key === 'Enter' && links[i]) { e.preventDefault(); location.href = links[i].getAttribute('href'); }
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && links.length) {
        e.preventDefault(); if (links[i]) links[i].classList.remove('on');
        i = (i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length; links[i].classList.add('on'); links[i].scrollIntoView({ block: 'nearest' });
      }
    });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) res.hidden = true; });
    document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); campo.focus(); campo.select(); } });
  }
  var _montar = montar;
  montar = function () { _montar(); try { busca(); } catch (e) {} };

  window.Continuar = { montar: function () { montar(); } };
})();
