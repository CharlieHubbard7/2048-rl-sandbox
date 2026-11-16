"""N-tuple network trained with TD(0) on afterstates.

The value of an afterstate is a sum of lookup-table weights, one per
(pattern, symmetry) pair, indexed by the tile exponents under that pattern.
It's a linear function over a huge sparse feature space, which is why it
learns 2048 so much faster than a neural net: each update touches only the
32 weights that actually describe the board.
"""
import numpy as np

from .. import game
from .base import BaseAgent, Decision, masked_argmax, with_nans

# The 4x6-tuple layout from Yeh et al. (2016), as cell indices 0..15 row-major.
PATTERNS = [
    (0, 1, 2, 3, 4, 5),
    (4, 5, 6, 7, 8, 9),
    (0, 1, 2, 4, 5, 6),
    (4, 5, 6, 8, 9, 10),
]


def _symmetries():
    grid = np.arange(16).reshape(4, 4)
    for k in range(4):
        rotated = np.rot90(grid, k)
        yield rotated.ravel()
        yield rotated.T.ravel()


# Sharing weights across all 8 rotations/reflections means one game teaches
# the network about every orientation at once.
CELLS = np.array([sym[list(p)] for p in PATTERNS for sym in _symmetries()])
TABLE_OF = np.repeat(np.arange(len(PATTERNS)), 8)
_POW = 16 ** np.arange(5, -1, -1)


def features(boards):
    flat = boards.reshape(*boards.shape[:-2], 16).astype(np.int64)
    return flat[..., CELLS] @ _POW


class NTupleAgent(BaseAgent):
    name = "ntuple"
    trainable = True

    def __init__(self, alpha=0.1):
        self.alpha = alpha
        self.lut = np.zeros((len(PATTERNS), 16**6), dtype=np.float32)
        self.episodes = 0

    def value(self, boards):
        return self.lut[TABLE_OF, features(boards)].sum(axis=-1)

    def _evaluate(self, board):
        afters, rewards = game.all_moves(board)
        mask = game.valid_mask(board, afters)
        return afters, rewards, mask, rewards + self.value(afters)

    def decide(self, board):
        afters, _, mask, q = self._evaluate(board)
        action = masked_argmax(q, mask)
        return Decision(action, with_nans(q, mask), "value", self.heatmap(afters[action]))

    def heatmap(self, board):
        # Spread each active weight evenly over the cells its tuple covers.
        weights = self.lut[TABLE_OF, features(board)]
        return np.bincount(
            CELLS.ravel(), weights=np.repeat(weights / CELLS.shape[1], CELLS.shape[1]), minlength=16
        ).reshape(4, 4)

    def train(self, seed=None):
        rng = np.random.default_rng(seed)
        while True:
            board = game.new_board(rng)
            path, score = [], 0
            while True:
                afters, rewards, mask, q = self._evaluate(board)
                if not mask.any():
                    break
                a = masked_argmax(q, mask)
                path.append((afters[a].copy(), float(rewards[a])))
                score += int(rewards[a])
                board = game.spawn_tile(afters[a].copy(), rng)

            loss = self._learn(path)
            self.episodes += 1
            yield {"score": score, "max_tile": 1 << int(board.max()), "loss": loss}

    def _learn(self, path):
        # Sweeping backwards from the terminal state lets the game's outcome
        # reach every earlier afterstate in a single pass, instead of creeping
        # back one step per episode as forward TD(0) would.
        step = self.alpha / len(CELLS)
        target, errors = 0.0, []
        for after, reward in reversed(path):
            idx = (TABLE_OF, features(after))
            err = target - self.lut[idx].sum()
            np.add.at(self.lut, idx, step * err)
            target = reward + self.lut[idx].sum()
            errors.append(abs(err))
        return float(np.mean(errors)) if errors else 0.0

    def state_dict(self):
        # The table is mostly zeros, so store it sparsely.
        flat = self.lut.ravel()
        nz = np.flatnonzero(flat)
        return {"alpha": self.alpha, "episodes": self.episodes,
                "index": nz.astype(np.int64), "weight": flat[nz]}

    def load_state_dict(self, state):
        self.alpha = state["alpha"]
        self.episodes = state["episodes"]
        self.lut[:] = 0
        self.lut.ravel()[state["index"]] = state["weight"]
