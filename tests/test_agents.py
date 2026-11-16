import numpy as np

from rl2048 import game
from rl2048.agents.baseline import HeuristicAgent, RandomAgent
from rl2048.arena import benchmark


def test_decisions_never_pick_illegal_moves():
    board = game.encode([[2, 4, 8, 16], [0] * 4, [0] * 4, [0] * 4])
    for agent in (RandomAgent(0), HeuristicAgent()):
        d = agent.decide(board)
        assert d.action == game.DOWN
        assert np.isnan(d.values[game.UP])


def test_heuristic_beats_random():
    rand = benchmark(RandomAgent(0), games=10)
    heur = benchmark(HeuristicAgent(), games=10)
    assert heur["mean_score"] > 3 * rand["mean_score"]
