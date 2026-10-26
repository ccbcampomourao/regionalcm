/* ============================================================
   Telas de edição (listas e calendários): salvar/carregar na
   nuvem e atalhos de teclado. Compartilhado pelas 9 telas.

   Cada página chama Nuvem.configurar({...}) dizendo:
     regiao        chave da lista no servidor (ex.: 'campomourao')
     tipo          'lista' ou 'calendario' (só muda os textos)
     sugerirNome() nome sugerido na primeira vez
     conteudo()    texto JSON do que está na tela
     aplicar(txt)  carrega um JSON na tela (retorna false se falhar)

   Não mexe na geração do PDF nem na pré-visualização: só chama
   as funções que a própria página já tinha.
   ============================================================ */
(function () {
  'use strict';

  var cfg = null;
  var ic = function (n, c) { return window.ic(n, c); };
  var esc = function (s) { return UI.esc(s); };

  // Mesmas regras do servidor (functions/_utils/listasStore.js)
  var NOME_OK = /^[a-zA-Z0-9À-ÿ _\-.]{1,120}$/;
  function normalizar(nome) {
    var l = String(nome || '').trim().replace(/\s+/g, ' ').toLowerCase();
    return /\.json$/.test(l) ? l : l + '.json';
  }
  function semExt(n) { return String(n || '').replace(/\.json$/i, ''); }

  function token() { return localStorage.getItem('session_token'); }
  function chaveUltimo() { return 'nuvem_ultimo_' + cfg.regiao; }
  function ultimoNome() { try { return localStorage.getItem(chaveUltimo()) || ''; } catch (e) { return ''; } }
  function guardarUltimo(n) { try { localStorage.setItem(chaveUltimo(), semExt(n)); } catch (e) {} }

  function txt(lista, cal) { return cfg.tipo === 'calendario' ? cal : lista; }

  async function api(rota, corpo) {
    var res = await fetch('/api/' + rota, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: token(), regiao: cfg.regiao }, corpo || {}))
    });
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401) {
      UI.toast('Sua sessão expirou. Entre de novo para continuar (o que está na tela continua salvo neste aparelho).', {
        type: 'error', action: { label: 'Entrar', icon: 'arrow-right', fn: function () { location.href = '/login.html'; } }
      });
      throw Object.assign(new Error(data.error || 'Sessão expirada'), { silencioso: true });
    }
    if (!res.ok) throw new Error(data.error || 'Erro de comunicação com o servidor');
    return data;
  }

  function quando(ms) {
    if (!ms) return 'data desconhecida';
    var d = new Date(ms), hoje = new Date();
    var h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    var dias = Math.round((new Date(hoje.toDateString()) - new Date(d.toDateString())) / 864e5);
    if (dias === 0) return 'hoje às ' + h;
    if (dias === 1) return 'ontem às ' + h;
    if (dias < 7) return 'há ' + dias + ' dias';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function itemArquivo(f, marcado) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ui-file';
    b.dataset.nome = f.nome;
    b.innerHTML =
      '<span class="ui-file__ic">' + ic('file') + '</span>' +
      '<span class="ui-file__tx"><span class="ui-file__nm">' + esc(semExt(f.nome)) +
        (marcado ? '<span class="ui-tag">último usado</span>' : '') + '</span>' +
      '<span class="ui-file__dt">' + ic('clock') + ' ' + esc(quando(f.modificado)) + '</span></span>' +
      '<span class="ui-file__go">' + ic('chevron-right') + '</span>';
    return b;
  }

  /* ---------------- Salvar ---------------- */
  async function salvar() {
    if (!cfg) return;
    var btn = document.getElementById('btnListaSalvar');
    var inicial = ultimoNome() || cfg.sugerirNome();
    var arquivos = null;

    var corpo = document.createElement('div');
    corpo.innerHTML =
      '<div class="ui-field"><label for="nuvemNome">Nome do arquivo</label>' +
      '<input type="text" id="nuvemNome" maxlength="120" autocomplete="off" spellcheck="false">' +
      '<div class="ui-hint" id="nuvemHint">' + ic('info') + '<span>Use o mesmo nome para atualizar um arquivo já salvo.</span></div></div>' +
      '<div id="nuvemExist"></div>';
    var campo = corpo.querySelector('#nuvemNome');
    var dica = corpo.querySelector('#nuvemHint');
    campo.value = inicial;

    function validar(caixa) {
      var v = campo.value.trim();
      var ok = v && NOME_OK.test(v);
      var existe = ok && arquivos && arquivos.filter(function (f) { return f.nome === normalizar(v); })[0];
      var principal = caixa && caixa.querySelector('[data-primary]');
      dica.className = 'ui-hint' + (!ok ? ' is-error' : existe ? ' is-warn' : '');
      if (!v) dica.innerHTML = ic('alert') + '<span>Informe um nome para o arquivo.</span>';
      else if (!ok) dica.innerHTML = ic('alert') + '<span>Use só letras, números, espaço, ponto, hífen ou sublinhado.</span>';
      else if (existe) dica.innerHTML = ic('alert') + '<span>Já existe um arquivo com esse nome (salvo ' + esc(quando(existe.modificado)) + '). Ele será substituído.</span>';
      else dica.innerHTML = ic('info') + '<span>Use o mesmo nome para atualizar um arquivo já salvo.</span>';
      if (principal) {
        principal.disabled = !ok;
        principal.querySelector('span').textContent = existe ? 'Substituir' : 'Salvar';
      }
      return ok;
    }

    var nome = await UI.dialog({
      title: txt('Salvar lista na nuvem', 'Salvar calendário na nuvem'),
      subtitle: 'Fica disponível para quem tem acesso, em qualquer aparelho.',
      icon: 'cloud-up',
      body: corpo,
      actions: [
        { label: 'Cancelar', value: null },
        { label: 'Salvar', primary: true, icon: 'check', value: function () { return validar() ? campo.value.trim() : undefined; } }
      ],
      onOpen: function (caixa) {
        campo.addEventListener('input', function () { validar(caixa); });
        validar(caixa);
        // Busca os arquivos existentes para avisar sobre substituição
        api('lista-list').then(function (d) {
          arquivos = d.arquivos || [];
          var host = corpo.querySelector('#nuvemExist');
          if (arquivos.length) {
            host.innerHTML = '<div class="ui-files__lbl">Ou atualize um arquivo existente</div>';
            var lista = document.createElement('div');
            lista.className = 'ui-files';
            arquivos.slice(0, 6).forEach(function (f) {
              var b = itemArquivo(f, semExt(f.nome) === ultimoNome());
              b.onclick = function () { campo.value = semExt(f.nome); validar(caixa); campo.focus(); };
              lista.appendChild(b);
            });
            host.appendChild(lista);
          }
          validar(caixa);
        }).catch(function () { /* sem lista: salva mesmo assim */ });
      }
    });
    if (!nome) return;

    var fim = UI.busy(btn, 'Salvando...');
    try {
      var conteudo = cfg.conteudo();
      var data = await api('lista-save', { nome: nome, conteudo: conteudo });
      guardarUltimo(data.nomeArquivo || nome);
      UI.toast(txt('Lista salva como “', 'Calendário salvo como “') + semExt(data.nomeArquivo || nome) + '”.', 'ok');
    } catch (e) {
      if (!e.silencioso) UI.toast('Não foi possível salvar: ' + e.message, 'error');
    } finally {
      fim();
    }
  }

  /* ---------------- Carregar ---------------- */
  async function carregar() {
    if (!cfg) return;
    var btn = document.getElementById('btnListaCarregar');
    var fim = UI.busy(btn, 'Buscando...');
    var arquivos;
    try {
      arquivos = (await api('lista-list')).arquivos || [];
    } catch (e) {
      if (!e.silencioso) UI.toast(txt('Não foi possível acessar as listas salvas: ', 'Não foi possível acessar os calendários salvos: ') + e.message, 'error');
      fim();
      return;
    }
    fim();
    if (!arquivos.length) {
      UI.toast(txt('Ainda não existe nenhuma lista salva na nuvem para esta página.', 'Ainda não existe nenhum calendário salvo na nuvem.'), 'info');
      return;
    }

    var corpo = document.createElement('div');
    corpo.innerHTML =
      (arquivos.length > 5
        ? '<div class="ui-field ui-search">' + ic('search') +
          '<input type="search" id="nuvemBusca" placeholder="Buscar pelo nome" autocomplete="off" aria-label="Buscar pelo nome"></div>'
        : '') +
      '<div class="ui-files" id="nuvemArquivos"></div>' +
      '<div class="ui-hint" style="margin-top:12px">' + ic('info') +
      '<span>O conteúdo atual da tela será substituído. Se mudar de ideia, use “Desfazer” no aviso que aparece depois.</span></div>';
    var host = corpo.querySelector('#nuvemArquivos');
    var escolhido = null;

    function desenhar(filtro) {
      host.replaceChildren();
      var f = (filtro || '').trim().toLowerCase();
      var vis = arquivos.filter(function (a) { return !f || a.nome.toLowerCase().indexOf(f) !== -1; });
      if (!vis.length) { host.innerHTML = '<div class="ui-files__empty">Nenhum arquivo com esse nome.</div>'; return; }
      vis.forEach(function (a) {
        var b = itemArquivo(a, semExt(a.nome) === ultimoNome());
        b.onclick = function () { escolhido = a.nome; fecharDlg(true); };
        host.appendChild(b);
      });
    }
    var fecharDlg = function () {};

    var ok = await UI.dialog({
      title: txt('Carregar lista da nuvem', 'Carregar calendário da nuvem'),
      subtitle: arquivos.length + (arquivos.length === 1 ? ' arquivo salvo' : ' arquivos salvos') + ', do mais recente para o mais antigo.',
      icon: 'cloud-down',
      wide: true,
      body: corpo,
      actions: [{ label: 'Cancelar', value: null }],
      onOpen: function (caixa, fechar) {
        fecharDlg = fechar;
        desenhar('');
        var busca = corpo.querySelector('#nuvemBusca');
        if (busca) {
          busca.addEventListener('input', function () { desenhar(busca.value); });
          busca.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') { e.preventDefault(); var p = host.querySelector('.ui-file'); if (p) p.focus(); }
          });
          setTimeout(function () { busca.focus(); }, 40);
        } else {
          var p = host.querySelector('.ui-file');
          if (p) setTimeout(function () { p.focus(); }, 40);
        }
        host.addEventListener('keydown', function (e) {
          var itens = Array.prototype.slice.call(host.querySelectorAll('.ui-file'));
          var i = itens.indexOf(document.activeElement);
          if (e.key === 'ArrowDown' && i < itens.length - 1) { e.preventDefault(); itens[i + 1].focus(); }
          if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) itens[i - 1].focus(); else if (busca) busca.focus(); }
        });
      }
    });
    if (!ok || !escolhido) return;

    fim = UI.busy(btn, 'Carregando...');
    try {
      var data = await api('lista-load', { nome: escolhido });
      var anterior = null;
      try { anterior = cfg.conteudo(); } catch (e) {}
      var r = cfg.aplicar(data.conteudo);
      if (r === false) return;
      guardarUltimo(escolhido);
      UI.toast('“' + semExt(escolhido) + '” carregado.', {
        type: 'ok',
        action: anterior ? { label: 'Desfazer', icon: 'undo', fn: function () {
          cfg.aplicar(anterior);
          UI.toast('Conteúdo anterior restaurado.', 'info');
        } } : null
      });
    } catch (e) {
      if (!e.silencioso) UI.toast('Não foi possível carregar o arquivo: ' + e.message, 'error');
    } finally {
      fim();
    }
  }

  window.Nuvem = {
    configurar: function (c) {
      cfg = c;
      window.salvarLista = salvar;
      window.carregarLista = carregar;
    }
  };

  /* ---------------- Atalhos de teclado ---------------- */
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (document.querySelector('.ui-modal')) return;
    var k = e.key.toLowerCase();
    if (k === 's' && cfg) {
      e.preventDefault();
      salvar();
    } else if (k === 'p' && typeof window.gerarPDF === 'function') {
      // Ctrl+P abre a mesma impressão do botão "Gerar PDF" (em vez de imprimir a tela de edição)
      e.preventDefault();
      window.gerarPDF();
    }
  });

  /* Dica dos atalhos no título dos botões */
  UI.pronto(function () {
    var mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
    var mod = mac ? 'Cmd' : 'Ctrl';
    var s = document.getElementById('btnListaSalvar');
    if (s && !s.title) s.title = 'Salvar na nuvem (' + mod + '+S)';
    var c = document.getElementById('btnListaCarregar');
    if (c && !c.title) c.title = 'Carregar da nuvem';
    document.querySelectorAll('[onclick^="gerarPDF"]').forEach(function (b) {
      if (!b.title) b.title = 'Gerar PDF (' + mod + '+P)';
    });
  });
})();

/* ------------------------------------------------------------
   Atualização da pré-visualização sem piscar.
   Em vez de apagar e recriar todo o conteúdo (innerHTML), compara
   o novo com o que já está na tela e só troca o que mudou: imagens
   (ex.: logo) não recarregam e o texto não "pisca" a cada tecla.
   O resultado final é exatamente o mesmo HTML.
   ------------------------------------------------------------ */
window.atualizarSemPiscar = function (alvo, origem) {
  function filhos(a, b) {
    var av = Array.prototype.slice.call(a.childNodes), bv = Array.prototype.slice.call(b.childNodes), i;
    for (i = 0; i < bv.length; i++) {
      var n = bv[i], o = av[i];
      if (n.ownerDocument !== a.ownerDocument) n = a.ownerDocument.importNode(n, true);
      if (!o) { a.appendChild(n); continue; }
      if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) { a.replaceChild(n, o); continue; }
      if (o.nodeType === 3 || o.nodeType === 8) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; continue; }
      if (o.nodeName === 'SCRIPT' || o.nodeName === 'STYLE') { if (o.outerHTML !== n.outerHTML) a.replaceChild(n, o); continue; }
      no(o, n);
    }
    for (i = av.length - 1; i >= bv.length; i--) a.removeChild(av[i]);
  }
  function no(o, n) {
    var k, at;
    for (k = o.attributes.length - 1; k >= 0; k--) { at = o.attributes[k]; if (!n.hasAttribute(at.name)) o.removeAttribute(at.name); }
    for (k = 0; k < n.attributes.length; k++) { at = n.attributes[k]; if (o.getAttribute(at.name) !== at.value) o.setAttribute(at.name, at.value); }
    filhos(o, n);
  }
  filhos(alvo, origem);
};
