'use strict';
// UI for base10.html. Logic lives in base10.js (B10); bit.js supplies the binary
// BIT paths used for comparison.

(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const S = {
    n: 40, b: 10, v: 'B',
    arr: [], tree: [],
    frames: [], idx: 0, playing: false, timer: null,
    focus: { kind: 'query', val: 37 },
    dom: null,
  };

  // deterministic first array so the page opens the same way every time
  function seeded(n, seed) {
    let x = seed;
    return Array.from({ length: n }, () => { x = (x * 1103515245 + 12345) % 2147483648; return 1 + (x % 9); });
  }

  const cellW = n => (n <= 20 ? 34 : n <= 40 ? 22 : 11);

  // ---------- code panel ----------
  const CODE_COMMON_HEAD = [
    ['', '// p(i): place value of the lowest nonzero base-B digit'],
    ['', 'int place(int i) {'],
    ['', '    int p = 1;'],
    ['', '    while (i % B == 0) { i /= B; p *= B; }  // vs i & -i'],
    ['', '    return p;'],
    ['', '}'],
    ['', ''],
  ];
  const CODE_A = [
    ['', '// Version A: chunk = one coin, B^(trailing zeros)'],
    ['len', 'int len(int i)  { return place(i); }'],
    ['next', 'int next(int i) { int q = place(i) * B;'],
    ['next', '                  return (i / q + 1) * q; }'],
  ];
  const CODE_B = [
    ['', '// Version B: chunk = whole last digit group'],
    ['len', 'int len(int i)  { return i % (place(i) * B); }'],
    ['next', 'int next(int i) { return i + place(i); }'],
  ];
  const CODE_COMMON_TAIL = [
    ['', ''],
    ['build', '// t[e] = a[e - len(e) + 1] + ... + a[e]'],
    ['', ''],
    ['add-sig', 'void add(int i, long long x) {'],
    ['add-loop', '    for (; i <= n; i = next(i))'],
    ['add-body', '        t[i] += x;'],
    ['', '}'],
    ['', ''],
    ['', 'long long sum(int i) {'],
    ['sum-init', '    long long s = 0;'],
    ['sum-loop', '    for (; i > 0; i -= len(i))'],
    ['sum-body', '        s += t[i];'],
    ['sum-ret', '    return s;'],
    ['', '}'],
  ];

  function buildCode() {
    const lines = [...CODE_COMMON_HEAD, ...(S.v === 'A' ? CODE_A : CODE_B), ...CODE_COMMON_TAIL];
    $('#code').innerHTML = lines.map(([id, line]) => {
      const k = line.indexOf('//');
      const body = k >= 0 ? esc(line.slice(0, k)) + `<span class="cm">${esc(line.slice(k))}</span>` : esc(line);
      return `<span class="ln" data-id="${id}">${body || ' '}</span>`;
    }).join('');
  }

  function renderCode(f) {
    const ids = [].concat(f.code || []);
    document.querySelectorAll('#code .ln').forEach(el => el.classList.toggle('hl', ids.includes(el.dataset.id)));
    $('#vars').innerHTML = Object.entries(f.vars).map(([k, v]) => `<span class="var">${esc(k)} = <b>${v}</b></span>`).join('');
  }

  // ---------- chunk grid ----------
  // e in base b, padded, with the last digit group (lowest nonzero digit + trailing zeros) highlighted
  function reprHTML(e) {
    const { b, n } = S;
    const s = B10.digitsOf(e, b).join('');
    const W = B10.digitsOf(n, b).length;
    const k = B10.trailing(e, b);
    const cut = s.length - k - 1;
    return `<span class="pad">${'0'.repeat(W - s.length)}</span>${s.slice(0, cut)}<span class="grp">${s.slice(cut)}</span>`;
  }

  function buildGrid() {
    const { n, b, v } = S;
    const g = $('#grid');
    g.innerHTML = '';
    g.className = 'grid' + (n > 40 ? ' compact' : n > 20 ? ' mid' : '');
    g.style.setProperty('--n', n);
    g.style.setProperty('--cw', cellW(n) + 'px');
    g.style.setProperty('--lw', n > 40 ? '128px' : '150px');
    const dom = { headCells: [], arrCells: [], rows: [], vals: [], bars: [], bg: [] };

    const sticky = document.createElement('div');
    sticky.className = 'g-sticky';
    const head = document.createElement('div');
    head.className = 'g-row g-head';
    head.innerHTML = '<div class="g-label">i</div>';
    for (let c = 1; c <= n; c++) {
      const d = document.createElement('div');
      d.className = 'g-cell';
      d.style.gridColumn = c + 1;
      d.textContent = n > 40 && c % 10 !== 0 && c !== 1 ? '' : c;
      head.appendChild(d);
      dom.headCells[c] = d;
    }
    const arrRow = document.createElement('div');
    arrRow.className = 'g-row g-arr';
    arrRow.innerHTML = '<div class="g-label">a[i]</div>';
    for (let c = 1; c <= n; c++) {
      const d = document.createElement('div');
      d.className = 'g-cell';
      d.style.gridColumn = c + 1;
      d.title = `a[${c}]: click to use as j for add(j, x)`;
      d.addEventListener('click', () => { $('#u-j').value = c; });
      arrRow.appendChild(d);
      dom.arrCells[c] = d;
    }
    sticky.append(head, arrRow);
    g.appendChild(sticky);

    for (let e = 1; e <= n; e++) {
      const s = B10.start(e, b, v);
      const row = document.createElement('div');
      row.className = 'g-row t-row';
      const lab = document.createElement('div');
      lab.className = 'g-label';
      lab.title = `t[${e}] covers ${s}–${e}. Click to use as q for sum(1..q).`;
      lab.innerHTML = `<span class="nm">t[${e}]</span><span class="bin">${reprHTML(e)}</span><span class="val"></span>`;
      lab.addEventListener('click', () => { $('#q-q').value = e; });
      row.appendChild(lab);
      dom.bg[e] = [];
      for (let c = 1; c <= n; c++) {
        const bg = document.createElement('div');
        bg.className = 'g-bg' + (c === n ? ' last' : '');
        bg.style.gridColumn = c + 1;
        row.appendChild(bg);
        dom.bg[e][c] = bg;
      }
      const bar = document.createElement('div');
      bar.className = 'g-bar';
      bar.style.gridColumn = `${s + 1} / ${e + 2}`;
      bar.title = `t[${e}] = a[${s}] + … + a[${e}] (length ${e - s + 1})`;
      row.appendChild(bar);
      g.appendChild(row);
      dom.rows[e] = row;
      dom.vals[e] = lab.querySelector('.val');
      dom.bars[e] = bar;
    }
    S.dom = dom;

    const ex = b === 10 && n >= 40
      ? (v === 'A' ? ' For example t[13] covers 13 alone, t[30] covers 21–30, and t[40] covers 31–40.' : ' For example t[37] covers 31–37 (7 long), t[30] covers 1–30, and t[40] covers 1–40.')
      : '';
    $('#grid-hint').innerHTML = (v === 'A'
      ? `Version A: every bar is a power of ${b} long. The orange part of each label is its last digit group, and the chunk length is that group's place value (a 1 followed by its zeros).`
      : `Version B: every bar is as long as the orange part of its label read as a number, the whole last digit group.`) + ex +
      ' Click an array cell to choose j, or a row label to choose q.';
  }

  function renderGrid(f, prev) {
    const { n, dom } = S;
    for (let c = 1; c <= n; c++) {
      dom.arrCells[c].textContent = f.arr[c];
      dom.arrCells[c].className = 'g-cell ' + (f.cells[c] || '');
      dom.headCells[c].className = 'g-cell' + (f.col === c ? ' col' : '');
    }
    for (let e = 1; e <= n; e++) {
      dom.rows[e].className = 'g-row t-row ' + (f.rows[e] || '');
      dom.vals[e].textContent = f.tree[e];
      dom.vals[e].classList.toggle('bump', !!prev && prev.tree[e] !== f.tree[e]);
      const L = B10.len(e, S.b, S.v);
      dom.bars[e].textContent = L * cellW(n) >= 26 ? f.tree[e] : '';
      for (let c = 1; c <= n; c++) dom.bg[e][c].classList.toggle('col', f.col === c);
    }
    // keep the current row in view inside the scroll box
    const activeE = Object.keys(f.rows).find(k => f.rows[k] === 'active');
    if (activeE) {
      const box = $('#grid-scroll');
      const row = dom.rows[activeE];
      const stickyH = box.querySelector('.g-sticky').offsetHeight;
      const top = row.offsetTop, bottom = top + row.offsetHeight;
      if (top < box.scrollTop + stickyH) box.scrollTop = top - stickyH - 4;
      else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 4;
    }
  }

  // ---------- digit walk ----------
  function chipBase(x) {
    const { b } = S;
    if (x <= 0) return '0';
    const s = B10.digitsOf(x, b).join('');
    const k = B10.trailing(x, b);
    const cut = s.length - k - 1;
    return `${s.slice(0, cut)}<b class="low">${s.slice(cut)}</b>`;
  }

  function renderTrail(f) {
    const el = $('#trail');
    const t = f.trail;
    if (!t) {
      el.innerHTML = '<p class="muted">Run a query or an update to watch the index move digit by digit.</p>';
      return;
    }
    const parts = [];
    t.items.forEach((x, k) => {
      const term = x === 0 || x > S.n;
      const cls = term ? 'term' : k === t.cur ? 'cur' : k < t.cur ? 'past' : '';
      if (k > 0) {
        const p = t.items[k - 1];
        const d = t.kind === 'query' ? `−${B10.len(p, S.b, S.v)}` : `+${x - p}`;
        parts.push(`<span class="arrow">${d} →</span>`);
      }
      const dec = S.b !== 10 && !term ? `<span class="stop">= ${x}</span>` : '';
      parts.push(`<div class="chip ${cls}"><span class="dec">${chipBase(x)}</span>${dec}${term ? '<span class="stop">stop</span>' : ''}</div>`);
    });
    const cap = t.kind === 'query'
      ? (S.v === 'A'
        ? 'Version A query: each step subtracts one coin, which lowers the last nonzero digit by 1. Reads = sum of the digits.'
        : 'Version B query: each step removes the whole last nonzero digit. Reads = number of nonzero digits.')
      : (S.v === 'A'
        ? 'Version A update: round up to the next multiple of the next place value. Writes = about one per digit level.'
        : 'Version B update: add 1 to the last nonzero digit (37 → 38 → 39 → 40). Up to b − 1 writes per digit level.');
    el.innerHTML = parts.join('') + `<p class="cap hint">${cap}</p>`;
  }

  // ---------- coins vs bills ----------
  function piecesBar(lens) {
    return `<div class="pc-bar">${lens.map(L => `<span style="flex:${L} 0 0" title="${L}">${L}</span>`).join('')}</div>`;
  }

  function groupByLevel(path, base) {
    const levels = new Map();
    path.forEach(e => {
      const k = Math.round(Math.log(B10.place(e, base)) / Math.log(base));
      if (!levels.has(k)) levels.set(k, []);
      levels.get(k).push(e);
    });
    return [...levels.entries()];
  }

  function renderPieces() {
    const { b, n, v } = S;
    const el = $('#pieces');
    const { kind, val } = S.focus;
    if (kind === 'query') {
      const q = val;
      const ds = B10.digitsOf(q, b);
      const terms = ds.map((d, i) => `<b>${d}</b>·${b ** (ds.length - 1 - i)}`).join(' + ');
      const pA = B10.queryPath(q, b, 'A').reverse().map(e => B10.len(e, b, 'A'));
      const pB = B10.queryPath(q, b, 'B').reverse().map(e => B10.len(e, b, 'B'));
      const pBit = peelPath(q).reverse().map(lowbit);
      const block = (id, name, lens, note) => `
        <div class="pc-block${id === v ? ' cur' : ''}">
          <div class="pc-head"><span>${name}</span><span class="cnt ${lens.length > pBit.length ? 'hi' : 'lo'}">${lens.length} read${lens.length === 1 ? '' : 's'}</span></div>
          ${piecesBar(lens)}<p class="pc-note">${note}</p>
        </div>`;
      el.innerHTML = `<p class="pc-num">sum(1..${q}): ${q} = ${terms}${b !== 10 ? ` <span class="muted">(${B10.fmt(q, b)})</span>` : ''}</p>` +
        block('A', 'Version A: coins', pA, `Each digit d is paid with d coins of its place value (1, ${b}, ${b * b}, …).`) +
        block('B', 'Version B: bills', pB, 'Each nonzero digit is paid with one chunk of size d × place.') +
        block('bit', 'Binary BIT, for reference', pBit, `${q} = ${toBin(q, bitLen(q))}₂: never more than one coin per size.`) +
        '<p class="pc-note">Pieces are laid end to end from position 1, exactly like the chunks the query reads.</p>';
    } else {
      const j = val;
      const lvl = (path, base) => groupByLevel(path, base).map(([k, es]) =>
        `<div class="pc-lvl"><span class="nm">size ${base ** k}</span><span class="ix">${es.map(e => `<i>${e}</i>`).join('')}</span></div>`).join('');
      const uA = B10.updatePath(j, n, b, 'A');
      const uB = B10.updatePath(j, n, b, 'B');
      const uBit = climbPath(j, n);
      const block = (id, name, path, base, note) => `
        <div class="pc-block${id === v ? ' cur' : ''}">
          <div class="pc-head"><span>${name}</span><span class="cnt ${path.length > uBit.length ? 'hi' : 'lo'}">${path.length} write${path.length === 1 ? '' : 's'}</span></div>
          <div class="pc-levels">${lvl(path, base)}</div><p class="pc-note">${note}</p>
        </div>`;
      el.innerHTML = `<p class="pc-num">add(${j}, x): which chunks contain position ${j}? <span class="muted">(n = ${n})</span></p>` +
        block('A', 'Version A', uA, b, 'Only one chunk of each size contains j.') +
        block('B', 'Version B', uB, b, `Up to ${b - 1} chunks per level contain j, because t[e] covers everything from the end of its higher digits up to e.`) +
        block('bit', 'Binary BIT, for reference', uBit, 2, 'One chunk per level, and there are about log₂ n levels.');
    }
  }

  // ---------- trade-off panel ----------
  function renderWorst() {
    const { n, b, v } = S;
    $('#ww-n').textContent = n;
    const w = B10.worst(n, b);
    let bitQ = 0, bitU = 0;
    for (let i = 1; i <= n; i++) { bitQ = Math.max(bitQ, popcount(i)); bitU = Math.max(bitU, climbPath(i, n).length); }
    const max = Math.max(w.qA, w.uA, w.qB, w.uB, bitQ, bitU, 1);
    const cell = (x, ref) => `<div class="ww-cell${x > ref ? ' bad' : ''}"><span class="bt"><span class="bf" style="width:${Math.max(3, (x / max) * 100)}%"></span></span><span class="bv">${x}</span></div>`;
    $('#worst').innerHTML = `
      <div class="ww-grid">
        <span></span><span class="hd">query (reads)</span><span class="hd">update (writes)</span>
        <span class="${v === 'A' ? 'cur-row' : ''}">Version A</span>${cell(w.qA, bitQ)}${cell(w.uA, bitU)}
        <span class="${v === 'B' ? 'cur-row' : ''}">Version B</span>${cell(w.qB, bitQ)}${cell(w.uB, bitU)}
        <span>Binary BIT</span>${cell(bitQ, bitQ)}${cell(bitU, bitU)}
      </div>
      <p class="hint">${b === 2
        ? 'In base 2, A, B and the BIT are the same structure, because a nonzero binary digit can only be 1.'
        : `Red bars are where the up-to-${b - 1}-pieces-per-digit cost lands. A pays it on queries, B pays it on updates.`}</p>`;
  }

  let tbTimer = null;
  function renderBaseTable() {
    const n = clamp(Math.floor(+$('#tb-n').value) || 2, 2, 300000);
    const rows = [2, 3, 4, 10, 100].map(b => {
      let digits = 0;
      for (let p = 1; p < n; p *= b) digits++;
      return { b, digits, formula: (b - 1) * digits, ...B10.worst(n, b) };
    });
    $('#btable').innerHTML = `
      <thead><tr><th>base</th><th>digits</th><th>(b−1)·digits</th><th>A query</th><th>A update</th><th>B query</th><th>B update</th></tr></thead>
      <tbody>${rows.map(r => `
        <tr class="${r.b === 2 ? 'two' : ''}">
          <td>${r.b}</td><td class="num">${r.digits}</td><td class="num">${r.formula}</td>
          <td class="num${r.b > 2 ? ' bad' : ''}">${r.qA}</td><td class="num">${r.uA}</td>
          <td class="num">${r.qB}</td><td class="num${r.b > 2 ? ' bad' : ''}">${r.uB}</td>
        </tr>`).join('')}</tbody>`;
  }

  // ---------- playback ----------
  function renderLog() {
    const ol = $('#log');
    ol.innerHTML = '';
    S.frames.forEach((f, k) => {
      const li = document.createElement('li');
      li.textContent = f.text;
      li.addEventListener('click', () => { setPlaying(false); show(k); });
      ol.appendChild(li);
    });
  }

  function syncLog() {
    const ol = $('#log');
    [...ol.children].forEach((li, k) => {
      li.classList.toggle('cur', k === S.idx);
      li.classList.toggle('future', k > S.idx);
    });
    const cur = ol.children[S.idx];
    if (cur) ol.scrollTop = Math.max(0, cur.offsetTop - ol.clientHeight / 2 + cur.clientHeight / 2);
  }

  function render() {
    const f = S.frames[S.idx];
    if (!f) return;
    renderGrid(f, S.idx > 0 ? S.frames[S.idx - 1] : null);
    renderTrail(f);
    renderCode(f);
    $('#narration').textContent = f.text;
    $('#result').textContent = f.result || '';
    $('#mode-pill').textContent = `Version ${S.v} · base ${S.b}`;
    $('#step-count').textContent = `step ${S.idx + 1} / ${S.frames.length}`;
    $('#p-play').textContent = S.playing ? '⏸' : '▶';
    syncLog();
  }

  function show(i) { S.idx = clamp(i, 0, S.frames.length - 1); render(); }
  const delay = () => Math.round(1800 * Math.pow(0.05, +$('#speed').value / 100));

  function schedule() {
    clearTimeout(S.timer);
    if (!S.playing) return;
    if (S.idx >= S.frames.length - 1) { setPlaying(false); return; }
    S.timer = setTimeout(() => { show(S.idx + 1); schedule(); }, delay());
  }

  function setPlaying(p) {
    if (p && S.idx >= S.frames.length - 1) S.idx = 0;
    S.playing = p;
    $('#p-play').textContent = p ? '⏸' : '▶';
    schedule();
  }

  function runFrames(ctx, play = true) {
    setPlaying(false);
    S.arr = ctx.arr;
    S.tree = ctx.tree;
    S.frames = ctx.frames;
    S.idx = 0;
    renderLog();
    render();
    if (play) setPlaying(true);
  }

  // ---------- state changes ----------
  function readInt(sel, lo, hi) {
    const el = $(sel);
    let x = Math.trunc(+el.value);
    if (!Number.isFinite(x)) x = lo;
    x = clamp(x, lo, hi);
    el.value = x;
    return x;
  }

  // the structure changed (version, base, n or array): rebuild instantly so queries work right away
  function restructure(note) {
    S.tree = B10.buildTree(S.arr, S.n, S.b, S.v);
    ['#q-q', '#u-j'].forEach(s => { $(s).max = S.n; });
    readInt('#q-q', 1, S.n);
    readInt('#u-j', 1, S.n);
    if (S.focus.val > S.n) S.focus.val = S.n;
    $('#v-A').classList.toggle('on', S.v === 'A');
    $('#v-B').classList.toggle('on', S.v === 'B');
    $('#walk-base').textContent = S.b;
    buildCode();
    buildGrid();
    renderPieces();
    renderWorst();
    runFrames(B10.genIdle(S, note), false);
  }

  function setArray(n, vals) {
    S.n = n;
    S.arr = [0, ...vals];
    $('#size').value = String(n);
  }

  function runQuery() {
    const q = readInt('#q-q', 1, S.n);
    S.focus = { kind: 'query', val: q };
    renderPieces();
    runFrames(B10.genQuery(S, q));
  }

  function runUpdate() {
    const j = readInt('#u-j', 1, S.n);
    const x = Math.trunc(+$('#u-x').value) || 0;
    $('#u-x').value = x;
    S.focus = { kind: 'update', val: j };
    renderPieces();
    runFrames(B10.genUpdate(S, j, x));
  }

  function wire() {
    const setVersion = v => {
      if (S.v === v) return;
      S.v = v;
      restructure(`Switched to Version ${v}. Same array, different chunks, rebuilt instantly. Run the same query or update again and compare the step counts.`);
    };
    $('#v-A').addEventListener('click', () => setVersion('A'));
    $('#v-B').addEventListener('click', () => setVersion('B'));
    $('#base').addEventListener('change', e => {
      S.b = +e.target.value;
      restructure(S.b === 2
        ? 'Base 2: every nonzero digit is 1, so Version A and Version B are identical. Both are exactly the binary BIT.'
        : `Base ${S.b}: digits run from 0 to ${S.b - 1}, so one side pays up to ${S.b - 1} pieces per digit.`);
    });
    $('#size').addEventListener('change', e => {
      const n = +e.target.value;
      setArray(n, seeded(n, Date.now() % 100000));
      restructure(`New array with n = ${n}. The tree is built. Press "Animate build" to watch each chunk get its length.`);
    });
    $('#random').addEventListener('click', () => {
      setArray(S.n, seeded(S.n, Date.now() % 100000));
      restructure('New random array. The tree is rebuilt.');
    });

    $('#op-build').addEventListener('click', () => runFrames(B10.genBuild(S)));
    $('#op-query').addEventListener('click', runQuery);
    $('#op-update').addEventListener('click', runUpdate);

    document.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
      const [v, kind, val] = btn.dataset.preset.split(':');
      const need = +val > S.n;
      if (S.b !== 10 || S.v !== v || need) {
        S.b = 10;
        $('#base').value = '10';
        S.v = v;
        if (need) setArray(40, seeded(40, 7));
        restructure('');
      }
      if (kind === 'q') { $('#q-q').value = val; runQuery(); }
      else { $('#u-j').value = val; runUpdate(); }
    }));

    $('#p-first').addEventListener('click', () => { setPlaying(false); show(0); });
    $('#p-prev').addEventListener('click', () => { setPlaying(false); show(S.idx - 1); });
    $('#p-next').addEventListener('click', () => { setPlaying(false); show(S.idx + 1); });
    $('#p-last').addEventListener('click', () => { setPlaying(false); show(S.frames.length - 1); });
    $('#p-play').addEventListener('click', () => setPlaying(!S.playing));
    $('#speed').addEventListener('input', schedule);

    document.addEventListener('keydown', e => {
      if (e.target.closest('input, select, textarea')) return;
      if (e.key === 'ArrowRight') { setPlaying(false); show(S.idx + 1); }
      else if (e.key === 'ArrowLeft') { setPlaying(false); show(S.idx - 1); }
      else if (e.key === 'Home') { setPlaying(false); show(0); }
      else if (e.key === 'End') { setPlaying(false); show(S.frames.length - 1); }
      else if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); setPlaying(!S.playing); }
    });

    $('#tb-n').addEventListener('input', () => { clearTimeout(tbTimer); tbTimer = setTimeout(renderBaseTable, 250); });
  }

  wire();
  setArray(40, seeded(40, 7));
  renderBaseTable();
  restructure('Version B in base 10 with n = 40, already built. Press "sum(1..q)" to see the cheap query (37 = 30 + 7, two reads), then "add(j, x)" to see the expensive update. Then switch to Version A and run both again.');
})();
