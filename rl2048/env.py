"""Stateful wrappers around the pure functions in `game`."""
import numpy as np

from . import game


class Game:
    """A single game, as played by a human or an agent."""

    def __init__(self, seed=None):
        self.rng = np.random.default_rng(seed)
        self.reset()

    def reset(self):
        self.board = game.new_board(self.rng)
        self.score = 0
        self.moves = 0
        self.done = False
        return self.board.copy()

    @property
    def max_tile(self):
        return 1 << int(self.board.max())

    def valid_actions(self):
        return game.valid_mask(self.board)

    def step(self, action):
        after, reward = game.move(self.board, action)
        if np.array_equal(after, self.board):
            # Illegal moves are no-ops in real 2048: no spawn, no reward.
            return self.board.copy(), 0, self.done, {"valid": False}

        self.board = game.spawn_tile(after, self.rng)
        self.score += int(reward)
        self.moves += 1
        self.done = game.is_game_over(self.board)
        return self.board.copy(), int(reward), self.done, {"valid": True}


class BatchEnv:
    """N independent games stepped in lockstep, auto-resetting on game over.

    Neural agents learn far faster from a batch of boards per forward pass,
    so this keeps everything as (N, 4, 4) arrays and never loops per game.
    """

    def __init__(self, n, seed=None):
        self.n = n
        self.rng = np.random.default_rng(seed)
        self.boards = np.zeros((n, 4, 4), dtype=np.uint8)
        self.scores = np.zeros(n, dtype=np.int64)
        self._reset(np.arange(n))

    def _spawn(self, idx):
        flat = self.boards[idx].reshape(len(idx), 16)
        # A random key on every empty cell; argmax is a uniform empty pick.
        keys = self.rng.random(flat.shape) * (flat == 0)
        cells = keys.argmax(axis=1)
        values = np.where(self.rng.random(len(idx)) < 0.9, 1, 2).astype(np.uint8)
        flat[np.arange(len(idx)), cells] = values
        self.boards[idx] = flat.reshape(-1, 4, 4)

    def _reset(self, idx):
        self.boards[idx] = 0
        self.scores[idx] = 0
        self._spawn(idx)
        self._spawn(idx)
        self.masks = game.valid_mask(self.boards)

    def step(self, actions):
        """Returns (boards, rewards, dones, info). Finished games are reset
        before returning; their final stats are in info["finished"]."""
        afters, rewards = game.all_moves(self.boards)
        rows = np.arange(self.n)
        after = afters[rows, actions]
        reward = rewards[rows, actions].astype(np.float32)

        moved = np.flatnonzero((after != self.boards).any(axis=(1, 2)))
        self.boards[moved] = after[moved]
        self._spawn(moved)
        self.scores += reward.astype(np.int64)

        self.masks = game.valid_mask(self.boards)
        dones = ~self.masks.any(axis=1)
        finished = []
        if dones.any():
            done_idx = np.flatnonzero(dones)
            for i in done_idx:
                finished.append({"score": int(self.scores[i]),
                                 "max_tile": 1 << int(self.boards[i].max())})
            terminal = self.boards[done_idx].copy()
            self._reset(done_idx)
        else:
            terminal = None
        info = {"finished": finished, "terminal_boards": terminal}
        return self.boards.copy(), reward, dones, info
