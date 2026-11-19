// Port of rl2048/agents/expectimax.py: search over the tiles that could
// appear next, scoring the leaves with the n-tuple network.
import { DIRECTIONS, move } from "../engine.js";

const SPAWNS = [
  [1, 0.9],
  [2, 0.1],
];

export function expectimaxAgent(net, { depth = 1, deepBelowEmpty = 4 } = {}) {
  let leaves = 0; // boards scored by the network, for the explanation

  // Average value of an afterstate over every tile that could spawn on it.
  function chance(after, plies) {
    if (plies === 0) {
      leaves++;
      return net.value(after);
    }
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

  // The same average as chance(), unrolled one level so the explanation can
  // show what each possible new tile would be worth on its own.
  function outcomes(after, plies) {
    const rows = [];
    for (let cell = 0; cell < 16; cell++) {
      if (after[cell]) continue;
      const row = { cell };
      for (const [exp] of SPAWNS) {
        after[cell] = exp;
        row[exp === 1 ? "two" : "four"] = best(after, plies - 1);
      }
      after[cell] = 0;
      rows.push(row);
    }
    return rows;
  }

  // Averages outcome rows exactly as chance() does, in the same order.
  const average = (rows) => {
    let total = 0;
    for (const { two, four } of rows) {
      total += 0.9 * two;
      total += 0.1 * four;
    }
    return total / rows.length;
  };

  return {
    kind: "search",
    decide(board, { detail = false } = {}) {
      // Crowded boards are the most dangerous and the cheapest to search
      // (few empty cells), so that is where the extra ply goes.
      const empty = board.reduce((n, v) => n + (v === 0), 0);
      const plies = depth + (empty < deepBelowEmpty ? 1 : 0);
      const values = [null, null, null, null];
      const rows = [null, null, null, null];
      const gains = [0, 0, 0, 0];
      let action = -1;
      let bestAfter = null;
      leaves = 0;
      for (const dir of DIRECTIONS) {
        const { after, gained, moved } = move(board, dir);
        gains[dir] = gained;
        if (!moved) continue;
        if (detail) {
          rows[dir] = outcomes(after, plies);
          values[dir] = gained + average(rows[dir]);
        } else {
          values[dir] = gained + chance(after, plies);
        }
        if (action < 0 || values[dir] > values[action]) {
          action = dir;
          bestAfter = after;
        }
      }
      const decision = { action, values, heat: bestAfter && net.heat(bestAfter) };
      if (detail) decision.detail = { plies, searched: leaves, gained: gains, outcomes: rows };
      return decision;
    },
  };
}
