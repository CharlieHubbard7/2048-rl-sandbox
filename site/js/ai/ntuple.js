// Port of the n-tuple value function in rl2048/agents/ntuple.py.
//
// The full tables would be 4 x 16^6 weights. Training only ever touches a
// small fraction of them, so the export ships just those, as sorted keys per
// table: a lookup is a binary search and a missing key means weight zero.
import { DIRECTIONS, move } from "../engine.js";

// Keys ship as gaps between consecutive sorted keys; rebuild them in place.
function undelta(gaps) {
  for (let i = 1; i < gaps.length; i++) gaps[i] += gaps[i - 1];
  return gaps;
}

export class NTupleNetwork {
  constructor({ meta, arrays }) {
    // Cell indices for every (pattern, symmetry) pair come from the export,
    // so the JS can never disagree with Python about the symmetries.
    this.cells = meta.cells;
    this.tableOf = meta.table_of;
    this.tables = meta.table_of
      .filter((t, i, all) => all.indexOf(t) === i)
      .map((t) => ({ keys: undelta(arrays[`keys${t}`]), values: arrays[`values${t}`] }));
  }

  #weight(feature, board) {
    let key = 0;
    for (const cell of this.cells[feature]) key = key * 16 + board[cell];
    const { keys, values } = this.tables[this.tableOf[feature]];
    let lo = 0;
    let hi = keys.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (keys[mid] < key) lo = mid + 1;
      else if (keys[mid] > key) hi = mid - 1;
      else return values[mid];
    }
    return 0;
  }

  // The 32 lookups behind value(): which cells each one read and the weight
  // it found. `pattern` is which of the four shapes it is (0..3).
  features(board) {
    return this.cells.map((cells, f) => ({
      cells,
      pattern: this.tableOf[f],
      weight: this.#weight(f, board),
    }));
  }

  value(board) {
    let total = 0;
    for (let f = 0; f < this.cells.length; f++) total += this.#weight(f, board);
    return total;
  }

  // Each active weight spread evenly over the tiles its tuple covers. Empty
  // cells get nothing, so the glow always lands on actual tiles.
  heat(board) {
    const heat = new Array(16).fill(0);
    for (let f = 0; f < this.cells.length; f++) {
      const tiles = this.cells[f].filter((cell) => board[cell]);
      const share = this.#weight(f, board) / (tiles.length || 1);
      for (const cell of tiles) heat[cell] += share;
    }
    return heat;
  }
}

// Greedy play: the move whose merge reward plus resulting board value is best.
export function ntupleAgent(net) {
  return {
    kind: "value",
    decide(board, { detail = false } = {}) {
      const values = [null, null, null, null];
      let action = -1;
      let bestAfter = null;
      for (const dir of DIRECTIONS) {
        const { after, gained, moved } = move(board, dir);
        if (!moved) continue;
        values[dir] = gained + net.value(after);
        if (action < 0 || values[dir] > values[action]) {
          action = dir;
          bestAfter = after;
        }
      }
      const decision = { action, values, heat: bestAfter && net.heat(bestAfter) };
      if (detail) {
        decision.detail = {
          gained: DIRECTIONS.map((dir) => move(board, dir).gained),
          features: DIRECTIONS.map((dir) => (values[dir] === null ? null : net.features(move(board, dir).after))),
        };
      }
      return decision;
    },
  };
}
