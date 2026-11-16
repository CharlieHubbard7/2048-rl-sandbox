"""Non-learning reference points: uniform random, and a greedy heuristic."""

import numpy as np

from .. import game
from .base import BaseAgent, Decision, masked_argmax, with_nans


class RandomAgent(BaseAgent):
    name = "random"

    def __init__(self, seed=None):
        self.rng = np.random.default_rng(seed)

    def decide(self, board):
        mask = game.valid_mask(board)
        probs = mask / mask.sum()
        return Decision(int(self.rng.choice(4, p=probs)), with_nans(probs, mask), "prob")


# Positional weights along a snake path from the top-left corner. Rewarding
# big exponents early on the path keeps the largest tile pinned in the corner
# with a descending chain behind it, which is what keeps merges available.
_SNAKE = np.array(
    [[15, 14, 13, 12], [8, 9, 10, 11], [7, 6, 5, 4], [0, 1, 2, 3]],
    dtype=np.float64,
)
POSITION_WEIGHTS = 0.8 ** (15 - _SNAKE)


def position_score(boards):
    return (POSITION_WEIGHTS * boards).sum(axis=(-1, -2))


def heuristic(boards):
    v = boards.astype(np.float64)
    empty = (boards == 0).sum(axis=(-1, -2))

    # Adjacent equal tiles are future merges; count them in both directions.
    pairs = ((v[..., :, 1:] == v[..., :, :-1]) & (v[..., :, 1:] > 0)).sum(axis=(-1, -2))
    pairs += ((v[..., 1:, :] == v[..., :-1, :]) & (v[..., 1:, :] > 0)).sum(axis=(-1, -2))

    # Big jumps between neighbours are hard to ever merge away.
    rough = np.abs(np.diff(v, axis=-1)).sum(axis=(-1, -2))
    rough += np.abs(np.diff(v, axis=-2)).sum(axis=(-1, -2))

    return 2.0 * position_score(v) + 1.5 * empty + 0.5 * pairs - 0.1 * rough


class HeuristicAgent(BaseAgent):
    """One-ply greedy search over a hand-tuned evaluation."""

    name = "heuristic"

    def decide(self, board):
        afters, _ = game.all_moves(board)
        mask = game.valid_mask(board, afters)
        scores = heuristic(afters)
        action = masked_argmax(scores, mask)
        heat = POSITION_WEIGHTS * afters[action]
        return Decision(action, with_nans(scores, mask), "value", heat)
