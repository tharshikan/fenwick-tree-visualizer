'use strict';
// Rendering + playback. All Fenwick logic lives in bit.js; this file only
// draws frames and wires up the controls.

const $ = s => document.querySelector(s);
const DEFAULT = [3, 1, 4, 1, 5, 9, 2, 6];
const ACTIVE_STATES = ['active', 'plus', 'minus', 'source'];

const S = {
  n: DEFAULT.length,
  arr: [0, ...DEFAULT],
  tree: new Array(DEFAULT.length + 1).fill(0),
  built: false,
  frames: [],
  idx: 0,
  playing: false,
  timer: null,
  counters: null,
  structMode: 'update',
  chartLog: true,
  dom: null,
};

const CODE = [
  ['', 'struct BIT {'],
  ['', '    int n;'],
  ['', '    vector<long long> t;       // t[0] unused'],
  ['ctor', '    BIT(int n) : n(n), t(n + 1, 0) {}'],
  ['', ''],
  ['', '    // climb to every chunk containing i'],
  ['add-sig', '    void add(int i, long long x) {'],
  ['add-loop', '        for (; i <= n; i += i & -i)'],
  ['add-body', '            t[i] += x;'],
  ['', '    }'],
  ['', ''],
  ['', '    // sum of 1..i: peel chunks off, right to left'],
  ['sum-sig', '    long long sum(int i) {'],
  ['sum-init', '        long long s = 0;'],
  ['sum-loop', '        for (; i > 0; i -= i & -i)'],
  ['sum-body', '            s += t[i];'],
  ['sum-ret', '        return s;'],
  ['', '    }'],
  ['', ''],
  ['', '    long long range(int l, int r) {'],
  ['range', '        return sum(r) - sum(l - 1);'],
  ['', '    }'],
  ['', '};'],
  ['', ''],
  ['', '// O(n) build: push each chunk into its parent'],
  ['fast-copy', 'for (int i = 1; i <= n; i++) t[i] = a[i];'],
  ['', 'for (int i = 1; i <= n; i++) {'],
  ['fast-body', '    int j = i + (i & -i);'],
  ['fast-body', '    if (j <= n) t[j] += t[i];'],
  ['', '}'],
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// binary string with the lowest set bit highlighted
function binHTML(v, w) {
  const s = toBin(v, w);
  if (v <= 0) return s;
  const pos = s.length - 1 - Math.log2(lowbit(v));
  return s.slice(0, pos) + '<b class="low">1</b>' + s.slice(pos + 1);
}

function cellWidth(n) { return n <= 8 ? 46 : n <= 16 ? 34 : 26; }

// ---------- chunk grid (DOM built once per n, classes toggled per frame) ----------
function buildGrid() {
  const n = S.n;
  const w = bitLen(n);
  const g = $('#grid');
  g.innerHTML = '';
  g.style.setProperty('--n', n);
  g.style.setProperty('--cw', cellWidth(n) + 'px');
  const dom = { headCells: [], arrCells: [], rows: [], vals: [], barVals: [], bg: [] };

  const head = document.createElement('div');
  head.className = 'g-row g-head';
  head.innerHTML = '<div class="g-label">i</div>';
  for (let c = 1; c <= n; c++) {
    const d = document.createElement('div');
    d.className = 'g-cell';
    d.style.gridColumn = c + 1;
    d.textContent = c;
    head.appendChild(d);
    dom.headCells[c] = d;
  }
  g.appendChild(head);

  const arrRow = document.createElement('div');
  arrRow.className = 'g-row g-arr';
  arrRow.innerHTML = '<div class="g-label">a[i]</div>';
  for (let c = 1; c <= n; c++) {
    const d = document.createElement('div');
    d.className = 'g-cell';
    d.style.gridColumn = c + 1;
    d.title = `a[${c}]: click to use as i for add(i, x)`;
    d.addEventListener('click', () => { $('#u-i').value = c; });
    arrRow.appendChild(d);
    dom.arrCells[c] = d;
  }
  g.appendChild(arrRow);

  for (let e = 1; e <= n; e++) {
    const row = document.createElement('div');
    row.className = 'g-row t-row';
    const lab = document.createElement('div');
    lab.className = 'g-label';
    lab.title = `t[${e}] covers ${chunkStart(e)}–${e}. Click to use as p for sum(1..p).`;
    lab.innerHTML = `<span class="nm">t[${e}]</span><span class="bin">${binHTML(e, w)}</span><span class="val"></span>`;
    lab.addEventListener('click', () => { $('#q-p').value = e; });
    row.appendChild(lab);
    dom.bg[e] = [];
    for (let c = 1; c <= n; c++) {
      const b = document.createElement('div');
      b.className = 'g-bg' + (c === n ? ' last' : '');
      b.style.gridColumn = c + 1;
      row.appendChild(b);
      dom.bg[e][c] = b;
    }
    const bar = document.createElement('div');
    bar.className = 'g-bar';
    bar.style.gridColumn = `${chunkStart(e) + 1} / ${e + 2}`;
    bar.title = `t[${e}] = a[${chunkStart(e)}] + … + a[${e}] (length ${lowbit(e)})`;
    row.appendChild(bar);
    g.appendChild(row);
    dom.rows[e] = row;
    dom.vals[e] = lab.querySelector('.val');
    dom.barVals[e] = bar;
  }
  S.dom = dom;
}

function renderGrid(f, prev) {
  const { n, dom } = S;
  for (let c = 1; c <= n; c++) {
    dom.arrCells[c].textContent = f.arr[c];
    dom.arrCells[c].className = 'g-cell ' + (f.cells[c] || '');
    dom.headCells[c].className = 'g-cell' + (f.col === c ? ' col' : '');
  }
  const showInBar = len => len * cellWidth(n) >= 30;
  for (let e = 1; e <= n; e++) {
    dom.rows[e].className = 'g-row t-row ' + (f.rows[e] || '');
    dom.vals[e].textContent = f.tree[e];
    dom.vals[e].classList.toggle('bump', !!prev && prev.tree[e] !== f.tree[e]);
    dom.barVals[e].textContent = showInBar(lowbit(e)) ? f.tree[e] : '';
    for (let c = 1; c <= n; c++) dom.bg[e][c].classList.toggle('col', f.col === c);
  }
}

// ---------- binary trail ----------
function renderTrail(f) {
  const el = $('#trail');
  const t = f.trail;
  if (!t) {
    el.innerHTML = '<p class="muted">Run an operation to watch the index move through its bits.</p>';
    return;
  }
  const w = bitLen(S.n) + 1;
  const parts = [];
  t.items.forEach((v, k) => {
    const term = v === 0 || v > S.n;
    const cls = term ? 'term' : k === t.cur ? 'cur' : k < t.cur ? 'past' : '';
    if (k > 0) {
      const p = t.items[k - 1];
      parts.push(`<span class="arrow">${t.kind === 'peel' ? '−' : '+'}${lowbit(p)} →</span>`);
    }
    parts.push(`<div class="chip ${cls}"><span class="dec">${v}</span><span class="bin">${binHTML(v, w)}</span>${term ? '<span class="stop">stop</span>' : ''}</div>`);
  });
  const cap = t.kind === 'peel'
    ? 'Query: <code>i -= i &amp; -i</code> deletes the lowest 1-bit, so there is one step per 1-bit of p.'
    : 'Update: <code>i += i &amp; -i</code> adds the lowest 1-bit. The carry at least doubles the lowest bit, so each chunk is at least twice as long as the last.';
  el.innerHTML = parts.join('') + `<p class="cap hint">${cap}</p>`;
}

// ---------- i & -i explainer ----------
function renderLowbit(f) {
  const el = $('#lowbit');
  const i = f.focus;
  if (!i) {
    el.innerHTML = '<p class="muted">Shows the two\'s-complement trick for the index currently in play.</p>';
    return;
  }
  const w = Math.max(5, bitLen(S.n) + 1);
  const mask = (1 << w) - 1;
  const lc = w - 1 - Math.log2(lowbit(i));
  const rows = [
    ['i', i & mask, i],
    ['~i', ~i & mask, 'flip'],
    ['-i = ~i + 1', -i & mask, '+1 carries'],
    ['i & -i', i & -i & mask, lowbit(i)],
  ];
  const html = rows.map(([k, v, d], r) => {
    const bits = toBin(v, w).split('').map((b, c) =>
      `<td class="bit${b === '1' ? ' one' : ''}${c === lc ? ' lc' : ''}">${b}</td>`).join('');
    return `<tr class="${r === 3 ? 'res' : ''}"><td class="k">${esc(k)}</td>${bits}<td class="dec">${esc(d)}</td></tr>`;
  }).join('');
  el.innerHTML = `<table class="lb-table">${html}</table>
    <p class="lb-cap">Above the lowest 1-bit, i and −i are opposites, so AND gives 0. Only that bit survives.
    <b>lowbit(${i}) = ${lowbit(i)}</b>, so <code>t[${i}]</code> covers ${chunkStart(i)}–${i}. <span class="muted">(last ${w} bits shown)</span></p>`;
}

// ---------- hidden tree (update: parent = i + lowbit, query: parent = i − lowbit) ----------
function renderStruct(f) {
  const n = S.n;
  const mode = S.structMode;
  const maxL = Math.floor(Math.log2(n));
  let maxPop = 0;
  for (let i = 1; i <= n; i++) maxPop = Math.max(maxPop, popcount(i));
  const dx = n <= 8 ? 56 : n <= 16 ? 40 : 30;
  const dy = 50, pad = 24, r = n <= 16 ? 13 : 11;
  const first = mode === 'query' ? 0 : 1;
  const levels = mode === 'update' ? maxL + 1 : maxPop + 1;
  const X = i => pad + 84 + (i - first) * dx;
  const Y = i => pad + (mode === 'update' ? maxL - Math.log2(lowbit(i)) : popcount(i)) * dy;
  const W = X(n) + pad;
  const H = pad * 2 + (levels - 1) * dy;
  const state = i => (i === 0 ? null : f.rows[i] || null);
  const on = i => ACTIVE_STATES.includes(state(i));

  let edges = '', nodes = '', lvl = '';
  for (let L = 0; L < levels; L++) {
    const label = mode === 'update' ? `len ${1 << (maxL - L)}` : `${L} one-bit${L === 1 ? '' : 's'}`;
    lvl += `<text class="st-level" x="${pad - 4}" y="${pad + L * dy + 4}">${label}</text>`;
  }
  for (let i = 1; i <= n; i++) {
    const p = mode === 'update' ? i + lowbit(i) : i - lowbit(i);
    if (mode === 'update' && p > n) continue;
    const lit = mode === 'update' ? on(i) && on(p) : on(i);
    const minus = state(i) === 'minus' ? ' minus' : '';
    edges += `<line class="st-edge${lit ? ' on' + minus : ''}" x1="${X(i)}" y1="${Y(i)}" x2="${X(p)}" y2="${Y(p)}"/>`;
  }
  for (let i = first; i <= n; i++) {
    const st = state(i) || '';
    const tgt = f.col === i ? ' target' : '';
    const title = i === 0 ? 'root: sum(0) = 0' : `t[${i}] covers ${chunkStart(i)}–${i}`;
    nodes += `<g class="st-node ${st}${tgt}"><title>${title}</title><circle cx="${X(i)}" cy="${Y(i)}" r="${r}"/><text x="${X(i)}" y="${Y(i)}">${i}</text></g>`;
  }
  $('#struct').innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${mode} tree">${lvl}${edges}${nodes}</svg>`;
  $('#struct-cap').innerHTML = mode === 'update'
    ? 'Draw an edge from each i to <code>i + lowbit(i)</code>: every node is the next chunk that contains it. An update starts at i and walks up to a root. Rows are chunk lengths, so the height is about log₂n.'
    : 'Draw an edge from each i to <code>i − lowbit(i)</code>: a node\'s depth is its number of 1-bits. A query starts at p and walks up to 0, collecting one chunk per level.';
}

// ---------- code panel ----------
function buildCode() {
  $('#code').innerHTML = CODE.map(([id, line]) => {
    const k = line.indexOf('//');
    const body = k >= 0 ? esc(line.slice(0, k)) + `<span class="cm">${esc(line.slice(k))}</span>` : esc(line);
    return `<span class="ln" data-id="${id}">${body || ' '}</span>`;
  }).join('');
}

function renderCode(f) {
  document.querySelectorAll('#code .ln').forEach(el => {
    el.classList.toggle('hl', !!f.code && el.dataset.id === f.code);
  });
  const w = bitLen(S.n) + 1;
  $('#vars').innerHTML = Object.entries(f.vars).map(([k, v]) => {
    const extra = (k === 'i' || k === 'j') && v > 0 ? ` <span class="muted">(${toBin(v, w)})</span>` : '';
    return `<span class="var">${esc(k)} = <b>${v}</b>${extra}</span>`;
  }).join('');
}

// ---------- step log ----------
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
  if (cur) {
    const top = cur.offsetTop - ol.clientHeight / 2 + cur.clientHeight / 2;
    ol.scrollTop = Math.max(0, top);
  }
}

// ---------- perf panel ----------
function renderCounters() {
  const el = $('#counters');
  const c = S.counters;
  if (!c) {
    el.innerHTML = '<p class="muted">Run an operation to compare how many cells each structure has to touch.</p>';
    return;
  }
  const max = Math.max(1, ...c.items.map(x => x.v));
  el.innerHTML = `<p class="c-title">${esc(c.title)}</p>` + c.items.map(it => `
    <div class="bar-row${it.bit ? ' bit' : ''}">
      <span class="bl">${esc(it.label)}<small>${it.big}</small></span>
      <span class="bt"><span class="bf" style="width:${Math.max(2, (it.v / max) * 100)}%"></span></span>
      <span class="bv">${it.v}</span>
    </div>`).join('') + `<p class="hint">${esc(c.note)} Try n = 32: the gap grows as n grows.</p>`;
}

function fmtCount(v) {
  if (v < 1e4) return String(Math.round(v));
  const units = [[1e12, ' trillion'], [1e9, ' billion'], [1e6, ' million'], [1e3, 'K']];
  for (const [u, s] of units) if (v >= u) return (v / u).toFixed(v / u < 10 ? 1 : 0) + s;
  return String(v);
}

function fmtTime(sec) {
  if (sec < 1e-3) return '< 1 ms';
  if (sec < 1) return `${Math.round(sec * 1000)} ms`;
  if (sec < 60) return `${sec.toFixed(1)} s`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)} min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} hours`;
  return `${(sec / 86400).toFixed(1)} days`;
}

function renderChart() {
  const W = 520, H = 250, ml = 52, mr = 18, mt = 14, mb = 34;
  const kMin = 3, kMax = 20;
  const yMax = 2 ** kMax;
  const X = k => ml + ((k - kMin) / (kMax - kMin)) * (W - ml - mr);
  const Y = v => S.chartLog
    ? H - mb - (Math.log2(Math.max(1, v)) / kMax) * (H - mb - mt)
    : H - mb - (v / yMax) * (H - mb - mt);
  const nLabel = k => (k >= 20 ? `${2 ** (k - 20)}M` : k >= 10 ? `${2 ** (k - 10)}K` : `${2 ** k}`);
  const series = [
    { cls: 'naive', f: n => n, name: 'Plain-array query / prefix-sum update: n' },
    { cls: 'bit', f: n => Math.floor(Math.log2(n)) + 1, name: 'Fenwick query or update: ⌊log₂n⌋ + 1' },
  ];
  let svg = '';
  const yTicks = S.chartLog ? [1, 32, 1024, 32768, 1048576] : [0, 262144, 524288, 786432, 1048576];
  const yLab = v => (v >= 1048576 ? '1M' : v >= 1024 ? `${v / 1024}K` : `${v}`);
  yTicks.forEach(v => {
    svg += `<line class="gridline" x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}"/>`;
    svg += `<text x="${ml - 6}" y="${Y(v) + 3}" text-anchor="end">${yLab(v)}</text>`;
  });
  for (let k = 4; k <= kMax; k += 4) {
    svg += `<text x="${X(k)}" y="${H - mb + 16}" text-anchor="middle">${nLabel(k)}</text>`;
  }
  svg += `<text x="${(ml + W - mr) / 2}" y="${H - 4}" text-anchor="middle">n (array size)</text>`;
  svg += `<line x1="${ml}" x2="${W - mr}" y1="${H - mb}" y2="${H - mb}"/>`;
  svg = `<g class="ax">${svg}</g>`;

  const kn = Math.log2(S.n);
  svg += `<line class="nmark" x1="${X(kn)}" x2="${X(kn)}" y1="${mt}" y2="${H - mb}"/>`;
  svg += `<text class="nmark-t" x="${X(kn) + 4}" y="${mt + 10}">your n = ${S.n}</text>`;

  series.forEach(s => {
    let d = '', pts = '';
    for (let k = kMin; k <= kMax; k++) {
      const n = 2 ** k, v = s.f(n);
      d += `${k === kMin ? 'M' : 'L'}${X(k).toFixed(1)},${Y(v).toFixed(1)}`;
      pts += `<circle class="pt-${s.cls}" cx="${X(k)}" cy="${Y(v)}" r="3"><title>n = ${n.toLocaleString()}: ${v.toLocaleString()} cells</title></circle>`;
    }
    svg += `<path class="s-${s.cls}" d="${d}"/>${pts}`;
  });
  $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Worst-case cells touched per operation versus n">${svg}</svg>` +
    `<div class="legend chart-legend">${series.map(x => `<span><i class="sw sw-${x.cls}"></i>${x.name}</span>`).join('')}</div>`;
}

function renderWorkload() {
  const n = Math.max(1, Math.floor(+$('#wl-n').value || 1));
  const q = Math.max(0, Math.floor(+$('#wl-q').value || 0));
  const u = Math.max(0, Math.floor(+$('#wl-u').value || 0));
  const L = Math.floor(Math.log2(n)) + 1;
  const rows = [
    { name: 'Plain array', v: q * n + u, f: `${fmtCount(q)}×${fmtCount(n)} + ${fmtCount(u)}` },
    { name: 'Prefix-sum array', v: q + u * n, f: `${fmtCount(q)} + ${fmtCount(u)}×${fmtCount(n)}` },
    { name: 'Fenwick tree', v: (q + u) * L, f: `(${fmtCount(q)} + ${fmtCount(u)})×${L}`, bit: true },
  ];
  const max = Math.max(1, ...rows.map(r => r.v));
  $('#workload').innerHTML = rows.map(r => `
    <div class="wl-row${r.bit ? ' bit' : ''}">
      <span>${r.name}</span>
      <span class="bt"><span class="bf" style="width:${Math.max(0.6, (r.v / max) * 100)}%"></span></span>
      <span class="meta">${r.f} ≈ ${fmtCount(r.v)} ops · ${fmtTime(r.v / 1e8)}</span>
    </div>`).join('');
}

// ---------- playback ----------
function render() {
  const f = S.frames[S.idx];
  if (!f) return;
  const prev = S.idx > 0 ? S.frames[S.idx - 1] : null;
  renderGrid(f, prev);
  renderTrail(f);
  renderLowbit(f);
  renderStruct(f);
  renderCode(f);
  $('#narration').textContent = f.text;
  $('#result').textContent = f.result || '';
  $('#step-count').textContent = `step ${S.idx + 1} / ${S.frames.length}`;
  $('#p-play').textContent = S.playing ? '⏸' : '▶';
  syncLog();
}

function show(i) {
  S.idx = clamp(i, 0, S.frames.length - 1);
  render();
}

function delay() {
  const v = +$('#speed').value; // 0 = slow, 100 = fast
  return Math.round(1800 * Math.pow(0.06, v / 100));
}

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

// ---------- operations ----------
function runOp(res, opts = {}) {
  setPlaying(false);
  S.arr = res.arr;
  S.tree = res.tree;
  S.frames = res.frames;
  S.counters = res.counters;
  if (opts.built !== undefined) S.built = opts.built;
  S.idx = 0;
  updateOpButtons();
  renderLog();
  renderCounters();
  render();
  if (opts.play !== false) setPlaying(true);
}

function updateOpButtons() {
  document.querySelectorAll('.needs-built').forEach(b => {
    b.disabled = !S.built;
    b.title = S.built ? '' : 'Build the tree first';
  });
}

function readInt(sel, lo, hi) {
  const el = $(sel);
  let v = Math.trunc(+el.value);
  if (!Number.isFinite(v)) v = lo;
  v = clamp(v, lo, hi);
  el.value = v;
  return v;
}

function setArray(vals) {
  S.n = vals.length;
  S.arr = [0, ...vals];
  S.tree = new Array(S.n + 1).fill(0);
  S.built = false;
  $('#arr-input').value = vals.join(', ');
  const sel = $('#size');
  sel.value = [8, 16, 32].includes(S.n) ? String(S.n) : '';
  ['#q-p', '#u-i', '#r-l', '#r-r'].forEach(s => { $(s).max = S.n; });
  readInt('#q-p', 1, S.n);
  readInt('#u-i', 1, S.n);
  readInt('#r-r', 1, S.n);
  readInt('#r-l', 1, +$('#r-r').value);
  buildGrid();
  renderChart();
  runOp(genIdle(S.arr, S.tree, S.n, `New array, n = ${S.n}. The tree is all zeros. Press "Build" to watch it fill in chunk by chunk.`), { built: false, play: false });
}

function randomArray(n) {
  return Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 9));
}

function wire() {
  $('#arr-apply').addEventListener('click', () => {
    const vals = $('#arr-input').value.split(/[\s,]+/).filter(Boolean).map(Number);
    const msg = $('#arr-msg');
    if (!vals.length || vals.some(v => !Number.isInteger(v))) { msg.textContent = 'Use whole numbers separated by commas.'; return; }
    if (vals.length > 32) { msg.textContent = 'At most 32 elements.'; return; }
    msg.textContent = '';
    setArray(vals);
  });
  $('#arr-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('#arr-apply').click(); });
  $('#size').addEventListener('change', e => {
    const n = +e.target.value;
    setArray(n === 8 ? DEFAULT.slice() : randomArray(n));
  });
  $('#random').addEventListener('click', () => setArray(randomArray(S.n)));

  $('#op-build').addEventListener('click', () => runOp(genBuild(S.arr, S.n), { built: true }));
  $('#op-fast').addEventListener('click', () => runOp(genFastBuild(S.arr, S.n), { built: true }));
  $('#op-query').addEventListener('click', () => {
    runOp(genQuery(S.arr, S.tree, S.n, readInt('#q-p', 1, S.n)));
  });
  $('#op-update').addEventListener('click', () => {
    const i = readInt('#u-i', 1, S.n);
    const x = Math.trunc(+$('#u-x').value) || 0;
    $('#u-x').value = x;
    runOp(genUpdate(S.arr, S.tree, S.n, i, x));
  });
  $('#op-range').addEventListener('click', () => {
    let l = readInt('#r-l', 1, S.n), r = readInt('#r-r', 1, S.n);
    if (l > r) { [l, r] = [r, l]; $('#r-l').value = l; $('#r-r').value = r; }
    runOp(genRange(S.arr, S.tree, S.n, l, r));
  });

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
    else return;
  });

  const seg = (a, b, fn) => {
    $(a).addEventListener('click', () => { $(a).classList.add('on'); $(b).classList.remove('on'); fn(); });
  };
  seg('#st-update', '#st-query', () => { S.structMode = 'update'; render(); });
  seg('#st-query', '#st-update', () => { S.structMode = 'query'; render(); });
  seg('#ch-log', '#ch-lin', () => { S.chartLog = true; renderChart(); });
  seg('#ch-lin', '#ch-log', () => { S.chartLog = false; renderChart(); });

  ['#wl-n', '#wl-q', '#wl-u'].forEach(s => $(s).addEventListener('input', renderWorkload));
}

buildCode();
wire();
renderWorkload();
setArray(DEFAULT.slice());
