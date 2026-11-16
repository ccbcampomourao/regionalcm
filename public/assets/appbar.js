/* ============================================================
   Barra de aplicativo (só no celular): os botões principais da
   tela ficam fixos embaixo. Cada página chama
     AppBar.montar([{ ic, rot, fn, ativo, menu, destaque }])
   - fn        o que fazer ao tocar
   - ativo()   diz se o item está "ligado" (opcional)
   - menu      seletor de um .menu-box já existente na página: os
               botões dele aparecem numa folha que sobe de baixo
   - destaque  botão principal (PDF)
   Não mexe em PDF nem em pré-visualização: só chama o que a
   página já tinha.
   ============================================================ */
(function () {
  'use strict';
  var ic = function (n) { return window.ic ? window.ic(n) : '<svg class="ic" aria-hidden="true"><use href="/assets/icons.svg#i-' + n + '"></use></svg>'; };
  var itens = [], bar = null, folha = null;

  function pintar() {
    if (!bar) return;
    var algum = false;
    Array.prototype.forEach.call(bar.children, function (b, i) {
      var it = itens[i], on = false;
      try { on = !!(it.ativo && it.ativo()); } catch (e) {}
      b.classList.toggle('on', on && !algum);
      if (on) algum = true;
    });
  }
  function fecharFolha() {
    if (!folha) return;
    var f = folha; folha = null;
    f.classList.remove('aberta');
    setTimeout(function () { f.remove(); }, 180);
  }
  function abrirFolha(it) {
    fecharFolha();
    var origem = document.querySelector(it.menu); if (!origem) return;
    var f = document.createElement('div'); f.className = 'appsheet';
    var caixa = document.createElement('div'); caixa.className = 'appsheet-box'; caixa.setAttribute('role', 'menu');
    caixa.innerHTML = '<div class="appsheet-tit">' + (it.titulo || it.rot) + '</div>';
    Array.prototype.forEach.call(origem.children, function (el) {
      if (el.tagName === 'HR') { caixa.appendChild(document.createElement('hr')); return; }
      if (el.tagName !== 'BUTTON' || el.hidden || el.style.display === 'none') return;
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
      b.className = el.classList.contains('danger') ? 'danger' : '';
      b.innerHTML = el.innerHTML; b.disabled = el.disabled;
      b.onclick = function () { fecharFolha(); el.click(); };
      caixa.appendChild(b);
    });
    f.appendChild(caixa);
    f.onclick = function (e) { if (e.target === f) fecharFolha(); };
    document.body.appendChild(f); folha = f;
    requestAnimationFrame(function () { f.classList.add('aberta'); });
  }
  function montar(lista) {
    itens = (lista || []).filter(Boolean);
    if (bar) bar.remove();
    bar = document.createElement('nav'); bar.className = 'appbar'; bar.setAttribute('aria-label', 'Ações da tela');
    itens.forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = it.destaque ? 'destaque' : '';
      b.innerHTML = ic(it.ic) + '<span>' + it.rot + '</span>';
      b.onclick = function () {
        if (it.menu) { abrirFolha(it); return; }
        fecharFolha();
        try { it.fn && it.fn(); } catch (e) { console.error(e); }
        setTimeout(pintar, 60);
      };
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
    document.body.classList.add('tem-appbar');
    pintar();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharFolha(); });
  // o estado "ligado" acompanha a página (abas, pré-visualização aberta, ficha aberta...)
  try {
    new MutationObserver(function () { pintar(); }).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class', 'hidden'] });
  } catch (e) {}
  window.AppBar = { montar: montar, atualizar: pintar, fechar: fecharFolha };
})();
