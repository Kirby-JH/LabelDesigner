/* ===========================================================
   render.js — 요소 렌더링(텍스트/QR/바코드/도형/이미지) 및 페이지 생성
   =========================================================== */
window.QL = window.QL || {};
(function (QL) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  QL.FONTS = [
    { v: 'sans', n: '산세리프(기본)', css: '"Pretendard","Malgun Gothic","Noto Sans KR",system-ui,sans-serif' },
    { v: 'gothic', n: '맑은 고딕', css: '"Malgun Gothic","맑은 고딕","Noto Sans KR",sans-serif' },
    { v: 'dotum', n: '돋움', css: 'Dotum,"돋움",Gulim,sans-serif' },
    { v: 'batang', n: '바탕(명조)', css: 'Batang,"바탕","Noto Serif KR",serif' },
    { v: 'mono', n: '고정폭', css: 'ui-monospace,Menlo,Consolas,"D2Coding",monospace' }
  ];
  QL.fontCss = function (v) {
    for (var i = 0; i < QL.FONTS.length; i++) if (QL.FONTS[i].v === v) return QL.FONTS[i].css;
    return QL.FONTS[0].css;
  };

  QL.BARCODE_FORMATS = [
    { v: 'CODE128', n: 'CODE128 (자동)' },
    { v: 'CODE128B', n: 'CODE128-B (영문/숫자)' },
    { v: 'CODE128C', n: 'CODE128-C (숫자 짝수자리)' },
    { v: 'EAN13', n: 'EAN-13 (숫자 12~13)' },
    { v: 'EAN8', n: 'EAN-8 (숫자 7~8)' },
    { v: 'UPC', n: 'UPC-A (숫자 11~12)' },
    { v: 'CODE39', n: 'CODE39' },
    { v: 'ITF', n: 'ITF (숫자 짝수자리)' },
    { v: 'ITF14', n: 'ITF-14 (숫자 13~14)' },
    { v: 'MSI', n: 'MSI' },
    { v: 'codabar', n: 'Codabar' },
    { v: 'pharmacode', n: 'Pharmacode' }
  ];

  QL.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ---------- {열이름} 치환 ---------- */
  QL.resolve = function (tpl, row, headers) {
    if (tpl == null) return '';
    return String(tpl).replace(/\{([^{}]*)\}/g, function (m, key) {
      key = key.trim();
      if (key === '') return m;
      var i = headers ? headers.indexOf(key) : -1;
      if (i < 0 && /^\d+$/.test(key)) i = parseInt(key, 10) - 1;
      if (i < 0) return m;                 // 없는 열 이름은 그대로 보여 준다
      if (!row) return m;
      return String(row[i] == null ? '' : row[i]);
    });
  };
  /* 템플릿이 열을 참조하는지 */
  QL.isBound = function (tpl, headers) {
    var hit = false;
    String(tpl || '').replace(/\{([^{}]*)\}/g, function (m, k) {
      k = k.trim();
      if ((headers && headers.indexOf(k) >= 0) || /^\d+$/.test(k)) hit = true;
      return m;
    });
    return hit;
  };

  /* ---------- QR ---------- */
  var qrCache = {};
  QL.qrSvg = function (text, ecc, quiet) {
    var key = ecc + '|' + quiet + '|' + text;
    var c = qrCache[key];
    if (!c) {
      var qr = null;
      try { qr = qrcode(0, ecc); qr.addData(text); qr.make(); }
      catch (e) {
        qr = null;
        for (var t = 1; t <= 40 && !qr; t++) {
          try { var q = qrcode(t, ecc); q.addData(text); q.make(); qr = q; } catch (e2) { }
        }
      }
      if (!qr) return null;
      var n = qr.getModuleCount(), d = '', r, col;
      for (r = 0; r < n; r++) {
        col = 0;
        while (col < n) {
          if (qr.isDark(r, col)) {
            var s = col;
            while (col < n && qr.isDark(r, col)) col++;
            d += 'M' + (s + quiet) + ' ' + (r + quiet) + 'h' + (col - s) + 'v1h-' + (col - s) + 'z';
          } else col++;
        }
      }
      c = qrCache[key] = { d: d, size: n + quiet * 2 };
    }
    return '<svg xmlns="' + SVGNS + '" viewBox="0 0 ' + c.size + ' ' + c.size +
      '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges">' +
      '<path d="' + c.d + '" fill="currentColor"/></svg>';
  };

  /* ---------- 바코드 (HRI 문자는 별도 HTML로 그린다) ---------- */
  var bcCache = {};
  QL.barcodeSvg = function (text, fmt, color, quiet) {
    quiet = quiet == null ? 10 : quiet;
    var key = fmt + '|' + color + '|' + quiet + '|' + text;
    if (key in bcCache) return bcCache[key];
    var out = null;
    try {
      var svg = document.createElementNS(SVGNS, 'svg');
      JsBarcode(svg, String(text), {
        format: fmt, width: 2, height: 100, margin: 0,
        marginLeft: quiet * 2, marginRight: quiet * 2,   // 스캐너용 좌우 여백(모듈 단위)
        displayValue: false, background: 'transparent', lineColor: color || '#000'
      });
      var w = svg.getAttribute('width'), h = svg.getAttribute('height');
      svg.setAttribute('viewBox', '0 0 ' + parseFloat(w) + ' ' + parseFloat(h));
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('shape-rendering', 'crispEdges');
      out = new XMLSerializer().serializeToString(svg);
    } catch (e) { out = null; }
    bcCache[key] = out;
    return out;
  };

  /* ---------- 상자에 맞춰 글자 크기 줄이기 ---------- */
  var mctx = null, fitCache = {};
  function measureCtx() {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    return mctx;
  }
  var MM2PX = 96 / 25.4, PT2PX = 96 / 72;

  QL.fitFontSize = function (text, el, wMM, hMM) {
    var key = [text, el.font, el.bold, el.italic, el.size, el.wrap, el.lh, wMM, hMM].join('\u0001');
    if (key in fitCache) return fitCache[key];
    var ctx = measureCtx();
    var fam = QL.fontCss(el.font);
    var boxW = wMM * MM2PX, boxH = hMM * MM2PX;
    var lh = el.lh || 1.15;
    var size = el.size;

    function lineCount(pt) {
      ctx.font = (el.italic ? 'italic ' : '') + (el.bold ? '700 ' : '400 ') + (pt * PT2PX) + 'px ' + fam;
      var paras = String(text).split('\n'), lines = 0, maxW = 0, p, i;
      for (p = 0; p < paras.length; p++) {
        if (!el.wrap) {
          lines++;
          maxW = Math.max(maxW, ctx.measureText(paras[p]).width);
          continue;
        }
        var words = paras[p].split(/(\s+)/), cur = '', n = 0;
        for (i = 0; i < words.length; i++) {
          var trial = cur + words[i];
          if (ctx.measureText(trial).width > boxW && cur !== '') {
            n++; maxW = Math.max(maxW, ctx.measureText(cur).width);
            cur = words[i].replace(/^\s+/, '');
          } else cur = trial;
        }
        n++; maxW = Math.max(maxW, ctx.measureText(cur).width);
        lines += n;
      }
      return { lines: lines, w: maxW };
    }

    var r = lineCount(size);
    var guard = 0;
    while (size > 2.5 && guard++ < 80 &&
      (r.w > boxW + 0.5 || r.lines * size * PT2PX * lh > boxH + 0.5)) {
      size = Math.round((size - 0.25) * 100) / 100;
      r = lineCount(size);
    }
    fitCache[key] = size;
    return size;
  };

  /* ---------- 요소 1개 → HTML ---------- */
  QL.elHtml = function (el, row, headers) {
    var st = 'left:' + el.x + 'mm;top:' + el.y + 'mm;width:' + el.w + 'mm;height:' + el.h + 'mm;';
    if (el.rot) st += 'transform:rotate(' + el.rot + 'deg);';
    if (el.opacity != null && el.opacity < 1) st += 'opacity:' + el.opacity + ';';
    var inner = '';

    if (el.type === 'text') {
      var txt = QL.resolve(el.tpl, row, headers);
      var size = el.fit ? QL.fitFontSize(txt, el, el.w, el.h) : el.size;
      var js = el.align === 'center' ? 'center' : (el.align === 'right' ? 'flex-end' : 'flex-start');
      var ai = el.valign === 'middle' ? 'center' : (el.valign === 'bottom' ? 'flex-end' : 'flex-start');
      inner = '<div class="inner" style="align-items:' + ai + ';justify-content:' + js + '">' +
        '<div style="font-family:' + QL.fontCss(el.font) + ';font-size:' + size + 'pt;' +
        'font-weight:' + (el.bold ? 700 : 400) + ';' + (el.italic ? 'font-style:italic;' : '') +
        'color:' + (el.color || '#000') + ';line-height:' + (el.lh || 1.15) + ';' +
        (el.ls ? 'letter-spacing:' + el.ls + 'mm;' : '') +
        'text-align:' + (el.align || 'left') + ';width:100%;' +
        (el.wrap ? 'white-space:pre-wrap;overflow-wrap:anywhere;' : 'white-space:pre;') +
        '">' + QL.esc(txt) + '</div></div>';

    } else if (el.type === 'qr') {
      var qtext = QL.resolve(el.tpl, row, headers);
      var svg = qtext ? QL.qrSvg(qtext, el.ecc || 'M', el.quiet == null ? 2 : el.quiet) : null;
      inner = '<div class="inner" style="color:' + (el.color || '#000') + ';align-items:center;justify-content:center">' +
        (svg || '<span class="err">QR 내용 없음</span>') + '</div>';

    } else if (el.type === 'barcode') {
      var btext = QL.resolve(el.tpl, row, headers);
      var bsvg = btext ? QL.barcodeSvg(btext, el.fmt || 'CODE128', el.color || '#000', el.quiet == null ? 10 : el.quiet) : null;
      if (!bsvg) {
        inner = '<div class="inner" style="align-items:center;justify-content:center">' +
          '<span class="err">' + (btext ? (el.fmt || 'CODE128') + ' 형식에 맞지 않는 값<br>' + QL.esc(btext) : '바코드 내용 없음') + '</span></div>';
      } else {
        var hriH = el.hri ? (el.hriSize * PT2PX / MM2PX * 1.25) : 0;   // mm
        inner = '<div class="inner" style="flex-direction:column">' +
          '<div style="flex:1 1 auto;width:100%;min-height:0">' + bsvg + '</div>' +
          (el.hri ? '<div style="flex:0 0 auto;width:100%;text-align:center;line-height:1.15;' +
            'font-family:' + QL.fontCss(el.font || 'sans') + ';font-size:' + el.hriSize + 'pt;' +
            'color:' + (el.color || '#000') + ';white-space:nowrap;overflow:hidden">' +
            QL.esc(btext) + '</div>' : '') +
          '</div>';
        if (hriH) { /* 높이 계산은 flex가 처리 */ }
      }

    } else if (el.type === 'box') {
      inner = '<div class="inner" style="background:' + (el.fill === 'none' ? 'transparent' : el.fill) + ';' +
        (el.sw > 0 ? 'border:' + el.sw + 'mm solid ' + el.stroke + ';' : '') +
        (el.radius ? 'border-radius:' + el.radius + 'mm;' : '') + '"></div>';

    } else if (el.type === 'image') {
      inner = el.src
        ? '<div class="inner"><img src="' + el.src + '" style="width:100%;height:100%;object-fit:' +
          (el.fit2 || 'contain') + '" alt=""></div>'
        : '<div class="inner" style="align-items:center;justify-content:center"><span class="err">이미지 없음</span></div>';
    }

    return '<div class="el" data-id="' + el.id + '" style="' + st + '">' + inner + '</div>';
  };

  QL.labelHtml = function (elements, row, headers) {
    var s = '', i;
    for (i = 0; i < elements.length; i++) s += QL.elHtml(elements[i], row, headers);
    return s;
  };

  /* ---------- 페이지 생성 ---------- */
  QL.MAX_LABELS = 1000;

  QL.buildPages = function (o) {
    var items = o.items, n = items.length, html = [], i;
    var limited = n > QL.MAX_LABELS;
    var count = limited ? QL.MAX_LABELS : n;

    if (o.mode === 'roll') {
      var pw = o.rot === 90 || o.rot === 270 ? o.labelH : o.labelW;
      var ph = (o.rot === 90 || o.rot === 270 ? o.labelW : o.labelH) + o.gap;
      var tf = '';
      if (o.rot === 90) tf = 'translate(' + o.labelH + 'mm,0) rotate(90deg)';
      else if (o.rot === 180) tf = 'translate(' + o.labelW + 'mm,' + o.labelH + 'mm) rotate(180deg)';
      else if (o.rot === 270) tf = 'translate(0,' + o.labelW + 'mm) rotate(270deg)';

      for (i = 0; i < count; i++) {
        html.push('<div class="page-wrap"><div class="pgno">' + (i + 1) + ' / ' + n + '</div>' +
          '<div class="page' + (o.border ? ' bordered' : '') + '">' +
          '<div class="slot" style="left:' + o.offX + 'mm;top:' + o.offY + 'mm;width:' + o.labelW +
          'mm;height:' + o.labelH + 'mm;' + (tf ? 'transform:' + tf + ';transform-origin:0 0;' : '') + '">' +
          QL.labelHtml(o.elements, items[i].row, o.headers) + '</div></div></div>');
      }
      return { html: html.join(''), pages: n, pw: pw, ph: ph, limited: limited, shown: count };
    }

    /* 시트 모드 */
    var per = o.cols * o.rows;
    var start = o.startAt % per;
    var pages = Math.ceil((count + start) / per);
    var idx = 0;
    for (var p = 0; p < pages; p++) {
      html.push('<div class="page-wrap"><div class="pgno">' + (p + 1) + ' / ' + pages + '</div>' +
        '<div class="page' + (o.border ? ' bordered' : '') + '">');
      if (o.guide) {
        for (var g = 0; g < per; g++) {
          html.push('<div class="ghost" style="left:' + (o.ml + (g % o.cols) * (o.labelW + o.gapX)) +
            'mm;top:' + (o.mt + Math.floor(g / o.cols) * (o.labelH + o.gapY)) +
            'mm;width:' + o.labelW + 'mm;height:' + o.labelH + 'mm"></div>');
        }
      }
      for (var s = (p === 0 ? start : 0); s < per && idx < count; s++) {
        var x = o.ml + (s % o.cols) * (o.labelW + o.gapX);
        var y = o.mt + Math.floor(s / o.cols) * (o.labelH + o.gapY);
        html.push('<div class="slot" style="left:' + x + 'mm;top:' + y + 'mm;width:' + o.labelW +
          'mm;height:' + o.labelH + 'mm">' +
          QL.labelHtml(o.elements, items[idx++].row, o.headers) + '</div>');
      }
      html.push('</div></div>');
    }
    return { html: html.join(''), pages: pages, pw: o.pageW, ph: o.pageH, limited: limited, shown: count };
  };

})(window.QL);
