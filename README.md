# Fenwick Tree Visualizer

An interactive, step-by-step visualizer for the Fenwick tree (Binary Indexed Tree). It has no dependencies and no build step.

**Live demo:** https://tharshikan.github.io/fenwick-tree-visualizer/

## Run

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

then visit http://localhost:8000.

## What you can do

- **Build (n × add)**: watch each `add(i, a[i])` climb `i → i + lowbit(i)` and fill the chunks.
- **Fast build O(n)**: copy `t = a`, then push each finished chunk into its parent `i + lowbit(i)`.
- **sum(1..p)**: the query walks left (`i -= i & -i`), and the chunks it reads tile the prefix.
- **add(i, x)**: the update walks right (`i += i & -i`). The rows it skips are shown, along with why they can't contain `i`.
- **range(l, r)**: computed as `sum(r) − sum(l−1)`. The subtracted chunks are shown in red.

Step forward and back with ◀ / ▶ (or the ← / → keys). Space plays and pauses, and the slider sets the speed.

## Panels

| Panel | Shows |
|---|---|
| Chunk diagram | One bar per `t[e]`, spanning `e − lowbit(e) + 1 … e`, with the lowest bit of `e` highlighted |
| Index walk in binary | `1101 → 1100 → 1000 → 0000` (query) or `0101 → 0110 → 1000 → 10000` (update) |
| The hidden tree | Parent links `i + lowbit(i)` (update tree) or `i − lowbit(i)` (query tree) |
| Code | The C++ BIT with the current line and variables highlighted |
| `i & -i` | The two's-complement bit trick for the current index |
| Why it's fast | Cells touched compared with a plain array and a prefix-sum array, a scaling chart, and a workload estimator |

## Try this (from the notes)

1. Set n = 16, press **Build** (or **Fast build**), then run `sum(1..11)`. The query should visit 11 → 10 → 8.
2. Run `add(9, x)`. The update should visit 9 → 10 → 12 → 16.
3. With the default array `[3,1,4,1,5,9,2,6]`:
   - Build gives `t = 3,4,4,9,5,14,2,31`
   - `sum(1..7) = 25`
   - `add(3, 10)` then `sum(1..7) = 35`

## Files

- `bit.js`: pure Fenwick logic and the frame generators (it can also be `require`d from Node)
- `app.js`: rendering, playback, and the controls
- `styles.css`: the theme (follows the system light or dark setting)
