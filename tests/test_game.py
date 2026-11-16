import numpy as np
import pytest

from rl2048 import game
from rl2048.env import Game
from rl2048.game import DOWN, LEFT, RIGHT, UP


def slide_row(tiles, action=LEFT):
    board = game.encode([tiles, [0] * 4, [0] * 4, [0] * 4])
    after, reward = game.move(board, action)
    return list(game.decode(after)[0]), int(reward)


@pytest.mark.parametrize(
    "row, expected, reward",
    [
        ([2, 2, 0, 0], [4, 0, 0, 0], 4),
        ([2, 2, 2, 2], [4, 4, 0, 0], 8),
        ([2, 2, 4, 0], [4, 4, 0, 0], 4),  # the new 4 must not merge again
        ([4, 0, 4, 4], [8, 4, 0, 0], 8),  # leftmost pair merges first
        ([2, 4, 8, 16], [2, 4, 8, 16], 0),
        ([0, 0, 0, 2], [2, 0, 0, 0], 0),
    ],
)
def test_slide_left(row, expected, reward):
    assert slide_row(row) == (expected, reward)


def test_slide_right_merges_from_the_right():
    assert slide_row([4, 4, 4, 0], RIGHT) == ([0, 0, 4, 8], 8)


def test_vertical_moves():
    board = game.encode([[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0]])
    up, _ = game.move(board, UP)
    down, _ = game.move(board, DOWN)
    assert list(game.decode(up)[:, 0]) == [4, 4, 0, 0]
    assert list(game.decode(down)[:, 0]) == [0, 0, 4, 4]


def test_move_does_not_mutate_input():
    board = game.encode([[2, 2, 0, 0]] * 4)
    snapshot = board.copy()
    for a in range(4):
        game.move(board, a)
    assert np.array_equal(board, snapshot)


def test_valid_mask_and_game_over():
    stuck = game.encode([[2, 4, 2, 4], [4, 2, 4, 2]] * 2)
    assert not game.valid_mask(stuck).any()
    assert game.is_game_over(stuck)

    only_down = game.encode([[2, 4, 8, 16], [0, 0, 0, 0], [0] * 4, [0] * 4])
    assert list(game.valid_mask(only_down)) == [False, True, False, False]


def test_batched_moves_match_single():
    rng = np.random.default_rng(0)
    boards = rng.integers(0, 5, size=(32, 4, 4), dtype=np.uint8)
    afters, rewards = game.all_moves(boards)
    for i, b in enumerate(boards):
        for a in range(4):
            single, r = game.move(b, a)
            assert np.array_equal(afters[i, a], single)
            assert rewards[i, a] == r


def test_max_tile_saturates_instead_of_overflowing():
    board = game.encode([[32768, 32768, 0, 0], [0] * 4, [0] * 4, [0] * 4])
    after, _ = game.move(board, LEFT)
    assert after[0, 0] == game.MAX_EXP
    assert after[0, 1] == 0


def test_spawn_distribution():
    rng = np.random.default_rng(1)
    values = [game.spawn_tile(np.zeros((4, 4), np.uint8), rng).max() for _ in range(5000)]
    assert 0.87 < np.mean(np.array(values) == 1) < 0.93


def test_game_step_scores_and_spawns():
    g = Game(seed=3)
    g.board = game.encode([[2, 2, 0, 0], [0] * 4, [0] * 4, [0] * 4])
    board, reward, done, info = g.step(LEFT)
    assert info["valid"] and reward == 4 and not done
    assert np.count_nonzero(board) == 2  # merged 4 + one spawn
    assert g.score == 4


def test_game_ignores_invalid_moves():
    g = Game(seed=0)
    g.board = game.encode([[2, 4, 8, 16], [0] * 4, [0] * 4, [0] * 4])
    before = g.board.copy()
    _, reward, _, info = g.step(UP)
    assert not info["valid"] and reward == 0
    assert np.array_equal(g.board, before)
