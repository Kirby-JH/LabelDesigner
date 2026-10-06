/* ===========================================================
   render.js — 요소 렌더링(텍스트/QR/바코드/도형/이미지) 및 페이지 생성
   =========================================================== */
window.QL = window.QL || {};
(function (QL) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  /* 글꼴 이름은 반드시 작은따옴표로 감쌀 것.
     style="..." 안에 그대로 들어가므로 큰따옴표를 쓰면 속성이 중간에서 끊긴다. */
  QL.FONTS = [
    /* 'embed' 는 vendor/fonts 에 함께 넣어 둔 Pretendard. 어느 PC에서 열어도 같은 모양이다.
       실제로 쓰일 때만 app.js 가 글꼴 CSS 를 끼워 넣는다. */
    { v: 'embed', n: '내장 Pretendard (어디서나 동일)', css: "'Pretendard','Malgun Gothic',sans-serif", embed: true },
    { v: 'sans', n: '산세리프(설치된 글꼴)', css: "'Pretendard','Malgun Gothic','Noto Sans KR',system-ui,sans-serif" },
    { v: 'gothic', n: '맑은 고딕', css: "'Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif" },
    { v: 'dotum', n: '돋움', css: "Dotum,'돋움',Gulim,sans-serif" },
    { v: 'batang', n: '바탕(명조)', css: "Batang,'바탕','Noto Serif KR',serif" },
    { v: 'mono', n: '고정폭', css: "ui-monospace,Menlo,Consolas,'D2Coding',monospace" }
  ];
  QL.fontCss = function (v) {
    for (var i = 0; i < QL.FONTS.length; i++) if (QL.FONTS[i].v === v) return QL.FONTS[i].css;
    return QL.FONTS[1].css;                      // 못 찾으면 시스템 산세리프
  };
  QL.usesEmbed = function (elements) {
    return (elements || []).some(function (e) { return e.font === 'embed'; });
  };
  /* style="..." 에 넣기 전 큰따옴표를 한 번 더 막아 둔다 */
  function styleSafe(v) { return String(v == null ? '' : v).replace(/"/g, "'"); }

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

  /* ---------- 길이 단위 ----------
     값은 언제나 mm 로 보관하고, 화면에 보여 줄 때와 입력받을 때만 바꾼다. */
  QL.U = {
    unit: 'mm',
    to: function (mm) {                        // mm → 화면 값
      if (!isFinite(mm)) return mm;
      return this.unit === 'in' ? Math.round(mm / 25.4 * 10000) / 10000 : Math.round(mm * 100) / 100;
    },
    from: function (v) {                       // 화면 값 → mm
      v = parseFloat(v);
      if (!isFinite(v)) return NaN;
      return Math.round((this.unit === 'in' ? v * 25.4 : v) * 100) / 100;
    },
    label: function () { return this.unit === 'in' ? 'in' : 'mm'; },
    step: function () { return this.unit === 'in' ? '0.001' : '0.1'; }
  };

  QL.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ---------- {열이름} 치환 + 내장 변수 + 필터 ----------
     {품명}          데이터 열
     {2}             열 번호
     {일련번호}      출력 순서 1,2,3…   {일련번호:0001} 0001 부터 4자리
     {행번호}        데이터 행 번호 (수량만큼 반복돼도 같은 행은 같은 번호)
     {오늘} {오늘:YY.MM.DD}   {시간} {시간:HH:mm}
     {바코드|ean13}  체크디지트 자동 계산해 붙이기
     {코드|숫자} {코드|대문자} {코드|소문자}                                   */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(pat) {
    var d = new Date();
    var map = {
      YYYY: String(d.getFullYear()), YY: String(d.getFullYear()).slice(2),
      MM: pad2(d.getMonth() + 1), DD: pad2(d.getDate()),
      HH: pad2(d.getHours()), mm: pad2(d.getMinutes()), ss: pad2(d.getSeconds())
    };
    return String(pat).replace(/YYYY|YY|MM|DD|HH|mm|ss/g, function (t) { return map[t]; });
  }
  /* ---------- 날짜·시간 읽기 ----------
     엑셀에서 넘어오는 값은 형식이 제각각이라(25.10.04 14.30.00 / 2025-10-04 /
     20251004 / 엑셀 일련번호 …) 정규식으로 날짜 부분을 먼저 집고,
     그 뒤쪽에서만 시간을 찾는다. 그래야 25.10.04 의 10.04 를 시간으로 오해하지 않는다. */
  function normYear(y) {
    y = parseInt(y, 10);
    if (y < 70) return 2000 + y;
    if (y < 100) return 1900 + y;
    return y;
  }
  /* prefer: '날짜'를 원하는지 '시간'을 원하는지. 모호할 때 어느 쪽으로 읽을지 가른다.
     점으로 끊긴 수가 두세 개뿐이면 시각보다 날짜가 보편적이라 기본은 날짜 쪽이다. */
  QL.parseDT = function (v, prefer) {
    if (v == null) return null;
    var str = String(v).trim();
    if (str === '') return null;
    var wantTime = prefer === 'time';

    /* 엑셀 날짜 일련번호 (1899-12-30 기준).
       그냥 숫자인 수량·가격을 날짜로 오해하지 않도록 1990~2050 범위만 인정한다.
       (32874 = 1990-01-01, 54789 = 2050-01-01) */
    if (/^\d{5}(\.\d+)?$/.test(str)) {
      var n = parseFloat(str);
      if (n >= 32874 && n < 54789) {
        var d0 = new Date(Math.round((n - 25569) * 86400) * 1000);
        if (!isNaN(d0.getTime())) {
          return { y: d0.getUTCFullYear(), m: d0.getUTCMonth() + 1, d: d0.getUTCDate(),
            H: d0.getUTCHours(), M: d0.getUTCMinutes(), S: d0.getUTCSeconds(),
            hasDate: true, hasTime: n % 1 !== 0 };
        }
      }
    }

    var out = { y: 0, m: 0, d: 0, H: 0, M: 0, S: 0, hasDate: false, hasTime: false };
    var rest = str, consumed = false;

    function okMD(m, d) { return m >= 1 && m <= 12 && d >= 1 && d <= 31; }

    /* 연·월·일 세 토막 */
    var md = str.match(/(\d{1,4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})\s*일?/);
    if (md && okMD(+md[2], +md[3])) {
      out.y = normYear(md[1]); out.m = +md[2]; out.d = +md[3]; out.hasDate = true;
      rest = str.slice(md.index + md[0].length); consumed = true;
    } else {
      var m8 = str.match(/(^|\D)(\d{4})(\d{2})(\d{2})(\D|$)/);
      if (m8 && okMD(+m8[3], +m8[4])) {
        out.y = +m8[2]; out.m = +m8[3]; out.d = +m8[4]; out.hasDate = true;
        rest = str.slice(m8.index + m8[0].length); consumed = true;
      }
    }

    /* 두 토막뿐일 때 (10.04 / 25.10). 시각을 달라고 한 경우엔 건너뛴다.
         1~12 . 1~31  → 월.일  (연도는 올해로)
         13~99 . 1~12 → 연.월  (유통기한에 흔한 형태, 일은 1일로) */
    if (!consumed && !wantTime) {
      var md2 = str.match(/^\s*(\d{1,2})\s*[.\-\/년월]\s*(\d{1,2})\s*[일월]?\s*$/);
      if (md2) {
        var a = +md2[1], b = +md2[2];
        if (okMD(a, b)) {
          out.y = new Date().getFullYear(); out.m = a; out.d = b;
          out.hasDate = true; consumed = true;
        } else if (a >= 13 && a <= 99 && b >= 1 && b <= 12) {
          out.y = normYear(a); out.m = b; out.d = 1;
          out.hasDate = true; consumed = true;
        }
        if (consumed) rest = '';
      }
    }

    /* 시각 구분자는 콜론과 한글(시/분)만 인정한다.
       점으로 끊긴 숫자는 날짜 뒤에 붙어 있더라도 시각으로 보지 않는다. */
    var mt = rest.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})(?:\s*[:분]\s*(\d{1,2}))?\s*초?/);
    if (mt && +mt[1] < 24 && +mt[2] < 60 && (!mt[3] || +mt[3] < 60)) {
      out.H = +mt[1]; out.M = +mt[2]; out.S = mt[3] ? +mt[3] : 0; out.hasTime = true;
    }
    return (out.hasDate || out.hasTime) ? out : null;
  };

  function fmtParts(p, pat) {
    var map = {
      YYYY: String(p.y), YY: String(p.y).slice(2),
      MM: pad2(p.m), DD: pad2(p.d), M: String(p.m), D: String(p.d),
      HH: pad2(p.H), mm: pad2(p.M), ss: pad2(p.S), H: String(p.H)
    };
    return String(pat).replace(/YYYY|YY|MM|DD|HH|mm|ss|M|D|H/g, function (t) { return map[t]; });
  }

  /* EAN/UPC 체크디지트 — 오른쪽부터 3,1,3,1… 가중합 */
  QL.eanCheck = function (digits) {
    var sum = 0, n = digits.length;
    for (var i = 0; i < n; i++) sum += (+digits[n - 1 - i]) * (i % 2 === 0 ? 3 : 1);
    return String((10 - sum % 10) % 10);
  };

  /* ---------- 값 가공 필터 ---------- */
  function applyFilter(val, f) {
    var ci = f.indexOf(':');
    var name = (ci >= 0 ? f.slice(0, ci) : f).trim();
    var arg = ci >= 0 ? f.slice(ci + 1) : null;
    var n;

    switch (name) {
      case '날짜': case 'date': {
        var p = QL.parseDT(val, 'date');
        return p && p.hasDate ? fmtParts(p, arg || 'YYYY-MM-DD') : '';
      }
      case '시간': case 'time': {
        var q = QL.parseDT(val, 'time');
        return q && q.hasTime ? fmtParts(q, arg || 'HH:mm') : '';
      }
      case '숫자': return val.replace(/\D/g, '');
      case '대문자': return val.toUpperCase();
      case '소문자': return val.toLowerCase();
      case '공백제거': return val.replace(/\s+/g, '');
      case '다듬기': return val.trim().replace(/\s+/g, ' ');
      case 'ean13': case 'ean': case '체크디지트': {
        var d = val.replace(/\D/g, '');
        return d + QL.eanCheck(d);
      }
      case '앞': return val.slice(0, Math.max(0, parseInt(arg, 10) || 0));
      case '뒤': return arg ? val.slice(-Math.abs(parseInt(arg, 10) || 0)) : val;
      case '자르기': {                                  // 자르기:3,5 → 3번째부터 5글자
        var a = String(arg || '').split(',');
        var from = Math.max(1, parseInt(a[0], 10) || 1) - 1;
        var len = a[1] != null ? parseInt(a[1], 10) : undefined;
        return len == null ? val.slice(from) : val.substr(from, len);
      }
      case '치환': {                                    // 치환:찾을말>바꿀말
        var pr = String(arg || '').split('>');
        if (pr.length < 2) return val;
        return val.split(pr[0]).join(pr.slice(1).join('>'));
      }
      case '채움': {                                    // 채움:0001 → 자릿수만큼 0 채우기
        var w = String(arg || '').length;
        var t = val;
        while (t.length < w) t = (String(arg || '0')[0] || '0') + t;
        return t;
      }
      case '천단위': {
        n = parseFloat(val.replace(/[^0-9.\-]/g, ''));
        return isFinite(n) ? n.toLocaleString('ko-KR') : val;
      }
      case '소수': {
        n = parseFloat(val.replace(/[^0-9.\-]/g, ''));
        return isFinite(n) ? n.toFixed(Math.max(0, parseInt(arg, 10) || 0)) : val;
      }
      case '더하기': case '빼기': case '곱하기': case '나누기': {
        n = parseFloat(val.replace(/[^0-9.\-]/g, ''));
        var k = parseFloat(arg);
        if (!isFinite(n) || !isFinite(k)) return val;
        if (name === '더하기') n += k;
        else if (name === '빼기') n -= k;
        else if (name === '곱하기') n *= k;
        else n = k ? n / k : n;
        return String(Math.round(n * 1e6) / 1e6);
      }
      default: return val;
    }
  }

  /* ---------- 조건 분기 ----------
     {?재고<10}재고 부족{:}정상{/}   — {:} 이하(거짓 쪽)는 생략 가능
     {?비고}비고: {비고}{/}          — 연산자가 없으면 "값이 있으면 참"
     안쪽 블록부터 처리하므로 중첩해 쓸 수 있다. */
  /* allowIndex: 왼쪽 피연산자에서만 {3} 같은 열 번호를 허용한다.
     오른쪽의 숫자는 비교할 값이지 열 번호가 아니다 (수량>100 의 100). */
  function cellOf(name, row, headers, allowIndex) {
    name = String(name).trim();
    var i = headers ? headers.indexOf(name) : -1;
    if (i < 0 && allowIndex && /^\d+$/.test(name)) {
      var k = parseInt(name, 10) - 1;
      if (headers && k >= 0 && k < headers.length) i = k;
    }
    if (i >= 0) return { isCol: true, v: row ? String(row[i] == null ? '' : row[i]) : '' };
    return { isCol: false, v: name.replace(/^['"]|['"]$/g, '') };
  }

  function testCond(expr, row, headers) {
    expr = String(expr).trim();
    var m = expr.match(/^([\s\S]*?)\s*(>=|<=|!=|<>|=|>|<|포함|시작|끝)\s*([\s\S]*)$/);
    if (!m) return cellOf(expr, row, headers, true).v.trim() !== '';

    var L = cellOf(m[1], row, headers, true).v;
    var op = m[2];
    var R = cellOf(m[3], row, headers, false);
    var rv = R.isCol ? R.v : R.v;

    if (op === '포함') return L.indexOf(rv) >= 0;
    if (op === '시작') return L.lastIndexOf(rv, 0) === 0;
    if (op === '끝') return rv === '' || L.slice(-rv.length) === rv;

    var ln = parseFloat(String(L).replace(/[,\s]/g, ''));
    var rn = parseFloat(String(rv).replace(/[,\s]/g, ''));
    var num = isFinite(ln) && isFinite(rn) &&
      /^[-\d.,\s]+$/.test(String(L).trim()) && /^[-\d.,\s]+$/.test(String(rv).trim());
    var a = num ? ln : L.trim(), b = num ? rn : String(rv).trim();

    switch (op) {
      case '=': return a === b;
      case '!=': case '<>': return a !== b;
      case '>': return a > b;
      case '<': return a < b;
      case '>=': return a >= b;
      case '<=': return a <= b;
    }
    return false;
  }

  /* 조건식 왼쪽에 열이 아닌 이름을 쓰면 그 이름 자체가 글자값으로 비교된다.
     ({?재고량>10} 에서 재고량 이란 열이 없으면 "재고량" > "10" 이 되어 늘 참)
     오타를 조용히 넘기지 않도록 그런 이름을 모아 둔다. */
  QL.lintConds = function (tpl, headers) {
    var out = [];
    String(tpl || '').replace(/\{\?([^{}]*)\}/g, function (m, expr) {
      expr = String(expr).trim();
      var mm = expr.match(/^([\s\S]*?)\s*(>=|<=|!=|<>|=|>|<|포함|시작|끝)\s*([\s\S]*)$/);
      var left = (mm ? mm[1] : expr).trim();
      if (!left) return m;
      if (/^['"][\s\S]*['"]$/.test(left)) return m;        // 따옴표로 감싼 건 일부러 쓴 글자값
      if (/^-?[\d.,]+$/.test(left)) return m;               // 숫자거나 열 번호
      if (headers && headers.indexOf(left) >= 0) return m;   // 실제 열
      out.push(left);
      return m;
    });
    return out;
  };

  var COND_RE = /\{\?([^{}]*)\}((?:(?!\{\?)(?!\{\/\})[\s\S])*?)(?:\{:\}((?:(?!\{\?)(?!\{\/\})[\s\S])*?))?\{\/\}/;
  function resolveConds(tpl, row, headers) {
    var guard = 0;
    while (COND_RE.test(tpl) && guard++ < 40) {
      tpl = tpl.replace(COND_RE, function (m, cond, yes, no) {
        return testCond(cond, row, headers) ? yes : (no || '');
      });
    }
    return tpl;
  }

  QL.resolve = function (tpl, row, headers, ctx) {
    if (tpl == null) return '';
    var src = resolveConds(String(tpl), row, headers);
    return src.replace(/\{([^{}]*)\}/g, function (m, body) {
      body = body.trim();
      if (body === '') return m;

      var filters = [];
      var bar = body.indexOf('|');
      if (bar >= 0) {
        filters = body.slice(bar + 1).split('|').map(function (f) { return f.trim(); });
        body = body.slice(0, bar).trim();
      }
      var ci = body.indexOf(':');
      var key = ci >= 0 ? body.slice(0, ci).trim() : body;
      var arg = ci >= 0 ? body.slice(ci + 1) : null;
      var val;

      if (key === '일련번호' || key === 'seq') {
        var start = 1, width = 0;
        if (arg && /^\d+$/.test(arg.trim())) { start = parseInt(arg, 10); width = arg.trim().length; }
        var num = start + ((ctx && ctx.seq ? ctx.seq : 1) - 1);
        val = String(num);
        while (val.length < width) val = '0' + val;
      } else if (key === '행번호' || key === 'row') {
        val = String(ctx && ctx.rowNo ? ctx.rowNo : 1);
      } else if (key === '오늘' || key === '날짜' || key === 'date') {
        val = fmtDate(arg || 'YYYY-MM-DD');
      } else if (key === '시간' || key === 'time') {
        val = fmtDate(arg || 'HH:mm');
      } else {
        var i = headers ? headers.indexOf(body) : -1;
        if (i < 0 && /^\d+$/.test(body)) i = parseInt(body, 10) - 1;
        if (i < 0) return m;                       // 없는 이름은 그대로 보여 준다
        if (!row) return m;
        val = String(row[i] == null ? '' : row[i]);
      }

      filters.forEach(function (f) { val = applyFilter(val, f); });
      return val;
    });
  };

  /* 내장 변수 목록 — 속성 패널의 "열 넣기" 드롭다운에서 쓴다 */
  QL.BUILTINS = [
    { v: '일련번호', n: '일련번호 1,2,3…' },
    { v: '일련번호:0001', n: '일련번호 0001…' },
    { v: '행번호', n: '데이터 행 번호' },
    { v: '오늘', n: '오늘 날짜' },
    { v: '오늘:YY.MM.DD', n: '오늘 날짜 (YY.MM.DD)' },
    { v: '시간', n: '현재 시각' }
  ];
  /* 드롭다운에 같이 넣는 보기들 — raw 가 있으면 그대로 삽입한다 */
  QL.SNIPPETS = [
    { raw: '|날짜', n: '◂ 앞의 열에서 날짜만' },
    { raw: '|날짜:YY.MM.DD', n: '◂ 날짜 (YY.MM.DD)' },
    { raw: '|시간', n: '◂ 앞의 열에서 시간만' },
    { raw: '|시간:HH:mm:ss', n: '◂ 시간 (초까지)' },
    { raw: '|천단위', n: '◂ 1,234,567 로' },
    { raw: '|앞:4', n: '◂ 앞 4글자' },
    { raw: '|치환:A>B', n: '◂ A 를 B 로' },
    { raw: '|ean13', n: '◂ 체크디지트 붙이기' },
    { raw: '{?열이름>10}많음{:}적음{/}', n: '조건 분기' },
    { raw: '{?비고}({비고}){/}', n: '값이 있을 때만' }
  ];

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

  /* 바코드 값이 해당 규격에 맞는지 (SVG 생성 결과를 재사용하므로 캐시가 공유된다) */
  QL.barcodeValid = function (text, fmt) {
    if (text == null || text === '') return false;
    return QL.barcodeSvg(text, fmt || 'CODE128', '#000', 0) !== null;
  };

  /* ---------- 상자에 맞춰 글자 크기 줄이기 ---------- */
  var mctx = null, fitCache = {};
  /* 글꼴이 늦게 도착하면 글자 폭이 달라지므로 측정값을 버리고 다시 잰다 */
  QL.clearFitCache = function () { fitCache = {}; };
  function measureCtx() {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    return mctx;
  }
  var MM2PX = 96 / 25.4, PT2PX = 96 / 72;

  QL.fitFontSize = function (text, el, wMM, hMM) {
    var key = [text, el.font, el.bold, el.italic, el.size, el.wrap, el.lh, el.vertical, wMM, hMM].join('\u0001');
    if (key in fitCache) return fitCache[key];
    var ctx = measureCtx();
    var fam = QL.fontCss(el.font);
    /* 세로쓰기는 글줄이 세로로 흐르므로 재는 축을 맞바꾼다 */
    var boxW = (el.vertical ? hMM : wMM) * MM2PX;
    var boxH = (el.vertical ? wMM : hMM) * MM2PX;
    var lh = el.lh || 1.15;

    /* 주어진 크기에서 줄 수와 가장 긴 줄 너비를 센다.
       줄바꿈은 CSS 의 overflow-wrap:anywhere 와 같게, 단어로 끊되
       한 단어가 상자보다 넓으면 글자 단위로 쪼갠다. */
    function measure(pt) {
      ctx.font = (el.italic ? 'italic ' : '') + (el.bold ? '700 ' : '400 ') + (pt * PT2PX) + 'px ' + fam;
      var paras = String(text).split('\n'), lines = 0, maxW = 0, p, i;
      for (p = 0; p < paras.length; p++) {
        if (!el.wrap) {
          lines++;
          maxW = Math.max(maxW, ctx.measureText(paras[p]).width);
          continue;
        }
        var tokens = paras[p].split(/(\s+)/), cur = '', n = 0;
        for (i = 0; i < tokens.length; i++) {
          var t = tokens[i];
          if (t === '') continue;
          if (ctx.measureText(t).width > boxW) {          // 상자보다 긴 단어 → 글자 단위
            for (var c = 0; c < t.length; c++) {
              if (cur !== '' && ctx.measureText(cur + t[c]).width > boxW) {
                n++; maxW = Math.max(maxW, ctx.measureText(cur).width); cur = '';
              }
              cur += t[c];
            }
            continue;
          }
          if (cur !== '' && ctx.measureText(cur + t).width > boxW) {
            n++; maxW = Math.max(maxW, ctx.measureText(cur).width);
            cur = t.replace(/^\s+/, '');
          } else cur += t;
        }
        n++; maxW = Math.max(maxW, ctx.measureText(cur).width);
        lines += n;
      }
      return { lines: lines, w: maxW };
    }

    function fits(pt) {
      var r = measure(pt);
      return r.w <= boxW + 0.5 && r.lines * pt * PT2PX * lh <= boxH + 0.5;
    }

    var size;
    if (fits(el.size)) {
      size = el.size;                                     // 줄일 필요 없음
    } else {
      /* 0.25pt 해상도 이분 탐색 — 상자가 아무리 작아도 몇 단계면 끝난다 */
      var lo = 2.5, hi = el.size, guard = 0;
      while (hi - lo > 0.25 && guard++ < 30) {
        var mid = Math.round(((lo + hi) / 2) * 4) / 4;
        if (mid <= lo || mid >= hi) break;
        if (fits(mid)) lo = mid; else hi = mid;
      }
      size = lo;
    }
    fitCache[key] = size;
    return size;
  };

  /* ---------- 요소 1개 → HTML ---------- */
  QL.elHtml = function (el, row, headers, ctx) {
    var st = 'left:' + el.x + 'mm;top:' + el.y + 'mm;width:' + el.w + 'mm;height:' + el.h + 'mm;';
    if (el.rot) st += 'transform:rotate(' + el.rot + 'deg);';
    if (el.opacity != null && el.opacity < 1) st += 'opacity:' + el.opacity + ';';
    var inner = '';

    if (el.type === 'text') {
      var txt = QL.resolve(el.tpl, row, headers, ctx);
      var size = el.fit ? QL.fitFontSize(txt, el, el.w, el.h) : el.size;
      var js = el.align === 'center' ? 'center' : (el.align === 'right' ? 'flex-end' : 'flex-start');
      var ai = el.valign === 'middle' ? 'center' : (el.valign === 'bottom' ? 'flex-end' : 'flex-start');
      inner = '<div class="inner" style="align-items:' + ai + ';justify-content:' + js + '">' +
        '<div style="font-family:' + styleSafe(QL.fontCss(el.font)) + ';font-size:' + size + 'pt;' +
        'font-weight:' + (el.bold ? 700 : 400) + ';' + (el.italic ? 'font-style:italic;' : '') +
        'color:' + (el.color || '#000') + ';line-height:' + (el.lh || 1.15) + ';' +
        (el.ls ? 'letter-spacing:' + el.ls + 'mm;' : '') +
        'text-align:' + (el.align || 'left') + ';' +
        (el.vertical
          ? 'writing-mode:vertical-rl;text-orientation:upright;height:100%;width:auto;'
          : 'width:100%;') +
        (el.wrap ? 'white-space:pre-wrap;overflow-wrap:anywhere;' : 'white-space:pre;') +
        '">' + QL.esc(txt) + '</div></div>';

    } else if (el.type === 'qr') {
      var qtext = QL.resolve(el.tpl, row, headers, ctx);
      var svg = qtext ? QL.qrSvg(qtext, el.ecc || 'M', el.quiet == null ? 2 : el.quiet) : null;
      inner = '<div class="inner" style="color:' + (el.color || '#000') + ';align-items:center;justify-content:center">' +
        (svg || '<span class="err">QR 내용 없음</span>') + '</div>';

    } else if (el.type === 'barcode') {
      var btext = QL.resolve(el.tpl, row, headers, ctx);
      var bsvg = btext ? QL.barcodeSvg(btext, el.fmt || 'CODE128', el.color || '#000', el.quiet == null ? 10 : el.quiet) : null;
      if (!bsvg) {
        inner = '<div class="inner" style="align-items:center;justify-content:center">' +
          '<span class="err">' + (btext ? (el.fmt || 'CODE128') + ' 형식에 맞지 않는 값<br>' + QL.esc(btext) : '바코드 내용 없음') + '</span></div>';
      } else {
        var hriH = el.hri ? (el.hriSize * PT2PX / MM2PX * 1.25) : 0;   // mm
        inner = '<div class="inner" style="flex-direction:column">' +
          '<div style="flex:1 1 auto;width:100%;min-height:0">' + bsvg + '</div>' +
          (el.hri ? '<div style="flex:0 0 auto;width:100%;text-align:center;line-height:1.15;' +
            'font-family:' + styleSafe(QL.fontCss(el.font || 'sans')) + ';font-size:' + el.hriSize + 'pt;' +
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
      /* 내용에 {열이름} 을 넣으면 행마다 다른 그림을 쓴다. 비어 있으면 넣어 둔 그림. */
      var src = el.src;
      if (el.tpl) {
        var r = QL.resolve(el.tpl, row, headers, ctx).trim();
        if (r && r.indexOf('{') < 0) src = r;
      }
      inner = src
        ? '<div class="inner"><img src="' + styleSafe(src) + '" style="width:100%;height:100%;object-fit:' +
          (el.fit2 || 'contain') + '" alt="" onerror="this.style.display=\'none\'"></div>'
        : '<div class="inner" style="align-items:center;justify-content:center"><span class="err">이미지 없음</span></div>';
    }

    return '<div class="el" data-id="' + el.id + '" style="' + st + '">' + inner + '</div>';
  };

  QL.labelHtml = function (elements, row, headers, ctx) {
    var s = '', i;
    for (i = 0; i < elements.length; i++) s += QL.elHtml(elements[i], row, headers, ctx);
    return s;
  };

  /* ---------- 페이지 생성 ---------- */
  QL.MAX_LABELS = 5000;

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
          QL.labelHtml(o.elements, items[i].row, o.headers,
            { seq: (o.seqOffset || 0) + i + 1, rowNo: items[i].rowNo }) + '</div></div></div>');
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
          QL.labelHtml(o.elements, items[idx].row, o.headers,
            { seq: (o.seqOffset || 0) + idx + 1, rowNo: items[idx].rowNo }) + '</div>');
        idx++;
      }
      html.push('</div></div>');
    }
    return { html: html.join(''), pages: pages, pw: o.pageW, ph: o.pageH, limited: limited, shown: count };
  };

})(window.QL);
