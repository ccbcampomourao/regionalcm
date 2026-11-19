/* ============================================================
   Quem mais está com o mesmo arquivo aberto.

   Presenca.entrar(regiao, nome)  ao abrir/trocar de arquivo
   Presenca.info()                consulta (sem gravar): { outros, modificado, por }
   Presenca.sair()                ao fechar

   Para gastar pouco do Cloudflare:
   - só grava ao abrir, ao fechar e, enquanto a pessoa está mexendo,
     no máximo uma vez a cada 4 minutos;
   - parado ou com a aba escondida, só consulta a cada 4 minutos (leitura).
   Mostra um aviso ao lado do menu Arquivo quando outra pessoa está no mesmo arquivo.
   ============================================================ */
(function () {
  'use strict';
  var INTERVALO = 4 * 60 * 1000;
  var atual = null, outros = [], ultimoGravado = 0, ultimaConsulta = 0, mexeu = false, ultimaInfo = null, avisados = {};

  function token() { try { return localStorage.getItem('session_token'); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hora(ms) { return ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; }
  function quem(e) { return String(e || 'alguém').split('@')[0]; }

  async function chamar(acao, alvo, keepalive) {
    alvo = alvo || atual; if (!alvo || !token()) return null;
    var r = await fetch('/api/presenca', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: !!keepalive,
      body: JSON.stringify({ token: token(), regiao: alvo.regiao, nome: alvo.nome, acao: acao })
    });
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }

  function host() {
    var el = document.getElementById('presenca');
    if (el) return el;
    var ref = document.getElementById('menuArq') || document.getElementById('btnListaSalvar');
    el = document.createElement('span');
    el.id = 'presenca'; el.className = 'presenca'; el.hidden = true;
    if (ref && ref.parentNode) ref.parentNode.insertBefore(el, ref);
    else { el.style.cssText = 'position:fixed;top:72px;right:12px;z-index:9999'; document.body.appendChild(el); }
    if (!document.getElementById('presencaCss')) {
      var st = document.createElement('style'); st.id = 'presencaCss';
      st.textContent = '.presenca{display:inline-flex;align-items:center;gap:6px;font:600 12.5px Inter,Arial,sans-serif;color:#7a4a12;background:#fdf0dc;border:1px solid #efcf98;border-radius:999px;padding:5px 11px;max-width:280px;cursor:default}' +
        '.presenca[hidden]{display:none!important}.presenca svg.ic{width:15px;height:15px;flex:none}.presenca span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '@media (max-width:640px){.presenca{max-width:150px;padding:5px 9px}}';
      document.head.appendChild(st);
    }
    return el;
  }
  function mostrar() {
    var el = host(); if (!el) return;
    if (!outros.length) { el.hidden = true; return; }
    var nomes = outros.map(function (o) { return quem(o.email); });
    el.hidden = false;
    el.title = outros.map(function (o) { return o.email + ' — aberto desde ' + hora(o.desde) + ', último sinal ' + hora(o.visto); }).join('\n') +
      '\nSe os dois salvarem, o último substitui o do outro. Combinem quem vai salvar.';
    el.innerHTML = (window.ic ? window.ic('users') : '') + '<span>' + esc(nomes.length === 1 ? nomes[0] + ' também está neste arquivo' : nomes.length + ' pessoas também estão neste arquivo') + '</span>';
    outros.forEach(function (o) {
      if (avisados[o.email]) return; avisados[o.email] = 1;
      if (window.UI && UI.toast) UI.toast(o.email + ' também está com este arquivo aberto (desde ' + hora(o.desde) + '). Se os dois salvarem, o último substitui o do outro: combinem quem vai salvar.', { type: 'info', duration: 12000 });
    });
  }
  function aplicar(i) {
    if (!i) return i;
    ultimaInfo = i;
    outros = i.outros || [];
    var vivos = {}; outros.forEach(function (o) { vivos[o.email] = 1; });
    Object.keys(avisados).forEach(function (k) { if (!vivos[k]) delete avisados[k]; }); // saiu: avisa de novo se voltar
    mostrar();
    return i;
  }

  async function entrar(regiao, nome) {
    if (!regiao || !nome) return null;
    if (atual && (atual.regiao !== regiao || atual.nome !== nome)) sair();
    atual = { regiao: regiao, nome: nome };
    outros = []; avisados = {}; mostrar();
    try { var i = aplicar(await chamar('entrar')); ultimoGravado = ultimaConsulta = Date.now(); mexeu = false; return i; } catch (e) { return null; }
  }
  async function info() {
    if (!atual) return null;
    try { var i = aplicar(await chamar('info')); ultimaConsulta = Date.now(); return i; } catch (e) { return null; }
  }
  function sair() {
    if (!atual) return;
    var a = atual; atual = null; outros = []; mostrar();
    try { chamar('sair', a, true).catch(function () {}); } catch (e) {}
  }

  // mexendo agora (só conta para "continua no arquivo")
  ['input', 'change', 'keydown', 'pointerdown'].forEach(function (ev) { document.addEventListener(ev, function () { mexeu = true; }, { capture: true, passive: true }); });
  setInterval(function () {
    if (!atual || document.visibilityState !== 'visible') return;
    var agora = Date.now();
    if (mexeu && agora - ultimoGravado >= INTERVALO) {
      mexeu = false;
      chamar('ping').then(function (i) { aplicar(i); ultimoGravado = ultimaConsulta = Date.now(); }).catch(function () {});
    } else if (agora - ultimaConsulta >= INTERVALO) {
      ultimaConsulta = agora;
      chamar('info').then(aplicar).catch(function () {});
    }
  }, 30000);
  var ultimoAlvo = null;
  window.addEventListener('pagehide', function () { ultimoAlvo = atual; sair(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted && ultimoAlvo && !atual) entrar(ultimoAlvo.regiao, ultimoAlvo.nome); });

  // consulta outro arquivo sem gravar presença (ex.: antes de salvar com outro nome)
  async function consultar(regiao, nome) {
    if (atual && atual.regiao === regiao && atual.nome === nome) return info();
    return chamar('info', { regiao: regiao, nome: nome });
  }
  window.Presenca = { entrar: entrar, info: info, sair: sair, consultar: consultar, outros: function () { return outros.slice(); }, ultima: function () { return ultimaInfo; } };
})();
