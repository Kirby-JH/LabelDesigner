/* ===========================================================
   QR 라벨 생성기 — 바코드 리스트를 라벨용지에 맞춰 페이지 단위로 출력
   =========================================================== */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  /* ---------- 라벨 용지 프리셋 (A4 210×297mm 기준) ----------
     여백은 '가운데 정렬'로 자동 계산되며, 대부분의 시판 라벨지와 일치합니다. */
  var PRESETS = [
    { id: 'custom', name: '직접 설정' },
    { id: 'a4-65', name: 'A4 65칸 · 5×13 · 38.1×21.2mm', c: 5, r: 13, w: 38.1, h: 21.2, gx: 2.5, gy: 0 },
    { id: 'a4-40', name: 'A4 40칸 · 4×10 · 45.7×25.4mm', c: 4, r: 10, w: 45.7, h: 25.4, gx: 2.5, gy: 0 },
    { id: 'a4-27', name: 'A4 27칸 · 3×9 · 63.5×29.6mm', c: 3, r: 9, w: 63.5, h: 29.6, gx: 2.5, gy: 0 },
    { id: 'a4-24', name: 'A4 24칸 · 3×8 · 63.5×33.9mm', c: 3, r: 8, w: 63.5, h: 33.9, gx: 2.5, gy: 0 },
    { id: 'a4-21', name: 'A4 21칸 · 3×7 · 63.5×38.1mm', c: 3, r: 7, w: 63.5, h: 38.1, gx: 2.5, gy: 0 },
    { id: 'a4-18', name: 'A4 18칸 · 3×6 · 63.5×46.6mm', c: 3, r: 6, w: 63.5, h: 46.6, gx: 2.5, gy: 0 },
    { id: 'a4-16', name: 'A4 16칸 · 2×8 · 99.1×33.9mm', c: 2, r: 8, w: 99.1, h: 33.9, gx: 2.5, gy: 0 },
    { id: 'a4-14', name: 'A4 14칸 · 2×7 · 99.1×38.1mm', c: 2, r: 7, w: 99.1, h: 38.1, gx: 2.5, gy: 0 },
    { id: 'a4-12', name: 'A4 12칸 · 3×4 · 63.5×72.0mm', c: 3, r: 4, w: 63.5, h: 72.0, gx: 2.5, gy: 0 },
    { id: 'a4-10', name: 'A4 10칸 · 2×5 · 99.1×57.0mm', c: 2, r: 5, w: 99.1, h: 57.0, gx: 2.5, gy: 0 },
    { id: 'a4-8', name: 'A4 8칸 · 2×4 · 99.1×67.7mm', c: 2, r: 4, w: 99.1, h: 67.7, gx: 2.5, gy: 0 },
    { id: 'a4-6', name: 'A4 6칸 · 2×3 · 99.1×93.1mm', c: 2, r: 3, w: 99.1, h: 93.1, gx: 2.5, gy: 0 },
    { id: 'a4-4', name: 'A4 4칸 · 2×2 · 99.1×139.0mm', c: 2, r: 2, w: 99.1, h: 139.0, gx: 2.5, gy: 0 },
    { id: 'a4-2', name: 'A4 2칸 · 1×2 · 199.6×143.5mm', c: 1, r: 2, w: 199.6, h: 143.5, gx: 0, gy: 0 },
    { id: 'a4-1', name: 'A4 1칸 · 1×1 · 199.6×289.1mm', c: 1, r: 1, w: 199.6, h: 289.1, gx: 0, gy: 0 },
    { id: 'a4-grid-40', name: 'A4 40칸(간격없음) · 4×10 · 52.5×29.7mm', c: 4, r: 10, w: 52.5, h: 29.7, gx: 0, gy: 0 }
  ];

  /* ---------- 상태 ---------- */
  var table = { headers: [], rows: [] };  // rows: 배열의 배열
  var workbook = null;
  var qrCache = {};
  var renderTimer = null;

  /* ---------- 유틸 ---------- */
  function num(el, def) {
    var v = parseFloat($(el).value);
    return isFinite(v) ? v : (def || 0);
  }
  function int(el, def) {
    var v = parseInt($(el).value, 10);
    return isFinite(v) ? v : (def || 0);
  }

  /* 따옴표를 존중하는 구분자 분리 */
  function splitLine(line, d) {
    var out = [], cur = '', q = false, i;
    for (i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else { q = false; }
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function parsePasted(txt) {
    var lines = txt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    if (!lines.length) return [];
    var first = lines[0];
    var d = first.indexOf('\t') >= 0 ? '\t' : (first.indexOf(',') >= 0 ? ',' : null);
    return lines.map(function (l) {
      return d ? splitLine(l, d).map(function (s) { return s.trim(); }) : [l.trim()];
    });
  }

  /* ---------- 표 적용 ---------- */
  function setTable(aoa) {
    aoa = (aoa || []).filter(function (r) {
      return r && r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; });
    });
    var width = 0;
    aoa.forEach(function (r) { if (r.length > width) width = r.length; });
    aoa = aoa.map(function (r) {
      var o = [], i;
      for (i = 0; i < width; i++) o.push(String(r[i] == null ? '' : r[i]).trim());
      return o;
    });

    if ($('#hasHeader').checked && aoa.length > 1) {
      table.headers = aoa[0].map(function (h, i) { return h || (i + 1) + '열'; });
      table.rows = aoa.slice(1);
    } else {
      table.headers = [];
      for (var i = 0; i < width; i++) table.headers.push((i + 1) + '열');
      table.rows = aoa;
    }
    buildColumnSelects();
    scheduleRender();
  }

  function buildColumnSelects() {
    var specs = [
      { el: '#colCode', none: null, def: 0 },
      { el: '#colQty', none: '사용 안 함', def: -1, guess: /수량|개수|qty|count|매수|장수/i },
      { el: '#colText1', none: '표시 안 함', def: 0 },
      { el: '#colText2', none: '표시 안 함', def: -1 }
    ];
    specs.forEach(function (sp) {
      var sel = $(sp.el);
      var prev = sel.dataset.touched === '1' ? sel.value : null;
      var html = sp.none ? '<option value="-1">' + sp.none + '</option>' : '';
      table.headers.forEach(function (h, i) {
        html += '<option value="' + i + '">' + escapeHtml(h) + '</option>';
      });
      sel.innerHTML = html || '<option value="-1">(데이터 없음)</option>';

      var pick = null;
      if (prev !== null && sel.querySelector('option[value="' + CSS.escape(prev) + '"]')) pick = prev;
      if (pick === null && sp.guess) {
        table.headers.forEach(function (h, i) { if (pick === null && sp.guess.test(h)) pick = String(i); });
      }
      if (pick === null && sp.el === '#colCode') {
        table.headers.forEach(function (h, i) {
          if (pick === null && /바코드|barcode|코드|code|sku|qr|번호/i.test(h)) pick = String(i);
        });
      }
      if (pick === null) pick = String(table.headers.length ? sp.def : -1);
      if (!sel.querySelector('option[value="' + CSS.escape(pick) + '"]')) pick = sel.options[0] ? sel.options[0].value : '-1';
      sel.value = pick;
    });
    // 텍스트1은 기본적으로 QR 데이터 열을 따라감
    if ($('#colText1').dataset.touched !== '1') $('#colText1').value = $('#colCode').value;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 인쇄 항목 생성 ---------- */
  function buildItems() {
    var ci = parseInt($('#colCode').value, 10);
    var qi = parseInt($('#colQty').value, 10);
    var t1 = parseInt($('#colText1').value, 10);
    var t2 = parseInt($('#colText2').value, 10);
    var pre = $('#prefix').value, suf = $('#suffix').value;
    var rep = Math.max(1, int('#repeat', 1));
    var skipEmpty = $('#skipEmpty').checked, dedupe = $('#dedupe').checked;

    var items = [], seen = {}, skipped = 0, dup = 0;
    if (!(ci >= 0)) return { items: items, skipped: skipped, dup: dup };

    table.rows.forEach(function (row) {
      var raw = String(row[ci] == null ? '' : row[ci]).trim();
      if (raw === '') { skipped++; return; }
      if (dedupe) {
        if (seen[raw]) { dup++; return; }
        seen[raw] = 1;
      }
      var qty = 1;
      if (qi >= 0) {
        var q = parseInt(String(row[qi]).replace(/[^0-9\-]/g, ''), 10);
        qty = isFinite(q) ? q : 1;
      }
      qty = qty * rep;
      if (qty < 1) return;
      if (qty > 2000) qty = 2000;
      var it = {
        code: pre + raw + suf,
        t1: t1 >= 0 ? String(row[t1] == null ? '' : row[t1]) : '',
        t2: t2 >= 0 ? String(row[t2] == null ? '' : row[t2]) : ''
      };
      for (var k = 0; k < qty; k++) items.push(it);
    });
    if (!skipEmpty) skipped = 0;
    return { items: items, skipped: skipped, dup: dup };
  }

  /* ---------- QR SVG ---------- */
  function qrSvg(text, ecc, quiet, mm) {
    var key = ecc + '|' + quiet + '|' + text;
    var cached = qrCache[key];
    if (!cached) {
      var qr = null;
      try {
        qr = qrcode(0, ecc);
        qr.addData(text);
        qr.make();
      } catch (e) {
        qr = null;
        for (var t = 1; t <= 40 && !qr; t++) {
          try {
            var q = qrcode(t, ecc);
            q.addData(text);
            q.make();
            qr = q;
          } catch (e2) { /* 다음 버전 시도 */ }
        }
      }
      if (!qr) return '<div style="font-size:5pt;color:#dc2626">QR 생성 실패</div>';

      var n = qr.getModuleCount(), d = '', r, c;
      for (r = 0; r < n; r++) {
        c = 0;
        while (c < n) {
          if (qr.isDark(r, c)) {
            var s = c;
            while (c < n && qr.isDark(r, c)) c++;
            d += 'M' + (s + quiet) + ' ' + (r + quiet) + 'h' + (c - s) + 'v1h-' + (c - s) + 'z';
          } else c++;
        }
      }
      cached = qrCache[key] = { d: d, size: n + quiet * 2 };
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + cached.size + ' ' + cached.size +
      '" width="' + mm + 'mm" height="' + mm + 'mm" shape-rendering="crispEdges">' +
      '<rect width="100%" height="100%" fill="#fff"/><path d="' + cached.d + '" fill="#000"/></svg>';
  }

  /* ---------- 레이아웃 ---------- */
  function getLayout() {
    var pw = num('#pageW', 210), ph = num('#pageH', 297);
    var cols = Math.max(1, int('#cols', 1)), rows = Math.max(1, int('#rows', 1));
    var lw = num('#labelW', 50), lh = num('#labelH', 30);
    var gx = num('#gapX', 0), gy = num('#gapY', 0);
    var ml, mt;
    if ($('#autoMargin').checked) {
      ml = (pw - (cols * lw + (cols - 1) * gx)) / 2;
      mt = (ph - (rows * lh + (rows - 1) * gy)) / 2;
      ml = Math.round(ml * 100) / 100;
      mt = Math.round(mt * 100) / 100;
      $('#marginL').value = ml;
      $('#marginT').value = mt;
    } else {
      ml = num('#marginL', 0);
      mt = num('#marginT', 0);
    }
    return {
      pw: pw, ph: ph, cols: cols, rows: rows, lw: lw, lh: lh, gx: gx, gy: gy,
      ml: ml + num('#offX', 0), mt: mt + num('#offY', 0),
      per: cols * rows
    };
  }

  /* ---------- 렌더링 ---------- */
  function render() {
    var L = getLayout();
    var res = buildItems();
    var items = res.items;

    document.documentElement.style.setProperty('--pw', L.pw + 'mm');
    document.documentElement.style.setProperty('--ph', L.ph + 'mm');
    $('#pageRule').textContent = '@page{size:' + L.pw + 'mm ' + L.ph + 'mm;margin:0}';

    // 데이터 요약
    var sum = $('#dataSummary');
    if (!table.rows.length) {
      sum.className = 'summary';
      sum.textContent = '데이터를 입력하세요.';
    } else {
      var msg = '행 <b>' + table.rows.length + '</b>개 → 라벨 <b>' + items.length + '</b>장';
      if (res.dup) msg += ' · 중복 제외 ' + res.dup;
      if (res.skipped) msg += ' · 빈 값 ' + res.skipped;
      sum.className = 'summary';
      sum.innerHTML = msg;
    }

    var start = Math.max(0, int('#startAt', 1) - 1) % Math.max(1, L.per);
    var total = items.length;
    var pages = total ? Math.ceil((total + start) / L.per) : 0;

    $('#empty').hidden = total > 0;
    $('#stat').innerHTML = total
      ? '라벨 <b>' + total + '</b>장 · 용지 <b>' + pages + '</b>장 · 한 장에 ' + L.per + '칸'
      : '—';

    var pv = $('#preview');
    if (!total) { pv.innerHTML = ''; return; }

    var MAXPAGES = 300;
    var limited = pages > MAXPAGES;
    var shown = limited ? MAXPAGES : pages;

    // 라벨 내용 설정
    var layout = $('#layout').value;
    var ecc = $('#ecc').value;
    var quiet = Math.max(0, int('#quiet', 2));
    var pad = num('#pad', 1.5);
    var fs = num('#fontSize', 7);
    var manual = num('#qrSize', 0);
    var showText = layout !== 'q';

    // QR 크기 결정
    var innerW = L.lw - pad * 2, innerH = L.lh - pad * 2;
    var qrMM;
    if (manual > 0) {
      qrMM = manual;
    } else if (layout === 'h') {
      qrMM = Math.min(innerH, innerW * 0.55);
    } else if (layout === 'q') {
      qrMM = Math.min(innerW, innerH);
    } else {
      var lines = ($('#colText2').value >= 0 && $('#colText2').value !== '-1') ? 2 : 1;
      var textMM = fs * 1.25 * lines * 25.4 / 72 + 0.6;
      qrMM = Math.min(innerW, innerH - textMM);
    }
    qrMM = Math.max(3, Math.round(qrMM * 100) / 100);

    var cls = 'page' + ($('#guide').checked ? ' guide' : '') + ($('#border').checked ? ' bordered' : '');
    var cellBase = 'width:' + L.lw + 'mm;height:' + L.lh + 'mm;padding:' + pad + 'mm;' +
      'font-size:' + fs + 'pt;' + ($('#bold').checked ? 'font-weight:700;' : '');

    var out = [], idx = 0;
    for (var p = 0; p < shown; p++) {
      out.push('<div class="page-wrap"><div class="pgno">' + (p + 1) + ' / ' + pages + '</div><div class="' + cls + '">');
      if ($('#guide').checked) {           // 빈 칸을 포함한 전체 격자(화면 전용)
        for (var g = 0; g < L.per; g++) {
          var gr = Math.floor(g / L.cols), gc = g % L.cols;
          out.push('<div class="ghost" style="width:' + L.lw + 'mm;height:' + L.lh + 'mm;left:' +
            (L.ml + gc * (L.lw + L.gx)) + 'mm;top:' + (L.mt + gr * (L.lh + L.gy)) + 'mm"></div>');
        }
      }
      var startSlot = p === 0 ? start : 0;
      for (var s = startSlot; s < L.per && idx < total; s++) {
        var r = Math.floor(s / L.cols), c = s % L.cols;
        var x = L.ml + c * (L.lw + L.gx);
        var y = L.mt + r * (L.lh + L.gy);
        var it = items[idx++];
        var inner = '<div class="qr">' + qrSvg(it.code, ecc, quiet, qrMM) + '</div>';
        if (showText && (it.t1 || it.t2)) {
          inner += '<div class="tx">' + escapeHtml(it.t1) +
            (it.t2 ? '<div class="t2">' + escapeHtml(it.t2) + '</div>' : '') + '</div>';
        }
        out.push('<div class="cell ' + (layout === 'h' ? 'h' : 'v') + '" style="' + cellBase +
          'left:' + x + 'mm;top:' + y + 'mm">' + inner + '</div>');
      }
      out.push('</div></div>');
    }
    if (limited) {
      out.push('<p class="empty">미리보기는 ' + MAXPAGES + '페이지까지만 표시합니다. (전체 ' + pages + '페이지)</p>');
    }
    pv.innerHTML = out.join('');
    applyZoom();
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 150);
  }

  /* ---------- 확대/축소 ---------- */
  function applyZoom() {
    var z = $('#zoom').value, s;
    if (z === 'fit') {
      var pxPerMm = 96 / 25.4;
      var avail = $('#viewport').clientWidth - 48;
      s = Math.min(1, avail / (num('#pageW', 210) * pxPerMm));
    } else {
      s = parseFloat(z);
    }
    document.documentElement.style.setProperty('--s', Math.max(0.1, s));
  }

  /* ---------- 프리셋 ---------- */
  function fillPresets() {
    $('#preset').innerHTML = PRESETS.map(function (p) {
      return '<option value="' + p.id + '">' + p.name + '</option>';
    }).join('');
    $('#preset').value = 'a4-21';
  }

  function applyPreset() {
    var p = PRESETS.filter(function (x) { return x.id === $('#preset').value; })[0];
    if (!p || p.id === 'custom') return;
    $('#pageW').value = 210; $('#pageH').value = 297;
    $('#cols').value = p.c; $('#rows').value = p.r;
    $('#labelW').value = p.w; $('#labelH').value = p.h;
    $('#gapX').value = p.gx; $('#gapY').value = p.gy;
    $('#autoMargin').checked = true;
    toggleMargin();
    scheduleRender();
  }

  function toggleMargin() {
    var on = $('#autoMargin').checked;
    $('#marginL').disabled = on;
    $('#marginT').disabled = on;
  }

  /* ---------- 파일 읽기 ---------- */
  /* CSV/TXT는 UTF-8로 먼저 해석하고, 깨지면 EUC-KR(CP949)로 다시 해석한다.
     (한국에서 엑셀로 저장한 CSV는 대부분 CP949이다) */
  function decodeText(buf) {
    var bytes = new Uint8Array(buf), txt;
    try {
      txt = new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      txt = String.fromCharCode.apply(null, bytes);
    }
    if (txt.indexOf('\uFFFD') >= 0) {
      try { txt = new TextDecoder('euc-kr').decode(bytes); } catch (e2) { /* 그대로 사용 */ }
    }
    return txt.replace(/^\uFEFF/, '');
  }

  function readFile(file) {
    $('#fileName').textContent = file.name + ' 읽는 중…';
    var isText = /\.(csv|txt|tsv)$/i.test(file.name);
    var fr = new FileReader();
    fr.onload = function (e) {
      try {
        if (isText) {
          workbook = null;
          $('#sheetWrap').hidden = true;
          $('#pasteArea').value = decodeText(e.target.result);
          $('#tabPaste').click();   // 읽어들인 내용을 바로 보고 수정할 수 있게
          setTable(parsePasted($('#pasteArea').value));
          $('#fileName').textContent = file.name + ' · ' + table.rows.length + '행';
          return;
        }
        workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: false });
        var names = workbook.SheetNames;
        $('#sheetWrap').hidden = names.length < 2;
        $('#sheetSel').innerHTML = names.map(function (n) {
          return '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>';
        }).join('');
        $('#sheetSel').value = names[0];
        loadSheet();
        $('#fileName').textContent = file.name + ' · 시트 ' + names.length + '개';
      } catch (err) {
        $('#fileName').textContent = '파일을 읽을 수 없습니다: ' + err.message;
      }
    };
    fr.readAsArrayBuffer(file);
  }

  function loadSheet() {
    if (!workbook) return;
    var ws = workbook.Sheets[$('#sheetSel').value];
    if (!ws) return;
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
    setTable(aoa);
  }

  /* ---------- 설정 저장/복원 ---------- */
  var SETTING_IDS = ['preset', 'pageW', 'pageH', 'cols', 'rows', 'labelW', 'labelH', 'gapX', 'gapY',
    'autoMargin', 'marginL', 'marginT', 'offX', 'offY', 'layout', 'ecc', 'qrSize', 'quiet',
    'fontSize', 'pad', 'bold', 'startAt', 'guide', 'border', 'repeat', 'prefix', 'suffix',
    'skipEmpty', 'dedupe', 'hasHeader'];
  var KEY = 'qrlabel.settings.v1';

  function saveSettings() {
    var o = {};
    SETTING_IDS.forEach(function (id) {
      var el = $('#' + id);
      if (!el) return;
      o[id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { }
  }

  function loadSettings() {
    var o;
    try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { o = null; }
    if (!o) return;
    SETTING_IDS.forEach(function (id) {
      if (!(id in o)) return;
      var el = $('#' + id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!o[id];
      else el.value = o[id];
    });
    toggleMargin();
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    // 탭
    $('#tabPaste').addEventListener('click', function () {
      $('#tabPaste').classList.add('on'); $('#tabFile').classList.remove('on');
      $('#panePaste').hidden = false; $('#paneFile').hidden = true;
    });
    $('#tabFile').addEventListener('click', function () {
      $('#tabFile').classList.add('on'); $('#tabPaste').classList.remove('on');
      $('#paneFile').hidden = false; $('#panePaste').hidden = true;
    });

    // 붙여넣기
    var pasteTimer = null;
    $('#pasteArea').addEventListener('input', function () {
      clearTimeout(pasteTimer);
      pasteTimer = setTimeout(function () {
        workbook = null;
        setTable(parsePasted($('#pasteArea').value));
      }, 250);
    });

    $('#btnSample').addEventListener('click', function () {
      $('#pasteArea').value =
        '바코드\t품명\t수량\n' +
        '8801234567890\t생수 500ml\t3\n' +
        '8801234567891\t아메리카노 원두 200g\t2\n' +
        '8801234567892\t우유 1L\t1\n' +
        '8801234567893\t초코칩 쿠키\t4\n' +
        '8801234567894\t녹차 티백 20入\t1\n' +
        'A-2024-0001\t내부관리 라벨 A\t6';
      $('#pasteArea').dispatchEvent(new Event('input'));
    });
    $('#btnClear').addEventListener('click', function () {
      $('#pasteArea').value = '';
      workbook = null;
      setTable([]);
    });

    // 파일
    $('#drop').addEventListener('click', function () { $('#fileInput').click(); });
    $('#fileInput').addEventListener('change', function (e) {
      if (e.target.files[0]) readFile(e.target.files[0]);
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      $('#drop').addEventListener(ev, function (e) { e.preventDefault(); $('#drop').classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      $('#drop').addEventListener(ev, function (e) { e.preventDefault(); $('#drop').classList.remove('over'); });
    });
    $('#drop').addEventListener('drop', function (e) {
      if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
    });
    $('#sheetSel').addEventListener('change', loadSheet);

    // 머리글 토글 → 표 재구성
    $('#hasHeader').addEventListener('change', function () {
      if (workbook) loadSheet();
      else setTable(parsePasted($('#pasteArea').value));
      saveSettings();
    });

    // 열 선택
    ['#colCode', '#colText1', '#colText2', '#colQty'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        this.dataset.touched = '1';
        scheduleRender();
      });
    });

    // 프리셋
    $('#preset').addEventListener('change', function () { applyPreset(); saveSettings(); });
    $('#autoMargin').addEventListener('change', function () { toggleMargin(); scheduleRender(); saveSettings(); });

    // 치수를 직접 바꾸면 프리셋을 '직접 설정'으로
    ['pageW', 'pageH', 'cols', 'rows', 'labelW', 'labelH', 'gapX', 'gapY'].forEach(function (id) {
      $('#' + id).addEventListener('input', function () { $('#preset').value = 'custom'; });
    });

    // 모든 설정 변경 → 다시 그리기
    SETTING_IDS.forEach(function (id) {
      var el = $('#' + id);
      if (!el) return;
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', function () {
        scheduleRender();
        saveSettings();
      });
    });

    $('#zoom').addEventListener('change', applyZoom);
    window.addEventListener('resize', function () { if ($('#zoom').value === 'fit') applyZoom(); });

    $('#btnPrint').addEventListener('click', function () { window.print(); });
    $('#btnReset').addEventListener('click', function () {
      if (!confirm('용지·QR 설정을 기본값으로 되돌릴까요? (입력한 데이터는 유지됩니다)')) return;
      try { localStorage.removeItem(KEY); } catch (e) { }
      location.reload();
    });

    // Ctrl+P
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); window.print(); }
    });
  }

  /* ---------- 시작 ---------- */
  function init() {
    // 한글·특수문자가 1바이트로 잘리지 않도록 UTF-8 바이트 인코더를 사용한다.
    if (typeof qrcode !== 'undefined' && qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    }
    if (typeof qrcode === 'undefined') {
      document.body.insertAdjacentHTML('afterbegin',
        '<div style="padding:10px;background:#fee2e2;color:#991b1b">QR 라이브러리(vendor/qrcode.min.js)를 불러오지 못했습니다.</div>');
    }
    fillPresets();
    bind();
    loadSettings();
    toggleMargin();
    setTable([]);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
