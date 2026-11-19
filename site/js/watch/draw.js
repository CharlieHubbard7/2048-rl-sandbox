// A small vocabulary for the hand-drawn diagrams: wobbly lines, arrows that
// curve a little, loops drawn around things, margin-note text and mini
// boards. Everything returns SVG markup strings, so a whole figure can be
// built in one pass and dropped into the page.
//
// The wobble is seeded by the coordinates, so a figure drawn twice from the
// same data looks the same both times (no shimmer between frames).

const SVG = "http://www.w3.org/2000/svg";

// Tile colours, mirrored from style.css so diagrams match the real board.
export const TILE = {
  1: ["#d9e0eb", "#33415a"],
  2: ["#c3d0e2", "#33415a"],
  3: ["#a6bddc", "#233049"],
  4: ["#8eaad3", "#fff"],
  5: ["#6c8fc6", "#fff"],
  6: ["#4b73b5", "#fff"],
  7: ["#f0b9a6", "#5a2618"],
  8: ["#ea9c82", "#fff"],
  9: ["#e2805f", "#fff"],
  10: ["#d9694f", "#fff"],
  11: ["#1d2738", "#fff"],
  12: ["#0f1520", "#f0b9a6"],
};
export const tileColours = (exp) => TILE[Math.min(exp, 12)];

export const INK = "#1d2738";
export const MUTED = "#687488";
export const ACCENT = "#d9694f";
export const BLUE = "#4b73b5";
export const EMPTY = "#f7f9fb";

const round = (n) => Math.round(n * 10) / 10;

function noise(...seeds) {
  let h = 2166136261;
  for (const s of seeds) h = Math.imul(h ^ Math.round(s * 7), 16777619);
  return ((h >>> 0) % 10000) / 10000 - 0.5; // -0.5 .. 0.5
}

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const attrs = (o = {}) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join("");

// A slightly bowed stroke from one point to another. Returns the path data
// and the control point, which arrows need for their head direction.
function bowed(x1, y1, x2, y2, bow) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const b = bow ?? noise(x1, y1, x2, y2) * Math.min(len * 0.08, 10);
  const cx = (x1 + x2) / 2 - (dy / len) * b;
  const cy = (y1 + y2) / 2 + (dx / len) * b;
  return { d: `M${round(x1)} ${round(y1)}Q${round(cx)} ${round(cy)} ${round(x2)} ${round(y2)}`, cx, cy };
}

export function line(x1, y1, x2, y2, { bow, cls = "ink", stage, dash } = {}) {
  const { d } = bowed(x1, y1, x2, y2, bow);
  return `<path${attrs({ d, class: `${cls} draw`, "data-stage": stage, pathLength: 1, "stroke-dasharray": dash })}/>`;
}

export function arrow(x1, y1, x2, y2, { bow, cls = "ink", stage, head = 7 } = {}) {
  const { d, cx, cy } = bowed(x1, y1, x2, y2, bow);
  const angle = Math.atan2(y2 - cy, x2 - cx);
  const wing = (a) => `${round(x2 - head * Math.cos(angle + a))} ${round(y2 - head * Math.sin(angle + a))}`;
  const tip = `M${wing(0.45)}L${round(x2)} ${round(y2)}L${wing(-0.45)}`;
  return `<g${attrs({ class: `${cls} arrow`, "data-stage": stage })}><path class="draw" pathLength="1" d="${d}"/><path class="tip" d="${tip}"/></g>`;
}

// A loose loop around a point, overshooting its start the way a pen does.
export function loop(cx, cy, rx, ry, { cls = "accent", stage } = {}) {
  const start = -2.2 + noise(cx, cy) * 0.6;
  const points = [];
  for (let i = 0; i <= 28; i++) {
    const t = start + (i / 28) * (Math.PI * 2 + 0.5);
    const wob = 1 + noise(cx, cy, i) * 0.06 + (i / 28) * 0.07;
    points.push(`${round(cx + Math.cos(t) * rx * wob)} ${round(cy + Math.sin(t) * ry * wob)}`);
  }
  return `<path${attrs({ d: `M${points.join("L")}`, class: `${cls} draw loop`, "data-stage": stage, pathLength: 1 })}/>`;
}

export function note(x, y, text, { size = 15, anchor = "start", cls = "note", stage, weight } = {}) {
  const lines = String(text).split("\n");
  const spans = lines
    .map((t, i) => `<tspan x="${round(x)}" dy="${i ? round(size * 1.2) : 0}">${esc(t)}</tspan>`)
    .join("");
  return `<text${attrs({ x: round(x), y: round(y), class: cls, "font-size": size, "text-anchor": anchor, "data-stage": stage, "font-weight": weight })}>${spans}</text>`;
}

export function label(x, y, text, opts = {}) {
  return note(x, y, text, { cls: "label", size: 13, ...opts });
}

// A board of exponents drawn at (x, y). `marks` maps a cell to a class name
// for highlighting (for example the tile that just spawned).
export function board(x, y, size, cells, { marks = {}, numbers = size >= 64, stage, cls = "", fade = [] } = {}) {
  const gap = size * 0.035;
  const cell = (size - gap * 5) / 4;
  const r = cell * 0.14;
  let out = `<g${attrs({ class: `mini-svg ${cls}`.trim(), "data-stage": stage })}>`;
  out += `<rect class="mini-well" x="${round(x)}" y="${round(y)}" width="${round(size)}" height="${round(size)}" rx="${round(r * 1.6)}"/>`;
  for (let i = 0; i < 16; i++) {
    const cx = x + gap + (i % 4) * (cell + gap);
    const cy = y + gap + Math.floor(i / 4) * (cell + gap);
    const exp = cells[i];
    const [bg, fg] = exp ? tileColours(exp) : [EMPTY, INK];
    const mark = marks[i] ? ` ${marks[i]}` : "";
    const dim = fade.includes(i) ? ' opacity="0.25"' : "";
    out += `<rect class="mini-cell${mark}" x="${round(cx)}" y="${round(cy)}" width="${round(cell)}" height="${round(cell)}" rx="${round(r)}" fill="${bg}"${dim}/>`;
    if (exp && numbers) {
      const value = 2 ** exp;
      const digits = String(value).length;
      const fs = cell * [0, 0.44, 0.4, 0.33, 0.27, 0.22][Math.min(digits, 5)];
      out += `<text class="mini-num" x="${round(cx + cell / 2)}" y="${round(cy + cell / 2 + fs * 0.36)}" font-size="${round(fs)}" fill="${fg}" text-anchor="middle"${dim}>${value}</text>`;
    }
  }
  return `${out}</g>`;
}

// Centre of a cell on a board drawn by board(): handy for pointing at it.
export function cellCentre(x, y, size, i) {
  const gap = size * 0.035;
  const cell = (size - gap * 5) / 4;
  return {
    x: x + gap + (i % 4) * (cell + gap) + cell / 2,
    y: y + gap + Math.floor(i / 4) * (cell + gap) + cell / 2,
    cell,
  };
}

export function svg(width, height, body, { label: aria, top = 0 } = {}) {
  return `<svg xmlns="${SVG}" viewBox="0 ${top} ${width} ${height}" role="img"${aria ? ` aria-label="${esc(aria)}"` : ""}>${body}</svg>`;
}

// ---- Numbers ----------------------------------------------------------------

export function fmt(v, kind) {
  if (v === null || v === undefined) return "–";
  if (kind === "prob") return `${Math.round(v * 100)}%`;
  // Q-values sit close together, so they need the extra digit.
  if (kind === "q") return v.toFixed(2);
  const a = Math.abs(v);
  if (Number.isInteger(v) && a < 10000) return v.toLocaleString();
  if (a >= 10000) return `${(v / 1000).toFixed(1)}k`;
  if (a >= 100) return Math.round(v).toLocaleString();
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function signed(v, kind) {
  const s = fmt(Math.abs(v), kind);
  if (Math.abs(v) < 0.005) return "±0";
  return `${v < 0 ? "−" : "+"}${s}`;
}

export const ARROWS = ["↑", "↓", "←", "→"];
export const NAMES = ["Up", "Down", "Left", "Right"];
