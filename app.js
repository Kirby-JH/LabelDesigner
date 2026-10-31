/* ===========================================================
   app.js — 상태, 데이터 입력, 용지 설정, 미리보기/인쇄, 저장
   =========================================================== */
window.QL = window.QL || {};
(function (QL) {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return [].slice.call(document.querySelectorAll(s)); };
  var MM2PX = 96 / 25.4;
  var r2 = function (v) { return Math.round(v * 100) / 100; };

  /* ---------- 공유 상태 ---------- */
  var S = QL.state = {
    headers: [], rows: [], sampleRow: 0,
    elements: [], selIds: [],
    label: { w: 60, h: 40 },
    snap: true, scale: 1
  };
  var workbook = null, previewDirty = true, view = 'design', redrawT = null, wantCommit = false;

  /* 글꼴이 다 도착한 뒤에 인쇄해야 대체 글꼴로 찍히지 않는다 */
  function whenFontsReady(cb) {
    if (!document.fonts || !document.fonts.ready) { cb(); return; }
    var done = false;
    var go = function () { if (!done) { done = true; cb(); } };
    document.fonts.ready.then(go, go);
    setTimeout(go, 4000);                        // 혹시 응답이 없어도 인쇄는 되게
  }

  /* 인쇄 중에는 DOM 을 전혀 건드리지 않는다.
     예전에는 #pages 를 body 직속으로 옮겼다가 인쇄가 끝나면 되돌렸는데,
     크롬 미리보기는 window.print() 가 반환한 뒤에도 계속 다시 그린다.
     그 사이에 되돌리면 인쇄 CSS 가 찾을 것이 없어져 빈 종이가 나왔다.
     지금은 인쇄 CSS 가 있는 그대로의 구조를 쓰므로 되돌릴 일이 없다. */
  function startPrint() {
    whenFontsReady(function () {
      setTimeout(function () { window.print(); }, 60);
    });
  }

  /* ---------- 용지 프리셋 ---------- */
  var ROLL = [
    { id: 'custom', n: '직접 설정' },
    { id: '30x20', n: '30 × 20 mm', w: 30, h: 20 },
    { id: '40x20', n: '40 × 20 mm', w: 40, h: 20 },
    { id: '40x30', n: '40 × 30 mm', w: 40, h: 30 },
    { id: '50x30', n: '50 × 30 mm', w: 50, h: 30 },
    { id: '50x40', n: '50 × 40 mm', w: 50, h: 40 },
    { id: '60x40', n: '60 × 40 mm (표준)', w: 60, h: 40 },
    { id: '70x50', n: '70 × 50 mm', w: 70, h: 50 },
    { id: '80x50', n: '80 × 50 mm', w: 80, h: 50 },
    { id: '90x30', n: '90 × 30 mm (가격표)', w: 90, h: 30 },
    { id: '100x50', n: '100 × 50 mm', w: 100, h: 50 },
    { id: '100x75', n: '100 × 75 mm', w: 100, h: 75 },
    { id: '100x100', n: '100 × 100 mm', w: 100, h: 100 },
    { id: '100x150', n: '100 × 150 mm (택배 송장)', w: 100, h: 150 },
    { id: '58roll', n: '영수증 롤 58mm 폭', w: 58, h: 40 },
    { id: '80roll', n: '영수증 롤 80mm 폭', w: 80, h: 50 }
  ];
  var SHEET = [
    { id: 'custom', n: '직접 설정' },
    { id: 'a4-65', n: 'A4 65칸 · 5×13 · 38.1×21.2mm', c: 5, r: 13, w: 38.1, h: 21.2, gx: 2.5, gy: 0 },
    { id: 'a4-40', n: 'A4 40칸 · 4×10 · 45.7×25.4mm', c: 4, r: 10, w: 45.7, h: 25.4, gx: 2.5, gy: 0 },
    { id: 'a4-27', n: 'A4 27칸 · 3×9 · 63.5×29.6mm', c: 3, r: 9, w: 63.5, h: 29.6, gx: 2.5, gy: 0 },
    { id: 'a4-24', n: 'A4 24칸 · 3×8 · 63.5×33.9mm', c: 3, r: 8, w: 63.5, h: 33.9, gx: 2.5, gy: 0 },
    { id: 'a4-21', n: 'A4 21칸 · 3×7 · 63.5×38.1mm', c: 3, r: 7, w: 63.5, h: 38.1, gx: 2.5, gy: 0 },
    { id: 'a4-18', n: 'A4 18칸 · 3×6 · 63.5×46.6mm', c: 3, r: 6, w: 63.5, h: 46.6, gx: 2.5, gy: 0 },
    { id: 'a4-16', n: 'A4 16칸 · 2×8 · 99.1×33.9mm', c: 2, r: 8, w: 99.1, h: 33.9, gx: 2.5, gy: 0 },
    { id: 'a4-14', n: 'A4 14칸 · 2×7 · 99.1×38.1mm', c: 2, r: 7, w: 99.1, h: 38.1, gx: 2.5, gy: 0 },
    { id: 'a4-12', n: 'A4 12칸 · 3×4 · 63.5×72.0mm', c: 3, r: 4, w: 63.5, h: 72.0, gx: 2.5, gy: 0 },
    { id: 'a4-10', n: 'A4 10칸 · 2×5 · 99.1×57.0mm', c: 2, r: 5, w: 99.1, h: 57.0, gx: 2.5, gy: 0 },
    { id: 'a4-8', n: 'A4 8칸 · 2×4 · 99.1×67.7mm', c: 2, r: 4, w: 99.1, h: 67.7, gx: 2.5, gy: 0 },
    { id: 'a4-6', n: 'A4 6칸 · 2×3 · 99.1×93.1mm', c: 2, r: 3, w: 99.1, h: 93.1, gx: 2.5, gy: 0 },
    { id: 'a4-4', n: 'A4 4칸 · 2×2 · 99.1×139.0mm', c: 2, r: 2, w: 99.1, h: 139.0, gx: 2.5, gy: 0 },
    { id: 'a4-2', n: 'A4 2칸 · 1×2 · 199.6×143.5mm', c: 1, r: 2, w: 199.6, h: 143.5, gx: 0, gy: 0 },
    { id: 'a4-1', n: 'A4 1칸 · 1×1 · 199.6×289.1mm', c: 1, r: 1, w: 199.6, h: 289.1, gx: 0, gy: 0 }
  ];

  /* ---------- 데이터 파싱 ---------- */
  function splitLine(line, d) {
    var out = [], cur = '', q = false, i;
    for (i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }
  function parsePasted(txt) {
    var lines = String(txt).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    if (!lines.length) return [];
    var f = lines[0];
    var d = f.indexOf('\t') >= 0 ? '\t' : (f.indexOf(',') >= 0 ? ',' : null);
    return lines.map(function (l) {
      return d ? splitLine(l, d).map(function (s) { return s.trim(); }) : [l.trim()];
    });
  }
  function decodeText(buf) {
    var bytes = new Uint8Array(buf), txt;
    try { txt = new TextDecoder('utf-8').decode(bytes); }
    catch (e) { txt = String.fromCharCode.apply(null, bytes); }
    if (txt.indexOf('�') >= 0) {
      try { txt = new TextDecoder('euc-kr').decode(bytes); } catch (e2) { }
    }
    return txt.replace(/^﻿/, '');
  }

  function setTable(aoa) {
    aoa = (aoa || []).filter(function (r) {
      return r && r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; });
    });
    var width = 1;
    aoa.forEach(function (r) { if (r.length > width) width = r.length; });
    aoa = aoa.map(function (r) {
      var o = [], i;
      for (i = 0; i < width; i++) o.push(String(r[i] == null ? '' : r[i]).trim());
      return o;
    });
    if ($('#hasHeader').checked && aoa.length > 1) {
      S.headers = aoa[0].map(function (h, i) { return h || (i + 1) + '열'; });
      S.rows = aoa.slice(1);
    } else {
      S.headers = [];
      for (var i = 0; i < width; i++) S.headers.push((i + 1) + '열');
      S.rows = aoa;
    }
    if (S.sampleRow >= S.rows.length) S.sampleRow = 0;
    fillQtySelect();
    changed();                                   // updateStat 에서 범위에 맞춰 다시 채운다
  }

  function fillQtySelect() {
    var sel = $('#colQty'), prev = sel.dataset.touched === '1' ? sel.value : null;
    sel.innerHTML = '<option value="-1">사용 안 함</option>' + S.headers.map(function (h, i) {
      return '<option value="' + i + '">' + QL.esc(h) + '</option>';
    }).join('');
    var pick = null;
    if (prev !== null && sel.querySelector('option[value="' + prev + '"]')) pick = prev;
    if (pick === null) S.headers.forEach(function (h, i) {
      if (pick === null && /수량|개수|qty|count|매수|장수/i.test(h)) pick = String(i);
    });
    sel.value = pick === null ? '-1' : pick;
  }
  /* 미리볼 행 목록도 출력 범위를 따라간다 */
  function fillSampleSelect(win) {
    var sel = $('#sampleRow');
    if (!S.rows.length) { sel.innerHTML = '<option value="0">(데이터 없음)</option>'; S.sampleRow = 0; return; }
    var from = Math.max(1, win && win.from ? win.from : 1);
    var to = Math.min(S.rows.length, win && win.to ? win.to : S.rows.length);
    if (to < from) to = from;
    var last = Math.min(to, from + SAMPLE_MAX - 1);
    if (S.sampleRow < from - 1 || S.sampleRow > last - 1) S.sampleRow = from - 1;

    var h = '', i;
    for (i = from - 1; i < last; i++) {
      h += '<option value="' + i + '">' + (i + 1) + '행 · ' +
        QL.esc(S.rows[i].slice(0, 3).join(' / ').slice(0, 30)) + '</option>';
    }
    if (last < to) h += '<option value="' + (last - 1) + '" disabled>… ' +
      (to - last).toLocaleString() + '행 더 있음 (범위를 옮겨 보세요)</option>';
    sel.innerHTML = h;
    sel.value = String(S.sampleRow);
  }

  /* 조건식에 쓴 이름 중 열이 아닌 것 찾기 (데이터가 있을 때만 의미가 있다) */
  function lintTemplates() {
    var bad = {};
    if (!S.headers.length) return bad;
    S.elements.forEach(function (el) {
      if (!el.tpl) return;
      QL.lintConds(el.tpl, S.headers).forEach(function (n) {
        if (!bad[n]) bad[n] = [];
        var who = el.name || el.type;
        if (bad[n].indexOf(who) < 0) bad[n].push(who);
      });
    });
    return bad;
  }

  function drawWarn(v) {
    var el = $('#dataWarn');
    var msgs = [];

    if (S.rows.length && v) {
      var rows = Object.keys(v.prob).map(function (i) { return +i + 1; });
      if (rows.length) {
        var head = rows.slice(0, 8).join(', ') + (rows.length > 8 ? ' 외 ' + (rows.length - 8) + '행' : '');
        msgs.push('바코드 형식 오류 <b>' + rows.length.toLocaleString() + '행</b> — ' + head +
          '<br><span style="opacity:.8">' + QL.esc(v.prob[rows[0] - 1][0]) + '</span>' +
          (v.truncated ? '<br><span style="opacity:.8">※ ' + v.from.toLocaleString() + '~' +
            v.to.toLocaleString() + '행까지만 검사했습니다 (한 번에 ' +
            VALIDATE_MAX.toLocaleString() + '행)</span>' : ''));
      }
    }

    var lint = lintTemplates();
    var names = Object.keys(lint);
    if (names.length) {
      msgs.push('조건식에 없는 열 이름 <b>' + names.length + '개</b> — ' +
        names.slice(0, 5).map(function (n) {
          return '<code>' + QL.esc(n) + '</code>(' + QL.esc(lint[n].join(', ')) + ')';
        }).join(', ') +
        '<br><span style="opacity:.8">열이 아닌 이름은 글자 그대로 비교되어 조건이 늘 맞거나 늘 틀립니다. ' +
        '글자값을 일부러 쓰려면 따옴표로 감싸세요.</span>');
    }

    if (!msgs.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = msgs.join('<hr style="border:0;border-top:1px solid #fecaca;margin:6px 0">');
  }

  /* ---------- 번호 생성 ----------  /* ---------- 번호 생성 ----------
     데이터 없이 번호만 찍을 때 쓴다. 별도 모드가 아니라 데이터를 만들어 넣는
     방식이라, 표·검증·조건문·출력 범위 같은 기존 기능이 그대로 적용된다.
     끝 번호가 시작보다 작으면 내려가며 센다. */
  var GEN_MAX = 100000;

  function genRows() {
    var from = parseInt($('#genFrom').value, 10);
    var to = parseInt($('#genTo').value, 10);
    var step = Math.max(1, Math.abs(parseInt($('#genStep').value, 10) || 1));
    var pad = Math.max(0, Math.min(12, parseInt($('#genPad').value, 10) || 0));
    var pre = $('#genPre').value, suf = $('#genSuf').value;
    var col = ($('#genCol').value || '').trim() || '번호';
    if (!isFinite(from)) from = 1;
    if (!isFinite(to)) to = from;

    var down = to < from;
    var count = Math.floor(Math.abs(to - from) / step) + 1;
    var clipped = count > GEN_MAX;
    if (clipped) count = GEN_MAX;

    var rows = [], i, n, t;
    for (i = 0; i < count; i++) {
      n = down ? from - i * step : from + i * step;
      t = String(Math.abs(n));
      while (t.length < pad) t = '0' + t;
      rows.push([pre + (n < 0 ? '-' : '') + t + suf]);
    }
    S.headers = [col];
    S.rows = rows;
    S.sampleRow = 0;

    $('#genInfo').innerHTML = rows.length
      ? from.toLocaleString() + ' → ' + to.toLocaleString() + (down ? ' (내림차순)' : '') +
        ' · <b>' + rows.length.toLocaleString() + '행</b> 생성' +
        (rows.length ? ' (' + QL.esc(rows[0][0]) + ' … ' + QL.esc(rows[rows.length - 1][0]) + ')' : '') +
        (clipped ? '<br>한 번에 ' + GEN_MAX.toLocaleString() + '행까지만 만듭니다.' : '')
      : '만들 번호가 없습니다.';
    fillQtySelect();
    changed();
  }

  /* 현재 고른 입력 방식대로 데이터를 다시 읽는다 */
  function reloadSource() {
    var m = $('#srcTabs').querySelector('button.on').dataset.src;
    if (m === 'gen') genRows();
    else if (m === 'file' && workbook) loadSheet();
    else setTable(parsePasted($('#pasteArea').value));
  }

  /* ---------- 인쇄 항목 ----------
     수만 행이 들어와도 범위 밖 행은 수량만 세고 넘어간다.
     실제 항목 객체는 출력할 구간에 대해서만 만든다. */
  function rangeSpec() {
    var by = $('#rangeBy') ? $('#rangeBy').value : 'label';
    var from = Math.max(1, parseInt($('#rangeFrom').value, 10) || 1);
    var to = parseInt($('#rangeTo').value, 10) || 0;
    return { by: by, from: from, to: to > 0 ? to : Infinity };
  }

  function collectItems() {
    var qi = parseInt($('#colQty').value, 10);
    var rep = Math.max(1, parseInt($('#repeat').value, 10) || 1);
    var dedupe = $('#dedupe').checked, skipEmpty = $('#skipEmpty').checked;
    var sp = rangeSpec();
    var out = {
      items: [], seqOffset: 0, dup: 0, skip: 0,
      totalLabels: 0, totalRows: 0, usedRows: 0,
      rowFrom: 0, rowTo: 0, by: sp.by
    };

    if (!S.rows.length) {                        // 데이터 없이 고정 내용만
      for (var k = 0; k < rep; k++) out.items.push({ row: null, rowNo: 1 });
      out.totalLabels = out.items.length;
      return out;
    }

    var seen = dedupe ? {} : null;
    var seq = 0;                                 // 지금까지 센 라벨 수
    S.rows.forEach(function (row, idx) {
      var rowNo = idx + 1;
      out.totalRows = rowNo;
      var joined = row.join('\u0001');
      if (skipEmpty && joined.replace(/\u0001/g, '').trim() === '') { out.skip++; return; }
      if (dedupe) { if (seen[joined]) { out.dup++; return; } seen[joined] = 1; }

      var qty = 1;
      if (qi >= 0) {
        var q = parseInt(String(row[qi]).replace(/[^0-9\-]/g, ''), 10);
        qty = isFinite(q) ? q : 1;
      }
      qty *= rep;
      if (qty < 1) return;
      if (qty > 2000) qty = 2000;
      out.usedRows++;
      out.totalLabels += qty;

      var take = 0, skipHead = 0;
      if (sp.by === 'row') {
        if (rowNo < sp.from) { seq += qty; out.seqOffset = seq; return; }
        if (rowNo > sp.to) { seq += qty; return; }
        take = qty;
      } else {                                   // 라벨 장수 기준
        var first = seq + 1, last = seq + qty;
        if (last < sp.from) { seq += qty; out.seqOffset = seq; return; }
        if (first > sp.to) { seq += qty; return; }
        skipHead = Math.max(0, sp.from - first);
        take = Math.min(qty, sp.to - first + 1) - skipHead;
        if (!out.items.length) out.seqOffset = seq + skipHead;
      }
      if (!out.rowFrom) out.rowFrom = rowNo;
      out.rowTo = rowNo;
      for (var i = 0; i < take; i++) out.items.push({ row: row, rowNo: rowNo });
      seq += qty;
    });
    return out;
  }

  /* ---------- 데이터 검증 · 표 ---------- */
  var VALIDATE_MAX = 2000, TABLE_MAX = 200, SAMPLE_MAX = 300;

  /* 바코드 요소에 들어갈 값이 그 규격에 맞는지 검사한다.
     앞에서부터 고정된 만큼이 아니라 "지금 출력할 범위"를 본다.
     20,000행 중 15,000~15,500행만 뽑는데 1~500행만 검사하면 의미가 없다. */
  function validateRows(win) {
    var out = { prob: {}, dupe: {}, count: 0, from: 1, to: 0, truncated: false };
    if (!S.rows.length) return out;

    var from = Math.max(1, win && win.from ? win.from : 1);
    var to = Math.min(S.rows.length, win && win.to ? win.to : S.rows.length);
    if (to < from) to = from;
    var lim = Math.min(to, from + VALIDATE_MAX - 1);
    out.from = from; out.to = lim; out.truncated = lim < to;

    var bcs = S.elements.filter(function (e) { return e.type === 'barcode' && e.tpl; });
    var seen = {};
    for (var i = from - 1; i < lim; i++) {
      var row = S.rows[i];
      if (!row) continue;
      var joined = row.join('\u0001');
      if (seen[joined]) out.dupe[i] = 1; else seen[joined] = 1;

      for (var k = 0; k < bcs.length; k++) {
        var el = bcs[k];
        var v = QL.resolve(el.tpl, row, S.headers, { seq: i + 1, rowNo: i + 1 });
        var msg = null;
        if (!v) msg = (el.name || '바코드') + ' 값이 비어 있음';
        else if (!QL.barcodeValid(v, el.fmt || 'CODE128'))
          msg = (el.name || '바코드') + ' — ' + (el.fmt || 'CODE128') + ' 형식에 맞지 않음: ' + v;
        if (msg) { (out.prob[i] = out.prob[i] || []).push(msg); out.count++; }
      }
    }
    return out;
  }

  function drawTable(v, win) {
    var wrap = $('#dataTable');
    if (wrap.hidden) return;
    if (!S.rows.length) { wrap.innerHTML = '<p class="hint" style="padding:8px">데이터가 없습니다.</p>'; return; }
    v = v || validateRows(win);
    var from = v.from, to = Math.min(v.to, from + TABLE_MAX - 1);
    var h = '<table class="dt"><thead><tr><th>#</th>' +
      S.headers.map(function (x) { return '<th>' + QL.esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (var i = from - 1; i < to; i++) {
      var cls = (v.prob[i] ? 'bad ' : '') + (v.dupe[i] ? 'dupe ' : '') + (i === S.sampleRow ? 'cur' : '');
      h += '<tr data-row="' + i + '" class="' + cls.trim() + '"' +
        (v.prob[i] ? ' title="' + QL.esc(v.prob[i].join('\n')) + '"' : '') + '>' +
        '<td class="n">' + (i + 1) + '</td>' +
        S.rows[i].map(function (c) { return '<td>' + QL.esc(c) + '</td>'; }).join('') + '</tr>';
    }
    h += '</tbody></table>';
    if (to < v.to || from > 1) {
      h += '<p class="hint" style="padding:6px">' + from.toLocaleString() + '~' + to.toLocaleString() +
        '행 표시 · 출력 범위를 옮기면 그 구간이 보입니다 (전체 ' + S.rows.length.toLocaleString() + '행)</p>';
    }
    wrap.innerHTML = h;
  }


  /* ---------- 용지 ---------- */
  /* 길이 입력칸은 모두 mm 로 환산해 읽는다 */
  var MMFIELDS = ['labelW', 'labelH', 'rollGap', 'pageW', 'pageH', 'sLabelW', 'sLabelH',
    'gapX', 'gapY', 'marginL', 'marginT', 'offX', 'offY'];
  function mmv(id, def) {
    var v = QL.U.from($('#' + id).value);
    return isFinite(v) ? v : def;
  }

  function paperOpts() {
    var mode = $('#paperMode').value;
    var offX = mmv('offX', 0), offY = mmv('offY', 0);
    if (mode === 'roll') {
      return {
        mode: 'roll',
        labelW: mmv('labelW', 60),
        labelH: mmv('labelH', 40),
        gap: mmv('rollGap', 0),
        rot: parseInt($('#rotate').value, 10) || 0,
        offX: offX, offY: offY, border: $('#border').checked
      };
    }
    var pw = mmv('pageW', 210), ph = mmv('pageH', 297);
    var cols = Math.max(1, parseInt($('#cols').value, 10) || 1);
    var rows = Math.max(1, parseInt($('#rows').value, 10) || 1);
    var lw = mmv('sLabelW', 50), lh = mmv('sLabelH', 30);
    var gx = mmv('gapX', 0), gy = mmv('gapY', 0);
    var ml, mt;
    if ($('#autoMargin').checked) {
      ml = r2((pw - (cols * lw + (cols - 1) * gx)) / 2);
      mt = r2((ph - (rows * lh + (rows - 1) * gy)) / 2);
      $('#marginL').value = QL.U.to(ml); $('#marginT').value = QL.U.to(mt);
    } else {
      ml = mmv('marginL', 0);
      mt = mmv('marginT', 0);
    }
    return {
      mode: 'sheet', pageW: pw, pageH: ph, cols: cols, rows: rows,
      labelW: lw, labelH: lh, gapX: gx, gapY: gy,
      ml: ml + offX, mt: mt + offY, offX: offX, offY: offY,
      startAt: Math.max(0, (parseInt($('#startAt').value, 10) || 1) - 1),
      border: $('#border').checked, guide: true
    };
  }

  function syncLabelSize() {
    var o = paperOpts();
    S.label = { w: o.labelW, h: o.labelH };
    /* 디자인 캔버스에만 걸어 둔다 — :root 에 두면 값이 바뀔 때마다
       미리보기 수천 장까지 스타일을 다시 계산해 한 글자가 400ms 씩 걸린다 */
    $('#stage').style.setProperty('--lw', o.labelW + 'mm');
    $('#stage').style.setProperty('--lh', o.labelH + 'mm');
    return o;
  }

  /* ---------- 다시 그리기 ---------- */
  /* 설정이 바뀌었을 때.
     가벼운 일(디자인 화면·장수·인쇄 치수)은 바로 하고, 미리보기 수천 장을 다시
     만드는 무거운 일은 "입력을 끝냈을 때"만 한다 — 2,000장에서 1.0초,
     5,000장에서 2.3초씩 멈추므로 숫자 한 글자마다 다시 만들 수는 없다. */
  function changed() { schedule(true); }
  function changedLive() { schedule(false); }
  QL.changed = changed;

  function schedule(commit) {
    previewDirty = true;
    if (commit) wantCommit = true;
    clearTimeout(redrawT);
    redrawT = setTimeout(function () {
      var now = wantCommit; wantCommit = false;
      if (QL.usesEmbed(S.elements)) ensureFontCss();
      syncLabelSize();
      /* 미리보기 화면에서 --s 를 건드리면 이미 있는 수천 장이 다시 배치된다.
         어차피 뒤처진 화면이니 다시 만들 때 함께 맞춘다. */
      if (view === 'design') applyZoom();
      QL.D.draw();
      updateStat();
      save();
      if (now && view === 'preview') buildPreview();
      else markStale();
    }, 120);
  }

  /* 미리보기가 지금 설정보다 뒤처져 있다고 알린다 */
  function markStale() {
    $('#staleBar').hidden = !(previewDirty && view === 'preview');
  }

  function updateStat() {
    var c = collectItems(), o = paperOpts();
    /* 출력할 구간을 먼저 알아내고, 검증·표·미리볼 행을 모두 거기에 맞춘다 */
    var win = S.rows.length
      ? { from: c.rowFrom || 1, to: c.rowTo || S.rows.length }
      : null;
    var v = win ? validateRows(win) : null;
    drawWarn(v);
    drawTable(v, win);
    fillSampleSelect(win);
    var n = c.items.length;
    var pages = o.mode === 'roll' ? n
      : Math.ceil((n + (o.startAt % (o.cols * o.rows))) / (o.cols * o.rows));
    $('#stat').innerHTML = '라벨 <b>' + n.toLocaleString() + '</b>장 · 페이지 <b>' +
      (n ? pages.toLocaleString() : 0) + '</b>장';

    var info = $('#rangeInfo');
    if (!S.rows.length) info.textContent = '';
    else if (c.by === 'row') {
      info.innerHTML = '전체 <b>' + c.totalRows.toLocaleString() + '행</b> 중 ' +
        (n ? c.rowFrom.toLocaleString() + '~' + c.rowTo.toLocaleString() + '행' : '해당 행 없음') +
        ' → 라벨 ' + n.toLocaleString() + '장 (전체 ' + c.totalLabels.toLocaleString() + '장)';
    } else {
      info.innerHTML = '전체 라벨 <b>' + c.totalLabels.toLocaleString() + '장</b> 중 ' +
        (n ? (c.seqOffset + 1).toLocaleString() + '~' + (c.seqOffset + n).toLocaleString() + '장' : '없음');
    }

    /* 드라이버 용지와 맞추라고 실제 인쇄 페이지 치수를 보여 준다.
       치수가 다르면 브라우저가 맞춤 배율로 줄여 그려 흐릿해진다. */
    var pw, ph, land;
    if (o.mode === 'roll') {
      var sw = (o.rot === 90 || o.rot === 270);
      pw = sw ? o.labelH : o.labelW;
      ph = (sw ? o.labelW : o.labelH) + o.gap;
    } else { pw = o.pageW; ph = o.pageH; }
    land = pw > ph;
    $('#pageSizeInfo').innerHTML =
      '인쇄 페이지 <b>' + QL.U.to(pw) + ' × ' + QL.U.to(ph) + ' ' + QL.U.label() + '</b>' +
      ' · ' + (land ? '가로 방향' : '세로 방향') +
      (o.mode === 'roll' && o.gap
        ? '<br><span style="opacity:.8">라벨 ' + QL.U.to(o.labelH) + ' + 간격 ' +
          QL.U.to(o.gap) + ' 이 더해진 값입니다. 드라이버 용지가 라벨 크기뿐이면 간격을 0 으로 두세요.</span>'
        : '');

    var sum = $('#dataSummary');
    if (!S.rows.length) {
      sum.className = 'note';
      sum.textContent = '데이터가 없어 고정 내용으로 ' + n + '장만 만듭니다.';
    } else {
      var m = '데이터 <b>' + c.totalRows.toLocaleString() + '</b>행 → 라벨 <b>' +
        c.totalLabels.toLocaleString() + '</b>장';
      if (c.dup) m += ' · 중복 제외 ' + c.dup;
      if (c.skip) m += ' · 빈 행 ' + c.skip;
      sum.className = 'note'; sum.innerHTML = m;
    }
  }

  /* ---------- 확대 ---------- */
  var lastDs = null, lastS = null;
  function setVar(el, name, v, keep) {
    if (keep === v) return v;                      // 같은 값을 다시 쓰면 restyle 만 유발한다
    el.style.setProperty(name, v);
    return v;
  }
  function applyZoom() {
    var z = $('#zoom').value, o = paperOpts(), s;
    if (view === 'design') {
      var wrap = $('#stagewrap');
      var aw = Math.max(80, wrap.clientWidth - 56), ah = Math.max(80, wrap.clientHeight - 90);
      if (z === 'fit') s = Math.min(aw / (o.labelW * MM2PX), ah / (o.labelH * MM2PX), 8);
      else s = parseFloat(z);
      s = Math.max(0.1, s);
      S.scale = s;
      lastDs = setVar($('#stage'), '--ds', s, lastDs);
      var st = $('#stage');
      st.style.width = (o.labelW * MM2PX * s) + 'px';
      st.style.height = (o.labelH * MM2PX * s) + 'px';
    } else {
      var pv = $('#pagesview');
      var pw = o.mode === 'roll'
        ? (o.rot === 90 || o.rot === 270 ? o.labelH : o.labelW)
        : o.pageW;
      var aw2 = Math.max(80, pv.clientWidth - 52);
      if (z === 'fit') s = Math.min(aw2 / (pw * MM2PX), 2.2);
      else s = parseFloat(z);
      lastS = setVar($('#pages'), '--s', Math.max(0.1, s), lastS);
    }
  }

  /* ---------- 미리보기 ---------- */
  var CHUNK_SYNC = 120;      // 이 장수까지는 끊지 않고 한 번에 만든다
  var SLICE_MS = 50;         // 한 조각이 목표로 하는 시간
  var SHOW_AFTER = 250;      // 이만큼 걸릴 때만 가림막을 띄운다 — 잠깐이면 깜빡여 거슬린다
  var buildToken = 0, buildTimer = null, showTimer = null;

  function prepPages() {
    var o = syncLabelSize();
    var c = collectItems();
    o.items = c.items;
    o.seqOffset = c.seqOffset;
    o.elements = S.elements;
    o.headers = S.headers;
    var st = QL.pageStepper(o);
    $('#pages').style.setProperty('--pw', st.pw + 'mm');
    $('#pages').style.setProperty('--ph', st.ph + 'mm');
    $('#pageRule').textContent = '@page{size:' + st.pw + 'mm ' + st.ph + 'mm;margin:0}';
    return { st: st, n: c.items.length };
  }

  function tailHtml(st, n) {
    return (st.limited ? '<p class="more">한 번에 ' + QL.MAX_LABELS.toLocaleString() +
        '장까지만 만듭니다. (선택한 범위 ' + n.toLocaleString() +
        '장) — 위의 <b>출력 범위</b>로 나누어 뽑으세요.</p>' : '') +
      (n ? '' : '<p class="more">출력할 라벨이 없습니다.</p>');
  }

  function donePages(st, n) {
    $('#pages').insertAdjacentHTML('beforeend', tailHtml(st, n));
    previewDirty = false;
    markStale();
    applyZoom();
  }

  function stopBuild() {
    buildToken++;
    clearTimeout(buildTimer);
    clearTimeout(showTimer);
    busyCancel(null);
    busy(false);
  }

  /* 조금씩 만들면서 진행률을 보여 준다. 수천 장이어도 화면이 멈추지 않는다. */
  function buildPreview(cb) {
    stopBuild();
    var host = $('#pages');
    /* 바뀐 치수로 옛 페이지를 다시 배치하는 것이 비싸다 — 먼저 비우고 계산한다 */
    if (host.childElementCount > CHUNK_SYNC) host.textContent = '';
    var token = buildToken, r = prepPages(), st = r.st, n = r.n;
    applyZoom();

    if (st.total <= CHUNK_SYNC) {
      host.innerHTML = st.step(st.total);
      donePages(st, n);
      if (cb) cb();
      return;
    }

    host.innerHTML = '';
    var shown = false;
    showTimer = setTimeout(function () {
      shown = true;
      showBuilding(st);
      busyCancel(function () {
        buildToken++;
        clearTimeout(buildTimer);
        busyCancel(null);
        busy(false);
        host.insertAdjacentHTML('beforeend',
          '<p class="more">중단했습니다 — ' + st.progress().pages.toLocaleString() +
          ' / ' + st.total.toLocaleString() + '페이지까지만 만들었습니다. ' +
          '위의 <b>지금 반영</b>으로 다시 만들 수 있습니다.</p>');
        markStale();
        applyZoom();
      });
    }, SHOW_AFTER);

    var per = 16;                                  // 한 조각에 붙이는 페이지 수
    function tick() {
      if (token !== buildToken) return;            // 설정이 또 바뀌어 버려진 작업
      var t0 = performance.now();
      host.insertAdjacentHTML('beforeend', st.step(per));
      host.offsetHeight;                           // 배치 비용까지 이 조각 안에서 치른다
      var dt = performance.now() - t0;
      /* 만드는 값보다 붙이고 배치하는 값이 더 크다 — 실제로 걸린 시간을 보고 맞춘다 */
      per = Math.max(4, Math.min(400, Math.round(per * (dt > 1 ? SLICE_MS / dt : 2))));
      if (st.done()) {
        clearTimeout(showTimer);
        busyCancel(null);
        busy(false);
        donePages(st, n);
        if (cb) cb();
        return;
      }
      if (shown) showBuilding(st);
      buildTimer = setTimeout(tick, 0);
    }
    buildTimer = setTimeout(tick, 30);             // 표시가 먼저 그려지도록 한 박자 늦게
  }

  function showBuilding(st) {
    var done = st.progress().pages;
    busy('라벨 ' + st.shown.toLocaleString() + '장 만드는 중…', done / st.total,
      done.toLocaleString() + ' / ' + st.total.toLocaleString() + '페이지');
  }

  /* 끊지 않고 전부 — 인쇄 직전처럼 기다릴 수 없는 자리에서 쓴다 */
  function buildPreviewSync() {
    stopBuild();
    var r = prepPages();
    $('#pages').innerHTML = r.st.step(r.st.total);
    donePages(r.st, r.n);
  }

  /* ---------- 만드는 중 표시 ---------- */
  function busy(msg, frac, sub) {
    var el = $('#busy');
    if (msg === false) { el.hidden = true; return; }
    $('#busyMsg').textContent = msg;
    $('#busySub').textContent = sub || '';
    var bar = $('#busyBar');
    if (frac == null) {
      bar.classList.add('idle');
      $('#busyFill').style.width = '';
    } else {
      bar.classList.remove('idle');
      $('#busyFill').style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
    }
    el.hidden = false;
  }
  var cancelFn = null;
  function busyCancel(fn) {
    cancelFn = fn;
    $('#busyCancel').hidden = !fn;
  }

  function ensurePreviewSync() { if (previewDirty) buildPreviewSync(); }

  function ensurePreview(cb) {
    if (!previewDirty) { if (cb) cb(); return; }
    buildPreview(cb);
  }

  function setView(v) {
    view = v;
    $$('#viewTabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.view === v); });
    $('#stagewrap').hidden = v !== 'design';
    $('#ctoolbar').hidden = v !== 'design';
    $('#pagesview').hidden = v !== 'preview';
    if (v === 'preview') ensurePreview();
    else { stopBuild(); markStale(); }
    applyZoom();
  }

  /* ---------- 저장/복원 ---------- */
  var IDS = ['hasHeader', 'colQty', 'repeat', 'genFrom', 'genTo', 'genStep', 'genPad', 'genPre', 'genSuf', 'genCol', 'skipEmpty', 'dedupe', 'paperMode', 'rollPreset',
    'labelW', 'labelH', 'rollGap', 'rotate', 'sheetPreset', 'pageW', 'pageH', 'cols', 'rows',
    'sLabelW', 'sLabelH', 'gapX', 'gapY', 'autoMargin', 'marginL', 'marginT', 'startAt', 'rangeBy', 'rangeFrom', 'rangeTo',
    'offX', 'offY', 'border', 'snap', 'unit'];
  var KEY = 'labeldesigner.v1';

  function collect() {
    var o = {};
    IDS.forEach(function (id) {
      var el = $('#' + id); if (!el) return;
      o[id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return o;
  }
  var saveWarned = false;
  function save() {
    var base = { set: collect(), elements: S.elements, src: activeSrc() };
    var paste = $('#pasteArea').value;
    function put(withPaste) {
      base.paste = withPaste ? paste : '';
      localStorage.setItem(KEY, JSON.stringify(base));
    }
    try { put(true); saveWarned = false; return; }
    catch (e) { /* 아래에서 데이터를 빼고 다시 */ }
    try {
      put(false);
      if (!saveWarned) {
        saveWarned = true;
        toast('데이터가 커서(' + Math.round(paste.length / 1024) +
          'KB) 자동 저장에서 제외했습니다. 디자인·설정은 저장되니, 다시 열 때 데이터만 새로 넣으세요.', 'bad');
      }
    } catch (e2) {
      if (saveWarned) return;
      saveWarned = true;
      var imgKB = 0;
      S.elements.forEach(function (el) { if (el.type === 'image' && el.src) imgKB += el.src.length / 1024; });
      toast('자동 저장 실패 — 브라우저 저장 공간을 넘었습니다' +
        (imgKB > 200 ? ' (이미지 ' + Math.round(imgKB) + 'KB)' : '') +
        '. 브라우저 저장은 이미 가득 찼으니 「파일↓」로 내려받아 두세요.', 'bad');
    }
  }

  function activeSrc() {
    var b = $('#srcTabs').querySelector('button.on');
    return b ? b.dataset.src : 'paste';
  }
  function setSrc(m) {
    var btn = $('#srcTabs').querySelector('button[data-src="' + m + '"]');
    if (!btn) return;
    $$('#srcTabs button').forEach(function (x) { x.classList.toggle('on', x === btn); });
    $('#srcPaste').hidden = m !== 'paste';
    $('#srcFile').hidden = m !== 'file';
    $('#srcGen').hidden = m !== 'gen';
    $('#hasHeader').disabled = m === 'gen';
  }

  function applySettings(o) {
    IDS.forEach(function (id) {
      if (!(id in o)) return;
      var el = $('#' + id); if (!el) return;
      if (el.type === 'checkbox') el.checked = !!o[id];
      else el.value = o[id];
    });
  }
  function load() {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
    if (!o) return false;
    if (o.set) applySettings(o.set);
    if (o.elements && o.elements.length) S.elements = o.elements;
    if (o.paste) $('#pasteArea').value = o.paste;
    if (o.src) setSrc(o.src);
    return true;
  }

  /* ---------- 기본 서식 ---------- */
  function seedDefault() {
    var w = S.label.w, h = S.label.h;
    var q = Math.min(h - 16, w * 0.38);
    S.elements = [
      { id: 'd1', type: 'qr', name: 'QR', tpl: '{1}', x: 2, y: 2, w: r2(q), h: r2(q),
        ecc: 'M', quiet: 2, color: '#000000', rot: 0 },
      { id: 'd2', type: 'text', name: '품명', tpl: '{2}', x: r2(q + 4), y: 2, w: r2(w - q - 6), h: 9,
        font: 'embed', size: 10, bold: true, italic: false, color: '#000000',
        align: 'left', valign: 'top', wrap: true, fit: true, lh: 1.15, ls: 0, rot: 0 },
      { id: 'd3', type: 'text', name: '보조', tpl: '{3}', x: r2(q + 4), y: 12, w: r2(w - q - 6), h: 6,
        font: 'embed', size: 8, bold: false, italic: false, color: '#000000',
        align: 'left', valign: 'top', wrap: false, fit: true, lh: 1.15, ls: 0, rot: 0 },
      { id: 'd4', type: 'barcode', name: '바코드', tpl: '{1}', x: 2, y: r2(q + 4),
        w: r2(w - 4), h: r2(h - q - 6), fmt: 'CODE128', hri: true, hriSize: 6, quiet: 10,
        font: 'embed', color: '#000000', rot: 0 }
    ];
  }

  /* ---------- 프리셋 ---------- */
  function fillPresets() {
    $('#rollPreset').innerHTML = ROLL.map(function (p) {
      return '<option value="' + p.id + '">' + p.n + '</option>';
    }).join('');
    $('#rollPreset').value = '60x40';
    $('#sheetPreset').innerHTML = SHEET.map(function (p) {
      return '<option value="' + p.id + '">' + p.n + '</option>';
    }).join('');
    $('#sheetPreset').value = 'a4-21';
  }
  function applyRollPreset() {
    var p = ROLL.filter(function (x) { return x.id === $('#rollPreset').value; })[0];
    if (!p || p.id === 'custom') return;
    $('#labelW').value = QL.U.to(p.w); $('#labelH').value = QL.U.to(p.h);
    changed();
  }
  function applySheetPreset() {
    var p = SHEET.filter(function (x) { return x.id === $('#sheetPreset').value; })[0];
    if (!p || p.id === 'custom') return;
    $('#pageW').value = QL.U.to(210); $('#pageH').value = QL.U.to(297);
    $('#cols').value = p.c; $('#rows').value = p.r;
    $('#sLabelW').value = QL.U.to(p.w); $('#sLabelH').value = QL.U.to(p.h);
    $('#gapX').value = QL.U.to(p.gx); $('#gapY').value = QL.U.to(p.gy);
    $('#autoMargin').checked = true;
    toggleMargin(); changed();
  }
  function toggleMargin() {
    var on = $('#autoMargin').checked;
    $('#marginL').disabled = on; $('#marginT').disabled = on;
  }
  /* 단위를 바꾸면 화면에 적힌 숫자와 (mm)/(in) 표시를 함께 갈아 끼운다 */
  function applyUnit(prev) {
    var next = $('#unit').value === 'in' ? 'in' : 'mm';
    MMFIELDS.forEach(function (id) {
      var el = $('#' + id);
      var v = parseFloat(el.value);
      if (isFinite(v)) {
        var mm = Math.round((prev === 'in' ? v * 25.4 : v) * 100) / 100;
        el.value = next === 'in' ? Math.round(mm / 25.4 * 10000) / 10000 : mm;
      }
      el.step = next === 'in' ? '0.001' : '0.1';
    });
    QL.U.unit = next;
    S.unit = next;
    $$('.side.left .u').forEach(function (sp) { sp.textContent = QL.U.label(); });
    QL.D.draw();
    changed();
  }

  function togglePaperMode() {
    var roll = $('#paperMode').value === 'roll';
    $('#rollOpts').hidden = !roll;
    $('#sheetOpts').hidden = roll;
    changed();
  }

  /* ---------- 내장 글꼴 ----------
     글꼴 CSS(와 woff2)는 '내장 글꼴'을 실제로 쓸 때만 끼워 넣는다. */
  var fontCssOn = false;
  function ensureFontCss() {
    if (fontCssOn) return;
    fontCssOn = true;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'vendor/fonts/pretendard.css';
    document.head.appendChild(l);
  }
  QL.ensureFontCss = ensureFontCss;

  /* ---------- 알림 ---------- */
  var toastT = null;
  function toast(msg, kind) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.hidden = true; }, kind === 'bad' ? 7000 : 3500);
  }
  QL.toast = toast;

  /* ---------- 엑셀 파서 지연 로딩 ----------
     SheetJS 는 gzip 308KB 로 전체의 대부분을 차지한다.
     붙여넣기만 쓰는 경우엔 끝까지 받지 않도록 파일을 열 때만 가져온다. */
  var xlsxState = 'idle';          // idle | loading | ready | failed
  var xlsxWaiters = [];
  function ensureXLSX(cb) {
    if (xlsxState === 'ready' || typeof XLSX !== 'undefined') { xlsxState = 'ready'; cb(true); return; }
    xlsxWaiters.push(cb);
    if (xlsxState === 'loading') return;
    xlsxState = 'loading';
    toast('엑셀 파서를 불러오는 중…');
    var sc = document.createElement('script');
    sc.src = 'vendor/xlsx.full.min.js';
    sc.onload = function () {
      xlsxState = 'ready';
      xlsxWaiters.splice(0).forEach(function (f) { f(true); });
    };
    sc.onerror = function () {
      xlsxState = 'failed';
      xlsxWaiters.splice(0).forEach(function (f) { f(false); });
    };
    document.head.appendChild(sc);
  }

  /* ---------- 파일 ---------- */
  /* 큰 엑셀은 읽고 펼치는 동안 한참 멈춘다 — 표시를 먼저 그린 뒤 일을 시작한다 */
  function readFile(file) {
    $('#fileName').textContent = file.name + ' 읽는 중…';
    var isText = /\.(csv|txt|tsv)$/i.test(file.name);
    var fr = new FileReader();
    fr.onload = function (e) {
      busy(file.name + ' 읽는 중…');            // 얼마나 남았는지 알 수 없어 흐르는 막대
      setTimeout(function () { parse(e.target.result); }, 30);
    };
    fr.onerror = function () {
      busy(false);
      $('#fileName').textContent = '읽기 실패';
      toast('파일을 읽지 못했습니다.', 'bad');
    };
    fr.readAsArrayBuffer(file);

    function parse(buf) {
      try {
        if (isText) {
          workbook = null; $('#sheetWrap').hidden = true;
          $('#pasteArea').value = decodeText(buf);
          setTable(parsePasted($('#pasteArea').value));
          $('#fileName').textContent = file.name + ' · ' + S.rows.length + '행';
          busy(false);
          return;
        }
        ensureXLSX(function (ok) {
          if (!ok) {
            busy(false);
            $('#fileName').textContent = '엑셀 파서를 불러오지 못했습니다. vendor/xlsx.full.min.js 를 확인하세요.';
            toast('엑셀 파서를 불러오지 못했습니다. CSV 로 저장하거나 붙여넣기를 쓰세요.', 'bad');
            return;
          }
          try {
            workbook = XLSX.read(new Uint8Array(buf), { type: 'array' });
            var names = workbook.SheetNames;
            $('#sheetWrap').hidden = names.length < 2;
            $('#sheetSel').innerHTML = names.map(function (n) {
              return '<option value="' + QL.esc(n) + '">' + QL.esc(n) + '</option>';
            }).join('');
            $('#sheetSel').value = names[0];
            loadSheet();
            $('#fileName').textContent = file.name + ' · 시트 ' + names.length + '개 · ' + S.rows.length + '행';
          } catch (err2) {
            $('#fileName').textContent = '읽기 실패: ' + err2.message;
            toast('엑셀 파일을 읽지 못했습니다: ' + err2.message, 'bad');
          }
          busy(false);
        });
      } catch (err) {
        busy(false);
        $('#fileName').textContent = '읽기 실패: ' + err.message;
      }
    }
  }

  function loadSheet() {
    if (!workbook) return;
    var ws = workbook.Sheets[$('#sheetSel').value];
    if (!ws) return;
    setTable(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false }));
  }

  /* ---------- 서식 라이브러리 (브라우저에 여러 벌 보관) ---------- */
  var LIBKEY = 'labeldesigner.lib.v1';

  function libRead() {
    try { return JSON.parse(localStorage.getItem(LIBKEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function libWrite(o) {
    try { localStorage.setItem(LIBKEY, JSON.stringify(o)); return true; }
    catch (e) { toast('서식을 저장하지 못했습니다 — 저장 공간이 부족합니다. 「파일↓」로 내보내세요.', 'bad'); return false; }
  }
  function libFill(keep) {
    var lib = libRead(), names = Object.keys(lib).sort();
    $('#tplSel').innerHTML = '<option value="">서식 선택…</option>' + names.map(function (n) {
      return '<option value="' + QL.esc(n) + '">' + QL.esc(n) + '</option>';
    }).join('');
    if (keep && lib[keep]) $('#tplSel').value = keep;
  }
  function libSave() {
    var cur = $('#tplSel').value;
    var name = (window.prompt('서식 이름', cur || '내 서식 1') || '').trim();
    if (!name) return;
    var lib = libRead();
    if (lib[name] && !window.confirm('「' + name + '」을(를) 덮어쓸까요?')) return;
    lib[name] = { set: collect(), elements: S.elements, at: new Date().toISOString().slice(0, 16).replace('T', ' ') };
    if (libWrite(lib)) { libFill(name); toast('「' + name + '」 저장했습니다.'); }
  }
  function libLoad(name) {
    var lib = libRead(), d = lib[name];
    if (!d) return;
    if (d.set) applySettings(d.set);
    QL.D.mark(function () { S.elements = JSON.parse(JSON.stringify(d.elements)); });
    S.selIds = [];
    togglePaperMode(); toggleMargin();
    changed();
    toast('「' + name + '」 불러왔습니다.' + (d.at ? ' (' + d.at + ' 저장)' : ''));
  }
  function libDel() {
    var name = $('#tplSel').value;
    if (!name) { toast('지울 서식을 먼저 고르세요.'); return; }
    if (!window.confirm('「' + name + '」을(를) 지울까요?')) return;
    var lib = libRead();
    delete lib[name];
    libWrite(lib); libFill(); toast('「' + name + '」 지웠습니다.');
  }

  /* ---------- 서식 파일 내보내기/가져오기 ---------- */
  function exportTpl() {
    var data = { app: 'label-designer', version: 1, set: collect(), elements: S.elements };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '라벨서식.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function importTpl(file) {
    var fr = new FileReader();
    fr.onload = function (e) {
      try {
        var d = JSON.parse(e.target.result);
        if (!d || !d.elements) throw new Error('형식이 아닙니다');
        if (d.set) applySettings(d.set);
        QL.D.mark(function () { S.elements = d.elements; });
        S.selIds = [];
        togglePaperMode(); toggleMargin();
        changed();
      } catch (err) { alert('불러오기 실패: ' + err.message); }
    };
    fr.readAsText(file);
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    $('#viewTabs').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view);
    });
    $('#srcTabs').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-src]'); if (!b) return;
      setSrc(b.dataset.src);
      reloadSource();
      save();
    });
    ['genFrom', 'genTo', 'genStep', 'genPad', 'genPre', 'genSuf', 'genCol'].forEach(function (id) {
      $('#' + id).addEventListener('input', function () {
        if (!$('#srcGen').hidden) genRows();
      });
    });

    var pt = null;
    $('#pasteArea').addEventListener('input', function () {
      clearTimeout(pt);
      pt = setTimeout(function () { workbook = null; setTable(parsePasted($('#pasteArea').value)); }, 250);
    });
    $('#btnSample').addEventListener('click', function () {
      $('#pasteArea').value =
        '바코드\t품명\t규격\t가격\t수량\n' +
        '8801234567890\t제주 삼다수\t500ml\t900\t3\n' +
        '8801234567891\t콜롬비아 원두\t200g\t12,000\t2\n' +
        '8801234567892\t서울우유\t1L\t2,850\t1\n' +
        '8801234567893\t초코칩 쿠키\t12입\t4,500\t4\n' +
        'A-2024-0001\t내부관리 자산\t창고 A-3\t-\t2';
      $('#pasteArea').dispatchEvent(new Event('input'));
    });
    $('#btnClear').addEventListener('click', function () {
      $('#pasteArea').value = ''; workbook = null; setTable([]);
    });

    $('#drop').addEventListener('click', function () { $('#fileInput').click(); });
    $('#fileInput').addEventListener('change', function (e) { if (e.target.files[0]) readFile(e.target.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      $('#drop').addEventListener(ev, function (e) { e.preventDefault(); $('#drop').classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      $('#drop').addEventListener(ev, function (e) { e.preventDefault(); $('#drop').classList.remove('over'); });
    });
    $('#drop').addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });
    $('#sheetSel').addEventListener('change', loadSheet);
    $('#hasHeader').addEventListener('change', reloadSource);
    $('#colQty').addEventListener('change', function () { this.dataset.touched = '1'; changed(); });
    $('#sampleRow').addEventListener('change', function () {
      S.sampleRow = parseInt(this.value, 10) || 0; QL.D.draw(); updateStat();
    });
    $('#btnTable').addEventListener('click', function () {
      var w = $('#dataTable');
      w.hidden = !w.hidden;
      this.textContent = w.hidden ? '표로 확인 ▾' : '표 접기 ▴';
      updateStat();
    });
    $('#dataTable').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-row]'); if (!tr) return;
      S.sampleRow = parseInt(tr.dataset.row, 10) || 0;
      $('#sampleRow').value = String(S.sampleRow);
      QL.D.draw(); updateStat();
    });

    // 요소 추가
    $('#ctoolbar').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.add) {
        if (b.dataset.add === 'image') { $('#imgFile').click(); return; }
        QL.D.add(b.dataset.add);
      } else if (b.id === 'btnUndo') QL.D.undo();
      else if (b.id === 'btnRedo') QL.D.redo();
      else if (b.id === 'btnDup') QL.D.duplicate();
      else if (b.id === 'btnDel') QL.D.remove();
      else if (b.id === 'btnFront') QL.D.move('front');
      else if (b.id === 'btnBack') QL.D.move('back');
    });
    $('#imgFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function (ev) {
        var sel = QL.D.sel();
        if (sel && sel.type === 'image') {
          QL.D.mark(function () { sel.src = ev.target.result; });
          QL.D.draw(); changed();
        } else QL.D.add('image', ev.target.result);
      };
      fr.readAsDataURL(f);
      e.target.value = '';
    });
    // 좁은 화면: 사이드 패널을 서랍처럼 열고 닫는다
    function pane(side, on) {
      var el = $('.side.' + side);
      if (on === undefined) on = !el.classList.contains('open');
      $$('.side').forEach(function (p) { p.classList.remove('open'); });
      if (on) el.classList.add('open');
      $('#scrim').hidden = !on;
    }
    $('#tglLeft').addEventListener('click', function () { pane('left'); });
    $('#tglRight').addEventListener('click', function () { pane('right'); });
    $('#scrim').addEventListener('click', function () { pane('left', false); });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1000) {
        $$('.side').forEach(function (p) { p.classList.remove('open'); });
        $('#scrim').hidden = true;
      }
    });

    $('#snap').addEventListener('change', function () { S.snap = this.checked; save(); });
    $('#zoom').addEventListener('change', applyZoom);
    window.addEventListener('resize', function () { if ($('#zoom').value === 'fit') applyZoom(); });

    // 용지/출력 설정
    $('#unit').addEventListener('change', function () { applyUnit(QL.U.unit); });
    $('#paperMode').addEventListener('change', togglePaperMode);
    $('#rollPreset').addEventListener('change', applyRollPreset);
    $('#sheetPreset').addEventListener('change', applySheetPreset);
    $('#autoMargin').addEventListener('change', function () { toggleMargin(); changed(); });
    ['labelW', 'labelH'].forEach(function (id) {
      $('#' + id).addEventListener('input', function () { $('#rollPreset').value = 'custom'; });
    });
    ['pageW', 'pageH', 'cols', 'rows', 'sLabelW', 'sLabelH', 'gapX', 'gapY'].forEach(function (id) {
      $('#' + id).addEventListener('input', function () { $('#sheetPreset').value = 'custom'; });
    });
    /* 직접 적는 칸은 두 단계로 받는다.
       input  — 치는 동안. 디자인 화면과 장수·치수만 가볍게 고친다.
       change — 포커스가 옮겨가거나 Enter·화살표를 쓴 순간. 이때 미리보기를 다시 만든다. */
    IDS.forEach(function (id) {
      var el = $('#' + id); if (!el) return;
      if (el.tagName === 'SELECT' || el.type === 'checkbox') {
        el.addEventListener('change', function () { changed(); });
      } else {
        el.addEventListener('input', changedLive);
        el.addEventListener('change', function () { changed(); });
      }
    });
    $('#btnRefresh').addEventListener('click', function () { buildPreview(); });
    $('#busyCancel').addEventListener('click', function () { if (cancelFn) cancelFn(); });

    $('#tplSel').addEventListener('change', function () { if (this.value) libLoad(this.value); });
    $('#btnTplNew').addEventListener('click', libSave);
    $('#btnTplDel').addEventListener('click', libDel);
    $('#btnTplSave').addEventListener('click', exportTpl);
    $('#btnTplLoad').addEventListener('click', function () { $('#tplFile').click(); });
    $('#tplFile').addEventListener('change', function (e) { if (e.target.files[0]) importTpl(e.target.files[0]); e.target.value = ''; });

    $('#btnPrint').addEventListener('click', function () {
      setView('preview');
      ensurePreview(startPrint);          // 다 만든 뒤에 인쇄 대화상자를 연다
    });
    /* 브라우저가 직접 인쇄를 시작한 경우(네이티브 Ctrl+P 등)에도 내용이 있도록 */
    window.addEventListener('beforeprint', ensurePreviewSync);
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setView('preview');
        ensurePreview(startPrint);
      }
    });
  }

  /* ---------- 시작 ---------- */
  function init() {
    if (typeof qrcode !== 'undefined' && qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];   // 한글 QR
    }
    fillPresets();
    bind();
    libFill();
    var restored = load();
    QL.U.unit = $('#unit').value === 'in' ? 'in' : 'mm';
    S.unit = QL.U.unit;
    $$('.side.left .u').forEach(function (sp) { sp.textContent = QL.U.label(); });
    MMFIELDS.forEach(function (id) { $('#' + id).step = QL.U.step(); });
    S.snap = $('#snap').checked;
    togglePaperMode();
    toggleMargin();
    syncLabelSize();
    QL.D.init(S, function () { previewDirty = true; save(); updateStat(); markStale(); });
    if (!restored || !S.elements.length) seedDefault();
    if (activeSrc() === 'gen') genRows();
    else if ($('#pasteArea').value.trim()) setTable(parsePasted($('#pasteArea').value));
    else setTable([]);
    if (document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', function () {
        QL.clearFitCache();                      // 새 글꼴 기준으로 다시 재서 그린다
        QL.D.draw();
        previewDirty = true;
        if (view === 'preview') buildPreview();
      });
    }
    setView('design');
    changed();
    QL.D.resetHistory();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.QL);
