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
        font: 'sans', size: 9, bold: false, italic: false, color: '#000000',
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
        fmt: 'CODE128', hri: true, hriSize: 6, quiet: 10, font: 'sans', color: '#000000'
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
    var el = D.newEl(type, S.label);
    if (src) el.src = src;
    S.elements.push(el);
    S.selId = el.id;
    D.draw();
    D.onChange();
  };

  D.sel = function () {
    for (var i = 0; i < S.elements.length; i++) if (S.elements[i].id === S.selId) return S.elements[i];
    return null;
  };
  D.select = function (id) { S.selId = id; D.draw(); };

  D.remove = function () {
    var i = S.elements.findIndex(function (e) { return e.id === S.selId; });
    if (i < 0) return;
    S.elements.splice(i, 1);
    S.selId = S.elements.length ? S.elements[Math.min(i, S.elements.length - 1)].id : null;
    D.draw(); D.onChange();
  };
  D.duplicate = function () {
    var e = D.sel(); if (!e) return;
    var c = JSON.parse(JSON.stringify(e));
    SEQ++; c.id = 'e' + Date.now().toString(36) + SEQ;
    c.x = r2(Math.min(c.x + 2, S.label.w - 2)); c.y = r2(Math.min(c.y + 2, S.label.h - 2));
    S.elements.push(c); S.selId = c.id; D.draw(); D.onChange();
  };
  function move(dir) {
    var i = S.elements.findIndex(function (e) { return e.id === S.selId; });
    if (i < 0) return;
    var e = S.elements.splice(i, 1)[0];
    if (dir === 'front') S.elements.push(e);
    else if (dir === 'back') S.elements.unshift(e);
    else S.elements.splice(Math.max(0, Math.min(S.elements.length, i + dir)), 0, e);
    D.draw(); D.onChange();
  }
  D.move = move;

  /* ---------- 그리기 ---------- */
  D.draw = function () {
    var cv = $('#canvas');
    if (!cv) return;
    var row = S.rows.length ? S.rows[Math.min(S.sampleRow, S.rows.length - 1)] : null;
    cv.innerHTML = QL.labelHtml(S.elements, row, S.headers);
    var e;
    for (var i = 0; i < S.elements.length; i++) {
      if (S.elements[i].id === S.selId) {
        e = cv.querySelector('[data-id="' + S.elements[i].id + '"]');
        if (e) e.classList.add('sel');
      }
    }
    drawHandles();
    drawLayers();
    drawProps();
  };

  function drawHandles() {
    var stage = $('#stage');
    var old = stage.querySelector('.hbox');
    if (old) old.remove();
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
      h += '<li data-id="' + e.id + '" class="' + (e.id === S.selId ? 'on' : '') + '">' +
        '<span class="ic">' + ICON[e.type] + '</span>' +
        '<span class="nm">' + esc(e.name || e.type) + '</span>' +
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
    return S.headers.map(function (h, i) {
      return '<option value="' + esc(h) + '">' + esc(h) + '</option>';
    }).join('');
  }

  function drawProps() {
    var box = $('#props'), el = D.sel();
    if (!el) { box.innerHTML = '<p class="hint">요소를 선택하세요.</p>'; return; }
    var h = '';

    h += '<div class="prop-sec">' +
      '<div class="f"><label>이름</label><input type="text" data-prop="name"></div>' +
      '<div class="f2">' + fld('X (mm)', 'x', 'number', 'step="0.1"') + fld('Y (mm)', 'y', 'number', 'step="0.1"') + '</div>' +
      '<div class="f2">' + fld('가로 (mm)', 'w', 'number', 'step="0.1" min="0.5"') + fld('세로 (mm)', 'h', 'number', 'step="0.1" min="0.5"') + '</div>' +
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
    cv.innerHTML = QL.labelHtml(S.elements, row, S.headers);
    var sel = cv.querySelector('[data-id="' + S.selId + '"]');
    if (sel) sel.classList.add('sel');
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

  function bindCanvas() {
    var stage = $('#stage');

    stage.addEventListener('pointerdown', function (e) {
      var hn = e.target.closest('.handle');
      var elDiv = e.target.closest('.el');
      if (!hn && !elDiv) { if (e.target.closest('#canvas')) { S.selId = null; D.draw(); } return; }

      var el;
      if (hn) { el = D.sel(); if (!el) return; }
      else {
        var id = elDiv.dataset.id;
        if (id !== S.selId) { S.selId = id; D.draw(); }
        el = D.sel();
      }
      if (!el) return;

      var st = stageMM(e);
      dragging = {
        mode: hn ? (hn.dataset.h === 'rot' ? 'rot' : 'resize') : 'move',
        h: hn ? hn.dataset.h : null,
        sx: st.x, sy: st.y,
        o: { x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot || 0 },
        el: el
      };
      if (dragging.mode === 'rot') {
        var ccx = el.x + el.w / 2, ccy = el.y + el.h / 2;
        dragging.a0 = Math.atan2(st.y - ccy, st.x - ccx) * 180 / Math.PI;
      }
      stage.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    stage.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var st = stageMM(e), d = dragging, el = d.el;
      var dx = st.x - d.sx, dy = st.y - d.sy;

      if (d.mode === 'move') {
        el.x = snap(d.o.x + dx);
        el.y = snap(d.o.y + dy);
      } else if (d.mode === 'rot') {
        var ccx = d.o.x + d.o.w / 2, ccy = d.o.y + d.o.h / 2;
        var a = Math.atan2(st.y - ccy, st.x - ccx) * 180 / Math.PI;
        var nr = d.o.rot + (a - d.a0);
        if (e.shiftKey) nr = Math.round(nr / 15) * 15;
        el.rot = Math.round(nr * 10) / 10;
      } else {
        var rad = (d.o.rot || 0) * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
        var lx = dx * co + dy * si;          // 회전 역변환
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
        el.x = Math.round((cx2 - nw / 2) * 100) / 100;
        el.y = Math.round((cy2 - nh / 2) * 100) / 100;
      }
      redrawCanvasOnly();
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = null;
      drawProps();
      D.onChange();
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    // 키보드
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      var el = D.sel(); if (!el) return;
      var step = e.shiftKey ? 1 : 0.2, used = true;
      if (e.key === 'ArrowLeft') el.x = r2(el.x - step);
      else if (e.key === 'ArrowRight') el.x = r2(el.x + step);
      else if (e.key === 'ArrowUp') el.y = r2(el.y - step);
      else if (e.key === 'ArrowDown') el.y = r2(el.y + step);
      else if (e.key === 'Delete' || e.key === 'Backspace') { D.remove(); e.preventDefault(); return; }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { D.duplicate(); e.preventDefault(); return; }
      else used = false;
      if (used) { e.preventDefault(); redrawCanvasOnly(); drawProps(); D.onChange(); }
    });
  }

  function bindToolbar() {
    $('#props').addEventListener('input', onPropInput);
    $('#props').addEventListener('change', onPropInput);
    $('#props').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var el = D.sel(); if (!el) return;
      if (b.dataset.set) {
        el[b.dataset.set] = b.dataset.val;
        D.draw(); D.onChange(); return;
      }
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
        D.onChange(); return;
      } else if (act === 'imgre') { document.querySelector('#imgFile').click(); return; }
      else return;
      D.draw(); D.onChange();
    });

    $('#layers').addEventListener('click', function (e) {
      var li = e.target.closest('li[data-id]'); if (!li) return;
      S.selId = li.dataset.id;
      var mv = e.target.closest('[data-mv]');
      if (mv) move(parseInt(mv.dataset.mv, 10));
      else D.draw();
    });
  }

})(window.QL);
