import pickle
from dataclasses import dataclass

import numpy as np


@dataclass
class Decision:
    """A chosen move plus what went into choosing it."""

    action: int
    values: np.ndarray  # one number per action; NaN marks an illegal move
    kind: str = "value"  # "q" | "prob" | "value": how the bars are labelled
    heatmap: np.ndarray | None = None  # (4, 4) cell importance, any scale


class BaseAgent:
    name = "base"
    trainable = False
    checkpoint_ext = ".pkl"

    def decide(self, board) -> Decision:
        raise NotImplementedError

    def act(self, board):
        return self.decide(board).action

    def train(self, seed=None):
        """Generator yielding a stats dict per finished training episode
        ({"score", "max_tile"} plus optional "loss", "epsilon"). Training
        runs exactly as long as the caller keeps pulling."""
        raise NotImplementedError(f"{self.name} has nothing to train")
        yield  # pragma: no cover

    def state_dict(self):
        return {}

    def load_state_dict(self, state):
        pass

    def save(self, path):
        with open(path, "wb") as f:
            pickle.dump(self.state_dict(), f)

    def load(self, path):
        with open(path, "rb") as f:
            self.load_state_dict(pickle.load(f))


def masked_argmax(values, mask):
    return int(np.where(mask, values, -np.inf).argmax())


def with_nans(values, mask):
    out = np.asarray(values, dtype=np.float64).copy()
    out[~mask] = np.nan
    return out
