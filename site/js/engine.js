// Core rules on exponent boards, mirroring rl2048/game.py.
//
// A board is 16 cells in row-major order: 0 is empty and k is the tile 2^k.
// Exponents fit in 4 bits, so a line of four cells packs into a 16-bit key
// and every possible line is solved once up front.

export const UP = 0;
export const DOWN = 1;
export const LEFT = 2;
export const RIGHT = 3;
export const DIRECTIONS = [UP, DOWN, LEFT, RIGHT];

// 4 bits per cell caps tiles at 2^15. Merging two of those saturates.
export const MAX_EXP = 15;

// For each direction, its four lines of cell indices, each ordered from the
// edge that tiles slide toward.
export const LINES = DIRECTIONS.map((dir) =>
  [0, 1, 2, 3].map((i) => {
    const line = [0, 1, 2, 3].map((j) => (dir === UP || dir === DOWN ? j * 4 + i : i * 4 + j));
    return dir === DOWN || dir === RIGHT ? line.reverse() : line;
  }),
);

// Slides one line toward index 0. Returns the new exponents, the points
// gained, and for each occupied output slot the input positions that ended
// up there (two positions means a merge).
export function mergeLine(line) {
  const out = [0, 0, 0, 0];
  const sources = [];
  let gained = 0;
  for (let i = 0; i < 4; i++) {
    if (!line[i]) continue;
    const k = sources.length;
    // Each tile merges at most once per move, so a slot that already took a
    // merge is closed to the next equal tile.
    if (k > 0 && sources[k - 1].length === 1 && out[k - 1] === line[i]) {
      out[k - 1] = Math.min(line[i] + 1, MAX_EXP);
      gained += 2 ** (line[i] + 1);
      sources[k - 1].push(i);
    } else {
      out[k] = line[i];
      sources.push([i]);
    }
  }
  return { out, gained, sources };
}

const pack = (a, b, c, d) => (a << 12) | (b << 8) | (c << 4) | d;

const LINE_OUT = new Uint16Array(1 << 16);
const LINE_GAIN = new Uint32Array(1 << 16);
for (let key = 0; key < 1 << 16; key++) {
  const { out, gained } = mergeLine([key >> 12, (key >> 8) & 15, (key >> 4) & 15, key & 15]);
  LINE_OUT[key] = pack(...out);
  LINE_GAIN[key] = gained;
}

// The board after sliding in `dir`, before a new tile spawns.
export function move(board, dir) {
  const after = new Uint8Array(16);
  let gained = 0;
  let moved = false;
  for (const [a, b, c, d] of LINES[dir]) {
    const key = pack(board[a], board[b], board[c], board[d]);
    const out = LINE_OUT[key];
    gained += LINE_GAIN[key];
    moved ||= out !== key;
    after[a] = out >> 12;
    after[b] = (out >> 8) & 15;
    after[c] = (out >> 4) & 15;
    after[d] = out & 15;
  }
  return { after, gained, moved };
}

export function legalMoves(board) {
  return DIRECTIONS.filter((dir) => move(board, dir).moved);
}

export function isOver(board) {
  return !board.includes(0) && legalMoves(board).length === 0;
}

// Drops a 2 (90%) or a 4 (10%) into a random empty cell, in place.
// Returns the cell index, or -1 if the board is full.
export function spawn(board, random) {
  const empty = [];
  board.forEach((exp, i) => exp === 0 && empty.push(i));
  if (!empty.length) return -1;
  const cell = empty[Math.floor(random() * empty.length)];
  board[cell] = random() < 0.9 ? 1 : 2;
  return cell;
}
