// Port of HeuristicAgent in rl2048/agents/baseline.py: a greedy one-move
// lookahead over a hand-tuned evaluation. No learning, no weights.
import { DIRECTIONS, move } from "../engine.js";

// Weights along a snake path from the top-left corner. Rewarding big tiles
// early on the path keeps the largest tile pinned in the corner with a
// descending chain behind it, which keeps merges available.
const SNAKE = [15, 14, 13, 12, 8, 9, 10, 11, 7, 6, 5, 4, 0, 1, 2, 3];
export const POSITION_WEIGHTS = SNAKE.map((s) => 0.8 ** (15 - s));

// The four ingredients of the evaluation, before they are weighted.
export function terms(board) {
  let position = 0;
  let empty = 0;
  let pairs = 0;
  let rough = 0;
  for (let i = 0; i < 16; i++) {
    const v = board[i];
    position += POSITION_WEIGHTS[i] * v;
    if (v === 0) empty++;
    // Each cell checks its right and lower neighbour.
    for (const j of [i % 4 < 3 ? i + 1 : -1, i < 12 ? i + 4 : -1]) {
      if (j < 0) continue;
      if (v > 0 && v === board[j]) pairs++;
      rough += Math.abs(v - board[j]);
    }
  }
  return { position, empty, pairs, rough };
}

export const WEIGHTS = { position: 2, empty: 1.5, pairs: 0.5, rough: -0.1 };

export function evaluate(board) {
  const { position, empty, pairs, rough } = terms(board);
  return 2 * position + 1.5 * empty + 0.5 * pairs - 0.1 * rough;
}

export const heuristicAgent = {
  kind: "value",
  decide(board, { detail = false } = {}) {
    const values = [null, null, null, null];
    let best = -1;
    let bestAfter = null;
    for (const dir of DIRECTIONS) {
      const { after, moved } = move(board, dir);
      if (!moved) continue;
      values[dir] = evaluate(after);
      if (best < 0 || values[dir] > values[best]) {
        best = dir;
        bestAfter = after;
      }
    }
    const heat = bestAfter && Array.from(bestAfter, (v, i) => v * POSITION_WEIGHTS[i]);
    const decision = { action: best, values, heat };
    if (detail) {
      decision.detail = {
        weights: WEIGHTS,
        terms: DIRECTIONS.map((dir) => (values[dir] === null ? null : terms(move(board, dir).after))),
      };
    }
    return decision;
  },
};
