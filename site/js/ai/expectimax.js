// Port of rl2048/agents/expectimax.py: search over the tiles that could
// appear next, scoring the leaves with the n-tuple network.
import { DIRECTIONS, move } from "../engine.js";

const SPAWNS = [
  [1, 0.9],
  [2, 0.1],
];

export function expectimaxAgent(net, { depth = 1, deepBelowEmpty = 4 } = {}) {
  // Average value of an afterstate over every tile that could spawn on it.
  function chance(after, plies) {
    if (plies === 0) return net.value(after);
    let total = 0;
    let empty = 0;
    for (let cell = 0; cell < 16; cell++) {
      if (after[cell]) continue;
      empty++;
      for (const [exp, p] of SPAWNS) {
        after[cell] = exp;
        total += p * best(after, plies - 1);
      }
      after[cell] = 0;
    }
    return total / empty;
  }

  // Best reward-plus-value over the legal moves; a dead board is worth 0.
  function best(board, plies) {
    let top = -Infinity;
    for (const dir of DIRECTIONS) {
      const { after, gained, moved } = move(board, dir);
      if (moved) top = Math.max(top, gained + chance(after, plies));
    }
    return top === -Infinity ? 0 : top;
  }

  return {
    kind: "search",
    decide(board) {
      // Crowded boards are the most dangerous and the cheapest to search
      // (few empty cells), so that is where the extra ply goes.
      const empty = board.reduce((n, v) => n + (v === 0), 0);
      const plies = depth + (empty < deepBelowEmpty ? 1 : 0);
      const values = [null, null, null, null];
      let action = -1;
      let bestAfter = null;
      for (const dir of DIRECTIONS) {
        const { after, gained, moved } = move(board, dir);
        if (!moved) continue;
        values[dir] = gained + chance(after, plies);
        if (action < 0 || values[dir] > values[action]) {
          action = dir;
          bestAfter = after;
        }
      }
      return { action, values, heat: bestAfter && net.heat(bestAfter) };
    },
  };
}
