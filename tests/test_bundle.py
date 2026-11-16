import numpy as np

from rl2048.bundle import read_bundle, write_bundle


def test_roundtrip_keeps_ints_exact_and_floats_close(tmp_path):
    rng = np.random.default_rng(0)
    weights = rng.normal(size=(7, 5)).astype(np.float32)
    keys = np.array([3, 17, 1 << 23], dtype=np.uint32)
    write_bundle(tmp_path / "m.bin.gz", {"w": weights, "keys": keys}, {"note": "hi"})

    meta, arrays = read_bundle(tmp_path / "m.bin.gz")
    assert meta == {"note": "hi"}
    assert np.array_equal(arrays["keys"], keys)
    assert arrays["w"].shape == (7, 5)
    assert np.abs(arrays["w"] - weights).max() <= np.abs(weights).max() / 32767


def test_ntuple_export_roundtrip(tmp_path):
    from itertools import islice

    from rl2048 import game
    from rl2048.agents.ntuple import NTupleAgent
    from rl2048.export import export_ntuple

    agent = NTupleAgent()
    list(islice(agent.train(seed=0), 5))
    clone = export_ntuple(agent, tmp_path / "nt.bin.gz")

    board = game.encode([[2, 4, 8, 0], [0, 16, 0, 0], [0, 0, 2, 0], [4, 0, 0, 0]])
    assert np.isclose(clone.value(board), agent.value(board), rtol=1e-3, atol=0.05)


def test_pruning_drops_small_weights(tmp_path):
    from rl2048.agents.ntuple import NTupleAgent
    from rl2048.export import export_ntuple

    agent = NTupleAgent()
    agent.lut[0, [5, 9, 12]] = [0.5, 3.0, -4.0]
    clone = export_ntuple(agent, tmp_path / "nt.bin.gz", min_weight=1.0)
    assert np.count_nonzero(clone.lut) == 2
