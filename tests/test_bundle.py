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
