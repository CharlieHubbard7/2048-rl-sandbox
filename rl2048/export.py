"""Export assets for the browser: parity fixtures for the JavaScript tests.

    python -m rl2048.export fixtures

The fixtures pin the JS port to this implementation: the Node tests replay
the same boards and must get identical results.
"""

import argparse
import json
from pathlib import Path

import numpy as np

from . import game

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "js" / "fixtures"


def random_boards(n, rng):
    # Mostly sparse, low boards like real play, plus some crowded and
    # saturated ones to cover the edge cases.
    boards = rng.integers(0, 12, size=(n, 4, 4), dtype=np.uint8)
    boards[rng.random((n, 4, 4)) < 0.4] = 0
    boards[: n // 10] = rng.integers(13, 16, size=(n // 10, 4, 4), dtype=np.uint8)
    return boards


def export_engine_fixtures(n=400, seed=0):
    boards = random_boards(n, np.random.default_rng(seed))
    afters, rewards = game.all_moves(boards)
    cases = [
        {
            "board": b.ravel().tolist(),
            "after": [a.ravel().tolist() for a in after],
            "reward": r.tolist(),
            "legal": game.valid_mask(b).tolist(),
        }
        for b, after, r in zip(boards, afters, rewards, strict=True)
    ]
    write_json(FIXTURES / "engine.json", cases)


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":")))
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB)")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("what", choices=["fixtures"])
    parser.parse_args()
    export_engine_fixtures()


if __name__ == "__main__":
    main()
