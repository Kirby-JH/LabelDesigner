/* ===========================================================
   designer.js — 라벨 캔버스 편집(선택·이동·크기·회전), 레이어, 속성
   =========================================================== */
window.QL = window.QL || {};
(function (QL) {
  'use strict';

  var MM2PX = 96 / 25.4;
  var D = QL.D = {};
  var S;                       // QL.state 참조
  var dragging = null;

  /* ---------- 실행 취소 / 다시 실행 ----------
     요소 배열 전체를 JSON 스냅샷으로 쌓는다. 라벨 하나에 들어가는 요소는
     많아야 수십 개라 비용이 작고, 부분 되돌리기보다 동작이 예측 가능하다. */
  var HIST_MAX = 60;
  var hist = { past: [], future: [], pending: null, timer: null };

  function snapshot() { return JSON.stringify(S.elements); }

  /* 바꾸기 직전 상태를 붙잡아 둔다 (같은 편집 묶음에서는 한 번만) */
  function begin() { if (hist.pending === null) hist.pending = snapshot(); }

  /* 붙잡아 둔 상태를 실제로 기록 — 값이 안 바뀌었으면 버린다 */
  function commit() {
    clearTimeout(hist.timer);
    if (hist.pending === null) return;
    if (hist.pending !== snapshot()) {
      hist.past.push(hist.pending);
      if (hist.past.length > HIST_MAX) hist.past.shift();
      hist.future.length = 0;
    }
    hist.pending = null;
    refreshHistBtns();
  }

  /* 연속 입력(타이핑·방향키)은 멈춘 뒤 한 묶음으로 기록 */
  function touch() {
    begin();
    clearTimeout(hist.timer);
    hist.timer = setTimeout(commit, 600);
  }

  function apply(json) {
    S.elements = JSON.parse(json);
    S.selIds = S.selIds.filter(function (id) {
      return S.elements.some(function (e) { return e.id === id; });
    });
    D.draw();
    D.onChange();
  }

  D.undo = function () {
    commit();
    if (!hist.past.length) return;
    hist.future.push(snapshot());
    apply(hist.past.pop());
    refreshHistBtns();
  };
  D.redo = function () {
    commit();
    if (!hist.future.length) return;
    hist.past.push(snapshot());
    apply(hist.future.pop());
    refreshHistBtns();
  };
  /* 서식 불러오기처럼 바깥에서 통째로 바꿀 때 */
  D.mark = function (fn) { begin(); fn(); commit(); };
  D.resetHistory = function () { hist.past.length = 0; hist.future.length = 0; hist.pending = null; refreshHistBtns(); };

  function refreshHistBtns() {
    var u = document.querySelector('#btnUndo'), r = document.querySelector('#btnRedo');
    if (u) u.disabled = !hist.past.length;
    if (r) r.disabled = !hist.future.length;
  }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return QL.esc(s); };
  var r2 = function (v) { return Math.round(v * 100) / 100; };

  D.init = function (state, onChange) {
    S = state;
    D.onChange = onChange || function () { };
    bindCanvas();
    bindToolbar();
  };

  /* ---------- 요소 만들기 ---------- */
  var SEQ = 0;
  D.newEl = function (type, label) {
    SEQ++;
    var id = 'e' + Date.now().toString(36) + SEQ;
    var cx = label.w / 2, cy = label.h / 2;
    var base = { id: id, type: type, rot: 0, name: '' };
    if (type === 'text') {
      return Object.assign(base, {
        name: '텍스트', tpl: '텍스트', x: r2(cx - Math.min(35, label.w * .8) / 2), y: r2(cy - 4),
        w: r2(Math.min(35, label.w * .8)), h: 8,
        font: 'embed', size: 9, bold: false, italic: false, color: '#000000',
        align: 'center', valign: 'middle', wrap: true, fit: true, lh: 1.15, ls: 0
      });
    }
    if (type === 'qr') {
      var q = Math.min(18, label.w * .5, label.h * .6);
      return Object.assign(base, {
        name: 'QR', tpl: '{1}', x: r2(cx - q / 2), y: r2(cy - q / 2), w: r2(q), h: r2(q),
        ecc: 'M', quiet: 2, color: '#000000'
      });
    }
    if (type === 'barcode') {
      var bw = Math.min(45, label.w * .8), bh = Math.min(14, label.h * .4);
      return Object.assign(base, {
        name: '바코드', tpl: '{1}', x: r2(cx - bw / 2), y: r2(cy - bh / 2), w: r2(bw), h: r2(bh),
        fmt: 'CODE128', hri: true, hriSize: 6, quiet: 10, font: 'embed', color: '#000000'
      });
    }
    if (type === 'box') {
      return Object.assign(base, {
        name: '도형', x: r2(cx - 15), y: r2(cy - 3), w: 30, h: 6,
        fill: 'none', stroke: '#000000', sw: 0.3, radius: 0
      });
    }
    return Object.assign(base, {
      name: '이미지', x: r2(cx - 9), y: r2(cy - 9), w: 18, h: 18, src: '', fit2: 'contain'
    });
  };

  D.add = function (type, src) {
    begin();
    var el = D.newEl(type, S.label);
    if (src) el.src = src;
    S.elements.push(el);
    S.selIds = [el.id];
    commit();
    D.draw();
    D.onChange();
  };

  /* ---------- 선택 (다중) ---------- */
  function isSel(id) { return S.selIds.indexOf(id) >= 0; }
  function byId(id) {
    for (var i = 0; i < S.elements.length; i++) if (S.elements[i].id === id) return S.elements[i];
    return null;
  }
  function isLocked(id) { var e = byId(id); return !!(e && e.locked); }
  D.isSel = isSel;
  D.selAll = function () { return S.elements.filter(function (e) { return isSel(e.id); }); };
  /* 속성 패널은 하나만 골랐을 때 */
  D.sel = function () { var a = D.selAll(); return a.length === 1 ? a[0] : null; };
  D.select = function (id, additive) {
    if (id && isLocked(id)) return;              // 잠긴 요소는 캔버스에서 집히지 않는다
    if (!id) S.selIds = [];
    else if (additive) {
      var i = S.selIds.indexOf(id);
      if (i >= 0) S.selIds.splice(i, 1); else S.selIds.push(id);
    } else S.selIds = [id];
    D.draw();
  };

  /* 회전을 반영한 요소 하나의 외곽 상자 */
  function elBBox(el) {
    var cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    var rad = (el.rot || 0) * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
    var hw = el.w / 2, hh = el.h / 2;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(function (q) {
      var x = cx + q[0] * co - q[1] * si, y = cy + q[0] * si + q[1] * co;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  D.elBBox = elBBox;

  function selBBox() {
    var a = D.selAll();
    if (!a.length) return null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    a.forEach(function (el) {
      var b = elBBox(el);
      if (b.x < x0) x0 = b.x; if (b.x + b.w > x1) x1 = b.x + b.w;
      if (b.y < y0) y0 = b.y; if (b.y + b.h > y1) y1 = b.y + b.h;
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  D.remove = function () {
    if (!S.selIds.length) return;
    begin();
    var first = S.elements.findIndex(function (e) { return isSel(e.id); });
    S.elements = S.elements.filter(function (e) { return !isSel(e.id); });
    S.selIds = S.elements.length ? [S.elements[Math.min(first, S.elements.length - 1)].id] : [];
    commit(); D.draw(); D.onChange();
  };
  D.duplicate = function () {
    var list = D.selAll(); if (!list.length) return;
    begin();
    var ids = [];
    list.forEach(function (e) {
      var c = JSON.parse(JSON.stringify(e));
      SEQ++; c.id = 'e' + Date.now().toString(36) + SEQ;
      c.x = r2(Math.min(c.x + 2, S.label.w - 2));
      c.y = r2(Math.min(c.y + 2, S.label.h - 2));
      S.elements.push(c); ids.push(c.id);
    });
    S.selIds = ids;
    commit(); D.draw(); D.onChange();
  };
  function move(dir) {
    if (!S.selIds.length) return;
    begin();
    if (dir === 'front' || dir === 'back') {
      var picked = S.elements.filter(function (e) { return isSel(e.id); });
      var rest = S.elements.filter(function (e) { return !isSel(e.id); });
      S.elements = dir === 'front' ? rest.concat(picked) : picked.concat(rest);
    } else {
      var i = S.elements.findIndex(function (e) { return isSel(e.id); });
      if (i < 0) { hist.pending = null; return; }
      var e = S.elements.splice(i, 1)[0];
      S.elements.splice(Math.max(0, Math.min(S.elements.length, i + dir)), 0, e);
    }
    commit(); D.draw(); D.onChange();
  }
  D.move = move;

  /* ---------- 정렬 · 균등 분배 ---------- */
  D.align = function (how) {
    var list = D.selAll(); if (list.length < 2) return;
    var bb = selBBox();
    begin();
    list.forEach(function (el) {
      var b = elBBox(el);
      if (how === 'left') el.x = r2(el.x + (bb.x - b.x));
      else if (how === 'hcenter') el.x = r2(el.x + (bb.x + bb.w / 2 - (b.x + b.w / 2)));
      else if (how === 'right') el.x = r2(el.x + (bb.x + bb.w - (b.x + b.w)));
      else if (how === 'top') el.y = r2(el.y + (bb.y - b.y));
      else if (how === 'vcenter') el.y = r2(el.y + (bb.y + bb.h / 2 - (b.y + b.h / 2)));
      else if (how === 'bottom') el.y = r2(el.y + (bb.y + bb.h - (b.y + b.h)));
    });
    commit(); D.draw(); D.onChange();
  };

  /* 양 끝은 두고 사이 간격을 똑같이 */
  D.distribute = function (axis) {
    var list = D.selAll(); if (list.length < 3) return;
    begin();
    var items = list.map(function (el) { return { el: el, b: elBBox(el) }; });
    items.sort(function (a, b) { return axis === 'x' ? a.b.x - b.b.x : a.b.y - b.b.y; });
    var first = items[0].b, last = items[items.length - 1].b;
    var span = axis === 'x' ? (last.x + last.w) - first.x : (last.y + last.h) - first.y;
    var used = items.reduce(function (sum, i) { return sum + (axis === 'x' ? i.b.w : i.b.h); }, 0);
    var gap = (span - used) / (items.length - 1);
    var cur = axis === 'x' ? first.x : first.y;
    items.forEach(function (it) {
      if (axis === 'x') { it.el.x = r2(it.el.x + (cur - it.b.x)); cur += it.b.w + gap; }
      else { it.el.y = r2(it.el.y + (cur - it.b.y)); cur += it.b.h + gap; }
    });
    commit(); D.draw(); D.onChange();
  };

  function previewCtx() {
    var n = (S.sampleRow || 0) + 1;
    return { seq: n, rowNo: n };
  }

  /* ---------- 그리기 ---------- */
  D.draw = function () {
    var cv = $('#canvas');
    if (!cv) return;
    var row = S.rows.length ? S.rows[Math.min(S.sampleRow, S.rows.length - 1)] : null;
    cv.innerHTML = QL.labelHtml(S.elements, row, S.headers, previewCtx());
    S.selIds.forEach(function (id) {
      var e = cv.querySelector('[data-id="' + id + '"]');
      if (e) e.classList.add('sel');
    });
    drawHandles();
    drawLayers();
    drawProps();
  };

  function drawHandles() {
    var stage = $('#stage');
    var old = stage.querySelector('.hbox');
    if (old) old.remove();

    var many = D.selAll();
    if (many.length > 1) {                     // 여러 개 → 외곽 상자만
      var bb = selBBox(), kk = MM2PX * S.scale;
      var box2 = document.createElement('div');
      box2.className = 'hbox';
      box2.style.cssText = 'left:0;top:0;width:100%;height:100%';
      box2.innerHTML = '<div class="selbox" style="left:' + (bb.x * kk) + 'px;top:' + (bb.y * kk) +
        'px;width:' + (bb.w * kk) + 'px;height:' + (bb.h * kk) + 'px"></div>';
      stage.appendChild(box2);
      return;
    }
    var el = D.sel();
    if (!el) return;
    var s = S.scale, k = MM2PX * s;
    var cx = (el.x + el.w / 2) * k, cy = (el.y + el.h / 2) * k;
    var hw = el.w / 2 * k, hh = el.h / 2 * k;
    var rad = (el.rot || 0) * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
    function pt(lx, ly) { return [cx + lx * co - ly * si, cy + lx * si + ly * co]; }

    var defs = [
      ['nw', -hw, -hh], ['n', 0, -hh], ['ne', hw, -hh],
      ['w', -hw, 0], ['e', hw, 0],
      ['sw', -hw, hh], ['s', 0, hh], ['se', hw, hh]
    ];
    var box = document.createElement('div');
    box.className = 'hbox';
    box.style.cssText = 'left:0;top:0;width:100%;height:100%';
    var html = '';
    defs.forEach(function (d) {
      var p = pt(d[1], d[2]);
      html += '<div class="handle h-' + d[0] + '" data-h="' + d[0] +
        '" style="left:' + (p[0] - 4.5) + 'px;top:' + (p[1] - 4.5) + 'px"></div>';
    });
    var rp = pt(0, -hh - 18);
    html += '<div class="handle rot" data-h="rot" style="left:' + (rp[0] - 4.5) + 'px;top:' + (rp[1] - 4.5) + 'px"></div>';
    box.innerHTML = html;
    stage.appendChild(box);
  }

  var ICON = { text: '🅣', qr: '▣', barcode: '▥', box: '▭', image: '🖼' };
  function drawLayers() {
    var ul = $('#layers');
    if (!S.elements.length) { ul.innerHTML = '<li class="none">요소가 없습니다. 위 도구로 추가하세요.</li>'; return; }
    var h = '';
    for (var i = S.elements.length - 1; i >= 0; i--) {
      var e = S.elements[i];
      h += '<li data-id="' + e.id + '" class="' + (isSel(e.id) ? 'on' : '') +
        (e.locked ? ' locked' : '') + '">' +
        '<span class="ic">' + ICON[e.type] + '</span>' +
        '<span class="nm">' + esc(e.name || e.type) + '</span>' +
        '<button class="btn-s lk" data-lock="1" title="' + (e.locked ? '잠금 해제' : '잠그기') + '">' +
        (e.locked ? '🔒' : '🔓') + '</button>' +
        '<button class="btn-s" data-mv="1" title="앞으로">▲</button>' +
        '<button class="btn-s" data-mv="-1" title="뒤로">▼</button></li>';
    }
    ul.innerHTML = h;
  }

  /* ---------- 속성 패널 ---------- */
  function fld(label, prop, type, extra) {
    return '<div class="f"><label>' + label + '</label>' +
      '<input type="' + type + '" data-prop="' + prop + '" ' + (extra || '') + '></div>';
  }
  function colOptions() {
    var cols = S.headers.map(function (h) {
      return '<option value="' + esc(h) + '">' + esc(h) + '</option>';
    }).join('');
    var bi = QL.BUILTINS.map(function (b) {
      return '<option value="' + esc(b.v) + '">' + esc(b.n) + '</option>';
    }).join('');
    return (cols ? '<optgroup label="데이터 열">' + cols + '</optgroup>' : '') +
      '<optgroup label="내장 변수">' + bi + '</optgroup>';
  }

  function drawProps() {
    var box = $('#props'), el = D.sel();
    var many = D.selAll();

    if (many.length > 1) {
      var grp = function (label, kind, defs) {
        return '<div class="f"><label>' + label + '</label><div class="align-grp">' +
          defs.map(function (d) {
            return '<button data-' + kind + '="' + d[0] + '" title="' + d[2] + '">' + d[1] + '</button>';
          }).join('') + '</div></div>';
      };
      box.innerHTML = '<div class="prop-sec">' +
        '<div class="ttl">요소 <b>' + many.length + '개</b> 선택됨</div>' +
        grp('가로 정렬', 'align', [['left', '⇤', '왼쪽'], ['hcenter', '⇔', '가운데'], ['right', '⇥', '오른쪽']]) +
        grp('세로 정렬', 'align', [['top', '⤒', '위'], ['vcenter', '⇕', '가운데'], ['bottom', '⤓', '아래']]) +
        grp('균등 분배', 'dist', [['x', '↔', '가로 간격 균등 (3개 이상)'], ['y', '↕', '세로 간격 균등 (3개 이상)']]) +
        '<p class="hint">Shift+클릭으로 선택에 더하거나 빼고, 빈 곳을 끌면 범위 선택입니다. ' +
        'Ctrl+A 전체 선택. 끌어 옮기면 선택한 요소가 함께 움직입니다.</p></div>';
      return;
    }

    if (!el) { box.innerHTML = '<p class="hint">요소를 선택하세요. (Shift+클릭 또는 빈 곳 드래그로 여러 개)</p>'; return; }
    var h = '';

    h += '<div class="prop-sec">' +
      '<div class="f"><label>이름</label><input type="text" data-prop="name"></div>' +
      '<div class="f2">' + fld('X (mm)', 'x', 'number', 'step="0.1"') + fld('Y (mm)', 'y', 'number', 'step="0.1"') + '</div>' +
      '<div class="f2">' + fld('가로 (mm)', 'w', 'number', 'step="0.1" min="0.5"') + fld('세로 (mm)', 'h', 'number', 'step="0.1" min="0.5"') + '</div>' +
      '<div class="chk"><input type="checkbox" data-prop="locked" id="p_lock">' +
      '<label for="p_lock">잠그기 (캔버스에서 선택·이동 안 됨)</label></div>' +
      '<div class="f2">' + fld('회전 (°)', 'rot', 'number', 'step="1"') +
      '<div class="f"><label>맞춤</label><div class="align-grp">' +
      '<button data-act="cx" title="가로 가운데">↔</button>' +
      '<button data-act="cy" title="세로 가운데">↕</button>' +
      '<button data-act="full" title="라벨 폭에 맞추기">⤢</button></div></div></div>' +
      '</div>';

    if (el.type === 'text' || el.type === 'qr' || el.type === 'barcode') {
      h += '<div class="prop-sec"><div class="ttl">내용 (열 이름은 <code>{이름}</code>)</div>' +
        '<div class="f"><textarea data-prop="tpl" style="min-height:' +
        (el.type === 'text' ? 54 : 32) + 'px;font-size:11.5px"></textarea></div>' +
        '<div class="tpl-row"><select id="insCol"><option value="">열 넣기…</option>' + colOptions() + '</select>' +
        '<button class="btn-s" data-act="ins">삽입</button></div></div>';
    }

    if (el.type === 'text') {
      h += '<div class="prop-sec">' +
        '<div class="f"><label>글꼴</label><select data-prop="font">' +
        QL.FONTS.map(function (f) { return '<option value="' + f.v + '">' + f.n + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="f2">' + fld('크기 (pt)', 'size', 'number', 'step="0.5" min="2"') +
        fld('줄 간격', 'lh', 'number', 'step="0.05" min="0.8"') + '</div>' +
        '<div class="f2">' + fld('자간 (mm)', 'ls', 'number', 'step="0.05"') +
        '<div class="f"><label>색</label><input type="color" data-prop="color"></div></div>' +
        '<div class="f"><label>가로 정렬</label><div class="align-grp">' +
        ['left:좌', 'center:중', 'right:우'].map(function (a) {
          var v = a.split(':');
          return '<button data-set="align" data-val="' + v[0] + '" class="' + (el.align === v[0] ? 'on' : '') + '">' + v[1] + '</button>';
        }).join('') + '</div></div>' +
        '<div class="f"><label>세로 정렬</label><div class="align-grp">' +
        ['top:위', 'middle:중', 'bottom:아래'].map(function (a) {
          var v = a.split(':');
          return '<button data-set="valign" data-val="' + v[0] + '" class="' + (el.valign === v[0] ? 'on' : '') + '">' + v[1] + '</button>';
        }).join('') + '</div></div>' +
        '<div class="chk"><input type="checkbox" data-prop="bold" id="p_bold"><label for="p_bold">굵게</label></div>' +
        '<div class="chk"><input type="checkbox" data-prop="italic" id="p_it"><label for="p_it">기울임</label></div>' +
        '<div class="chk"><input type="checkbox" data-prop="wrap" id="p_wrap"><label for="p_wrap">자동 줄바꿈</label></div>' +
        '<div class="chk"><input type="checkbox" data-prop="fit" id="p_fit"><label for="p_fit">상자에 맞게 자동 축소</label></div>' +
        '</div>';
    }

    if (el.type === 'qr') {
      h += '<div class="prop-sec"><div class="f2">' +
        '<div class="f"><label>오류 보정</label><select data-prop="ecc">' +
        ['L', 'M', 'Q', 'H'].map(function (v) { return '<option value="' + v + '">' + v + '</option>'; }).join('') +
        '</select></div>' + fld('여백(모듈)', 'quiet', 'number', 'min="0" max="8"') + '</div>' +
        '<div class="f"><label>색</label><input type="color" data-prop="color"></div></div>';
    }

    if (el.type === 'barcode') {
      h += '<div class="prop-sec">' +
        '<div class="f"><label>바코드 종류</label><select data-prop="fmt">' +
        QL.BARCODE_FORMATS.map(function (f) { return '<option value="' + f.v + '">' + f.n + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="chk"><input type="checkbox" data-prop="hri" id="p_hri"><label for="p_hri">숫자(문자) 함께 표시</label></div>' +
        '<div class="f2">' + fld('글자 크기 (pt)', 'hriSize', 'number', 'step="0.5" min="2"') +
        fld('좌우 여백(모듈)', 'quiet', 'number', 'min="0" max="30"') + '</div>' +
        '<div class="f"><label>색</label><input type="color" data-prop="color"></div>' +
        '<p class="hint">여백(quiet zone)은 스캐너 인식에 필요합니다. EAN/UPC는 10 이상 권장.</p></div>';
    }

    if (el.type === 'box') {
      h += '<div class="prop-sec">' +
        '<div class="f2"><div class="f"><label>채우기</label><input type="color" data-prop="fill"></div>' +
        '<div class="f"><label>선 색</label><input type="color" data-prop="stroke"></div></div>' +
        '<div class="chk"><input type="checkbox" id="p_nofill"><label for="p_nofill">채우기 없음</label></div>' +
        '<div class="f2">' + fld('선 굵기 (mm)', 'sw', 'number', 'step="0.1" min="0"') +
        fld('모서리 (mm)', 'radius', 'number', 'step="0.5" min="0"') + '</div>' +
        '<p class="hint">선 굵기만 두고 세로를 얇게 하면 구분선이 됩니다.</p></div>';
    }

    if (el.type === 'image') {
      h += '<div class="prop-sec">' +
        '<div class="f"><label>표시 방식</label><select data-prop="fit2">' +
        '<option value="contain">비율 유지(여백)</option><option value="cover">비율 유지(꽉 채움)</option>' +
        '<option value="fill">늘리기</option></select></div>' +
        '<button class="btn-s" data-act="imgre">이미지 바꾸기</button></div>';
    }

    box.innerHTML = h;

    // 값 채우기
    box.querySelectorAll('[data-prop]').forEach(function (inp) {
      var p = inp.dataset.prop, v = el[p];
      if (inp.type === 'checkbox') inp.checked = !!v;
      else if (inp.type === 'color') inp.value = (v && v !== 'none') ? v : '#000000';
      else inp.value = v == null ? '' : v;
    });
    var nf = $('#p_nofill', box);
    if (nf) nf.checked = (el.fill === 'none');
  }

  /* ---------- 입력 반영 ---------- */
  function onPropInput(e) {
    var el = D.sel(); if (!el) return;
    var t = e.target;
    touch();
    if (t.id === 'p_nofill') {
      el.fill = t.checked ? 'none' : ($('[data-prop=fill]').value || '#ffffff');
      D.draw(); D.onChange(); return;
    }
    var p = t.dataset.prop;
    if (!p) return;
    if (t.type === 'checkbox') el[p] = t.checked;
    else if (t.type === 'number') {
      var v = parseFloat(t.value);
      el[p] = isFinite(v) ? v : 0;
      if ((p === 'w' || p === 'h') && el[p] < 0.5) el[p] = 0.5;
    } else el[p] = t.value;
    if (p === 'fill' && el.fill !== 'none') { var n = $('#p_nofill'); if (n) n.checked = false; }

    // 입력 중 포커스를 잃지 않도록 캔버스만 다시 그린다
    redrawCanvasOnly();
    D.onChange();
  }

  function redrawCanvasOnly() {
    var cv = $('#canvas');
    var row = S.rows.length ? S.rows[Math.min(S.sampleRow, S.rows.length - 1)] : null;
    cv.innerHTML = QL.labelHtml(S.elements, row, S.headers, previewCtx());
    S.selIds.forEach(function (id) {
      var q = cv.querySelector('[data-id="' + id + '"]');
      if (q) q.classList.add('sel');
    });
    drawHandles();
    drawLayers();
  }
  D.redrawCanvasOnly = redrawCanvasOnly;

  /* ---------- 캔버스 조작 ---------- */
  function stageMM(e) {
    var r = $('#stage').getBoundingClientRect(), k = MM2PX * S.scale;
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  }
  function snap(v) { return S.snap ? Math.round(v * 2) / 2 : Math.round(v * 100) / 100; }

  /* ---------- 스마트 정렬 가이드 ----------
     옮기는 동안 라벨 가장자리/중앙과 다른 요소의 변·중심에 달라붙는다. */
  function guideTargets(axis) {
    var t = axis === 'x'
      ? [{ v: 0 }, { v: S.label.w / 2 }, { v: S.label.w }]
      : [{ v: 0 }, { v: S.label.h / 2 }, { v: S.label.h }];
    S.elements.forEach(function (e) {
      if (isSel(e.id)) return;
      var b = elBBox(e);
      if (axis === 'x') t.push({ v: b.x }, { v: b.x + b.w / 2 }, { v: b.x + b.w });
      else t.push({ v: b.y }, { v: b.y + b.h / 2 }, { v: b.y + b.h });
    });
    return t;
  }
  /* 상자의 세 기준선(앞·중간·끝) 중 가장 가까운 목표를 찾아 보정량을 돌려준다 */
  function bestSnap(lo, size, axis, thr) {
    var mine = [lo, lo + size / 2, lo + size];
    var best = null;
    guideTargets(axis).forEach(function (t) {
      mine.forEach(function (m) {
        var d = t.v - m;
        if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d: d, line: t.v };
      });
    });
    return best;
  }

  function drawGuides(lines) {
    var stage = $('#stage');
    stage.querySelectorAll('.guideline').forEach(function (g) { g.remove(); });
    if (!lines) return;
    var k = MM2PX * S.scale;
    var W = S.label.w * k, H = S.label.h * k;
    if (lines.x != null) {
      var gx = document.createElement('div');
      gx.className = 'guideline';
      gx.style.cssText = 'left:' + (lines.x * k) + 'px;top:0;width:1px;height:' + H + 'px';
      stage.appendChild(gx);
    }
    if (lines.y != null) {
      var gy = document.createElement('div');
      gy.className = 'guideline';
      gy.style.cssText = 'top:' + (lines.y * k) + 'px;left:0;height:1px;width:' + W + 'px';
      stage.appendChild(gy);
    }
  }

  function drawMarquee(a, b) {
    var stage = $('#stage');
    var m = stage.querySelector('.marquee');
    if (!a) { if (m) m.remove(); return; }
    if (!m) { m = document.createElement('div'); m.className = 'marquee'; stage.appendChild(m); }
    var k = MM2PX * S.scale;
    m.style.cssText = 'left:' + (Math.min(a.x, b.x) * k) + 'px;top:' + (Math.min(a.y, b.y) * k) +
      'px;width:' + (Math.abs(b.x - a.x) * k) + 'px;height:' + (Math.abs(b.y - a.y) * k) + 'px';
  }

  function bindCanvas() {
    var stage = $('#stage');

    stage.addEventListener('pointerdown', function (e) {
      var hn = e.target.closest('.handle');
      var elDiv = e.target.closest('.el');
      var additive = e.shiftKey || e.ctrlKey || e.metaKey;
      var st = stageMM(e);

      if (elDiv && isLocked(elDiv.dataset.id)) elDiv = null;   // 잠긴 요소는 통과

      /* 빈 곳 → 영역 선택 시작 */
      if (!hn && !elDiv) {
        if (!e.target.closest('#canvas')) return;
        if (!additive) { S.selIds = []; D.draw(); }
        dragging = { mode: 'marquee', sx: st.x, sy: st.y, add: additive, base: S.selIds.slice() };
        stage.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      if (hn) {
        if (D.selAll().length !== 1) return;        // 크기·회전은 하나만 골랐을 때
      } else {
        var id = elDiv.dataset.id;
        if (additive) { D.select(id, true); if (!isSel(id)) return; }
        else if (!isSel(id)) D.select(id);
      }
      var list = D.selAll();
      if (!list.length) return;

      begin();                                      // 드래그 전 상태 포착
      dragging = {
        mode: hn ? (hn.dataset.h === 'rot' ? 'rot' : 'resize') : 'move',
        h: hn ? hn.dataset.h : null,
        sx: st.x, sy: st.y,
        list: list,
        orig: list.map(function (el) { return { x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot || 0 }; }),
        bb: selBBox(),
        el: list[0],
        o: { x: list[0].x, y: list[0].y, w: list[0].w, h: list[0].h, rot: list[0].rot || 0 }
      };
      if (dragging.mode === 'rot') {
        var ccx = dragging.o.x + dragging.o.w / 2, ccy = dragging.o.y + dragging.o.h / 2;
        dragging.a0 = Math.atan2(st.y - ccy, st.x - ccx) * 180 / Math.PI;
      }
      stage.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    stage.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var st = stageMM(e), d = dragging;
      var dx = st.x - d.sx, dy = st.y - d.sy;

      if (d.mode === 'marquee') {
        drawMarquee({ x: d.sx, y: d.sy }, st);
        var x0 = Math.min(d.sx, st.x), x1 = Math.max(d.sx, st.x);
        var y0 = Math.min(d.sy, st.y), y1 = Math.max(d.sy, st.y);
        var hit = S.elements.filter(function (el) {
          if (el.locked) return false;
          var b = elBBox(el);
          return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0;
        }).map(function (el) { return el.id; });
        S.selIds = d.add ? d.base.concat(hit.filter(function (i) { return d.base.indexOf(i) < 0; })) : hit;
        redrawCanvasOnly();
        return;
      }

      var el = d.el;

      if (d.mode === 'move') {
        var lines = null;
        if (!e.altKey) {                            // Alt 누르면 가이드 끄기
          var thr = 6 / (MM2PX * S.scale);          // 화면 6px 에 해당하는 mm
          var gx = bestSnap(d.bb.x + dx, d.bb.w, 'x', thr);
          var gy = bestSnap(d.bb.y + dy, d.bb.h, 'y', thr);
          if (gx) dx += gx.d;
          if (gy) dy += gy.d;
          lines = { x: gx ? gx.line : null, y: gy ? gy.line : null };
          if (!gx && !gy) lines = null;
        }
        if (!lines) {                               // 달라붙지 않을 때만 격자 보정
          dx = snap(d.bb.x + dx) - d.bb.x;
          dy = snap(d.bb.y + dy) - d.bb.y;
        }
        d.list.forEach(function (it, i) {
          it.x = r2(d.orig[i].x + dx);
          it.y = r2(d.orig[i].y + dy);
        });
        drawGuides(lines);

      } else if (d.mode === 'rot') {
        var ccx2 = d.o.x + d.o.w / 2, ccy2 = d.o.y + d.o.h / 2;
        var a = Math.atan2(st.y - ccy2, st.x - ccx2) * 180 / Math.PI;
        var nr = d.o.rot + (a - d.a0);
        if (e.shiftKey) nr = Math.round(nr / 15) * 15;
        el.rot = Math.round(nr * 10) / 10;

      } else {
        var rad = (d.o.rot || 0) * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
        var lx = dx * co + dy * si;                 // 회전 역변환
        var ly = -dx * si + dy * co;
        var sx = /w/.test(d.h) ? -1 : (/e/.test(d.h) ? 1 : 0);
        var sy = /n/.test(d.h) ? -1 : (/s/.test(d.h) ? 1 : 0);
        var nw = Math.max(0.5, d.o.w + sx * lx);
        var nh = Math.max(0.5, d.o.h + sy * ly);
        if (e.shiftKey && el.type === 'qr') { nw = nh = Math.max(nw, nh); }
        nw = snap(nw); nh = snap(nh);
        var ocx = d.o.x + d.o.w / 2, ocy = d.o.y + d.o.h / 2;
        var mx = sx * (nw - d.o.w) / 2, my = sy * (nh - d.o.h) / 2;   // 로컬 중심 이동
        var cx2 = ocx + (mx * co - my * si), cy2 = ocy + (mx * si + my * co);
        el.w = nw; el.h = nh;
        el.x = r2(cx2 - nw / 2);
        el.y = r2(cy2 - nh / 2);
      }
      redrawCanvasOnly();
    });

    function endDrag(e) {
      if (!dragging) return;
      var wasMarquee = dragging.mode === 'marquee';
      dragging = null;
      drawGuides(null);
      drawMarquee(null);
      if (wasMarquee) { hist.pending = null; D.draw(); return; }
      commit();                                  // 드래그 한 번을 한 단계로
      drawProps();
      D.onChange();
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    // 키보드
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      // 실행 취소 / 다시 실행
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) D.redo(); else D.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); D.redo(); return; }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        S.selIds = S.elements.filter(function (x) { return !x.locked; }).map(function (x) { return x.id; });
        D.draw();
        return;
      }
      if (e.key === 'Escape') { S.selIds = []; D.draw(); return; }

      var list = D.selAll(); if (!list.length) return;
      var step = e.shiftKey ? 1 : 0.2, used = true, dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else if (e.key === 'Delete' || e.key === 'Backspace') { D.remove(); e.preventDefault(); return; }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { D.duplicate(); e.preventDefault(); return; }
      else used = false;
      if (used) list.forEach(function (el) { el.x = r2(el.x + dx); el.y = r2(el.y + dy); });
      if (used) { touch(); e.preventDefault(); redrawCanvasOnly(); drawProps(); D.onChange(); }
    });
  }

  function bindToolbar() {
    $('#props').addEventListener('input', onPropInput);
    $('#props').addEventListener('change', onPropInput);
    $('#props').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.align) { D.align(b.dataset.align); return; }
      if (b.dataset.dist) { D.distribute(b.dataset.dist); return; }
      var el = D.sel(); if (!el) return;
      if (b.dataset.set) {
        begin();
        el[b.dataset.set] = b.dataset.val;
        commit(); D.draw(); D.onChange(); return;
      }
      begin();
      var act = b.dataset.act;
      if (act === 'cx') el.x = r2((S.label.w - el.w) / 2);
      else if (act === 'cy') el.y = r2((S.label.h - el.h) / 2);
      else if (act === 'full') { el.x = 1; el.w = r2(S.label.w - 2); }
      else if (act === 'ins') {
        var sel = $('#insCol'); if (!sel || !sel.value) return;
        var ta = $('[data-prop=tpl]');
        var p = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
        var ins = '{' + sel.value + '}';
        el.tpl = ta.value.slice(0, p) + ins + ta.value.slice(ta.selectionEnd || p);
        D.draw();
        var ta2 = $('[data-prop=tpl]'); if (ta2) { ta2.focus(); ta2.setSelectionRange(p + ins.length, p + ins.length); }
        commit(); D.onChange(); return;
      } else if (act === 'imgre') { hist.pending = null; document.querySelector('#imgFile').click(); return; }
      else { hist.pending = null; return; }
      commit(); D.draw(); D.onChange();
    });

    $('#layers').addEventListener('click', function (e) {
      var li = e.target.closest('li[data-id]'); if (!li) return;
      if (e.target.closest('[data-lock]')) {
        var t = byId(li.dataset.id);
        begin();
        t.locked = !t.locked;
        if (t.locked) S.selIds = S.selIds.filter(function (x) { return x !== t.id; });
        commit(); D.draw(); D.onChange();
        return;
      }
      var mv = e.target.closest('[data-mv]');
      if (mv) { if (!isSel(li.dataset.id)) S.selIds = [li.dataset.id]; move(parseInt(mv.dataset.mv, 10)); }
      else D.select(li.dataset.id, e.shiftKey || e.ctrlKey || e.metaKey);
    });
  }

})(window.QL);
