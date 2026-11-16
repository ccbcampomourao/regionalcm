/* Abas (Tabelas / Configurações), menus e o aviso "Salvo" das telas de edição. */
(function () {
  'use strict';
  var CHAVE = 'ed2_aba_' + location.pathname.replace(/\W+/g, '_');
  function aba(qual) {
    document.querySelectorAll('.abas [data-aba]').forEach(function (b) { b.classList.toggle('on', b.dataset.aba === qual); });
    document.querySelectorAll('.aba[data-aba-de]').forEach(function (s) { s.hidden = s.dataset.abaDe !== qual; });
    try { localStorage.setItem(CHAVE, qual); } catch (e) {}
    var fp = document.getElementById('formPanel');
    if (fp && fp.getBoundingClientRect().top < 0) fp.scrollIntoView({ block: 'start' });
  }
  function togMenu(ev, id) {
    ev.stopPropagation();
    document.querySelectorAll('.menu.open').forEach(function (m) { if (m.id !== id) m.classList.remove('open'); });
    document.getElementById(id).classList.toggle('open');
  }
  document.addEventListener('click', function (e) {
    var box = e.target.closest && e.target.closest('.menu-box');
    if (box) { if (e.target.closest('button')) box.closest('.menu').classList.remove('open'); return; }
    document.querySelectorAll('.menu.open').forEach(function (m) { m.classList.remove('open'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('.menu.open').forEach(function (m) { m.classList.remove('open'); });
  });
  function marcarSalvo() {
    var el = document.getElementById('salvo'); if (!el) return;
    el.classList.remove('pulsa'); void el.offsetWidth; el.classList.add('pulsa');
  }
  window.aba = aba; window.togMenu = togMenu; window.marcarSalvo = marcarSalvo;
  document.addEventListener('DOMContentLoaded', function () {
    var q = null; try { q = localStorage.getItem(CHAVE); } catch (e) {}
    if (q && document.querySelector('.abas [data-aba="' + q + '"]')) aba(q);
  });
})();
