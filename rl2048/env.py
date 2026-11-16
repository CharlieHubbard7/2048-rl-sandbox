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
