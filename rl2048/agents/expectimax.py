"""Expectimax search with a learned afterstate value at the leaves.

The leaf evaluator is the N-tuple network: it already scores afterstates in
raw game points, so `reward + V(afterstate)` is on one consistent scale.
(The DQN/PPO critics are trained on log-shaped rewards and on states, not
afterstates, so they can't be dropped in without a calibration step.)

Each tree level is evaluated as one batched numpy call rather than node by
node, which is what makes depth 2 affordable in Python.
"""
import numpy as np

from .. import game
from .base import BaseAgent, Decision, masked_argmax, with_nans


def expand_spawns(afters):
    """Every (cell, 2-or-4) spawn outcome of each afterstate.

    Returns children (K, 4, 4), the parent index of each child, and the
    probability of that child given its parent.
    """
    flat = afters.reshape(len(afters), 16)
    parent, cell = np.nonzero(flat == 0)
    n_empty = np.bincount(parent, minlength=len(afters))

    parent, cell = np.repeat(parent, 2), np.repeat(cell, 2)
    tile = np.tile(np.array([1, 2], np.uint8), len(parent) // 2)
    prob = np.tile([0.9, 0.1], len(parent) // 2) / n_empty[parent]

    children = flat[parent].copy()
    children[np.arange(len(children)), cell] = tile
    return children.reshape(-1, 4, 4), parent, prob


class ExpectimaxAgent(BaseAgent):
    name = "expectimax"

    def __init__(self, leaf, depth=1, deep_below_empty=4):
        self.leaf = leaf
        self.depth = depth
        # Crowded boards are both the most dangerous and the cheapest to
        # search (few spawn cells), so that's where an extra ply pays off.
        self.deep_below_empty = deep_below_empty

    def _chance(self, afters, depth):
        if depth == 0:
            return self.leaf.value(afters)
        children, parent, prob = expand_spawns(afters)
        return np.bincount(parent, weights=prob * self._max(children, depth - 1),
                           minlength=len(afters))

    def _max(self, boards, depth):
        afters, rewards = game.all_moves(boards)
        mask = game.valid_mask(boards, afters)
        q = np.full(mask.shape, -np.inf)
        q[mask] = rewards[mask] + self._chance(afters[mask], depth)
        best = q.max(axis=1)
        best[~mask.any(axis=1)] = 0.0  # game over: no future value
        return best

    def search(self, board):
        afters, rewards = game.all_moves(board)
        mask = game.valid_mask(board, afters)
        depth = self.depth + (np.count_nonzero(board == 0) < self.deep_below_empty)
        q = np.full(4, -np.inf)
        q[mask] = rewards[mask] + self._chance(afters[mask], depth)
        return afters, mask, q

    def act(self, board):
        _, mask, q = self.search(board)
        return masked_argmax(q, mask)

    def decide(self, board):
        afters, mask, q = self.search(board)
        action = masked_argmax(q, mask)
        heat = self.leaf.heatmap(afters[action]) if hasattr(self.leaf, "heatmap") else None
        return Decision(action, with_nans(q, mask), "value", heat)
