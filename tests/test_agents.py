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


def test_ntuple_value_is_symmetric_and_learns():
    from itertools import islice

    from rl2048.agents.ntuple import NTupleAgent

    agent = NTupleAgent()
    stats = list(islice(agent.train(seed=0), 20))
    assert all(s["score"] > 0 for s in stats)

    board = game.encode([[2, 4, 8, 0], [0, 16, 0, 0], [0, 0, 2, 0], [4, 0, 0, 0]])
    v = agent.value(board)
    assert v != 0
    for k in range(4):
        rotated = np.rot90(board, k)
        assert np.isclose(agent.value(rotated), v, rtol=1e-5)
        assert np.isclose(agent.value(rotated.T), v, rtol=1e-5)


def test_ntuple_checkpoint_roundtrip(tmp_path):
    from itertools import islice

    from rl2048.agents.ntuple import NTupleAgent

    agent = NTupleAgent()
    list(islice(agent.train(seed=1), 5))
    agent.save(tmp_path / "nt.pkl")
    clone = NTupleAgent()
    clone.load(tmp_path / "nt.pkl")
    assert np.array_equal(agent.lut, clone.lut)
