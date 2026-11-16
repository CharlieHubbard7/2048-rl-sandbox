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


def test_pair_conv_matches_conv2d():
    import torch

    from rl2048.agents.nets import PairConv

    pc, conv = PairConv(3, 5), torch.nn.Conv2d(3, 5, kernel_size=2)
    # Conv2d weights are (out, in, kh, kw); PairConv stacks patches as
    # [top-left, top-right, bottom-left, bottom-right] blocks of channels.
    w = conv.weight.detach()
    pc.linear.weight.data = torch.cat([w[:, :, 0, 0], w[:, :, 0, 1], w[:, :, 1, 0], w[:, :, 1, 1]], 1)
    pc.linear.bias.data = conv.bias.detach().clone()
    x = torch.randn(2, 3, 4, 4)
    assert torch.allclose(pc(x), conv(x), atol=1e-5)


def test_dqn_trains_and_explains(tmp_path):
    from itertools import islice

    from rl2048.agents.dqn import DQNAgent

    agent = DQNAgent(n_envs=8, warmup=256, batch_size=32)
    stats = list(islice(agent.train(seed=0), 3))
    assert stats[-1]["epsilon"] < 1.0

    d = agent.decide(game.encode([[2, 4, 8, 16], [0] * 4, [0] * 4, [0] * 4]))
    assert d.kind == "q" and d.heatmap.shape == (4, 4)
    agent.save(tmp_path / "dqn.pt")
    DQNAgent().load(tmp_path / "dqn.pt")


def test_ppo_masks_illegal_moves_and_updates():
    from itertools import islice

    from rl2048.agents.ppo import PPOAgent

    agent = PPOAgent(n_envs=16, horizon=32, minibatch=128)
    board = game.encode([[2, 4, 8, 16], [0] * 4, [0] * 4, [0] * 4])
    d = agent.decide(board)
    assert d.kind == "prob" and np.isnan(d.values[game.UP])
    assert np.isclose(np.nansum(d.values), 1.0, atol=1e-5)

    stats = list(islice(agent.train(seed=0), 40))
    assert agent.updates >= 1 and stats[-1]["loss"] is not None


def test_spawn_expansion_is_a_distribution():
    from rl2048.agents.expectimax import expand_spawns

    afters = game.encode([
        [[2, 0, 0, 0], [0] * 4, [0] * 4, [0] * 4],
        [[2, 4, 8, 16], [32, 64, 128, 256], [2, 4, 8, 16], [32, 64, 0, 0]],
    ])
    children, parent, prob = expand_spawns(afters)
    assert np.allclose(np.bincount(parent, weights=prob), 1.0)
    assert (np.bincount(parent) == [30, 4]).all()
    assert all(np.count_nonzero(c) == np.count_nonzero(afters[p]) + 1
               for c, p in zip(children, parent))


def test_expectimax_avoids_dead_moves():
    from rl2048.agents.expectimax import ExpectimaxAgent
    from rl2048.agents.ntuple import NTupleAgent

    agent = ExpectimaxAgent(NTupleAgent())
    board = game.encode([[2, 4, 8, 16], [0] * 4, [0] * 4, [0] * 4])
    d = agent.decide(board)
    assert d.action == game.DOWN and np.isnan(d.values[game.UP])
