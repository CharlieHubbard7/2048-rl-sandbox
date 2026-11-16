"""Core 2048 mechanics on exponent-encoded boards.

A board is a (4, 4) uint8 array where 0 is empty and k means the tile 2**k.
Every move is reduced to "slide rows left" with flips/transposes, and sliding
is one table lookup: a row packs into a 16-bit index (4 bits per cell), so all
65536 possible rows are solved once at import time.

All functions accept a leading batch dimension, i.e. (..., 4, 4).
"""
import numpy as np

UP, DOWN, LEFT, RIGHT = range(4)
ACTIONS = ("up", "down", "left", "right")

# 4 bits per cell caps us at 2**15 = 32768. Merging two of those saturates
# rather than overflowing into the neighbouring cell.
MAX_EXP = 15

_PACK = np.array([1 << 12, 1 << 8, 1 << 4, 1], dtype=np.int32)


def _build_row_tables():
    rows = np.zeros((1 << 16, 4), dtype=np.uint8)
    gains = np.zeros(1 << 16, dtype=np.int32)
    for idx in range(1 << 16):
        tiles = [t for t in ((idx >> s) & 0xF for s in (12, 8, 4, 0)) if t]
        out, gain, i = [], 0, 0
        while i < len(tiles):
            # Each tile merges at most once per move, so we skip past both.
            if i + 1 < len(tiles) and tiles[i] == tiles[i + 1]:
                out.append(min(tiles[i] + 1, MAX_EXP))
                gain += 1 << (tiles[i] + 1)
                i += 2
            else:
                out.append(tiles[i])
                i += 1
        rows[idx, : len(out)] = out
        gains[idx] = gain
    return rows, gains


_ROW_LEFT, _ROW_GAIN = _build_row_tables()


def _slide_left(board):
    idx = board.astype(np.int32) @ _PACK
    return _ROW_LEFT[idx], _ROW_GAIN[idx].sum(axis=-1)


def _orient(board, action):
    """View the board so that `action` becomes a left slide."""
    if action == LEFT:
        return board
    if action == RIGHT:
        return board[..., ::-1]
    if action == UP:
        return board.swapaxes(-1, -2)
    return board.swapaxes(-1, -2)[..., ::-1]


def _unorient(board, action):
    if action == LEFT:
        return board
    if action == RIGHT:
        return board[..., ::-1]
    if action == UP:
        return board.swapaxes(-1, -2)
    return board[..., ::-1].swapaxes(-1, -2)


def move(board, action):
    """Slide without spawning. Returns (afterstate, reward)."""
    slid, reward = _slide_left(_orient(board, action))
    return np.ascontiguousarray(_unorient(slid, action)), reward


def all_moves(board):
    """Afterstates for every action: shapes (..., 4, 4, 4) and (..., 4)."""
    results = [move(board, a) for a in range(4)]
    afters = np.stack([r[0] for r in results], axis=-3)
    rewards = np.stack([r[1] for r in results], axis=-1)
    return afters, rewards


def valid_mask(board, afters=None):
    if afters is None:
        afters, _ = all_moves(board)
    return (afters != board[..., None, :, :]).any(axis=(-1, -2))


def is_game_over(board):
    return not valid_mask(board).any()


def spawn_tile(board, rng):
    """Drop a 2 (90%) or 4 (10%) into a random empty cell, in place."""
    empties = np.flatnonzero(board == 0)
    if empties.size:
        board.flat[rng.choice(empties)] = 1 if rng.random() < 0.9 else 2
    return board


def new_board(rng):
    board = np.zeros((4, 4), dtype=np.uint8)
    spawn_tile(board, rng)
    spawn_tile(board, rng)
    return board


def encode(tiles):
    """Tile values (2, 4, 8, ...) -> exponent board."""
    tiles = np.asarray(tiles, dtype=np.int64)
    out = np.zeros(tiles.shape, dtype=np.uint8)
    nz = tiles > 0
    out[nz] = np.log2(tiles[nz]).astype(np.uint8)
    return out


def decode(board):
    board = np.asarray(board, dtype=np.int64)
    return np.where(board > 0, 1 << board, 0)
