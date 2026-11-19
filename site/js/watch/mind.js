// "What it's thinking": the four moves the model compared, where each one
// landed on a number line, and a look inside the score of one of them.
import { ARROWS, NAMES, esc, fmt, signed } from "./draw.js";

const html = (strings, ...values) => strings.reduce((out, s, i) => out + values[i - 1] + s).trim();
const name = (dir) => `${ARROWS[dir]} ${NAMES[dir]}`;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// A board as plain HTML, reusing the real tile styles so colours match.
// `empty` fills an empty cell; `attrs` adds attributes to any cell.
export function miniBoard(cells, { cls = "", attrs = () => "", empty = () => "" } = {}) {
  const inner = Array.from(cells, (exp, i) => {
    if (!exp) return `<span class="mini-cell is-empty" data-cell="${i}"${attrs(i)}>${empty(i)}</span>`;
    const value = 2 ** exp;
    return `<span class="mini-cell" data-cell="${i}"${attrs(i)}><span class="tile-face" data-exp="${Math.min(exp, 12)}" data-digits="${String(value).length}">${value}</span></span>`;
  }).join("");
  return `<div class="mini ${cls}">${inner}</div>`;
}

export class MindPanel {
  #decision = null;
  #pinned = null; // a move the reader clicked, kept until the next decision
  #hover = null;

  constructor({ meta, lede, futures, why }) {
    Object.assign(this, { meta, lede, futures, why });
    futures.addEventListener("pointerover", (e) => this.#preview(e.target.closest("[data-dir]")));
    futures.addEventListener("focusin", (e) => this.#preview(e.target.closest("[data-dir]")));
    futures.addEventListener("pointerleave", () => this.#preview(null));
    futures.addEventListener("focusout", () => this.#preview(null));
    futures.addEventListener("click", (e) => {
      const card = e.target.closest("[data-dir]");
      if (!card || card.disabled) return;
      const dir = Number(card.dataset.dir);
      this.#pinned = this.#pinned === dir ? null : dir;
      this.#renderWhy();
      this.#markSelected();
    });
  }

  get selected() {
    return this.#hover ?? this.#pinned ?? this.#decision?.action ?? null;
  }

  #preview(card) {
    const dir = card && !card.disabled ? Number(card.dataset.dir) : null;
    if (dir === this.#hover) return;
    this.#hover = dir;
    this.#renderWhy();
    this.#markSelected();
  }

  loading(model) {
    this.#decision = null;
    this.lede.textContent = model.lede;
    this.meta.textContent = "Thinking…";
    this.futures.classList.add("is-waiting");
    this.why.classList.add("is-waiting");
  }

  played() {
    this.futures.classList.add("is-played");
  }

  show(decision, model, game) {
    this.#decision = decision;
    this.#pinned = null;
    this.futures.classList.remove("is-waiting", "is-played");
    this.why.classList.remove("is-waiting");
    this.lede.textContent = model.lede;
    this.#renderMeta(game);
    this.#renderFutures();
    this.#renderWhy();
  }

  ended(game) {
    this.#decision = null;
    this.futures.classList.remove("is-waiting", "is-played");
    this.why.classList.remove("is-waiting");
    this.meta.textContent = `Game over after ${game.moves.toLocaleString()} moves`;
    this.futures.innerHTML = `<p class="mind-empty">No move changes the board any more, so the game is over.</p>`;
    this.why.innerHTML = "";
  }

  #renderMeta(game) {
    const d = this.#decision;
    const bits = [`Move ${(game.moves + 1).toLocaleString()}`, `${d.ms < 1 ? "<1" : Math.round(d.ms)} ms`];
    if (d.kind === "search") bits.push(`${d.detail.searched.toLocaleString()} boards scored`);
    this.meta.textContent = bits.join(" · ");
  }

  #renderFutures() {
    const d = this.#decision;
    const legal = d.values.filter((v) => v !== null);
    const best = d.values[d.action];
    const cards = d.futures
      .map((f, dir) => {
        if (!f) {
          return html`<button type="button" class="future is-blocked" data-dir="${dir}" disabled>
            <span class="future-name">${name(dir)}</span>
            <span class="future-none">can't move</span>
          </button>`;
        }
        const v = d.values[dir];
        const chosen = dir === d.action;
        let gap = chosen ? (d.kind === "prob" ? "its pick" : "best") : signed(v - best, d.kind);
        if (d.kind === "prob" && !chosen) gap = "&nbsp;";
        return html`<button type="button" class="future${chosen ? " is-chosen" : ""}" data-dir="${dir}" aria-pressed="false">
          <span class="future-name">${name(dir)}</span>
          ${miniBoard(f.after)}
          <span class="future-value">${fmt(v, d.kind)}</span>
          <span class="future-gap">${gap}</span>
        </button>`;
      })
      .join("");
    this.futures.innerHTML = `<div class="future-row">${cards}</div>${numberLine(d.values, d.action, d.kind, legal)}`;
    this.#markSelected();
  }

  #markSelected() {
    const sel = this.selected;
    for (const card of this.futures.querySelectorAll("[data-dir]")) {
      const on = Number(card.dataset.dir) === sel;
      card.classList.toggle("is-selected", on);
      if (!card.disabled) card.setAttribute("aria-pressed", String(on && this.#pinned === sel));
    }
  }

  #renderWhy() {
    const d = this.#decision;
    if (!d) return;
    const dir = this.selected;
    const render = WHY[d.kind];
    this.why.innerHTML = render ? render(d, dir) : "";
    if (d.kind === "value") wireLookups(this.why);
  }
}

// ---- The number line under the cards ---------------------------------------

function numberLine(values, action, kind, legal) {
  const W = 400;
  const left = 22;
  const right = W - 22;
  let lo = kind === "prob" ? 0 : Math.min(...legal);
  let hi = kind === "prob" ? 1 : Math.max(...legal);
  if (hi === lo) {
    lo -= 1;
    hi += 1;
  }
  const x = (v) => left + ((v - lo) / (hi - lo)) * (right - left);
  const points = values
    .map((v, dir) => (v === null ? null : { dir, v, x: x(v) }))
    .filter(Boolean)
    .sort((a, b) => a.x - b.x);
  // Stack labels that would collide.
  let lastX = -Infinity;
  let level = 0;
  for (const p of points) {
    level = p.x - lastX < 20 ? level + 1 : 0;
    p.level = level;
    lastX = p.x;
  }
  const dots = points
    .map(({ dir, x: px, level: lv }) => {
      const cls = dir === action ? "nl-dot is-chosen" : "nl-dot";
      const ly = 22 - lv * 13;
      return `<g class="${cls}"><line x1="${px}" y1="${ly + 3}" x2="${px}" y2="33" class="nl-stem"/><circle cx="${px}" cy="36" r="4"/><text x="${px}" y="${ly}" text-anchor="middle">${ARROWS[dir]}</text></g>`;
    })
    .join("");
  const ends =
    kind === "prob"
      ? `<text class="nl-end" x="${left}" y="56" text-anchor="middle">0%</text><text class="nl-end" x="${right}" y="56" text-anchor="middle">100%</text>`
      : `<text class="nl-end" x="${left}" y="56" text-anchor="start">worse</text><text class="nl-end" x="${right}" y="56" text-anchor="end">better</text>`;
  return `<svg class="number-line" viewBox="0 0 ${W} 62" aria-hidden="true"><path class="nl-axis" d="M${left - 8} 36.5Q${W / 2} 35 ${right + 8} 36.8"/>${dots}${ends}</svg>`;
}

// ---- Inside the score, per kind of model -------------------------------------

// The heuristic and the n-tuple network share kind "value"; tell them apart
// by what detail came back.
const WHY = {
  value: (d, dir) => (d.detail.terms ? heuristicWhy(d, dir) : ntupleWhy(d, dir)),
  search: searchWhy,
  q: netWhy,
  prob: netWhy,
};

const TERMS = [
  ["position", "Corner gradient", "big tiles laid along a snake from the top-left corner"],
  ["empty", "Empty cells", "room left to manoeuvre"],
  ["pairs", "Mergeable pairs", "neighbours holding the same tile"],
  ["rough", "Bumpiness", "how much neighbouring tiles differ"],
];

function heuristicWhy(d, dir) {
  const { terms, weights } = d.detail;
  const t = terms[dir];
  const parts = TERMS.map(([key]) => weights[key] * t[key]);
  const maxAbs = Math.max(...parts.map(Math.abs), 1e-9);
  const rows = TERMS.map(([key, label, gloss], i) => {
    const w = weights[key];
    const width = (Math.abs(parts[i]) / maxAbs) * 50;
    const bar = parts[i] >= 0 ? `left:50%;width:${width}%` : `left:${50 - width}%;width:${width}%`;
    return html`<tr>
      <th scope="row">${label}<small>${gloss}</small></th>
      <td class="num">${w < 0 ? "−" : ""}${Math.abs(w)} ×</td>
      <td class="num">${fmt(t[key])}</td>
      <td class="num strong">${signed(parts[i])}</td>
      <td class="term-bar"><span class="${parts[i] < 0 ? "neg" : "pos"}" style="${bar}"></span></td>
    </tr>`;
  }).join("");

  // What separated this move from its closest rival, term by term.
  const rival = rivalOf(d, dir);
  let versus = "";
  if (rival !== null) {
    const r = terms[rival];
    const diffs = TERMS.map(([key, label]) => ({ label, diff: weights[key] * (t[key] - r[key]) })).sort(
      (a, b) => Math.abs(b.diff) - Math.abs(a.diff),
    );
    const total = d.values[dir] - d.values[rival];
    const top = diffs[0];
    versus = `<p class="why-versus">${total >= 0 ? "Beats" : "Loses to"} ${name(rival)} by ${fmt(Math.abs(total))}, mostly on <strong>${top.label.toLowerCase()}</strong> (${signed(top.diff)}).</p>`;
  }

  return html`<h3 class="why-title">Inside the score for ${name(dir)}</h3>
    <table class="terms">
      <tbody>${rows}</tbody>
      <tfoot><tr><th scope="row">Score</th><td></td><td></td><td class="num strong">${fmt(d.values[dir])}</td><td></td></tr></tfoot>
    </table>
    ${versus}
    <p class="why-note">Tiles are counted by their power of two, so a 64 counts as 6.</p>`;
}

function rivalOf(d, dir) {
  if (dir !== d.action) return d.action;
  let rival = null;
  d.values.forEach((v, i) => {
    if (i !== dir && v !== null && (rival === null || v > d.values[rival])) rival = i;
  });
  return rival;
}

function ntupleWhy(d, dir) {
  const features = d.detail.features[dir];
  const gained = d.detail.gained[dir];
  const after = d.futures[dir].after;
  const total = sum(features.map((f) => f.weight));
  const maxAbs = Math.max(...features.map((f) => Math.abs(f.weight)), 1e-9);
  // Order: one row per shape, eight symmetries across.
  const byPattern = [0, 1, 2, 3].map((p) => features.map((f, i) => ({ ...f, i })).filter((f) => f.pattern === p));
  const glyphs = byPattern
    .map((row) =>
      row
        .map(({ cells, weight, i }) => {
          const a = (0.3 + 0.7 * (Math.abs(weight) / maxAbs)).toFixed(2);
          const tone = weight >= 0 ? "pos" : "neg";
          const sq = Array.from({ length: 16 }, (_, c) => {
            const on = cells.includes(c);
            return `<rect x="${(c % 4) * 6}" y="${Math.floor(c / 4) * 6}" width="5" height="5" rx="1" class="${on ? tone : "off"}"${on ? ` fill-opacity="${a}"` : ""}/>`;
          }).join("");
          return `<button type="button" class="glyph" data-feature="${i}" data-cells="${cells.join(",")}" data-weight="${weight}" aria-label="Lookup ${i + 1}: weight ${signed(weight)}"><svg viewBox="0 0 23 23">${sq}</svg></button>`;
        })
        .join(""),
    )
    .join("");
  return html`<h3 class="why-title">Inside the score for ${name(dir)}</h3>
    <p class="why-sum"><span>${gained.toLocaleString()}</span> points from merging <span class="op">+</span> <span>${fmt(total)}</span> board value <span class="op">=</span> <strong>${fmt(d.values[dir])}</strong></p>
    <div class="lookups">
      <div class="lookup-board">${miniBoard(after, { cls: "mini-lg" })}<p class="lookup-readout" data-default="Hover a shape to see where it looked.">Hover a shape to see where it looked.</p></div>
      <div>
        <div class="waffle">${glyphs}</div>
        <p class="why-note">The board value is 32 lookups added up: 4 shapes of 6 cells, each read in all 8 rotations and reflections of the board. Each lookup returns a weight learned in self-play. <span class="key pos"></span> liked what it saw, <span class="key neg"></span> didn't; darker is stronger.</p>
      </div>
    </div>`;
}

function wireLookups(root) {
  const board = root.querySelector(".lookup-board .mini");
  const readout = root.querySelector(".lookup-readout");
  if (!board) return;
  const show = (glyph) => {
    for (const c of board.children) c.classList.remove("is-read");
    for (const g of root.querySelectorAll(".glyph")) g.classList.toggle("is-on", g === glyph);
    if (!glyph) {
      readout.textContent = readout.dataset.default;
      return;
    }
    const cells = glyph.dataset.cells.split(",").map(Number);
    cells.forEach((c) => board.children[c].classList.add("is-read"));
    const w = Number(glyph.dataset.weight);
    const key = cells.map((c) => {
      const face = board.children[c].textContent;
      return face || "·";
    });
    readout.innerHTML = `Read <span class="mono">${esc(key.join(" "))}</span>, found <strong class="${w < 0 ? "neg-text" : "pos-text"}">${signed(w)}</strong>`;
  };
  root.querySelector(".waffle").addEventListener("pointerover", (e) => show(e.target.closest(".glyph")));
  root.querySelector(".waffle").addEventListener("focusin", (e) => show(e.target.closest(".glyph")));
  root.querySelector(".waffle").addEventListener("pointerleave", () => show(null));
}

function searchWhy(d, dir) {
  const rows = d.detail.outcomes[dir];
  const gained = d.detail.gained[dir];
  const after = d.futures[dir].after;
  const mean = d.values[dir] - gained;
  const byCell = new Map(rows.map((r) => [r.cell, r]));
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.two - mean)), 1e-9);
  const worst = rows.reduce((a, b) => (b.two < a.two ? b : a));
  const bestRow = rows.reduce((a, b) => (b.two > a.two ? b : a));
  const where = (cell) => `row ${Math.floor(cell / 4) + 1}, column ${(cell % 4) + 1}`;
  const empty = (i) => {
    const r = byCell.get(i);
    const delta = r.two - mean;
    const a = (Math.abs(delta) / maxAbs).toFixed(2);
    const tone = delta < 0 ? "neg" : "pos";
    const tag = i === worst.cell && rows.length > 1 ? '<span class="spawn-tag">worst</span>' : "";
    const title = `A 2 here: ${signed(delta)}. A 4 here: ${signed(r.four - mean)}.`;
    return `<span class="spawn ${tone}" style="--a:${a}" title="${title}">${tag}<span class="spawn-two">${signed(delta)}</span></span>`;
  };
  const plies = d.detail.plies;
  const depth =
    plies > 1
      ? "The board is crowded, so it looks two moves deep here: for every new tile, its best reply, then every tile after that."
      : "For every new tile it finds its best reply and scores the result with the N-tuple network.";
  return html`<h3 class="why-title">Inside the score for ${name(dir)}</h3>
    <p class="why-sum"><span>${gained.toLocaleString()}</span> points from merging <span class="op">+</span> average over <span>${rows.length * 2}</span> possible new tiles <span class="op">=</span> <strong>${fmt(d.values[dir])}</strong></p>
    <div class="spawnmap">
      ${miniBoard(after, { cls: "mini-lg mini-spawn", empty })}
      <div class="spawn-notes">
        <p>It can't choose where the next tile lands, so it plans for all of them: a 2 (90% likely) or a 4 (10%) in each empty cell.</p>
        <p>Each empty cell shows how the game looks if a 2 lands there, compared with the average of ${fmt(mean)}. <span class="key neg"></span> worse, <span class="key pos"></span> better.</p>
        ${rows.length > 1 ? `<p>Worst case: a 2 in ${where(worst.cell)} (${signed(worst.two - mean)}). Best: ${where(bestRow.cell)} (${signed(bestRow.two - mean)}).</p>` : ""}
        <p class="why-note">${depth}</p>
      </div>
    </div>`;
}

function netWhy(d) {
  const { hidden } = d.detail;
  const heat = d.heat ?? new Array(16).fill(0);
  const hi = Math.max(...heat, 1e-9);
  const attrs = (i) => (d.board[i] ? ` style="--h:${(heat[i] / hi).toFixed(2)}"` : "");
  const hmax = Math.max(...hidden, 1e-9);
  const active = hidden.filter((h) => h > 0).length;
  const cells = hidden
    .map((h, i) => `<rect x="${(i % 16) * 6}" y="${Math.floor(i / 16) * 6}" width="5" height="5" fill-opacity="${h > 0 ? (0.12 + 0.88 * (h / hmax)).toFixed(2) : 0}"/>`)
    .join("");
  const value =
    d.kind === "prob"
      ? `<p class="why-versus">Its value head rates the position at <strong>${fmt(d.detail.value)}</strong>: how much future merging it expects from here, on its log scale.</p>`
      : "";
  return html`<h3 class="why-title">Inside the network</h3>
    <div class="net-why">
      <figure>
        ${miniBoard(d.board, { cls: "mini-lg mini-heat", attrs })}
        <figcaption>Tiles that mattered: how much its rating of ${name(d.action)} moves when each tile is taken away.</figcaption>
      </figure>
      <figure>
        <svg class="activations" viewBox="0 0 95 95" aria-hidden="true">${cells}</svg>
        <figcaption>The 256 numbers its layers boil this board down to. ${active} are switched on.</figcaption>
      </figure>
    </div>
    ${value}`;
}
