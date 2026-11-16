// Tile colours follow one perceptual ramp from cool to warm, so tile size
// reads like a heatmap. The arena's tile-distribution bars reuse it.
export const RAMP = [
  "#2b3a55", "#304a6b", "#2f5f7f", "#2c7589", "#2a8b8a", "#3aa17f", "#68b26b",
  "#a2bd57", "#d4be48", "#f0a93e", "#f38a3f", "#ee6a4a", "#e04d63", "#c93d80", "#a23c9e",
];

export function tileColors(value) {
  const exp = Math.min(Math.log2(value), RAMP.length);
  return { bg: RAMP[exp - 1], ink: exp >= 7 ? "#17120a" : "#eaf0f8" };
}

// Cells of each line, ordered from the edge that tiles slide toward.
// Actions match the server: 0 up, 1 down, 2 left, 3 right.
function lines(action) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const line = [0, 1, 2, 3].map((j) => (action < 2 ? [j, i] : [i, j]));
    out.push(action === 1 || action === 3 ? line.reverse() : line);
  }
  return out;
}

const emptyGrid = () => Array.from({ length: 4 }, () => Array(4).fill(null));
const SLIDE_MS = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 110;

export class Board {
  constructor({ cells, tiles, heat }) {
    this.tilesEl = tiles;
    this.heatEl = heat;
    this.grid = emptyGrid();
    this.heatCells = [];
    this.pending = null;
    this.lastRender = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        cells.append(this.#cell(r, c));
        const h = this.#cell(r, c);
        heat.append(h);
        this.heatCells.push(h);
      }
    }
  }

  #cell(r, c) {
    const el = document.createElement("span");
    el.style.setProperty("--r", r);
    el.style.setProperty("--c", c);
    return el;
  }

  #makeTile(value, r, c, cls) {
    const el = this.#cell(r, c);
    el.className = cls ? `tile ${cls}` : "tile";
    this.tilesEl.append(el);
    const tile = { el, value, r, c };
    this.#paint(tile);
    return tile;
  }

  #paint(tile) {
    const { bg, ink } = tileColors(tile.value);
    tile.el.style.setProperty("--tile", bg);
    tile.el.style.setProperty("--ink", ink);
    tile.el.textContent = tile.value;
    tile.el.dataset.digits = String(tile.value).length;
  }

  #place(tile, r, c) {
    tile.r = r;
    tile.c = c;
    tile.el.style.setProperty("--r", r);
    tile.el.style.setProperty("--c", c);
  }

  render(board, action, isSingleMove) {
    this.#flush();
    const now = performance.now();
    // Only animate when moves are spaced out enough to actually see it.
    const animate = isSingleMove && action != null && now - this.lastRender > SLIDE_MS * 1.5;
    this.lastRender = now;
    if (!(animate && this.#slide(board, action))) this.#sync(board);
  }

  // Replays the move locally to know where each tile went, then lets CSS
  // transitions do the sliding. Returns false if the replay disagrees with
  // the server, in which case the caller falls back to a plain redraw.
  #slide(board, action) {
    const next = emptyGrid();
    const vanish = [];
    const merged = new Set();
    for (const line of lines(action)) {
      let t = 0;
      let last = null;
      for (const [r, c] of line) {
        const tile = this.grid[r][c];
        if (!tile) continue;
        if (last && last.value === tile.value && !merged.has(last)) {
          this.#place(tile, last.r, last.c);
          vanish.push(tile);
          merged.add(last);
        } else {
          const [nr, nc] = line[t++];
          next[nr][nc] = tile;
          this.#place(tile, nr, nc);
          last = tile;
        }
      }
    }

    let spawn = null;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const tile = next[r][c];
        const expected = tile ? tile.value * (merged.has(tile) ? 2 : 1) : 0;
        if (expected === board[r][c]) continue;
        if (tile || spawn) return this.#abort(vanish);
        spawn = [r, c];
      }
    }

    this.grid = next;
    this.pending = () => {
      vanish.forEach((t) => t.el.remove());
      for (const tile of merged) {
        tile.value *= 2;
        this.#paint(tile);
        tile.el.classList.remove("merge");
        void tile.el.offsetWidth; // restart the animation
        tile.el.classList.add("merge");
      }
      if (spawn) {
        const [r, c] = spawn;
        this.grid[r][c] = this.#makeTile(board[r][c], r, c, "spawn");
      }
      this.pending = null;
    };
    this.timer = setTimeout(this.pending, SLIDE_MS);
    return true;
  }

  #abort(vanish) {
    vanish.forEach((t) => t.el.remove());
    return false;
  }

  #flush() {
    if (this.pending) {
      clearTimeout(this.timer);
      this.pending();
    }
  }

  #sync(board) {
    this.tilesEl.replaceChildren();
    this.grid = emptyGrid();
    board.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v) this.grid[r][c] = this.#makeTile(v, r, c);
      }),
    );
  }

  setHeat(heat) {
    const flat = heat ? heat.flat() : [];
    const lo = Math.min(...flat);
    const hi = Math.max(...flat);
    this.heatCells.forEach((el, i) => {
      // Min-max scaling: the overlay shows relative attention, not magnitude.
      const h = heat && hi > lo ? (flat[i] - lo) / (hi - lo) : 0;
      el.style.setProperty("--h", h.toFixed(3));
    });
  }
}
