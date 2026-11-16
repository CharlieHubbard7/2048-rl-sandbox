import { LINES, isOver, mergeLine, spawn } from "./engine.js";
import { createRng } from "./rng.js";

export const WIN_EXP = 11; // the 2048 tile

// One game, with tile identities so the view can animate where each tile
// went. Each tile is { id, exp, merged, spawned } and lives in `cells`.
export class Game {
  #nextId = 1;

  constructor(seed, saved = null) {
    this.rng = createRng(saved ? saved.rngState : seed);
    if (saved) {
      this.cells = saved.board.map((exp) => (exp ? this.#tile(exp) : null));
      Object.assign(this, {
        score: saved.score,
        moves: saved.moves,
        won: saved.won,
        keepPlaying: saved.keepPlaying,
      });
      this.over = isOver(this.board);
    } else {
      this.cells = Array(16).fill(null);
      Object.assign(this, { score: 0, moves: 0, won: false, keepPlaying: false, over: false });
      this.#spawn();
      this.#spawn();
    }
  }

  get board() {
    return Uint8Array.from(this.cells, (t) => (t ? t.exp : 0));
  }

  get tiles() {
    return this.cells.flatMap((t, cell) => (t ? [{ ...t, cell }] : []));
  }

  // Waiting on the "you win" choice: no moves until the player decides.
  get paused() {
    return this.won && !this.keepPlaying;
  }

  #tile(exp) {
    return { id: this.#nextId++, exp, merged: false, spawned: false };
  }

  #spawn() {
    const board = this.board;
    const cell = spawn(board, this.rng.next);
    if (cell >= 0) this.cells[cell] = { ...this.#tile(board[cell]), spawned: true };
  }

  // Returns null if the move changes nothing (like the original, an illegal
  // move is simply ignored). Otherwise returns the points gained and the
  // tiles that merged away, each with the cell it slid into.
  move(dir) {
    if (this.over || this.paused) return null;
    const next = Array(16).fill(null);
    const absorbed = [];
    let gained = 0;
    let moved = false;

    for (const line of LINES[dir]) {
      const result = mergeLine(line.map((cell) => this.cells[cell]?.exp ?? 0));
      result.sources.forEach(([a, b], slot) => {
        const target = line[slot];
        const keep = { ...this.cells[line[a]], merged: b !== undefined, spawned: false };
        if (b !== undefined) {
          keep.exp = result.out[slot];
          absorbed.push({ id: this.cells[line[b]].id, cell: target });
        }
        moved ||= line[a] !== target || b !== undefined;
        next[target] = keep;
      });
      gained += result.gained;
    }
    if (!moved) return null;

    this.cells = next;
    this.score += gained;
    this.moves += 1;
    this.#spawn();
    if (!this.won && this.cells.some((t) => t?.exp >= WIN_EXP)) this.won = true;
    this.over = isOver(this.board);
    return { gained, absorbed };
  }

  continueAfterWin() {
    this.keepPlaying = true;
  }

  serialize() {
    return {
      board: Array.from(this.board),
      rngState: this.rng.state,
      score: this.score,
      moves: this.moves,
      won: this.won,
      keepPlaying: this.keepPlaying,
    };
  }
}
