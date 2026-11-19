// "What it's thinking": the four moves the model compared, a one-line
// verdict, and (folded away until asked for) a look inside one score.
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

  constructor({ futures, verdict, why, whyTitle }) {
    Object.assign(this, { futures, verdict, why, whyTitle });
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

  loading() {
    this.#decision = null;
    this.verdict.textContent = "Thinking…";
    this.futures.classList.add("is-waiting");
    this.why.classList.add("is-waiting");
  }

  played() {
    this.futures.classList.add("is-played");
  }

  show(decision, lede) {
    this.#decision = decision;
    this.lede = lede;
    this.#pinned = null;
    this.futures.classList.remove("is-waiting", "is-played");
    this.why.classList.remove("is-waiting");
    this.verdict.innerHTML = verdict(decision);
    this.#renderFutures();
    this.#renderWhy();
  }

  ended(game) {
    this.#decision = null;
    this.futures.classList.remove("is-waiting", "is-played");
    this.why.classList.remove("is-waiting");
    this.verdict.textContent = `No move changes the board any more. Game over after ${game.moves.toLocaleString()} moves.`;
    this.futures.innerHTML = "";
    this.why.innerHTML = "";
    this.whyTitle.textContent = "Inside the numbers";
  }

  #renderFutures() {
    const d = this.#decision;
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
        let gap = chosen ? "picks" : signed(v - best, d.kind);
        if (d.kind === "prob" && !chosen) gap = "&nbsp;";
        return html`<button type="button" class="future${chosen ? " is-chosen" : ""}" data-dir="${dir}" aria-pressed="false">
          <span class="future-name">${name(dir)}</span>
          ${miniBoard(f.after)}
          <span class="future-value">${fmt(v, d.kind)}</span>
          <span class="future-gap">${gap}</span>
        </button>`;
      })
      .join("");
    this.futures.innerHTML = cards;
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
    const net = d.kind === "q" || d.kind === "prob";
    this.whyTitle.textContent = net ? "Inside the network" : `Inside the score for ${name(dir)}`;
    this.why.innerHTML = `<p class="why-lede">${this.lede}</p>${WHY[d.kind](d, dir)}`;
    if (d.kind === "value") wireLookups(this.why);
  }
}

// One sentence: what it picked and by how much.
function verdict(d) {
  const legal = d.values.map((v, dir) => ({ v, dir })).filter(({ v }) => v !== null);
  const pick = `<strong>${name(d.action)}</strong>`;
  if (legal.length === 1) return `Only ${pick} can move.`;
  if (d.kind === "prob") return `Picks ${pick}, ${fmt(d.values[d.action], "prob")} sure, without trying a move.`;
  const rival = legal.filter(({ dir }) => dir !== d.action).sort((a, b) => b.v - a.v)[0];
  const margin = `${fmt(d.values[d.action] - rival.v, d.kind)} ahead of ${name(rival.dir)}`;
  if (d.kind === "q") return `Picks ${pick}, ${margin}, without trying a move.`;
  if (d.kind === "search") {
    const ms = d.ms < 1 ? "under a millisecond" : `${Math.round(d.ms)} ms`;
    return `Picks ${pick}, ${margin}. Scored ${d.detail.searched.toLocaleString()} boards in ${ms}.`;
  }
  return `Picks ${pick}, ${margin}.`;
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
  ["position", "Corner gradient", "Big tiles laid along a snake from the top-left corner"],
  ["empty", "Empty cells", "Room left to manoeuvre"],
  ["pairs", "Mergeable pairs", "Neighbours holding the same tile"],
  ["rough", "Bumpiness", "How much neighbouring tiles differ"],
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
      <th scope="row" title="${gloss}">${label}</th>
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

  return html`<table class="terms">
      <tbody>${rows}</tbody>
      <tfoot><tr><th scope="row">Score</th><td></td><td></td><td class="num strong">${fmt(d.values[dir])}</td><td></td></tr></tfoot>
    </table>
    ${versus}
    <p class="why-note">Four hand-picked rules, weighted and added. Tiles count by their power of two: a 64 is 6.</p>`;
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
  return html`<p class="why-sum"><span>${gained.toLocaleString()}</span> from merging <span class="op">+</span> <span>${fmt(total)}</span> board value <span class="op">=</span> <strong>${fmt(d.values[dir])}</strong></p>
    <div class="lookups">
      <div class="lookup-board">${miniBoard(after, { cls: "mini-lg" })}<p class="lookup-readout" data-default="Hover a shape to see what it read.">Hover a shape to see what it read.</p></div>
      <div>
        <div class="waffle">${glyphs}</div>
        <p class="why-note">32 lookups in learned tables: 4 six-cell shapes, each read in 8 rotations and reflections. <span class="key pos"></span> liked what it saw, <span class="key neg"></span> didn't.</p>
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
  const where = (cell) => `row ${Math.floor(cell / 4) + 1}, column ${(cell % 4) + 1} (${signed(byCell.get(cell).two - mean)})`;
  const empty = (i) => {
    const r = byCell.get(i);
    const delta = r.two - mean;
    const a = (Math.abs(delta) / maxAbs).toFixed(2);
    const tone = delta < 0 ? "neg" : "pos";
    const tag = i === worst.cell && rows.length > 1 ? '<span class="spawn-tag">worst</span>' : "";
    const title = `A 2 here: ${signed(delta)}. A 4 here: ${signed(r.four - mean)}.`;
    return `<span class="spawn ${tone}" style="--a:${a}" title="${title}">${tag}<span class="spawn-two">${signed(delta)}</span></span>`;
  };
  const deep = d.detail.plies > 1 ? " Crowded board, so it looked two moves deep." : "";
  return html`<p class="why-sum"><span>${gained.toLocaleString()}</span> from merging <span class="op">+</span> average over <span>${rows.length * 2}</span> possible new tiles <span class="op">=</span> <strong>${fmt(d.values[dir])}</strong></p>
    <div class="spawnmap">
      ${miniBoard(after, { cls: "mini-lg mini-spawn", empty })}
      <div class="spawn-notes">
        <p>It can't choose where the next tile lands, so it plans for every cell. Each shows how the outlook moves if a 2 lands there: <span class="key neg"></span> worse, <span class="key pos"></span> better.</p>
        ${rows.length > 1 ? `<p class="why-note">Worst: ${where(worst.cell)}. Best: ${where(bestRow.cell)}.${deep}</p>` : ""}
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
      ? `<p class="why-note">Its value head rates the position ${fmt(d.detail.value)} (future merging, log scale).</p>`
      : "";
  return html`<div class="net-why">
      <figure>
        ${miniBoard(d.board, { cls: "mini-lg mini-heat", attrs })}
        <figcaption>Tiles that mattered: remove one and the rating of ${name(d.action)} shifts this much.</figcaption>
      </figure>
      <figure>
        <svg class="activations" viewBox="0 0 95 95" aria-hidden="true">${cells}</svg>
        <figcaption>Its 256-number summary of the board. ${active} are on.</figcaption>
      </figure>
    </div>
    ${value}`;
}
