'use strict';
// Base-b Fenwick variants (the "Version A" and "Version B" thought experiment).
//   p(e) = place value of e's lowest nonzero base-b digit, d(e) = that digit.
//   Version A: t[e] covers p(e) positions        (fixed coin sizes 1, b, b², …)
//   Version B: t[e] covers d(e)·p(e) positions   (the whole last digit group)
// In base 2 every nonzero digit is 1, so A and B both collapse to the ordinary BIT.
// Everything lives inside B10 so it can sit next to bit.js without name clashes.

const B10 = (() => {
  function place(i, b) {
    let p = 1;
    while (i % b === 0) { i /= b; p *= b; }
    return p;
  }
  const digitAt = (i, b) => Math.floor(i / place(i, b)) % b;
  const trailing = (i, b) => Math.round(Math.log(place(i, b)) / Math.log(b));
  const len = (e, b, v) => (v === 'A' ? place(e, b) : digitAt(e, b) * place(e, b));
  const start = (e, b, v) => e - len(e, b, v) + 1;

  // next chunk (to the right) that also contains the current position
  function next(i, b, v) {
    const p = place(i, b);
    if (v === 'B') return i + p;            // bump the lowest nonzero digit by one
    const bp = p * b;
    return (Math.floor(i / bp) + 1) * bp;   // round up to the next multiple of b·p
  }

  function queryPath(q, b, v) {
    const out = [];
    for (let i = q; i > 0; i -= len(i, b, v)) out.push(i);
    return out;
  }

  function updatePath(j, n, b, v) {
    const out = [];
    for (let i = j; i <= n; i = next(i, b, v)) out.push(i);
    return out;
  }

  function digitsOf(x, b) {
    if (x <= 0) return [0];
    const d = [];
    while (x > 0) { d.unshift(x % b); x = Math.floor(x / b); }
    return d;
  }

  const SUB = { 2: '₂', 3: '₃', 4: '₄', 10: '' };
  const fmt = (x, b) => digitsOf(x, b).join('') + (SUB[b] ?? `(base ${b})`);

  // why t[e] has the length it has, in words
  function explainLen(e, b, v) {
    const p = place(e, b), d = digitAt(e, b), k = trailing(e, b);
    if (v === 'A') {
      return `${fmt(e, b)} ends in ${k} zero${k === 1 ? '' : 's'}, so its chunk is ${b}^${k} = ${p} long`;
    }
    return `the lowest nonzero digit of ${fmt(e, b)} is ${d} in the ${p}s place, so its chunk is ${d} × ${p} = ${d * p} long`;
  }

  function buildTree(arr, n, b, v) {
    const t = new Array(n + 1).fill(0);
    for (let e = 1; e <= n; e++) for (let c = start(e, b, v); c <= e; c++) t[e] += arr[c];
    return t;
  }

  // ---------- frames ----------
  function snap(ctx, f) {
    ctx.frames.push({
      tree: ctx.tree.slice(),
      arr: ctx.arr.slice(),
      rows: { ...(f.rows || {}) },
      cells: { ...(f.cells || {}) },
      col: f.col ?? null,
      code: f.code || null,
      vars: f.vars || {},
      trail: f.trail || null,   // { kind: 'query' | 'update', items: [...], cur }
      text: f.text,
      result: f.result ?? null,
    });
  }

  function genIdle(st, text) {
    const ctx = { arr: st.arr.slice(), tree: st.tree.slice(), frames: [] };
    snap(ctx, { text });
    return ctx;
  }

  function genBuild(st) {
    const { n, b, v } = st;
    const ctx = { arr: st.arr.slice(), tree: new Array(n + 1).fill(0), frames: [] };
    snap(ctx, {
      code: 'build',
      text: v === 'A'
        ? `Version A: every chunk is a power of ${b} long. t[e] covers ${b}^k positions, where k = number of trailing zeros of e in base ${b}.`
        : `Version B: the chunk length is the whole last digit group, so t[e] covers (lowest nonzero digit) × (its place value) positions.`,
    });
    for (let e = 1; e <= n; e++) {
      const s = start(e, b, v);
      const cells = {};
      for (let c = s; c <= e; c++) { ctx.tree[e] += ctx.arr[c]; cells[c] = 'covered'; }
      const rows = {};
      for (let k = 1; k < e; k++) rows[k] = 'done';
      rows[e] = 'active';
      snap(ctx, {
        rows, cells, code: ['build', 'len'],
        vars: { e, 'len(e)': len(e, b, v), 't[e]': ctx.tree[e] },
        text: `t[${e}]: ${explainLen(e, b, v)}. It covers ${s}–${e}, so t[${e}] = ${ctx.tree[e]}.`,
      });
    }
    const all = {};
    for (let e = 1; e <= n; e++) all[e] = 'done';
    snap(ctx, { rows: all, text: `Built all ${n} chunks for Version ${v} in base ${b}. Try a query, then an update, then switch versions and run the same two again.` });
    return ctx;
  }

  function genQuery(st, q) {
    const { b, v } = st;
    const ctx = { arr: st.arr.slice(), tree: st.tree.slice(), frames: [] };
    const path = queryPath(q, b, v);
    const rows = {}, cells = {};
    for (let c = 1; c <= q; c++) cells[c] = 'range';
    const ds = digitsOf(q, b);
    snap(ctx, {
      cells, code: 'sum-init', vars: { i: q, s: 0 },
      trail: { kind: 'query', items: [q], cur: 0 },
      text: `sum(1..${q}): ${q} = ${fmt(q, b)} has digits ${ds.join(', ')}. ` +
        (v === 'A'
          ? `Version A pays each digit with that many fixed-size coins, so ${path.length} reads.`
          : `Version B pays each nonzero digit with one chunk, so ${path.length} read${path.length === 1 ? '' : 's'}.`),
    });
    let s = 0;
    path.forEach((i, k) => {
      s += ctx.tree[i];
      const L = len(i, b, v);
      for (let c = i - L + 1; c <= i; c++) cells[c] = 'covered';
      const nx = i - L;
      const items = path.slice(0, k + 1);
      if (nx === 0) items.push(0);
      snap(ctx, {
        rows: { ...rows, [i]: 'active' }, cells, code: ['sum-body', 'len'],
        vars: { i, 'len(i)': L, s, 't[i]': ctx.tree[i] },
        trail: { kind: 'query', items, cur: k },
        text: `At ${fmt(i, b)}: t[${i}] covers ${i - L + 1}–${i} (len ${L}). s += ${ctx.tree[i]} → ${s}. Jump ${i} − ${L} = ${nx}${nx === 0 ? ', stop.' : '.'}`,
      });
      rows[i] = 'plus';
    });
    let naive = 0;
    for (let c = 1; c <= q; c++) naive += ctx.arr[c];
    snap(ctx, {
      rows, cells, code: 'sum-ret', vars: { i: 0, s },
      trail: ctx.frames[ctx.frames.length - 1].trail,
      result: `sum(1..${q}) = ${s} · ${path.length} reads`,
      text: `Done: sum(1..${q}) = ${s} (check ${naive} ${s === naive ? '✓' : '✗'}) using ${path.length} read${path.length === 1 ? '' : 's'}.`,
    });
    return ctx;
  }

  function genUpdate(st, j, x) {
    const { n, b, v } = st;
    const ctx = { arr: st.arr.slice(), tree: st.tree.slice(), frames: [] };
    ctx.arr[j] += x;
    const path = updatePath(j, n, b, v);
    const rows = {};
    snap(ctx, {
      col: j, cells: { [j]: 'target' }, code: 'add-sig', vars: { i: j, x },
      trail: { kind: 'update', items: [j], cur: 0 },
      text: `a[${j}] += ${x}. Now fix every chunk that contains position ${j}: the bars crossing the shaded column. Version ${v} has ${path.length} of them.`,
    });
    let prev = null;
    path.forEach((i, k) => {
      let skip = '';
      if (prev !== null) {
        const sk = [];
        for (let m = prev + 1; m < i; m++) { rows[m] = 'skip'; sk.push(m); }
        if (sk.length) skip = ` Skipped ${sk.length === 1 ? `t[${sk[0]}]` : `t[${sk[0]}..${sk[sk.length - 1]}]`}: those chunks start right of ${j}.`;
      }
      ctx.tree[i] += x;
      const nx = next(i, b, v);
      const items = path.slice(0, k + 1);
      if (nx > n) items.push(nx);
      snap(ctx, {
        rows: { ...rows, [i]: 'active' }, col: j, cells: { [j]: 'target' }, code: ['add-body', 'next'],
        vars: { i, 'next(i)': nx, 't[i]': ctx.tree[i] },
        trail: { kind: 'update', items, cur: k },
        text: `At ${fmt(i, b)}: t[${i}] covers ${start(i, b, v)}–${i}, which contains ${j}. t[${i}] += ${x} → ${ctx.tree[i]}.${skip} ` +
          `Next: ${nx}${nx > n ? ` > ${n}, stop.` : '.'}`,
      });
      rows[i] = 'plus';
      prev = i;
    });
    snap(ctx, {
      rows, col: j, cells: { [j]: 'target' }, code: 'add-loop', vars: { x },
      trail: ctx.frames[ctx.frames.length - 1].trail,
      result: `${path.length} writes`,
      text: `Done: add(${j}, ${x}) wrote ${path.length} chunk${path.length === 1 ? '' : 's'}.`,
    });
    return ctx;
  }

  // worst-case reads / writes over every position 1..n
  function worst(n, b) {
    const w = { qA: 0, uA: 0, qB: 0, uB: 0 };
    for (let i = 1; i <= n; i++) {
      let ds = 0, nz = 0;
      for (let x = i; x > 0; x = Math.floor(x / b)) { const d = x % b; ds += d; if (d) nz++; }
      if (ds > w.qA) w.qA = ds;
      if (nz > w.qB) w.qB = nz;
      let ua = 0, ub = 0;
      for (let k = i; k <= n; k = next(k, b, 'A')) ua++;
      for (let k = i; k <= n; k = next(k, b, 'B')) ub++;
      if (ua > w.uA) w.uA = ua;
      if (ub > w.uB) w.uB = ub;
    }
    return w;
  }

  return {
    place, digitAt, trailing, len, start, next, queryPath, updatePath, digitsOf, fmt,
    explainLen, buildTree, genIdle, genBuild, genQuery, genUpdate, worst,
  };
})();

if (typeof module !== 'undefined') module.exports = B10;
