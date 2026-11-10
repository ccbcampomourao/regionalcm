/* =====================================================================
   Sugestões do Relatório de Igrejas na lista de serviços.
   Ao digitar o Local, aparecem as casas de oração cadastradas; ao digitar
   quem atende (obreiros, ancião, diáconos), aparecem os nomes do ministério,
   com os anciães da localidade da linha em primeiro.
   Os dados vêm do relatório da região (deste aparelho ou da nuvem).
   Não muda nada do PDF: só ajuda a preencher.
   ===================================================================== */
(function () {
  'use strict';
  var REGIAO = (window.SUGESTOES_REGIAO || 'campomourao');
  var CHAVE = 'ccb_igrejas_' + REGIAO;
  var IGREJAS = [];

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, ' ').replace(/\s+/g, ' ').trim(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nomes(v) { return (v || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean); }
  var MIUDAS = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1 };
  function titulo(s) {
    return String(s || '').toLowerCase().split(' ').map(function (w, i) {
      return (i > 0 && MIUDAS[w]) ? w : w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  function usar(dados) {
    IGREJAS = (dados && Array.isArray(dados.igrejas)) ? dados.igrejas : [];
    window.IGREJAS_SUGESTOES = IGREJAS;
  }
  try { var t = localStorage.getItem(CHAVE); if (t) usar(JSON.parse(t)); } catch (e) {}

  // busca a versão da nuvem (se este aparelho não tiver alterações pendentes do relatório)
  (function nuvem() {
    var token = localStorage.getItem('session_token');
    if (!token) return;
    var pend = false; try { pend = localStorage.getItem(CHAVE + '_pend') === '1'; } catch (e) {}
    if (pend) return;
    fetch('/api/lista-load', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, regiao: REGIAO, nome: '_igrejas.json' }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.conteudo) return;
        var dados = typeof d.conteudo === 'string' ? JSON.parse(d.conteudo) : d.conteudo;
        usar(dados);
        try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch (e) {}
      }).catch(function () {});
  })();

  /* ---------- o que sugerir ---------- */
  var CAMPOS_NOME = { atende: 1, anciao: 1, diaconos: 1 };
  function contexto(el) {
    var foco = el.dataset && el.dataset.foco; if (!foco) return null;
    var partes = foco.split('|'), campo = partes[1];
    if (campo !== 'local' && !CAMPOS_NOME[campo]) return null;
    var lin = el.closest('.lin'), sec = el.closest('[data-section-id]');
    if (!lin || !sec || typeof STATE === 'undefined') return null;
    var section = STATE.sections.find(function (s) { return s.id === sec.dataset.sectionId; });
    var entry = section && section.entries && section.entries.find(function (e) { return e.id === lin.dataset.entryId; });
    if (!entry) return null;
    return { campo: campo, section: section, entry: entry, porCidade: section.typeKey === 'evangelizacao' || section.typeKey === 'coleta_reforco_caixa' };
  }
  // igreja que corresponde ao Local da linha
  function igrejaDaLinha(ctx) {
    var loc = norm(ctx.entry.data.local); if (!loc) return null;
    var cid = norm(ctx.entry.data.cidade);
    return IGREJAS.find(function (i) {
      var n = norm(i.nome), c = norm(i.cidade);
      if (ctx.porCidade) return n === loc && (!cid || c === cid);
      return norm(i.cidade + ' - ' + i.nome) === loc || (n && loc.indexOf(c) === 0 && loc.slice(-n.length) === n);
    }) || null;
  }
  function itens(ctx, texto) {
    var q = norm(texto), palavras = q.split(' ').filter(Boolean);
    var bate = function (s) { var n = norm(s); return palavras.every(function (p) { return n.indexOf(p) !== -1; }); };
    var out = [];
    if (ctx.campo === 'local') {
      var cid = norm(ctx.entry.data.cidade);
      IGREJAS.forEach(function (i) {
        if (!i.nome && !i.cidade) return;
        if (ctx.porCidade) {
          if (cid && norm(i.cidade) !== cid) return;
          var v = String(i.nome || '').trim(); if (!v) return;
          if (!bate(v + ' ' + i.cidade)) return;
          out.push({ valor: v, rot: v, sub: titulo(i.cidade) + (i.codigo ? ' · ' + i.codigo : '') });
        } else {
          var cidade = titulo(String(i.cidade || '').trim());
          var val = cidade + (i.nome ? ' - ' + String(i.nome).trim() : '');
          if (!bate(val)) return;
          out.push({ valor: val, rot: val, sub: [i.codigo, nomes(i.anciaes)[0]].filter(Boolean).join(' · ') });
        }
      });
      out.sort(function (a, b) { return a.rot.localeCompare(b.rot, 'pt-BR'); });
    } else {
      var daqui = igrejaDaLinha(ctx);
      var vistos = {};
      var add = function (nome, papel, ig, peso) {
        var k = norm(nome); if (!k || !bate(nome)) return;
        if (vistos[k] !== undefined) { if (peso < out[vistos[k]].peso) { out[vistos[k]].peso = peso; out[vistos[k]].sub = papel; } return; }
        vistos[k] = out.length;
        out.push({ valor: nome, rot: nome, sub: papel + (ig ? ' · ' + titulo(ig.cidade) + (ig.nome ? ' - ' + ig.nome : '') : ''), peso: peso });
      };
      if (daqui) nomes(daqui.anciaes).forEach(function (n) { add(n, 'Ancião desta localidade', null, 0); });
      var PAPEIS = ctx.campo === 'diaconos'
        ? [['diaconos', 'Diácono', 1], ['anciaes', 'Ancião', 2], ['coopOficio', 'Coop. do Ofício', 3]]
        : [['anciaes', 'Ancião', 1], ['diaconos', 'Diácono', 2], ['coopOficio', 'Coop. do Ofício', 3], ['coopJovens', 'Coop. de Jovens', 4], ['encRegionais', 'Enc. Regional', 5], ['encLocais', 'Enc. Local', 6]];
      PAPEIS.forEach(function (p) { IGREJAS.forEach(function (i) { nomes(i[p[0]]).forEach(function (n) { add(n, p[1], i, p[2]); }); }); });
      out.sort(function (a, b) { return a.peso - b.peso || a.rot.localeCompare(b.rot, 'pt-BR'); });
    }
    return out.slice(0, 8);
  }

  /* ---------- a caixinha de sugestões ---------- */
  var caixa = null, alvo = null, lista = [], ativo = -1;
  function css() {
    if (document.getElementById('sug-css')) return;
    var st = document.createElement('style'); st.id = 'sug-css';
    st.textContent = '.sug{position:absolute;z-index:99990;background:#fff;border:1px solid #e4dcc9;border-radius:10px;box-shadow:0 16px 36px -14px rgba(27,42,65,.45);padding:4px;min-width:240px;max-width:420px;font-family:Inter,Arial,sans-serif}' +
      '.sug-it{display:block;width:100%;text-align:left;border:none;background:none;padding:7px 10px;border-radius:7px;cursor:pointer;color:#1b2a41;font-size:13.5px;font-weight:600;line-height:1.25}' +
      '.sug-it small{display:block;font-weight:500;font-size:11.5px;color:#8f846b}' +
      '.sug-it.on,.sug-it:hover{background:#f6f1e4}' +
      '.sug-pe{font-size:10.5px;color:#a39a85;padding:4px 10px 2px;border-top:1px solid #f0eadb;margin-top:3px}';
    document.head.appendChild(st);
  }
  function fechar() { if (caixa) caixa.remove(); caixa = null; alvo = null; lista = []; ativo = -1; }
  function abrir(el) {
    var ctx = contexto(el);
    if (!ctx || !IGREJAS.length) { fechar(); return; }
    var val = el.value || '';
    lista = itens(ctx, val);
    // não mostra se o que está escrito já é exatamente a única sugestão
    if (!lista.length || (lista.length === 1 && norm(lista[0].valor) === norm(val))) { fechar(); return; }
    css();
    if (!caixa) { caixa = document.createElement('div'); caixa.className = 'sug'; caixa.setAttribute('role', 'listbox'); document.body.appendChild(caixa); }
    alvo = el; ativo = -1;
    caixa.innerHTML = lista.map(function (it, i) {
      return '<button type="button" class="sug-it" data-i="' + i + '">' + esc(it.rot) + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</button>';
    }).join('') + '<div class="sug-pe">Do Relatório de Igrejas · ↑↓ e Enter para escolher</div>';
    caixa.querySelectorAll('.sug-it').forEach(function (b) {
      b.onmousedown = function (e) { e.preventDefault(); escolher(+b.dataset.i); };
    });
    posicionar();
  }
  function posicionar() {
    if (!caixa || !alvo) return;
    var r = alvo.getBoundingClientRect();
    caixa.style.minWidth = Math.max(240, r.width) + 'px';
    caixa.style.left = (r.left + window.scrollX) + 'px';
    caixa.style.top = (r.bottom + window.scrollY + 4) + 'px';
  }
  function marcar(i) {
    ativo = i;
    caixa.querySelectorAll('.sug-it').forEach(function (b, k) { b.classList.toggle('on', k === i); });
  }
  function escolher(i) {
    var it = lista[i], el = alvo; if (!it || !el) return;
    el.value = it.valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    fechar();
    el.focus();
  }

  document.addEventListener('input', function (e) { if (e.target && e.target.dataset && e.target.dataset.foco) abrir(e.target); }, true);
  document.addEventListener('focusin', function (e) { if (e.target && e.target.dataset && e.target.dataset.foco && !e.target.value) abrir(e.target); else if (caixa && e.target !== alvo) fechar(); });
  document.addEventListener('focusout', function (e) { if (e.target === alvo) setTimeout(function () { if (document.activeElement !== alvo) fechar(); }, 120); });
  // teclado: captura antes dos atalhos da página (Enter no obreiro acrescenta outro)
  document.addEventListener('keydown', function (e) {
    if (!caixa || e.target !== alvo) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); marcar(Math.min(lista.length - 1, ativo + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); marcar(Math.max(0, ativo - 1)); }
    else if (e.key === 'Enter' && ativo >= 0) { e.preventDefault(); e.stopImmediatePropagation(); escolher(ativo); }
    else if (e.key === 'Escape') { e.stopImmediatePropagation(); fechar(); }
  }, true);
  window.addEventListener('scroll', posicionar, true);
  window.addEventListener('resize', posicionar);

  /* =================================================================
     Dias de culto: nas Coletas para Reforço de Caixa a coleta só acontece
     em dia de culto. Cada linha mostra os cultos da casa escolhida e avisa
     quando a data cai num dia sem culto (ou o horário não bate). Ao
     escolher a data/local, o horário do culto entra sozinho se estiver vazio.
     ================================================================= */
  var TABELAS_CULTO = { coleta_reforco_caixa: 1 };
  var DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var DIAS3 = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  function horaBR(h) { if (!h) return ''; var p = String(h).split(':'); return (+p[0]) + 'h' + (p[1] && p[1] !== '00' ? p[1] : ''); }
  function cultosDe(ig) {
    // coleta: cultos oficiais (RJM não conta)
    return (ig.cultos || []).filter(function (c) { return c.dia && c.tipo !== 'RJM'; });
  }
  function igrejaDe(section, entry) {
    return igrejaDaLinha({ entry: entry, porCidade: section.typeKey === 'evangelizacao' || section.typeKey === 'coleta_reforco_caixa' });
  }
  function analisar(section, entry) {
    var ig = igrejaDe(section, entry); if (!ig) return null;
    var cultos = cultosDe(ig); if (!cultos.length) return null;
    var lista = cultos.slice().sort(function (a, b) { return DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia) || String(a.hora).localeCompare(String(b.hora)); })
      .map(function (c) { return DIAS3[DIAS.indexOf(c.dia)] + ' ' + horaBR(c.hora) + (c.obs ? ' (' + c.obs + ')' : ''); }).join(' · ');
    var r = { ig: ig, lista: lista, nivel: 'info', doDia: [] };
    var d = entry.data.data;
    if (!d) return r;
    var dt = new Date(d + 'T12:00'), dia = DIAS[dt.getDay()];
    // "2º sábado", "1º e 3º domingo", "último domingo" na observação: só nessas semanas do mês
    var semana = Math.ceil(dt.getDate() / 7);
    var ultimo = dt.getDate() + 7 > new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
    var vale = function (c) {
      var o = norm(c.obs), nums = (o.match(/\d(?=\s*[ºo°ª])/g) || []).map(Number), ult = /ultim/.test(o);
      if (!nums.length && !ult) return true;
      return nums.indexOf(semana) !== -1 || (ult && ultimo);
    };
    r.doDia = cultos.filter(function (c) { return c.dia === dia && vale(c); });
    if (!r.doDia.length) {
      var temNoDia = cultos.some(function (c) { return c.dia === dia; });
      r.nivel = 'erro';
      r.msg = temNoDia ? (ig.nome || 'Esta casa') + ' não tem culto ' + (dia === 'Sábado' || dia === 'Domingo' ? 'neste ' : 'nesta ') + dia.toLowerCase() + ' (' + semana + 'ª semana do mês).'
                       : (ig.nome || 'Esta casa') + ' não tem culto ' + (dia === 'Sábado' || dia === 'Domingo' ? 'no ' : 'na ') + dia.toLowerCase() + '.';
      return r;
    }
    var h = entry.data.hora;
    if (h && !r.doDia.some(function (c) { return c.hora === h; })) {
      r.nivel = 'alerta'; r.msg = 'O culto de ' + dia.toLowerCase() + ' é às ' + r.doDia.map(function (c) { return horaBR(c.hora); }).join(' / ') + '.';
    } else { r.nivel = 'ok'; r.msg = 'Dia de culto' + (r.doDia[0].obs ? ' (' + r.doDia[0].obs + ')' : '') + '.'; }
    return r;
  }
  function cssAviso() {
    if (document.getElementById('sug-css2')) return;
    var st = document.createElement('style'); st.id = 'sug-css2';
    st.textContent = '.lin-culto{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:12px;color:#7a6a45;margin-top:-2px}' +
      '.lin-culto b{font-weight:700}' +
      '.lin-culto .lc-st{display:inline-flex;align-items:center;gap:5px;font-weight:700;border-radius:999px;padding:1px 9px}' +
      '.lin-culto.ok .lc-st{background:#e3f1e7;color:#2f6b45}' +
      '.lin-culto.alerta .lc-st{background:#fbecd2;color:#8a5a12}' +
      '.lin-culto.erro .lc-st{background:#f8dfd9;color:#9b3727}' +
      '.lin-culto .lc-h{border:1px solid #e4dcc9;background:#fff;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:600;color:#1b2a41;cursor:pointer}' +
      '.lin-culto .lc-h:hover{border-color:#c99a55}' +
      '.lin.tem-erro{box-shadow:inset 3px 0 0 #c0503e}' +
      '@container (max-width:900px){.lin .lin-culto{grid-column:1/4}}';
    document.head.appendChild(st);
  }
  function anotarLinha(lin) {
    var sec = lin.closest('[data-section-id]'); if (!sec || typeof STATE === 'undefined') return;
    var section = STATE.sections.find(function (s) { return s.id === sec.dataset.sectionId; });
    if (!section || !TABELAS_CULTO[section.typeKey]) return;
    var entry = (section.entries || []).find(function (e) { return e.id === lin.dataset.entryId; }); if (!entry) return;
    var velho = lin.querySelector('.lin-culto'); if (velho) velho.remove();
    lin.classList.remove('tem-erro');
    var r = analisar(section, entry); if (!r) return;
    cssAviso();
    var d = document.createElement('div'); d.className = 'lin-culto ' + r.nivel;
    var html = '';
    if (r.msg) html += '<span class="lc-st">' + (r.nivel === 'ok' ? '✓ ' : '⚠ ') + esc(r.msg) + '</span>';
    if (r.nivel === 'alerta' || r.nivel === 'erro' || !entry.data.data) html += '<span>Cultos: <b>' + esc(r.lista) + '</b></span>';
    if (r.nivel === 'alerta') r.doDia.forEach(function (c) { html += '<button type="button" class="lc-h" data-h="' + esc(c.hora) + '">Usar ' + esc(horaBR(c.hora)) + '</button>'; });
    d.innerHTML = html;
    d.querySelectorAll('.lc-h').forEach(function (b) {
      b.onclick = function () {
        entry.data.hora = b.dataset.h;
        var inp = lin.querySelector('.c-hora input'); if (inp) inp.value = b.dataset.h;
        saveState(); renderPreview(); anotarLinha(lin);
      };
    });
    if (r.nivel === 'erro') lin.classList.add('tem-erro');
    var ac = lin.querySelector('.lin-acoes');
    lin.insertBefore(d, ac && ac.nextSibling ? ac.nextSibling : null);
  }
  function anotarTudo(raiz) { (raiz || document).querySelectorAll('.lin').forEach(anotarLinha); }
  // horário do culto entra sozinho quando a pessoa escolhe data ou local (se a hora estiver vazia)
  function preencherHora(lin) {
    var sec = lin.closest('[data-section-id]'); if (!sec) return;
    var section = STATE.sections.find(function (s) { return s.id === sec.dataset.sectionId; });
    if (!section || !TABELAS_CULTO[section.typeKey]) return;
    var entry = (section.entries || []).find(function (e) { return e.id === lin.dataset.entryId; });
    if (!entry || entry.data.hora) return;
    var r = analisar(section, entry);
    if (r && r.doDia.length === 1 && r.doDia[0].hora) {
      entry.data.hora = r.doDia[0].hora;
      var inp = lin.querySelector('.c-hora input'); if (inp) inp.value = entry.data.hora;
      saveState(); renderPreview();
    }
  }
  document.addEventListener('change', function (e) {
    var lin = e.target.closest && e.target.closest('.lin'); if (!lin) return;
    var campo = ((e.target.dataset && e.target.dataset.foco) || '').split('|')[1];
    if (campo === 'data' || campo === 'local') preencherHora(lin);
    setTimeout(function () { var l = document.querySelector('.lin[data-entry-id="' + lin.dataset.entryId + '"]'); if (l) anotarLinha(l); }, 30);
  });
  // depois de redesenhar as tabelas, anota de novo
  ['renderSections', 'renderSection'].forEach(function (fn) {
    var orig = window[fn]; if (typeof orig !== 'function') return;
    window[fn] = function () { var r = orig.apply(this, arguments); try { anotarTudo(document.getElementById('sectionsContainer')); } catch (e) {} return r; };
  });
  // ao gerar o PDF, avisa se alguma coleta caiu em dia sem culto
  (function () {
    var orig = window.gerarPDF; if (typeof orig !== 'function') return;
    window.gerarPDF = async function () {
      var ruins = [];
      if (IGREJAS.length && typeof STATE !== 'undefined') STATE.sections.forEach(function (s) {
        if (!TABELAS_CULTO[s.typeKey]) return;
        (s.entries || []).forEach(function (e) { var r = analisar(s, e); if (r && r.nivel === 'erro') ruins.push(e); });
      });
      if (ruins.length && window.UI && UI.confirm) {
        var ok = await UI.confirm('Coleta em dia sem culto', ruins.length + (ruins.length === 1 ? ' coleta está marcada' : ' coletas estão marcadas') + ' num dia em que a casa de oração não tem culto (segundo o Relatório de Igrejas). Gerar o PDF assim mesmo?', { ok: 'Gerar assim mesmo' });
        if (!ok) return;
      }
      return orig.apply(this, arguments);
    };
  })();
  setTimeout(function () { anotarTudo(document.getElementById('sectionsContainer')); }, 0);
  var _usar = usar;
  usar = function (d) { _usar(d); try { anotarTudo(document.getElementById('sectionsContainer')); } catch (e) {} };

  window.SugestoesIgrejas = { total: function () { return IGREJAS.length; }, usar: usar, anotar: anotarTudo, analisar: analisar, tabelasCulto: TABELAS_CULTO };
})();
