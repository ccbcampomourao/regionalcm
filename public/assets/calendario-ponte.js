/* ============================================================
   Ponte Calendário Anual -> Lista de Serviços de Campo Mourão

   Puxa do calendário anual os serviços do início do período da
   lista até a próxima RMA (inclusive) e coloca cada um na seção
   certa da lista:
     - "Reuniões para a mocidade"  -> Reunião para Mocidade
     - "Ensaios regionais"         -> Ensaio Regional
     - todos os outros tipos       -> Reuniões Diversas
   Só acrescenta o que ainda não está na lista: nada é apagado
   nem alterado.

   O calendário pode vir deste computador (salvo automaticamente
   pelo editor do calendário) ou da nuvem.
   ============================================================ */
(function () {
  'use strict';

  var CHAVE_CAL = 'ccb_calendario_reunioes_anual';
  var MESES = { JANEIRO: 1, FEVEREIRO: 2, 'MARÇO': 3, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7,
                AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 };
  var ic = function (n) { return window.ic ? window.ic(n) : ''; };
  var esc = function (s) { return UI.esc(s); };
  var p2 = function (n) { return String(n).padStart(2, '0'); };

  /* ---------- leitura do calendário ---------- */
  function calendarioLocal() {
    try { var r = localStorage.getItem(CHAVE_CAL); return r ? JSON.parse(r) : null; } catch (e) { return null; }
  }
  function token() { return localStorage.getItem('session_token'); }
  async function api(rota, corpo) {
    var res = await fetch('/api/' + rota, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: token(), regiao: 'calendarioanual' }, corpo || {}))
    });
    var data = {}; try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data.error || 'Erro de comunicação com o servidor');
    return data;
  }

  /* ---------- regras ---------- */
  // "19h30min", "19:30", "1930", "19h" -> "19:30"
  function hora(h) {
    var m = String(h || '').match(/(\d{1,2})\s*[:hH.]?\s*(\d{2})?/);
    return m ? p2(+m[1]) + ':' + (m[2] || '00') : '';
  }
  function ehRMA(e) {
    var x = String(e.x || '');
    // "RMA - ..." ou "Reunião Ministerial Administrativa"; não confunde com "(depois da RMA)"
    return /^\W*RMA\b/i.test(x) || /reuni[aã]o\s+ministerial\s+administrativa/i.test(x);
  }
  function secaoDestino(t) { return t === 'mocidade' ? 'reuniao_mocidade' : t === 'ensaio' ? 'ensaio_regional' : 'reuniaodiversa'; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }

  // período da lista: "NOVEMBRO/DEZEMBRO - 2026" -> { ini: 2026-11-01, fim: 2026-12-31 }
  function periodo() {
    var p = (document.getElementById('meta_periodo') || {}).value || (STATE.meta && STATE.meta.periodo) || '';
    var m = p.toUpperCase().match(/([A-ZÇ]+)\s*\/\s*([A-ZÇ]+).*?(\d{4})/);
    if (!m || !MESES[m[1]]) return null;
    var ano = +m[3], m1 = MESES[m[1]], m2 = MESES[m[2]] || m1, ano2 = m2 < m1 ? ano + 1 : ano;
    var ult = new Date(ano2, m2, 0).getDate();
    return { ini: ano + '-' + p2(m1) + '-01', fim: ano2 + '-' + p2(m2) + '-' + p2(ult) };
  }
  function inicioPeriodo() { var p = periodo(); return p && p.ini; }

  function anoDe(cal) { return +((cal && cal.meta || {}).ano) || 0; }
  function contar(cal) { return cal ? Object.keys(cal.dias || {}).reduce(function (a, k) { return a + (cal.dias[k] || []).length; }, 0) : 0; }

  // todos os serviços dos calendários (um por ano), em ordem de data e hora
  function servicos(cals) {
    var out = [], vistos = {};
    cals.forEach(function (cal) {
      var ano = anoDe(cal) || new Date().getFullYear();
      if (vistos[ano]) return; vistos[ano] = 1;
      Object.keys(cal.dias || {}).forEach(function (k) {
        (cal.dias[k] || []).forEach(function (e) { out.push({ data: ano + '-' + k, e: e }); });
      });
    });
    out.sort(function (a, b) { return a.data.localeCompare(b.data) || hora(a.e.h).localeCompare(hora(b.e.h)); });
    return out;
  }

  // A RMA é bimestral e cai dentro de cada período (ex.: novembro e janeiro). A lista de
  // NOV/DEZ vai do início do período até a RMA do período SEGUINTE (a de janeiro), passando
  // pela RMA do próprio período. ate: limite usado quando essa RMA ainda não foi lançada.
  function planejar(cals, ate) {
    if (!Array.isArray(cals)) cals = [cals];
    var per = periodo();
    if (!per) return { erro: 'Escolha o período da lista antes de puxar do calendário.' };
    var ini = per.ini;
    var todos = servicos(cals).filter(function (s) { return s.data >= ini; });
    var rma = todos.find(function (s) { return s.data > per.fim && ehRMA(s.e); });
    var fim = rma ? rma.data : (ate || null);
    var sel = fim ? todos.filter(function (s) { return s.data <= fim; }) : [];
    return { ini: ini, fimPer: per.fim, fim: fim, rma: rma, itens: sel };
  }

  // procura o calendário de um ano: primeiro neste computador, depois na nuvem
  async function buscarAno(ano, jaTem) {
    var loc = calendarioLocal();
    if (loc && anoDe(loc) === ano && contar(loc)) return { cal: loc, origem: 'deste computador' };
    if (!token()) return null;
    var arquivos;
    try { arquivos = (await api('lista-list')).arquivos || []; } catch (e) { return null; }
    var comAno = arquivos.filter(function (a) { return String(a.nome).indexOf(String(ano)) !== -1; });
    var resto = arquivos.filter(function (a) { return comAno.indexOf(a) === -1; });
    var fila = comAno.concat(resto).filter(function (a) { return a.nome !== jaTem; }).slice(0, 10);
    for (var i = 0; i < fila.length; i++) {
      try {
        var c = (await api('lista-load', { nome: fila[i].nome })).conteudo;
        c = typeof c === 'string' ? JSON.parse(c) : c;
        if (anoDe(c) === ano && contar(c)) return { cal: c, origem: 'da nuvem (' + String(fila[i].nome).replace(/\.json$/i, '') + ')' };
      } catch (e) {}
    }
    return null;
  }

  /* ---------- montagem das entradas da lista ---------- */
  function codigosCargos() { return (STATE.cargos || []).map(function (c) { return c.code; }); }
  function entrada(s) {
    var e = s.e, tipo = secaoDestino(e.t);
    var d = { data: s.data, hora: hora(e.h), local: e.l || '' };
    if (tipo === 'reuniaodiversa') {
      var cods = codigosCargos(), chips = [], resto = [];
      (e.c || []).forEach(function (c) { if (cods.indexOf(c) !== -1) chips.push(c); else resto.push('*' + c); });
      if (e.o) resto.push(e.o);
      d.convocados = { chips: chips, texto: resto.join(', ') };
      d.evento = e.x || '';
    } else {
      d.atende = e.a && e.a.trim() ? [e.a.trim()] : [''];
    }
    return { tipo: tipo, data: d };
  }
  function chave(tipo, d) {
    return tipo + '|' + d.data + '|' + d.hora + '|' + (tipo === 'reuniaodiversa' ? norm(d.evento) : '');
  }
  function jaExiste(tipo, d) {
    var k = chave(tipo, d);
    return STATE.sections.some(function (sec) {
      return sec.typeKey === tipo && (sec.entries || []).some(function (en) { return chave(tipo, en.data || {}) === k; });
    });
  }
  // seção onde a entrada entra: a de Reuniões Diversas que já cobre aquela data (há listas com
  // duas, frente e verso); senão a última daquele tipo; se não existir, cria uma no fim
  function secaoPara(tipo, data) {
    var secs = STATE.sections.filter(function (s) { return s.typeKey === tipo; });
    if (!secs.length) {
      var nova = { id: newId(), typeKey: tipo, entries: [], isOpen: true };
      var iAv = STATE.sections.findIndex(function (s) { return s.typeKey === 'evangelizacao'; });
      if (iAv >= 0) STATE.sections.splice(iAv, 0, nova); else STATE.sections.push(nova);
      return nova;
    }
    for (var i = 0; i < secs.length - 1; i++) {
      var max = secs[i].entries.reduce(function (m, en) { return en.data && en.data.data > m ? en.data.data : m; }, '');
      if (max && data <= max) return secs[i];
    }
    return secs[secs.length - 1];
  }

  function br(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

  async function aplicarDe(cal, origem, nomeNuvem) {
    var cals = [cal], origens = [anoDe(cal) + ' ' + origem];
    var plano = planejar(cals);
    if (plano.erro) { UI.toast(plano.erro, 'error'); return; }
    var anoIni = +plano.ini.slice(0, 4), anoRma = +plano.fimPer.slice(0, 4) + (plano.fimPer.slice(5, 7) === '12' ? 1 : 0);
    var anos = []; for (var a = anoIni; a <= anoRma; a++) anos.push(a);
    // a RMA seguinte pode cair no ano seguinte (lista de NOV/DEZ -> RMA de janeiro):
    // junta o calendário do outro ano que faltar, deste computador ou da nuvem
    if (!plano.fim) {
      var precisa = anos.filter(function (a) { return !cals.some(function (c) { return anoDe(c) === a; }); });
      for (var i = 0; i < precisa.length; i++) {
        var achado = await buscarAno(precisa[i], nomeNuvem);
        if (achado) { cals.push(achado.cal); origens.push(precisa[i] + ' ' + achado.origem); }
        plano = planejar(cals);
        if (plano.fim) break;
      }
    }
    if (!plano.fim) {
      var falta = anos.filter(function (a) { return !cals.some(function (c) { return anoDe(c) === a; }); });
      var ate = plano.fimPer;
      var r = await UI.dialog({ title: 'Puxar do calendário', icon: 'info',
        body: '<p class="ui-modal__p">Não encontrei a RMA seguinte ao período (depois de <b>' + br(plano.fimPer) + '</b>), que é onde a lista termina.</p>' +
          (falta.length ? '<p class="ui-modal__p">Não achei o calendário de <b>' + falta.join(' e ') + '</b> neste computador nem na nuvem. Se a RMA cai em ' + falta.join('/') + ', monte e salve na nuvem o calendário desse ano e tente de novo.</p>'
                        : '<p class="ui-modal__p">Lance a RMA no calendário anual (com “RMA” na descrição) e tente de novo.</p>') +
          '<p class="ui-modal__p" style="color:#7a7466">Se preferir, posso puxar agora até o fim do período (<b>' + br(ate) + '</b>) e, quando a RMA seguinte estiver lançada, é só puxar de novo.</p>',
        actions: [{ label: 'Cancelar', value: false }, { label: 'Puxar até ' + br(ate), value: true, primary: true }] });
      if (r !== true) return;
      plano = planejar(cals, ate);
    }
    origem = origens.join(' + ');
    var novos = [], repetidos = 0, cont = { reuniaodiversa: 0, reuniao_mocidade: 0, ensaio_regional: 0 };
    plano.itens.forEach(function (s) {
      var en = entrada(s);
      if (jaExiste(en.tipo, en.data)) { repetidos++; return; }
      novos.push(en);
    });
    var rotulo = { reuniaodiversa: 'Reuniões Diversas', reuniao_mocidade: 'Reunião para Mocidade', ensaio_regional: 'Ensaio Regional' };
    novos.forEach(function (n) { cont[n.tipo]++; });
    var resumo = Object.keys(cont).filter(function (k) { return cont[k]; })
      .map(function (k) { return '<li><b>' + cont[k] + '</b> em ' + rotulo[k] + '</li>'; }).join('');
    var corpo =
      '<p class="ui-modal__p">' + (origens.length > 1 ? 'Dos calendários ' : 'Do calendário ') + '<b>' + esc(origem) + '</b>, de <b>' + br(plano.ini) + '</b> até ' + (plano.rma ? 'a RMA de ' : '') + '<b>' + br(plano.fim) + '</b>:</p>' +
      (novos.length ? '<ul style="margin:8px 0 4px 18px;padding:0;line-height:1.7">' + resumo + '</ul>' : '<p class="ui-modal__p"><b>Nada novo para acrescentar.</b></p>') +
      (repetidos ? '<p class="ui-modal__p" style="color:#7a7466">' + repetidos + ' serviço(s) já estavam na lista e ficam como estão.</p>' : '') +
      '<p class="ui-modal__p" style="color:#7a7466">Só acrescenta: nada do que já está na lista é apagado ou alterado.</p>';
    if (!novos.length) { await UI.dialog({ title: 'Puxar do calendário', icon: 'info', body: corpo, actions: [{ label: 'Fechar', value: false, primary: true }] }); return; }
    var ok = await UI.dialog({ title: 'Puxar do calendário', icon: 'calendar', body: corpo,
      actions: [{ label: 'Cancelar', value: false }, { label: 'Acrescentar ' + novos.length, value: true, primary: true, icon: 'plus' }] });
    if (ok !== true) return;
    var antes = JSON.stringify(STATE);
    novos.forEach(function (n) { secaoPara(n.tipo, n.data.data).entries.push({ id: newId(), data: n.data, origem: 'calendario' }); });
    sortStateDates(); saveState(); renderSections(); renderPreview();
    UI.toast(novos.length + ' serviço(s) acrescentado(s) do calendário. Confira os locais e quem atende.', {
      type: 'ok', duration: 9000,
      action: { label: 'Desfazer', icon: 'undo', fn: function () { STATE = JSON.parse(antes); saveState(); renderSections(); renderPreview(); } }
    });
  }

  async function daNuvem() {
    var arquivos;
    try { arquivos = (await api('lista-list')).arquivos || []; }
    catch (e) { UI.toast('Não foi possível acessar os calendários salvos na nuvem: ' + e.message, 'error'); return; }
    if (!arquivos.length) { UI.toast('Ainda não há calendário anual salvo na nuvem.', 'info'); return; }
    var corpo = document.createElement('div'); corpo.className = 'ui-files';
    var escolhido = null, fechar = function () {};
    arquivos.slice(0, 12).forEach(function (a) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ui-file';
      b.innerHTML = '<span class="ui-file__ic">' + ic('file') + '</span><span class="ui-file__tx"><span class="ui-file__nm">' + esc(String(a.nome).replace(/\.json$/i, '')) + '</span></span>';
      b.onclick = function () { escolhido = a.nome; fechar(true); };
      corpo.appendChild(b);
    });
    var ok = await UI.dialog({ title: 'Calendário da nuvem', subtitle: 'Escolha qual calendário usar (o mais recente está em cima).', icon: 'cloud-down',
      body: corpo, actions: [{ label: 'Cancelar', value: null }], onOpen: function (c, f) { fechar = f; } });
    if (!ok || !escolhido) return;
    var conteudo;
    try { conteudo = (await api('lista-load', { nome: escolhido })).conteudo; }
    catch (e) { UI.toast('Não foi possível abrir o calendário: ' + e.message, 'error'); return; }
    var cal; try { cal = typeof conteudo === 'string' ? JSON.parse(conteudo) : conteudo; } catch (e) { UI.toast('O arquivo do calendário está inválido.', 'error'); return; }
    aplicarDe(cal, 'da nuvem (' + String(escolhido).replace(/\.json$/i, '') + ')', escolhido);
  }

  async function puxar() {
    var local = calendarioLocal();
    var nLocal = local ? Object.keys(local.dias || {}).reduce(function (a, k) { return a + (local.dias[k] || []).length; }, 0) : 0;
    var r = await UI.dialog({
      title: 'Puxar do calendário anual', icon: 'calendar',
      subtitle: 'Acrescenta Reuniões Diversas, Mocidade e Ensaio Regional do início do período até a RMA do período seguinte (ex.: lista de NOV/DEZ vai até a RMA de janeiro).',
      body: '<p class="ui-modal__p">De onde vem o calendário?</p>',
      actions: [
        { label: 'Cancelar', value: null },
        { label: 'Da nuvem', value: 'nuvem', icon: 'cloud-down' },
        { label: local ? 'Deste computador (' + nLocal + ' serviços)' : 'Deste computador (vazio)', value: 'local', primary: true, icon: 'file' }
      ]
    });
    if (r === 'nuvem') return daNuvem();
    if (r === 'local') {
      if (!local || !nLocal) { UI.toast('O calendário anual deste computador está vazio. Use “Da nuvem” ou abra o calendário anual e carregue-o.', 'info'); return; }
      return aplicarDe(local, 'deste computador');
    }
  }

  window.CalPonte = { puxar: puxar, _planejar: planejar, _entrada: entrada, _hora: hora };
})();
