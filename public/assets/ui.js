/* ============================================================
   Utilitários de interface compartilhados por todas as telas.
   - ic(nome)          -> HTML de um ícone SVG do /assets/icons.svg
   - UI.toast(...)     -> aviso flutuante (substitui alert)
   - UI.dialog(...)    -> janela modal com botões (Promise)
   - UI.confirm(...)   -> confirmação estilizada (Promise<boolean>)
   - UI.busy(btn, txt) -> estado "carregando" num botão
   - Campos de senha ganham botão "mostrar senha" e aviso de Caps Lock.
   Nada aqui interfere na geração do PDF nem na pré-visualização.
   ============================================================ */
(function () {
  'use strict';

  var SPRITE = '/assets/icons.svg';

  function ic(nome, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false">' +
      '<use href="' + SPRITE + '#i-' + nome + '"></use></svg>';
  }
  window.ic = ic;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function quandoPronto(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* ---------------- Avisos flutuantes ---------------- */
  var pilha;
  function toast(msg, opts) {
    opts = typeof opts === 'string' ? { type: opts } : (opts || {});
    if (!pilha) {
      pilha = document.createElement('div');
      pilha.className = 'ui-toasts';
      pilha.setAttribute('role', 'status');
      pilha.setAttribute('aria-live', 'polite');
      document.body.appendChild(pilha);
    }
    var tipo = opts.type || 'info';
    var icone = { ok: 'check-circle', error: 'alert', info: 'info' }[tipo] || 'info';
    var el = document.createElement('div');
    el.className = 'ui-toast ui-toast--' + tipo;
    el.innerHTML = ic(icone) + '<span class="ui-toast__txt">' + esc(msg) + '</span>';
    if (opts.action) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ui-toast__act';
      b.innerHTML = (opts.action.icon ? ic(opts.action.icon) : '') + esc(opts.action.label);
      b.onclick = function () { fechar(); opts.action.fn(); };
      el.appendChild(b);
    }
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'ui-toast__x';
    x.setAttribute('aria-label', 'Fechar aviso');
    x.innerHTML = ic('x');
    x.onclick = fechar;
    el.appendChild(x);
    pilha.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-in'); });
    var t = setTimeout(fechar, opts.duration || (tipo === 'error' ? 7000 : opts.action ? 8000 : 4200));
    function fechar() {
      clearTimeout(t);
      el.classList.remove('is-in');
      setTimeout(function () { el.remove(); }, 220);
    }
    return fechar;
  }

  /* ---------------- Diálogo modal ---------------- */
  function dialog(o) {
    return new Promise(function (resolve) {
      var anterior = document.activeElement;
      var fundo = document.createElement('div');
      fundo.className = 'ui-modal';
      var caixa = document.createElement('div');
      caixa.className = 'ui-modal__box' + (o.wide ? ' ui-modal__box--wide' : '');
      caixa.setAttribute('role', 'dialog');
      caixa.setAttribute('aria-modal', 'true');
      caixa.setAttribute('aria-labelledby', 'uiModalTitulo');
      caixa.innerHTML =
        '<div class="ui-modal__head">' +
          (o.icon ? '<span class="ui-modal__icon' + (o.tone ? ' is-' + o.tone : '') + '">' + ic(o.icon) + '</span>' : '') +
          '<div class="ui-modal__ttl"><h2 id="uiModalTitulo">' + esc(o.title) + '</h2>' +
          (o.subtitle ? '<p>' + esc(o.subtitle) + '</p>' : '') + '</div>' +
          '<button type="button" class="ui-modal__x" aria-label="Fechar">' + ic('x') + '</button>' +
        '</div><div class="ui-modal__body"></div><div class="ui-modal__foot"></div>';
      var corpo = caixa.querySelector('.ui-modal__body');
      if (typeof o.body === 'string') corpo.innerHTML = o.body;
      else if (o.body) corpo.appendChild(o.body);
      if (!o.body) corpo.remove();

      var rodape = caixa.querySelector('.ui-modal__foot');
      (o.actions || [{ label: 'OK', value: true, primary: true }]).forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ui-btn' + (a.primary ? ' ui-btn--primary' : '') + (a.danger ? ' ui-btn--danger' : '');
        b.innerHTML = (a.icon ? ic(a.icon) : '') + '<span>' + esc(a.label) + '</span>';
        b.onclick = function () {
          var v = typeof a.value === 'function' ? a.value(caixa) : a.value;
          if (v === undefined && typeof a.value === 'function') return; // validação falhou: mantém aberto
          fechar(v);
        };
        if (a.primary) b.dataset.primary = '1';
        rodape.appendChild(b);
      });

      function fechar(v) {
        document.removeEventListener('keydown', tecla, true);
        fundo.classList.remove('is-in');
        setTimeout(function () { fundo.remove(); }, 180);
        if (anterior && anterior.focus) try { anterior.focus(); } catch (e) {}
        resolve(v === undefined ? null : v);
      }
      function tecla(e) {
        if (e.key === 'Escape') { e.preventDefault(); fechar(null); }
        else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.isComposing) {
          var p = rodape.querySelector('[data-primary]');
          if (p && !p.disabled) { e.preventDefault(); p.click(); }
        } else if (e.key === 'Tab') {
          var f = caixa.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
          f = Array.prototype.filter.call(f, function (el) { return !el.disabled && el.offsetParent !== null; });
          if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
      }
      caixa.querySelector('.ui-modal__x').onclick = function () { fechar(null); };
      fundo.addEventListener('mousedown', function (e) { if (e.target === fundo) fechar(null); });
      document.addEventListener('keydown', tecla, true);

      fundo.appendChild(caixa);
      document.body.appendChild(fundo);
      requestAnimationFrame(function () { fundo.classList.add('is-in'); });
      var foco = caixa.querySelector('[autofocus]') || caixa.querySelector('input') || rodape.querySelector('[data-primary]');
      if (foco) setTimeout(function () { foco.focus(); if (foco.select) foco.select(); }, 30);
      if (o.onOpen) o.onOpen(caixa, fechar);
    });
  }

  function confirmar(titulo, texto, opts) {
    opts = opts || {};
    return dialog({
      title: titulo,
      body: texto ? '<p class="ui-modal__p">' + esc(texto) + '</p>' : '',
      icon: opts.icon || (opts.danger ? 'alert' : 'info'),
      tone: opts.danger ? 'danger' : '',
      actions: [
        { label: opts.cancel || 'Cancelar', value: false },
        { label: opts.ok || 'Confirmar', value: true, primary: !opts.danger, danger: !!opts.danger, icon: opts.okIcon }
      ]
    }).then(function (v) { return v === true; });
  }

  /* ---------------- Botão ocupado ---------------- */
  function busy(btn, texto) {
    if (!btn) return function () {};
    var antes = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = ic('spinner', 'ic-spin') + '<span>' + esc(texto || 'Aguarde...') + '</span>';
    return function () {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.innerHTML = antes;
    };
  }

  /* ---------------- Campos de senha ---------------- */
  function melhorarSenha(input) {
    if (input.dataset.uiSenha) return;
    input.dataset.uiSenha = '1';
    var caixa = document.createElement('div');
    caixa.className = 'ui-pass';
    input.parentNode.insertBefore(caixa, input);
    caixa.appendChild(input);
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ui-pass__eye';
    b.setAttribute('aria-label', 'Mostrar senha');
    b.title = 'Mostrar senha';
    b.tabIndex = 0;
    b.innerHTML = ic('eye');
    b.addEventListener('click', function () {
      var ver = input.type === 'password';
      input.type = ver ? 'text' : 'password';
      b.innerHTML = ic(ver ? 'eye-off' : 'eye');
      b.setAttribute('aria-label', ver ? 'Esconder senha' : 'Mostrar senha');
      b.title = ver ? 'Esconder senha' : 'Mostrar senha';
      input.focus();
    });
    caixa.appendChild(b);

    var aviso = document.createElement('div');
    aviso.className = 'ui-caps';
    aviso.innerHTML = ic('alert') + 'Caps Lock está ligado';
    caixa.parentNode.insertBefore(aviso, caixa.nextSibling);
    function caps(e) {
      if (e.getModifierState) aviso.classList.toggle('is-on', e.getModifierState('CapsLock'));
    }
    input.addEventListener('keydown', caps);
    input.addEventListener('keyup', caps);
    input.addEventListener('blur', function () { aviso.classList.remove('is-on'); });
  }

  /* ---------------- Força da senha + conferência ---------------- */
  function medidorSenha(senha, confirma, medidor, confere) {
    if (!senha) return;
    var NIVEIS = ['Muito curta', 'Fraca', 'Razoável', 'Boa', 'Forte'];
    function nota(v) {
      if (v.length < 6) return 0;
      var n = 1;
      if (v.length >= 10) n++;
      if (/[a-z]/.test(v) && /[A-Z]/.test(v)) n++;
      if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) n++;
      else if (/\d/.test(v) || /[^A-Za-z0-9]/.test(v)) n += 0.5;
      return Math.min(4, Math.floor(n));
    }
    function atualizar() {
      var v = senha.value;
      if (medidor) {
        if (!v) { medidor.innerHTML = ''; medidor.removeAttribute('data-n'); }
        else {
          var n = nota(v);
          medidor.setAttribute('data-n', n);
          medidor.innerHTML = '<span class="pw-bars"><i></i><i></i><i></i><i></i></span><span class="pw-lbl">' +
            NIVEIS[n] + (n === 0 ? ' (mínimo de 6 caracteres)' : '') + '</span>';
        }
      }
      if (confere && confirma) {
        var c = confirma.value;
        if (!c) { confere.innerHTML = ''; confere.className = 'pw-match'; }
        else if (c === v) { confere.className = 'pw-match is-ok'; confere.innerHTML = ic('check') + 'As senhas conferem'; }
        else { confere.className = 'pw-match is-bad'; confere.innerHTML = ic('x') + 'As senhas ainda não conferem'; }
      }
    }
    senha.addEventListener('input', atualizar);
    if (confirma) confirma.addEventListener('input', atualizar);
    atualizar();
  }

  /* ---------------- Entrar com Google / Microsoft ---------------- */
  var LOGO_GOOGLE = '<svg class="ic ic-brand" viewBox="0 0 48 48" aria-hidden="true">' +
    '<path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.4 0 24 0 14.6 0 6.6 5.4 2.6 13.3l8 6.2C12.5 13.6 17.8 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/>' +
    '<path fill="#FBBC05" d="M10.5 28.5A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.8-4.5l-8-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.2z"/>' +
    '<path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.8l-8 6.2C6.6 42.6 14.6 48 24 48z"/></svg>';
  var LOGO_MICROSOFT = '<svg class="ic ic-brand" viewBox="0 0 23 23" aria-hidden="true">' +
    '<path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M12 1h10v10H12z"/>' +
    '<path fill="#00A4EF" d="M1 12h10v10H1z"/><path fill="#FFB900" d="M12 12h10v10H12z"/></svg>';

  // Mostra os botões só dos provedores configurados no servidor
  function botoesSocial(host, verbo) {
    if (!host) return;
    fetch('/api/oauth-providers').then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) {
      var itens = [];
      if (d.google) itens.push(['google', LOGO_GOOGLE, verbo + ' com Google']);
      if (d.microsoft) itens.push(['microsoft', LOGO_MICROSOFT, verbo + ' com Microsoft']);
      if (!itens.length) return;
      host.innerHTML = '<div class="social-sep"><span>ou</span></div>' + itens.map(function (i) {
        return '<a class="social-btn" href="/api/oauth-start?p=' + i[0] + '">' + i[1] + '<span>' + esc(i[2]) + '</span></a>';
      }).join('');
      host.hidden = false;
      host.querySelectorAll('.social-btn').forEach(function (a) {
        a.addEventListener('click', function () {
          a.classList.add('is-busy');
          a.querySelector('span').textContent = 'Abrindo...';
        });
      });
    }).catch(function () {});
  }

  /* ---------------- Sessão (leitura local do token) ---------------- */
  function sessao() {
    try {
      var t = localStorage.getItem('session_token');
      if (!t || t.indexOf('.') === -1) return null;
      var b64 = t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var p = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (!p.exp || Date.now() > p.exp) return null;
      p.token = t;
      return p;
    } catch (e) { return null; }
  }

  /* ---------------- Catálogo de listas (igual ao do servidor) ---------------- */
  var LISTAS = {
    regional:        { url: '/listaregional.html',      label: 'Regional',                     tipo: 'regional', desc: 'Lista de serviços de toda a regional' },
    campomourao:     { url: '/listacampomourao.html',   label: 'Campo Mourão',                 tipo: 'local',    desc: 'Lista de serviços da localidade' },
    cianorte:        { url: '/listacianorte.html',      label: 'Cianorte',                     tipo: 'local',    desc: 'Lista de serviços da localidade' },
    ubirata:         { url: '/listaubirata.html',       label: 'Ubiratã',                      tipo: 'local',    desc: 'Lista de serviços da localidade' },
    pitanga:         { url: '/listapitanga.html',       label: 'Pitanga',                      tipo: 'local',    desc: 'Lista de serviços da localidade' },
    goioere:         { url: '/listagoioere.html',       label: 'Goioerê',                      tipo: 'local',    desc: 'Lista de serviços da localidade' },
    ivaipora:        { url: '/listaivaipora.html',      label: 'Ivaiporã',                     tipo: 'local',    desc: 'Lista de serviços da localidade' },
    calendario:      { url: '/calendario-ensaios.html', label: 'Calendário dos Ensaios',       tipo: 'cal',      desc: 'Ensaios locais da regional' },
    calendarioanual: { url: '/calendario-reunioes.html',label: 'Calendário Anual de Reuniões', tipo: 'cal',      desc: 'Reuniões do ano, com capa, legenda e feriados' }
  };

  // Para onde levar quem já está com a sessão aberta
  function destino(p) {
    if (!p) return '/login.html';
    if (p.role === 'admin') return '/admin.html';
    var ls = (p.lists || []).filter(function (k) { return LISTAS[k]; });
    if (ls.length === 1) return LISTAS[ls[0]].url;
    if (ls.length > 1) return '/minhas-listas.html';
    return '/login.html';
  }

  function sair() {
    localStorage.removeItem('session_token');
    location.href = '/login.html';
  }

  // Guarda a última lista aberta, para destacar no catálogo
  (function () {
    var aqui = location.pathname;
    Object.keys(LISTAS).forEach(function (k) {
      if (LISTAS[k].url === aqui) {
        try { localStorage.setItem('ultima_lista', JSON.stringify({ k: k, t: Date.now() })); } catch (e) {}
      }
    });
  })();
  function ultimaLista() {
    try { return JSON.parse(localStorage.getItem('ultima_lista') || 'null'); } catch (e) { return null; }
  }

  window.UI = {
    ic: ic, esc: esc, toast: toast, dialog: dialog, confirm: confirmar, busy: busy,
    sessao: sessao, melhorarSenha: melhorarSenha, medidorSenha: medidorSenha, pronto: quandoPronto,
    LISTAS: LISTAS, destino: destino, sair: sair, ultimaLista: ultimaLista, botoesSocial: botoesSocial
  };

  quandoPronto(function () {
    document.querySelectorAll('input[type=password]:not([data-sem-olho])').forEach(melhorarSenha);
  });
})();
