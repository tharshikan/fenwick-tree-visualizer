'use strict';
// Pure Fenwick-tree logic + frame generators.
// Every generator returns { frames, arr, tree, counters }. A frame is a full
// snapshot (tree, arr, highlight state, narration), so the UI can step back
// and forth without re-running anything.

const lowbit = i => i & -i;
const popcount = v => { let c = 0; for (; v; v &= v - 1) c++; return c; };
const bitLen = v => (v <= 0 ? 1 : Math.floor(Math.log2(v)) + 1);
const toBin = (v, w) => (v >>> 0).toString(2).padStart(w, '0');
const chunkStart = e => e - lowbit(e) + 1;

// indices visited by add(i, ...): i, i+lowbit(i), ... while <= n
function climbPath(i, n) {
  const p = [];
  for (; i <= n; i += lowbit(i)) p.push(i);
  return p;
}

// indices visited by sum(i): i, i-lowbit(i), ... while > 0
function peelPath(i) {
  const p = [];
  for (; i > 0; i -= lowbit(i)) p.push(i);
  return p;
}

// 13 -> "8 + 4 + 1"
function coins(p) {
  const out = [];
  for (let b = bitLen(p) - 1; b >= 0; b--) if (p & (1 << b)) out.push(1 << b);
  return out.join(' + ');
}

function range(a, b) {
  const r = [];
  for (let i = a; i <= b; i++) r.push(i);
  return r;
}

function snap(ctx, f) {
  ctx.frames.push({
    op: ctx.op,
    tree: ctx.tree.slice(),
    arr: ctx.arr.slice(),
    rows: { ...(f.rows || {}) },   // tree index -> active | plus | minus | skip | done | source
    cells: { ...(f.cells || {}) }, // array index -> range | covered | minus | target
    col: f.col ?? null,            // array position whose column is shaded (update target)
    code: f.code || null,          // id of the highlighted code line
    vars: f.vars || {},
    trail: f.trail || null,        // { kind: 'peel' | 'climb', items: [...], cur }
    focus: f.focus ?? null,        // index for the i & -i explainer
    text: f.text,
    result: f.result ?? null,
  });
}

function newCtx(op, arr, tree) {
  return { op, arr: arr.slice(), tree: tree.slice(), frames: [] };
}

function genIdle(arr, tree, n, text) {
  const ctx = newCtx('idle', arr, tree);
  snap(ctx, { text });
  return { frames: ctx.frames, arr: ctx.arr, tree: ctx.tree, counters: null };
}

function fastBuildAdds(n) {
  let c = 0;
  for (let i = 1; i <= n; i++) if (i + lowbit(i) <= n) c++;
  return c;
}

function buildCounters(n, steps) {
  return {
    title: `Build, n = ${n}`,
    items: [
      { label: 'Fenwick: n × add', big: 'O(n log n)', v: steps, bit: true },
      { label: 'Fenwick: O(n) build', big: 'O(n)', v: fastBuildAdds(n), bit: true },
      { label: 'Prefix-sum array', big: 'O(n)', v: n },
    ],
    note: 'Building is paid once. The payoff is that every later query and update costs O(log n).',
  };
}

// ---------- Build: call add(i, a[i]) for every i ----------
function genBuild(arr, n) {
  const ctx = newCtx('build', arr, new Array(n + 1).fill(0));
  let steps = 0;
  snap(ctx, {
    code: 'ctor',
    text: `Start with t[1..${n}] = 0. To build, call add(i, a[i]) for i = 1..${n}.`,
  });
  for (let i = 1; i <= n; i++) {
    const x = ctx.arr[i];
    const path = climbPath(i, n);
    const done = {};
    for (let e = 1; e < i; e++) done[e] = 'done';
    snap(ctx, {
      rows: done, col: i, cells: { [i]: 'target' }, code: 'add-sig',
      vars: { i, x }, trail: { kind: 'climb', items: [i], cur: 0 }, focus: i,
      text: `add(${i}, ${x}): position ${i} lies inside ${path.map(j => `t[${j}]`).join(', ')}.`,
    });
    path.forEach((j, k) => {
      ctx.tree[j] += x;
      steps++;
      const nx = j + lowbit(j);
      const items = path.slice(0, k + 1);
      if (nx > n) items.push(nx);
      snap(ctx, {
        rows: { ...done, [j]: 'active' }, col: i, cells: { [i]: 'target' }, code: 'add-body',
        vars: { i: j, x, 't[i]': ctx.tree[j] }, trail: { kind: 'climb', items, cur: k }, focus: j,
        text: `t[${j}] += ${x} → ${ctx.tree[j]}. Next: ${j} + lowbit(${j}) = ${j} + ${lowbit(j)} = ${nx}` +
          (nx > n ? ` > ${n}, stop.` : '.') +
          (j === i ? ` t[${i}] is now complete: it covers ${chunkStart(i)}–${i}, and every one of those has been added.` : ''),
      });
    });
  }
  const all = {};
  for (let e = 1; e <= n; e++) all[e] = 'done';
  snap(ctx, {
    rows: all,
    text: `Built. ${n} calls to add made ${steps} cell updates (≈ n·log n). Every t[e] holds the sum of the lowbit(e) elements ending at e.`,
  });
  return { frames: ctx.frames, arr: ctx.arr, tree: ctx.tree, counters: buildCounters(n, steps) };
}

// ---------- O(n) build: t = a, then push each finished chunk to its parent ----------
function genFastBuild(arr, n) {
  const tree = arr.slice();
  tree[0] = 0;
  const ctx = newCtx('fast', arr, tree);
  let steps = 0;
  for (let i = 1; i <= n; i++) steps += climbPath(i, n).length; // for the n × add comparison
  snap(ctx, {
    code: 'fast-copy',
    text: `Copy t = a, so each t[i] holds only a[i] for now. When we reach i, all of t[i]'s children are smaller than i and have already pushed into it, so t[i] is complete.`,
  });
  const done = {};
  for (let i = 1; i <= n; i++) {
    const j = i + lowbit(i);
    if (j <= n) {
      ctx.tree[j] += ctx.tree[i];
      snap(ctx, {
        rows: { ...done, [i]: 'source', [j]: 'active' }, code: 'fast-body',
        vars: { i, j, 't[i]': ctx.tree[i], 't[j]': ctx.tree[j] },
        trail: { kind: 'climb', items: [i, j], cur: 1 }, focus: i,
        text: `t[${i}] is complete (covers ${chunkStart(i)}–${i}). Push it into its parent t[${j}] = t[${i} + ${lowbit(i)}] → ${ctx.tree[j]}.`,
      });
    } else {
      snap(ctx, {
        rows: { ...done, [i]: 'source' }, code: 'fast-body',
        vars: { i, j }, trail: { kind: 'climb', items: [i, j], cur: 0 }, focus: i,
        text: `t[${i}] is complete (covers ${chunkStart(i)}–${i}). Its parent ${i} + ${lowbit(i)} = ${j} > ${n}, so there's nothing to push.`,
      });
    }
    done[i] = 'done';
  }
  snap(ctx, {
    rows: done,
    text: `Built with ${fastBuildAdds(n)} additions in a single pass, O(n). Same tree as n × add.`,
  });
  return { frames: ctx.frames, arr: ctx.arr, tree: ctx.tree, counters: buildCounters(n, steps) };
}

// One sum(p) walk. state.rows / state.cells persist across walks (used by range).
function walkSum(ctx, p, sign, state, label) {
  const path = peelPath(p);
  let s = 0;
  snap(ctx, {
    rows: state.rows, cells: state.cells, code: 'sum-init',
    vars: { i: p, s: 0 }, trail: { kind: 'peel', items: [p], cur: 0 }, focus: p || null,
    text: p === 0
      ? `${label}sum(0) = 0, so the loop body never runs.`
      : `${label}sum(1..${p}): ${p} = ${toBin(p, bitLen(p))}₂ = ${coins(p)}, so ${path.length} chunk${path.length > 1 ? 's' : ''}.`,
  });
  path.forEach((i, k) => {
    s += ctx.tree[i];
    for (let c = chunkStart(i); c <= i; c++) state.cells[c] = sign === 'minus' ? 'minus' : 'covered';
    const nx = i - lowbit(i);
    const items = path.slice(0, k + 1);
    if (nx === 0) items.push(0);
    snap(ctx, {
      rows: { ...state.rows, [i]: 'active' }, cells: state.cells, code: 'sum-body',
      vars: { i, s, 't[i]': ctx.tree[i] }, trail: { kind: 'peel', items, cur: k }, focus: i,
      text: `At ${i} (${toBin(i, bitLen(i))}): t[${i}] covers ${chunkStart(i)}–${i} (len ${lowbit(i)}). ` +
        `s += ${ctx.tree[i]} → ${s}. Jump ${i} − ${lowbit(i)} = ${nx}${nx === 0 ? ', stop.' : '.'}`,
    });
    state.rows[i] = sign;
  });
  return { s, steps: path.length };
}

function naiveSum(arr, l, r) {
  let s = 0;
  for (let i = l; i <= r; i++) s += arr[i];
  return s;
}

// ---------- Query: sum(1..p) ----------
function genQuery(arr, tree, n, p) {
  const ctx = newCtx('query', arr, tree);
  const state = { rows: {}, cells: {} };
  for (let c = 1; c <= p; c++) state.cells[c] = 'range';
  const { s, steps } = walkSum(ctx, p, 'plus', state, '');
  const naive = naiveSum(ctx.arr, 1, p);
  snap(ctx, {
    rows: state.rows, cells: state.cells, code: 'sum-ret', vars: { i: 0, s },
    trail: ctx.frames[ctx.frames.length - 1].trail,
    result: `sum(1..${p}) = ${s}`,
    text: `i = 0, return ${s}. Check: a[1] + … + a[${p}] = ${naive} ${s === naive ? '✓' : '✗'}. ` +
      `Fenwick read ${steps} cell${steps > 1 ? 's' : ''}; a plain loop reads ${p}.`,
  });
  return {
    frames: ctx.frames, arr: ctx.arr, tree: ctx.tree,
    counters: {
      title: `Query sum(1..${p}), n = ${n}`,
      items: [
        { label: 'Fenwick: sum(p)', big: 'O(log n)', v: steps, bit: true },
        { label: 'Plain array: loop 1..p', big: 'O(n)', v: p },
        { label: 'Prefix-sum array: read P[p]', big: 'O(1)', v: 1 },
      ],
      note: 'Prefix sums win queries, but run an update to see what that costs them.',
    },
  };
}

// ---------- Range: sum(r) − sum(l−1) ----------
function genRange(arr, tree, n, l, r) {
  const ctx = newCtx('range', arr, tree);
  const state = { rows: {}, cells: {} };
  for (let c = l; c <= r; c++) state.cells[c] = 'range';
  snap(ctx, {
    cells: state.cells, code: 'range',
    text: `range(${l}, ${r}) = sum(${r}) − sum(${l - 1}). Add the chunks tiling 1..${r}, then subtract the ones tiling 1..${l - 1}.`,
  });
  const A = walkSum(ctx, r, 'plus', state, 'First, ');
  const B = walkSum(ctx, l - 1, 'minus', state, 'Then subtract ');
  const res = A.s - B.s;
  const naive = naiveSum(ctx.arr, l, r);
  snap(ctx, {
    rows: state.rows, cells: state.cells, code: 'range',
    result: `${A.s} − ${B.s} = ${res}`,
    text: `range(${l}, ${r}) = ${A.s} − ${B.s} = ${res}. Check: a[${l}] + … + a[${r}] = ${naive} ${res === naive ? '✓' : '✗'}. ` +
      `${A.steps + B.steps} cells read instead of ${r - l + 1}.`,
  });
  return {
    frames: ctx.frames, arr: ctx.arr, tree: ctx.tree,
    counters: {
      title: `Range sum(${l}..${r}), n = ${n}`,
      items: [
        { label: 'Fenwick: sum(r) − sum(l−1)', big: 'O(log n)', v: A.steps + B.steps, bit: true },
        { label: 'Plain array: loop l..r', big: 'O(n)', v: r - l + 1 },
        { label: 'Prefix-sum array: P[r] − P[l−1]', big: 'O(1)', v: 2 },
      ],
      note: 'A range is just two prefix queries.',
    },
  };
}

// ---------- Update: add(i, x) ----------
function genUpdate(arr, tree, n, i, x) {
  const ctx = newCtx('update', arr, tree);
  ctx.arr[i] += x;
  const path = climbPath(i, n);
  const rows = {};
  snap(ctx, {
    col: i, cells: { [i]: 'target' }, code: 'add-sig',
    vars: { i, x }, trail: { kind: 'climb', items: [i], cur: 0 }, focus: i,
    text: `a[${i}] += ${x} (now ${ctx.arr[i]}). Every chunk that contains position ${i} has to change too. They're the bars crossing the shaded column.`,
  });
  let prev = null;
  path.forEach((j, k) => {
    let skipNote = '';
    if (prev !== null) {
      const sk = range(prev + 1, j - 1);
      sk.forEach(m => { rows[m] = 'skip'; });
      if (sk.length) skipNote = ` Skipped ${sk.map(m => `t[${m}]`).join(', ')}: those chunks start right of ${i}, so they can't contain it.`;
    }
    ctx.tree[j] += x;
    const nx = j + lowbit(j);
    const items = path.slice(0, k + 1);
    if (nx > n) items.push(nx);
    snap(ctx, {
      rows: { ...rows, [j]: 'active' }, col: i, cells: { [i]: 'target' }, code: 'add-body',
      vars: { i: j, x, 't[i]': ctx.tree[j] }, trail: { kind: 'climb', items, cur: k }, focus: j,
      text: `At ${j} (${toBin(j, bitLen(j))}): t[${j}] covers ${chunkStart(j)}–${j}, which contains ${i}. t[${j}] += ${x} → ${ctx.tree[j]}.${skipNote} ` +
        `Next: ${j} + ${lowbit(j)} = ${nx}${nx > n ? ` > ${n}, stop.` : '.'}`,
    });
    rows[j] = 'plus';
    prev = j;
  });
  const last = path[path.length - 1];
  snap(ctx, {
    rows, col: i, cells: { [i]: 'target' }, code: 'add-loop',
    vars: { i: last + lowbit(last), x },
    trail: ctx.frames[ctx.frames.length - 1].trail,
    result: `${path.length} chunk${path.length > 1 ? 's' : ''} updated`,
    text: `Done. add(${i}, ${x}) touched ${path.length} chunk${path.length > 1 ? 's' : ''} (${path.join(' → ')}). ` +
      `A prefix-sum array would have to rewrite ${n - i + 1} entries (P[${i}..${n}]).`,
  });
  return {
    frames: ctx.frames, arr: ctx.arr, tree: ctx.tree,
    counters: {
      title: `Update add(${i}, ${x}), n = ${n}`,
      items: [
        { label: 'Fenwick: add(i, x)', big: 'O(log n)', v: path.length, bit: true },
        { label: 'Plain array: a[i] += x', big: 'O(1)', v: 1 },
        { label: 'Prefix-sum array: rewrite P[i..n]', big: 'O(n)', v: n - i + 1 },
      ],
      note: 'A plain array wins updates and loses queries. Prefix sums are the reverse. Fenwick is O(log n) for both.',
    },
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    lowbit, popcount, bitLen, toBin, chunkStart, climbPath, peelPath, coins,
    genIdle, genBuild, genFastBuild, genQuery, genRange, genUpdate,
  };
}
