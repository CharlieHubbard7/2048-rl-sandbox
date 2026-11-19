// "How it decides": a short storyboard per model, drawn with the board the
// AI is actually looking at and the numbers it actually computed. Each step
// adds a layer to the same drawing, so the picture builds up the way the
// algorithm does.
import { POSITION_WEIGHTS } from "../ai/heuristic.js";
import { ARROWS, NAMES, arrow, board, cellCentre, fmt, label, line, loop, note, signed, svg } from "./draw.js";

const W = 720;
const H = 320;
const PAN = 420; // width of drawing visible at once on a phone
const name = (dir) => `${ARROWS[dir]} ${NAMES[dir]}`;
const pct = (p) => `${p >= 0.1 ? Math.round(p * 100) : (p * 100).toFixed(1)}%`;

// ---- The part every look-ahead model shares: try all four moves --------------

const ROOT = { x: 14, y: 104, s: 120 };
const AFTER = { x: 226, s: 58, ys: [14, 90, 166, 242] };

function tryMoves(d, { valueStage, pickStage }) {
  let out = note(ROOT.x, ROOT.y - 12, "the board now", { stage: 1 });
  out += board(ROOT.x, ROOT.y, ROOT.s, d.board, { stage: 1 });
  d.futures.forEach((f, dir) => {
    const y = AFTER.ys[dir];
    const cy = y + AFTER.s / 2;
    const legal = Boolean(f);
    out += arrow(ROOT.x + ROOT.s + 6, ROOT.y + ROOT.s / 2 + (dir - 1.5) * 14, AFTER.x - 8, cy, {
      stage: 1,
      cls: legal ? "ink" : "faint",
      bow: (dir - 1.5) * -6,
    });
    if (legal) {
      out += board(AFTER.x, y, AFTER.s, f.after, { stage: 1, numbers: false });
    } else {
      out += `<rect class="ghost" data-stage="1" x="${AFTER.x}" y="${y}" width="${AFTER.s}" height="${AFTER.s}" rx="6"/>`;
      out += note(AFTER.x + AFTER.s / 2, cy - 2, "can't\nmove", { stage: 1, size: 12, anchor: "middle", cls: "note faint-text" });
    }
    out += label(AFTER.x + AFTER.s + 8, y + 18, name(dir), { stage: 1, cls: legal ? "label" : "label faint-text" });
    if (legal && valueStage) {
      const cls = dir === d.action ? "note value is-best" : "note value";
      out += note(AFTER.x + AFTER.s + 8, y + 42, fmt(d.values[dir], d.kind), { stage: valueStage, size: 17, cls });
    }
  });
  if (pickStage) {
    const y = AFTER.ys[d.action];
    out += loop(AFTER.x + AFTER.s / 2 + 24, y + AFTER.s / 2, AFTER.s / 2 + 40, AFTER.s / 2 + 8, { stage: pickStage });
  }
  return out;
}

function tryCaption(d) {
  const legal = d.futures.filter(Boolean).length;
  const blocked = d.futures.map((f, dir) => (f ? null : NAMES[dir])).filter(Boolean);
  const which =
    legal === 4
      ? "All four change the board."
      : `${blocked.join(" and ")} ${blocked.length > 1 ? "don't" : "doesn't"} change anything, so ${blocked.length > 1 ? "they're" : "it's"} out.`;
  return `First it tries all four moves on a copy of the board, before any new tile appears. ${which}`;
}

// ---- Search + N-tuple ---------------------------------------------------------

function searchBoard(d) {
  const dir = d.action;
  const rows = d.detail.outcomes[dir];
  const n = rows.length;
  const y0 = AFTER.ys[dir] + AFTER.s / 2;

  // A handful of the imagined boards: 2s spread across the empty cells, and
  // one 4, then a note for the rest.
  const take = Math.min(n, 5);
  const picks = Array.from({ length: take }, (_, k) => rows[Math.round((k * (n - 1)) / Math.max(take - 1, 1))]);
  const leaves = picks.map((r) => ({ cell: r.cell, exp: 1, value: r.two, p: 0.9 / n }));
  leaves.push({ cell: rows[0].cell, exp: 2, value: rows[0].four, p: 0.1 / n });

  const LX = 430;
  const LS = 40;
  const top = 24;
  const step = Math.min(48, (H - 40 - LS) / Math.max(leaves.length - 1, 1));
  let out = tryMoves(d, { valueStage: 4, pickStage: 5 });

  const after = d.futures[dir].after;
  leaves.forEach((leaf, k) => {
    const y = top + k * step;
    const cells = Array.from(after);
    cells[leaf.cell] = leaf.exp;
    out += arrow(352, y0, LX - 8, y + LS / 2, { stage: 2, cls: leaf.exp === 2 ? "ink dashed" : "ink", head: 5 });
    out += board(LX, y, LS, cells, { stage: 2, numbers: false, marks: { [leaf.cell]: "spawned" } });
    out += label(LX + LS + 8, y + 15, `a ${2 ** leaf.exp} · ${pct(leaf.p)}`, { stage: 2, size: 12 });
    out += note(LX + LS + 8, y + 34, fmt(leaf.value), { stage: 3, size: 15, cls: "note value" });
  });
  const shown = leaves.length;
  if (n * 2 > shown) {
    out += note(LX, top + shown * step + 10, `+ ${n * 2 - shown} more like these`, { stage: 2, size: 13, cls: "note faint-text" });
  }

  // A brace gathering the leaf scores into one average.
  const bx = 560;
  const by0 = top;
  const by1 = top + (shown - 1) * step + LS;
  const mid = (by0 + by1) / 2;
  out += `<path class="ink draw" data-stage="4" pathLength="1" d="M${bx} ${by0}q12 0 12 14v${mid - by0 - 26}q0 12 10 12q-10 0 -10 12v${by1 - mid - 26}q0 14 -12 14"/>`;
  out += note(bx + 30, mid - 14, "weighted\naverage", { stage: 4, size: 14 });
  out += note(bx + 30, mid + 26, fmt(d.values[dir] - d.detail.gained[dir]), { stage: 4, size: 20, cls: "note value is-best" });
  if (d.detail.gained[dir]) {
    out += note(bx + 30, mid + 46, `+ ${d.detail.gained[dir].toLocaleString()} merged`, { stage: 4, size: 12, cls: "note faint-text" });
  }
  out += note(W - 8, H - 10, `plays ${name(dir)}`, { stage: 5, size: 18, anchor: "end", cls: "note accent-text" });
  return out;
}

function searchStory(d) {
  const dir = d.action;
  const n = d.detail.outcomes[dir].length;
  const deep = d.detail.plies > 1;
  return {
    title: "How the search decides",
    svg: searchBoard(d),
    focus: [180, 420, 520, 540, 360],
    stages: [
      tryCaption(d),
      `Then a new tile appears in a random empty cell, and it can't control where. So it imagines every case: a 2 (90%) or a 4 (10%) in each of the ${n} empty cells. That's ${n * 2} boards for ${NAMES[dir]} alone.`,
      deep
        ? "The board is crowded, so it looks deeper: for each imagined board it plays its best reply, imagines every tile after that too, and asks the N-tuple network to score the results."
        : "For each imagined board it plays its best reply and asks the N-tuple network how good the result is. Those are the scores on the right.",
      `It averages the scores, counting each case by how likely it is. ${NAMES[dir]} comes to ${fmt(d.values[dir])}. It does the same for every other move.`,
      `It plays the move with the best average, ${name(dir)}. All told it scored ${d.detail.searched.toLocaleString()} boards in ${Math.max(1, Math.round(d.ms))} ms.`,
    ],
  };
}

// ---- N-tuple network ------------------------------------------------------------

const BIG = { x: 404, y: 62, s: 196 };

function ntupleBoard(d) {
  const dir = d.action;
  const after = d.futures[dir].after;
  const y0 = AFTER.ys[dir] + AFTER.s / 2;
  let out = tryMoves(d, { valueStage: 4, pickStage: 5 });
  out += arrow(350, y0, BIG.x - 10, BIG.y + BIG.s / 2, { stage: 2, bow: -12 });
  out += note(BIG.x, BIG.y - 14, `scoring ${NAMES[dir].toLowerCase()}`, { stage: 2, size: 14 });
  out += board(BIG.x, BIG.y, BIG.s, after, { stage: 2 });
  // The window: six highlighted cells, moved around by the animation.
  out += `<g class="probe" data-stage="2">`;
  for (let i = 0; i < 6; i++) out += `<rect class="probe-cell" width="0" height="0" rx="5"/>`;
  out += `</g>`;
  const tx = 640;
  out += arrow(BIG.x + BIG.s + 6, BIG.y + 60, tx - 4, 92, { stage: 2, head: 6 });
  // A little ledger standing in for the lookup table.
  out += `<g class="ink" data-stage="2"><path class="draw" pathLength="1" d="M${tx} 74h56v58h-56z"/>`;
  for (let k = 1; k < 5; k++) out += `<path class="draw" pathLength="1" d="M${tx + 6} ${74 + k * 11}h${36 + ((k * 7) % 11)}"/>`;
  out += `</g>`;
  out += label(tx + 28, 150, "learned table", { stage: 2, size: 12, anchor: "middle" });
  out += arrow(tx + 28, 158, tx + 28, 186, { stage: 2, head: 5, bow: 0 });
  out += `<text class="note value probe-weight" data-stage="2" x="${tx + 28}" y="210" font-size="20" text-anchor="middle"></text>`;
  out += `<text class="note probe-total" data-stage="3" x="${tx + 28}" y="250" font-size="13" text-anchor="middle"></text>`;
  out += `<text class="note faint-text probe-count" data-stage="3" x="${tx + 28}" y="268" font-size="12" text-anchor="middle"></text>`;
  out += note(W - 8, H - 10, `plays ${name(dir)}`, { stage: 5, size: 18, anchor: "end", cls: "note accent-text" });
  return out;
}

// Steps the six-cell window through the 32 lookups, adding up as it goes.
function ntupleAnimate(d) {
  const features = d.detail.features[d.action];
  let timer = 0;
  return (root, stage) => {
    clearInterval(timer);
    const cells = root.querySelectorAll(".probe-cell");
    const weight = root.querySelector(".probe-weight");
    const total = root.querySelector(".probe-total");
    const count = root.querySelector(".probe-count");
    const show = (k) => {
      const f = features[k];
      f.cells.forEach((c, i) => {
        const { x, y, cell } = cellCentre(BIG.x, BIG.y, BIG.s, c);
        Object.entries({ x: x - cell / 2 - 2, y: y - cell / 2 - 2, width: cell + 4, height: cell + 4 }).forEach(([a, v]) =>
          cells[i].setAttribute(a, v.toFixed(1)),
        );
      });
      weight.textContent = signed(f.weight);
      weight.classList.toggle("neg-text", f.weight < 0);
      const running = features.slice(0, k + 1).reduce((s, x) => s + x.weight, 0);
      total.textContent = `running total ${fmt(running)}`;
      count.textContent = `lookup ${k + 1} of 32`;
    };
    if (stage < 3) return show(0);
    if (stage > 3) return show(31);
    let k = 0;
    show(k);
    timer = setInterval(() => {
      k = Math.min(k + 1, 31);
      show(k);
      if (k === 31) clearInterval(timer);
    }, 95);
  };
}

function ntupleStory(d, episodes) {
  const dir = d.action;
  const first = d.detail.features[dir][0].weight;
  const value = d.values[dir] - d.detail.gained[dir];
  return {
    title: "How the N-tuple network decides",
    svg: ntupleBoard(d),
    focus: [180, 520, 540, 300, 400],
    animate: ntupleAnimate(d),
    durations: [3600, 4200, 4400, 3800, 4200],
    stages: [
      tryCaption(d),
      `To score a board it looks through a window of 6 cells. The tiles it sees there are a key into a table learned over ${episodes.toLocaleString()}-odd games of self-play. This one returns ${signed(first)}.`,
      "It does that 32 times: 4 window shapes, each laid over all 8 rotations and reflections of the board, and adds up everything it finds.",
      `That sum, plus any points from merging, is the move's score: ${NAMES[dir]} gets ${d.detail.gained[dir].toLocaleString()} + ${fmt(value)} = ${fmt(d.values[dir])}. Same for the others.`,
      `It plays the best-scoring move, ${name(dir)}. It never looks past this one move; the table has to know what's good.`,
    ],
  };
}

// ---- Heuristic -----------------------------------------------------------------

// Cells in order of their corner-gradient weight, which traces the snake.
const SNAKE_PATH = Array.from({ length: 16 }, (_, i) => i).sort((a, b) => POSITION_WEIGHTS[b] - POSITION_WEIGHTS[a]);

function heuristicBoard(d) {
  const dir = d.action;
  const after = d.futures[dir].after;
  const t = d.detail.terms[dir];
  const y0 = AFTER.ys[dir] + AFTER.s / 2;
  let out = tryMoves(d, { valueStage: 4, pickStage: 5 });
  out += arrow(350, y0, BIG.x - 10, BIG.y + BIG.s / 2, { stage: 2, bow: -12 });
  out += note(BIG.x, BIG.y - 14, `scoring ${NAMES[dir].toLowerCase()}`, { stage: 2, size: 14 });
  out += board(BIG.x, BIG.y, BIG.s, after, { stage: 2 });

  // The snake, drawn through the cell centres.
  const pts = SNAKE_PATH.map((c) => cellCentre(BIG.x, BIG.y, BIG.s, c));
  const d1 = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
  out += `<path class="snake draw" data-stage="2" pathLength="1" d="${d1}"/>`;
  out += note(BIG.x + BIG.s + 14, BIG.y + 18, "big tiles\nshould follow\nthe snake", { stage: 2, size: 14 });
  out += note(BIG.x + BIG.s + 14, BIG.y + 84, `corner score\n${fmt(t.position)}`, { stage: 2, size: 13, cls: "note faint-text" });

  // Empty cells and equal neighbours.
  after.forEach((v, i) => {
    const c = cellCentre(BIG.x, BIG.y, BIG.s, i);
    if (!v) out += loop(c.x, c.y, c.cell * 0.32, c.cell * 0.32, { stage: 3, cls: "blue" });
    for (const j of [i % 4 < 3 ? i + 1 : -1, i < 12 ? i + 4 : -1]) {
      if (j >= 0 && v && v === after[j]) {
        const e = cellCentre(BIG.x, BIG.y, BIG.s, j);
        out += line(c.x, c.y, e.x, e.y, { stage: 3, cls: "pair", bow: 6 });
      }
    }
  });
  out += note(BIG.x + BIG.s + 14, BIG.y + 136, `${t.empty} empty\n${t.pairs} pair${t.pairs === 1 ? "" : "s"}\nbumpiness ${t.rough}`, { stage: 3, size: 13 });

  const formula = `2×${fmt(t.position)} + 1.5×${t.empty} + 0.5×${t.pairs} − 0.1×${t.rough}\n= ${fmt(d.values[dir])}`;
  out += note(BIG.x, BIG.y + BIG.s + 24, formula, { stage: 4, size: 14, cls: "note value" });
  out += note(W - 8, H - 10, `plays ${name(dir)}`, { stage: 5, size: 18, anchor: "end", cls: "note accent-text" });
  return out;
}

function heuristicStory(d) {
  const dir = d.action;
  return {
    title: "How the heuristic decides",
    svg: heuristicBoard(d),
    focus: [180, 520, 520, 420, 400],
    stages: [
      tryCaption(d),
      "Rule one: big tiles belong along a snake that starts in the top-left corner. A tile scores more the earlier it sits on the snake, which keeps the biggest one pinned in the corner.",
      "Rules two to four: leave cells empty, keep equal tiles side by side so they can merge, and avoid bumps between very different neighbours.",
      `Each rule has a weight a person picked by hand, and the four are added up. ${NAMES[dir]} scores ${fmt(d.values[dir])}.`,
      `It plays whichever move scores highest, ${name(dir)}. Nothing here was learned.`,
    ],
  };
}

// ---- Neural networks (DQN and PPO) ----------------------------------------------

function netBoard(d) {
  let out = note(ROOT.x, ROOT.y - 12, "the board now", { stage: 1 });
  out += board(ROOT.x, ROOT.y, ROOT.s, d.board, { stage: 1 });

  // One-hot planes: one per tile value on the board, stacked like cards.
  const exps = [...new Set(Array.from(d.board).filter(Boolean))].sort((a, b) => a - b).slice(0, 5);
  const PS = 62;
  const px = 172;
  const py = 178;
  out += arrow(ROOT.x + ROOT.s + 6, ROOT.y + ROOT.s / 2, px - 6, py - 10, { stage: 1, head: 6 });
  exps
    .slice()
    .reverse()
    .forEach((exp, k) => {
      const o = (exps.length - 1 - k) * 12;
      const x = px + o;
      const y = py - o;
      let g = `<g data-stage="1" class="plane"><rect x="${x}" y="${y}" width="${PS}" height="${PS}" rx="5"/>`;
      for (let i = 0; i < 16; i++) {
        const cx = x + 8 + (i % 4) * 15.3;
        const cy = y + 8 + Math.floor(i / 4) * 15.3;
        g += d.board[i] === exp ? `<circle class="on" cx="${cx}" cy="${cy}" r="4.2"/>` : `<circle class="off" cx="${cx}" cy="${cy}" r="1.4"/>`;
      }
      g += `<text class="plane-tag" x="${x + PS + 3}" y="${y + 10}">${2 ** exp}s</text></g>`;
      out += g;
    });
  out += note(px - 4, py + PS + 24, "one layer per tile value:\nis there a 2 here? a 4? …", { stage: 1, size: 13 });

  // Convolutions: 2×2 patches -> 3×3 -> 2×2.
  const patch = cellCentre(ROOT.x, ROOT.y, ROOT.s, 0);
  const span = patch.cell * 2 + ROOT.s * 0.035;
  out += `<rect class="probe-cell" data-stage="2" x="${(patch.x - patch.cell / 2 - 3).toFixed(1)}" y="${(patch.y - patch.cell / 2 - 3).toFixed(1)}" width="${(span + 6).toFixed(1)}" height="${(span + 6).toFixed(1)}" rx="6"/>`;
  const grid = (x, y, n, s) => {
    let g = `<g class="grid" data-stage="2">`;
    const c = s / n;
    for (let i = 0; i < n * n; i++) {
      g += `<rect x="${x + (i % n) * c + 1}" y="${y + Math.floor(i / n) * c + 1}" width="${c - 2}" height="${c - 2}" rx="2"/>`;
    }
    return `${g}</g>`;
  };
  out += arrow(px + PS + 52, py - 10, 334, 150, { stage: 2, head: 6 });
  out += grid(340, 126, 3, 54);
  out += arrow(400, 153, 418, 153, { stage: 2, head: 5, bow: 0 });
  out += grid(424, 135, 2, 36);
  out += note(340, 112, "2×2 filters,\ntwice", { stage: 2, size: 13 });
  out += label(340, 200, "128 patterns\nper patch", { stage: 2, size: 11, cls: "label faint-text" });

  // Dense layer: the real 256 hidden activations.
  const hidden = d.detail.hidden;
  const hmax = Math.max(...hidden, 1e-9);
  const DX = 494;
  const DY = 106;
  out += arrow(466, 153, DX - 6, 153, { stage: 3, head: 5, bow: 0 });
  let cells = `<g class="dense" data-stage="3"><rect class="dense-well" x="${DX - 3}" y="${DY - 3}" width="${16 * 6 + 5}" height="${16 * 6 + 5}" rx="4"/>`;
  hidden.forEach((h, i) => {
    cells += `<rect x="${DX + (i % 16) * 6}" y="${DY + Math.floor(i / 16) * 6}" width="5" height="5" rx="1" fill-opacity="${h > 0 ? (0.12 + 0.88 * (h / hmax)).toFixed(2) : 0.05}"/>`;
  });
  out += `${cells}</g>`;
  out += note(DX, DY - 14, "256 numbers", { stage: 3, size: 13 });
  out += label(DX, DY + 118, `${hidden.filter((h) => h > 0).length} switched on`, { stage: 3, size: 11, cls: "label faint-text" });

  // Outputs.
  const OX = 622;
  out += arrow(DX + 104, 153, OX - 8, 153, { stage: 4, head: 5, bow: 0 });
  d.values.forEach((v, dir) => {
    const y = 104 + dir * 28;
    const cls = v === null ? "note faint-text" : dir === d.action ? "note value is-best" : "note value";
    out += note(OX, y, `${ARROWS[dir]} ${v === null ? "masked" : fmt(v, d.kind)}`, { stage: 4, size: 16, cls });
  });
  if (d.kind === "prob") out += label(OX, 228, `value head: ${fmt(d.detail.value)}`, { stage: 4, size: 12, cls: "label faint-text" });
  out += loop(OX + 32, 104 + d.action * 28 - 6, 44, 14, { stage: 5 });
  out += note(W - 8, H - 30, `plays ${name(d.action)}`, { stage: 5, size: 18, anchor: "end", cls: "note accent-text" });
  out += note(W - 8, H - 10, "without trying a single move", { stage: 5, size: 13, anchor: "end", cls: "note faint-text" });
  return out;
}

function netStory(d) {
  const q = d.kind === "q";
  return {
    title: q ? "How the deep Q-network decides" : "How PPO decides",
    svg: netBoard(d),
    view: [64, 256],
    focus: [160, 380, 520, 600, 560],
    stages: [
      "A network can't read numbers off tiles, only on/off signals. So the board becomes 16 layers, one per tile value, each marking where that tile sits.",
      "Two layers of small filters slide over every 2×2 patch of tiles. Training taught them to fire on useful patterns, like two equal tiles side by side.",
      "Those patterns are mixed into 256 numbers: the network's summary of the board. The squares above are the real values for this board.",
      q
        ? "A last layer turns the summary into one number per move: how much future merging it expects, on the log scale it was trained with."
        : "A last layer turns the summary into a probability for each move, with moves that can't happen masked out. A second head estimates how well the game is going.",
      `It plays the ${q ? "highest" : "most likely"} move, ${name(d.action)}. It never tried a move: everything it knows came from 30 minutes of practice.`,
    ],
  };
}

// ---- The player ---------------------------------------------------------------------

const STORIES = { search: searchStory, value: (d, e) => (d.detail.terms ? heuristicStory(d) : ntupleStory(d, e)), q: netStory, prob: netStory };

export class Explainer {
  #story = null;
  #stage = 0;
  #timer = 0;
  #latest = null;
  #drawn = 0; // the move number the current drawing comes from
  #playing = !matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor({ figure, caption, steps, prev, next, play, title, sub }) {
    Object.assign(this, { figure, caption, steps, title, sub, playButton: play });
    prev.addEventListener("click", () => this.#go(this.#stage - 1, true));
    next.addEventListener("click", () => this.#go(this.#stage + 1, true));
    play.addEventListener("click", () => this.#setPlaying(!this.#playing));
    steps.addEventListener("click", (e) => {
      const li = e.target.closest("[data-step]");
      if (li) this.#go(Number(li.dataset.step), true);
    });
    sub.addEventListener("click", (e) => {
      if (e.target.closest(".ex-redraw")) this.redraw();
    });
    this.#setPlaying(this.#playing);
    this.episodes = 55000;
  }

  // A new decision arrives every move. Only the first one for a model is
  // drawn right away; later ones wait for the storyboard to come round again,
  // so the drawing never changes under the reader mid-explanation.
  offer(decision, { moveNumber, force = false } = {}) {
    this.#latest = { decision, moveNumber };
    if (force || !this.#story) this.#draw();
    else this.#showStale();
  }

  redraw() {
    if (this.#latest) this.#draw();
  }

  #showStale() {
    const stale = this.#latest.moveNumber !== this.#drawn;
    this.sub.innerHTML = `Drawn with the real board and numbers from move ${this.#drawn.toLocaleString()}.${
      stale ? ` <button type="button" class="link ex-redraw">Redraw with move ${this.#latest.moveNumber.toLocaleString()}</button>` : ""
    }`;
  }

  clear(text) {
    clearTimeout(this.#timer);
    this.#story = null;
    this.figure.innerHTML = `<p class="ex-empty">${text}</p>`;
    this.caption.textContent = "";
    this.steps.innerHTML = "";
  }

  #draw() {
    const { decision: d, moveNumber } = this.#latest;
    this.#story = STORIES[d.kind](d, this.episodes);
    this.title.textContent = this.#story.title;
    this.#drawn = moveNumber;
    this.#showStale();
    const [top, height] = this.#story.view ?? [0, H];
    this.figure.innerHTML = svg(W, height, this.#story.svg, { label: this.#story.title, top });
    this.steps.innerHTML = this.#story.stages
      .map((_, i) => `<li><button type="button" data-step="${i}" aria-label="Step ${i + 1}">${i + 1}</button></li>`)
      .join("");
    this.#go(0);
  }

  #go(stage, manual = false) {
    const n = this.#story?.stages.length ?? 0;
    if (!n) return;
    if (stage >= n) {
      // Come round again with the newest board.
      if (this.#latest && !manual) return this.#draw();
      stage = 0;
    }
    if (stage < 0) stage = n - 1;
    this.#stage = stage;
    const svgEl = this.figure.querySelector("svg");
    for (const el of svgEl.querySelectorAll("[data-stage]")) {
      const s = Number(el.dataset.stage) - 1;
      el.classList.toggle("on", s <= stage);
      el.classList.toggle("now", s === stage);
    }
    this.#story.animate?.(svgEl, stage + 1);
    this.#pan(svgEl, stage);
    this.caption.innerHTML = `<span class="ex-num">${stage + 1}</span>${this.#story.stages[stage]}`;
    for (const b of this.steps.querySelectorAll("button")) {
      b.setAttribute("aria-current", String(Number(b.dataset.step) === stage));
    }
    if (manual && this.#playing) this.#setPlaying(false);
    this.#schedule();
  }

  // On narrow screens the drawing is shown larger than the screen and the
  // view pans to the part each step is about, like a camera.
  #pan(svgEl, stage) {
    const centre = this.#story.focus?.[stage] ?? W / 2;
    const shift = Math.min(Math.max(centre - PAN / 2, 0), W - PAN);
    svgEl.style.setProperty("--pan", `${((-shift / W) * 100).toFixed(2)}%`);
  }

  #schedule() {
    clearTimeout(this.#timer);
    if (!this.#playing || !this.#story) return;
    const ms = this.#story.durations?.[this.#stage] ?? (this.#stage === this.#story.stages.length - 1 ? 5200 : 4200);
    this.#timer = setTimeout(() => this.#go(this.#stage + 1), ms);
  }

  #setPlaying(on) {
    this.#playing = on;
    this.playButton.textContent = on ? "❚❚" : "▶";
    this.playButton.setAttribute("aria-label", on ? "Pause the explanation" : "Play the explanation");
    this.#schedule();
  }
}
