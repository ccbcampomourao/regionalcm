/* ============================================================
   Lista de Serviços: modelo NOVO (preto e branco)

   Funciona assim:
   - A página continua montando a folha do jeito de sempre
     (buildDocumentHTMLClassico). Se o modelo escolhido for "Atual",
     nada muda: a folha sai exatamente igual.
   - Se for "Novo", este arquivo pega essa mesma folha e só troca o
     visual por cima (estilo, cabeçalho e "Atende" numa coluna só).
     A divisão de páginas, a pré-visualização e a impressão continuam
     usando o mesmo motor de antes.
   ============================================================ */
(function () {
  'use strict';

  var LOGO = 'data:image/png;base64,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';
  var CHAVE_PREF = 'lista_modelo_preferido';

  /* ---------------- Qual modelo está ativo ---------------- */
  // STATE é declarado com "let" na página: não aparece em window, mas é acessível pelo nome.
  function estado() { try { return typeof STATE !== 'undefined' ? STATE : null; } catch (e) { return null; } }

  function ativo() {
    var st = estado();
    var m = st && st.meta && st.meta.modelo;
    if (m === 'novo' || m === 'atual') return m;
    try { return localStorage.getItem(CHAVE_PREF) === 'novo' ? 'novo' : 'atual'; } catch (e) { return 'atual'; }
  }

  function escolher(m) {
    var st = estado();
    if (!st) return;
    st.meta = st.meta || {};
    st.meta.modelo = m;
    try { localStorage.setItem(CHAVE_PREF, m); } catch (e) {}
    sincronizarBotoes();
    if (typeof saveState === 'function') saveState();
    if (typeof renderPreview === 'function') renderPreview();
  }

  function sincronizarBotoes() {
    var m = ativo();
    document.querySelectorAll('[data-modelo]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-modelo') === m ? 'true' : 'false');
    });
  }

  /* ---------------- Utilidades ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var MINUSCULAS = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1 };
  function tituloBonito(s) {
    return String(s || '').toLowerCase().split(' ').map(function (p, i) {
      if (i > 0 && MINUSCULAS[p]) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join(' ').replace(/ - (Pr|Sp|Sc|Ms)$/i, function (x) { return x.toUpperCase(); });
  }
  function valor(id, padrao) {
    var el = document.getElementById(id);
    return (el && el.value) || padrao;
  }

  var ROTULOS = {
    'DATA': 'col-data', 'HORA': 'col-hora', 'LOCAL': 'col-local', 'EVENTO': 'col-evento',
    'CONVOCADOS': 'col-conv', 'ENDEREÇO': 'col-end', 'REFEIÇÃO': 'col-ref', 'PARTICIPANTES': 'col-part',
    'CATEGORIA': 'col-cat', 'ATENDE': 'col-atende', 'OBREIROS QUE ATENDEM': 'col-atende'
  };

  /* Linha de cabeçalho das colunas (a que não é título da seção nem da cidade) */
  function linhaColunas(table) {
    var thead = table.tHead;
    if (!thead) return null;
    var linhas = Array.prototype.slice.call(thead.rows).reverse();
    for (var i = 0; i < linhas.length; i++) {
      var r = linhas[i];
      var ehTitulo = Array.prototype.some.call(r.cells, function (c) {
        return c.classList.contains('table-title') || c.classList.contains('table-title-cidade') || c.classList.contains('table-title-cidade-rest');
      });
      if (!ehTitulo) return r;
    }
    return null;
  }

  /* Posição (coluna inicial) de cada célula do corpo, considerando rowspan */
  function posicoes(tbody) {
    var ocupado = {};
    return Array.prototype.map.call(tbody.rows, function (tr, r) {
      var c = 0, res = [];
      Array.prototype.forEach.call(tr.cells, function (td) {
        while (ocupado[r] && ocupado[r][c]) c++;
        var cs = td.colSpan || 1, rs = td.rowSpan || 1;
        res.push({ td: td, start: c, span: cs });
        for (var k = 1; k < rs; k++) {
          ocupado[r + k] = ocupado[r + k] || {};
          for (var j = 0; j < cs; j++) ocupado[r + k][c + j] = true;
        }
        c += cs;
      });
      return res;
    });
  }

  /* ---------------- Transformação de cada tabela ---------------- */
  function ajustarTabela(table) {
    var hdr = linhaColunas(table);
    var tbody = table.tBodies[0];
    if (!hdr || !tbody) return;
    hdr.classList.add('nv-hd');

    // mapa das colunas pelo cabeçalho
    var cols = [], pos = 0;
    Array.prototype.forEach.call(hdr.cells, function (th) {
      var span = th.colSpan || 1;
      var rot = th.textContent.trim().toUpperCase();
      cols.push({ th: th, start: pos, span: span, rotulo: rot });
      if (ROTULOS[rot]) th.classList.add('h-' + ROTULOS[rot]);
      pos += span;
    });
    function colDe(start) {
      for (var i = 0; i < cols.length; i++) if (start >= cols[i].start && start < cols[i].start + cols[i].span) return cols[i];
      return null;
    }

    // "Atende": várias colunas viram uma só, com os nomes separados por " · "
    var atende = cols.filter(function (c) { return ROTULOS[c.rotulo] === 'col-atende'; })[0];
    var linhasPos = posicoes(tbody);
    if (atende && atende.span > 1) {
      var reduz = atende.span - 1;
      linhasPos.forEach(function (cells) {
        var dentro = cells.filter(function (x) { return x.start >= atende.start && x.start < atende.start + atende.span; });
        if (!dentro.length) return;
        var nomes = [];
        dentro.forEach(function (x) {
          var t = x.td.textContent.trim();
          if (t && t !== '-') nomes.push(esc(t));
        });
        var novo = dentro[0].td;
        novo.colSpan = 1;
        novo.innerHTML = nomes.length ? nomes.join('<span class="nv-sep"> · </span>') : '—';
        dentro.slice(1).forEach(function (x) { x.td.remove(); });
      });
      atende.th.colSpan = 1;
      Array.prototype.forEach.call(table.tHead.rows, function (r) {
        Array.prototype.forEach.call(r.cells, function (c) {
          if (c.classList.contains('table-title') || c.classList.contains('table-title-cidade-rest')) {
            c.colSpan = Math.max(1, (c.colSpan || 1) - reduz);
          }
        });
      });
      linhasPos = posicoes(tbody);
      // recalcula o mapa (Atende agora ocupa 1 coluna)
      atende.span = 1;
    }

    // classes por coluna (data, dia, hora, local...) para o estilo
    linhasPos.forEach(function (cells) {
      cells.forEach(function (x) {
        var col = colDe(x.start);
        if (!col) return;
        var cls = ROTULOS[col.rotulo];
        if (cls === 'col-data' && x.start > col.start) cls = 'col-dia';
        if (cls) x.td.classList.add(cls);
        // complemento entre parênteses (ex.: "Sala de Reunião", moradores) numa linha menor
        if (cls === 'col-local' || cls === 'col-end') {
          x.td.innerHTML = x.td.innerHTML.replace(/<br>\s*(\([\s\S]*)$/, '<small>$1</small>');
        }
        if (cls === 'col-atende' && (!atende || atende.span === 1)) {
          var t = x.td.textContent.trim();
          if (t === '-' || t === '') x.td.textContent = '—';
        }
      });
    });
  }

  /* ---------------- Aplica o modelo novo na folha ---------------- */
  function aplicar(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');

    // 1) estilo (vai no 1º <style>, que é o mesmo usado na pré-visualização)
    var st = doc.querySelector('style');
    if (st) st.textContent = IMPORT_FONTES + st.textContent + CSS_NOVO;

    // 2) cabeçalho
    var cab = doc.querySelector('.doc-header');
    if (cab) {
      var titulo = valor('meta_titulo', 'LISTA DE SERVIÇOS');
      var regiao = valor('meta_regiao', 'CAMPO MOURÃO - PR');
      var periodo = valor('meta_periodo', '');
      var partes = periodo.split(' - ');
      cab.innerHTML =
        '<img class="nv-logo" src="' + LOGO + '" alt="">' +
        '<div class="nv-tx"><div class="nv-org">Congregação Cristã no Brasil</div>' +
        '<div class="nv-ttl">' + esc(tituloBonito(titulo)) + '</div>' +
        '<div class="nv-reg">Região de ' + esc(tituloBonito(regiao)) + '</div></div>' +
        (periodo ? '<div class="nv-per"><small>' + esc((partes[0] || '').replace('/', ' / ')) + '</small><b>' + esc(partes[1] || '') + '</b></div>' : '');
    }

    // 3) tabelas
    doc.querySelectorAll('.table-wrapper table').forEach(ajustarTabela);

    // 4) avisos: títulos "-{ASSUNTO}-" viram subtítulos
    doc.querySelectorAll('th.avisos-title').forEach(function (th) {
      var w = th.closest('.table-wrapper');
      if (w) w.classList.add('nv-avisos');
    });
    doc.querySelectorAll('.nv-avisos td p').forEach(function (p) {
      var m = p.textContent.trim().match(/^-\{(.+)\}-$/);
      if (m) { p.textContent = m[1]; p.classList.add('aviso-tit'); }
    });

    return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
  }

  var IMPORT_FONTES = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Lora:wght@600&display=swap');\n";

  var CSS_NOVO = '\n' + [
    '/* ================= MODELO NOVO (preto e branco) ================= */',
    'body{ font-family:"Inter", Arial, Helvetica, sans-serif; color:#000; }',
    '.page-border{ display:none !important; }',
    '.spacer{ height:7mm; }',
    '.content-padding{ padding:0 7mm; }',

    /* cabeçalho */
    '.doc-header{ position:relative; display:flex; align-items:center; gap:3.5mm; text-align:left; border:none; outline:none; padding:0 0 1.6mm; margin:0; border-bottom:1.2pt solid #000; }',
    '.doc-header::after{ content:""; position:absolute; z-index:2; left:0; bottom:-1.5mm; width:30mm; border-top:2pt solid #000; }',
    '.nv-logo{ height:10mm; width:auto; flex:none; }',
    '.nv-tx{ flex:1; min-width:0; }',
    '.nv-org{ font-size:6.4pt; font-weight:700; letter-spacing:.24em; text-transform:uppercase; }',
    '.nv-ttl{ margin-top:.6mm; font-family:"Lora", Georgia, serif; font-weight:600; font-size:15pt; line-height:1; }',
    '.nv-reg{ margin-top:.8mm; font-size:7.6pt; color:#333; }',
    '.nv-per{ flex:none; border:1.2pt solid #000; border-radius:1.6mm; padding:1.4mm 3.6mm; text-align:center; }',
    '.nv-per small{ display:block; font-size:6.2pt; font-weight:700; letter-spacing:.16em; }',
    '.nv-per b{ display:block; font-family:"Lora", Georgia, serif; font-size:15pt; font-weight:600; line-height:1.05; }',

    /* blocos e tabelas */
    '.table-wrapper, .section-title-block, .avisos-container{ outline:none !important; border:none !important; margin:0 !important; }',
    'table{ border-collapse:collapse; border:none !important; border-spacing:0; }',
    'th, td{ border:none; border-bottom:.5pt solid #9a9a9a; text-align:left; padding:.4mm 1.6mm; font-size:8pt; font-weight:400; color:#000; line-height:1.2; vertical-align:middle; }',
    'th.table-title, th.table-title.avisos-title{ background:#e3e3e3 !important; color:#000 !important; text-align:left; font-size:8pt; font-weight:700; letter-spacing:.12em; text-transform:uppercase; padding:.9mm 2.4mm; box-shadow:inset 3pt 0 0 #000, inset 0 1pt 0 #000; border-top:2.6mm solid #fff; border-bottom:none; }',
    /* larguras: data/dia/hora fixas; local e convocados com espaço suficiente; o resto divide */
    'table{ table-layout:auto; width:100%; }',
    'tr.nv-hd th.h-col-local{ width:42mm !important; }',
    'tr.nv-hd th.h-col-conv{ width:50mm !important; }',
    'tr.nv-hd th.h-col-end{ width:66mm !important; }',
    'tr.nv-hd th.h-col-hora{ width:10mm !important; }',
    'tr.nv-hd th{ min-width:0 !important; max-width:none !important; }',
    'tr.nv-hd th.h-col-evento{ width:auto !important; }',
    'tr.nv-hd th{ background:#fff; color:#000; font-size:6.2pt; font-weight:700; letter-spacing:.14em; text-transform:uppercase; padding:.8mm 1.6mm; border-bottom:1pt solid #000; }',
    'tbody tr:nth-child(even) td{ background:#f1f1f1; }',
    'td.col-data{ font-weight:700; white-space:nowrap; width:10mm !important; max-width:none !important; }',
    'td.col-dia{ color:#333; font-size:7.2pt; white-space:nowrap; width:7mm !important; max-width:none !important; padding-left:0; }',
    'td.col-hora{ font-weight:600; white-space:nowrap; }',
    'td.col-local, td.col-evento{ font-weight:600; }',
    'td.col-conv{ font-style:italic; font-size:7.6pt; }',
    'td.col-end{ font-size:7.8pt; }',
    'td small{ display:block; font-weight:400; font-size:6.8pt; color:#333; line-height:1.15; }',
    '.nv-sep{ font-weight:700; }',

    /* evangelização: cidade */
    'th.table-title-cidade{ background:#fff !important; color:#000; font-style:normal; font-size:8.4pt; font-weight:700; letter-spacing:.12em; text-transform:uppercase; text-align:left; padding:1.2mm 0 .6mm; border-top:2.2mm solid #fff; border-bottom:1.4pt solid #000; }',
    'th.table-title-cidade-rest{ background:#fff !important; border-top:2.2mm solid #fff; border-bottom:1.4pt solid #000; }',

    /* legenda */
    '.legenda-container{ gap:.6mm 3.4mm; margin:0 !important; padding:1mm 0 0; }',
    '.legenda-item{ font-size:6.6pt; font-weight:400; color:#000; text-transform:uppercase; letter-spacing:.03em; gap:1mm; }',
    '.legenda-chip{ text-transform:none; background:#fff; color:#000; border:.8pt solid #000; border-radius:.9mm; padding:.1mm 1.1mm; font-size:6.4pt; font-weight:700; }',

    /* avisos */
    '.nv-avisos td{ border:.8pt solid #000; border-top:none; padding:.6mm 3mm 1mm !important; background:#fff !important; }',
    '.nv-avisos td p{ font-size:7.3pt !important; line-height:1.25; margin:.15mm 0 !important; }',
    '.nv-avisos td p.aviso-tit{ font-weight:800 !important; font-size:7pt !important; letter-spacing:.1em; text-transform:uppercase; margin-top:.5mm !important; }',
    '.aviso-divider{ border-top:.7pt dashed #555 !important; margin:1mm 0 !important; }',

    /* rodapés */
    '.fixed-footer-left{ left:7mm; right:7mm; bottom:2.4mm; border-top:.6pt solid #000; padding-top:1mm; font-size:6.8pt; font-weight:400; font-style:italic; color:#000; }',
    '.fixed-footer-right{ right:7mm; bottom:2.4mm; font-size:6.8pt; font-weight:700; color:#000; }',
    'div.fixed-footer-right[style*="absolute"]{ bottom:auto; transform:translateY(3.1mm); }',
    '@media print{ tbody tr:nth-child(even) td{ background:#f1f1f1 !important; } }'
  ].join('\n');

  window.ModeloLista = { ativo: ativo, escolher: escolher, aplicar: aplicar, sincronizar: sincronizarBotoes };

  /* botões do seletor */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-modelo]');
    if (b) escolher(b.getAttribute('data-modelo'));
  });
  window.addEventListener('load', function () { setTimeout(sincronizarBotoes, 0); });
})();
