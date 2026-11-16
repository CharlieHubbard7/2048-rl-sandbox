"""Export assets for the browser.

    python -m rl2048.export fixtures   # engine/heuristic parity fixtures
    python -m rl2048.export models     # weights from the newest checkpoints

Model exports also write parity fixtures computed from the *exported*
(quantised) weights, so the JavaScript tests check the port itself rather
than the quantisation.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import torch

from . import game
from .agents.baseline import HeuristicAgent, heuristic
from .agents.dqn import DQNAgent
from .agents.expectimax import ExpectimaxAgent
from .agents.ntuple import CELLS, PATTERNS, TABLE_OF, NTupleAgent
from .agents.ppo import PPOAgent
from .bundle import read_bundle, write_bundle

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "js" / "fixtures"
MODELS = ROOT / "site" / "models"
CHECKPOINTS = ROOT / "checkpoints"


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":")))
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB)")


def rounded(values, legal=None):
    """Values as a JSON list, with None where a move is illegal."""
    legal = [True] * len(values) if legal is None else legal
    return [round(float(v), 4) if ok else None for v, ok in zip(values, legal, strict=True)]


# ---- engine fixtures ---------------------------------------------------------


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
            "heuristic": [round(float(h), 6) for h in heuristic(after)],
        }
        for b, after, r in zip(boards, afters, rewards, strict=True)
    ]
    write_json(FIXTURES / "engine.json", cases)


def realistic_boards(n, seed=0):
    """Positions from real games, which exercise the trained weights far
    better than random boards do."""
    from .env import Game

    boards, agent, rng = [], HeuristicAgent(), np.random.default_rng(seed)
    while len(boards) < n:
        g = Game(int(rng.integers(1 << 31)))
        while not g.done:
            if rng.random() < 0.05:
                boards.append(g.board.copy())
            g.step(agent.act(g.board))
    return np.array(boards[:n])


# ---- n-tuple ---------------------------------------------------------------


def latest_checkpoint(name, ext):
    files = sorted(CHECKPOINTS.glob(f"{name}-*{ext}"))
    if not files:
        raise SystemExit(f"No {name} checkpoint found. Train one with: python -m rl2048.train {name}")
    return files[-1]


def export_ntuple(min_weight=0.0):
    agent = NTupleAgent()
    agent.load(latest_checkpoint("ntuple", ".pkl"))
    arrays = {}
    for t in range(len(PATTERNS)):
        keys = np.flatnonzero(np.abs(agent.lut[t]) > min_weight)
        # Sorted keys are stored as gaps, which are small and compress well.
        arrays[f"keys{t}"] = np.diff(keys, prepend=0).astype(np.uint32)
        arrays[f"values{t}"] = agent.lut[t][keys]
    meta = {"cells": CELLS.tolist(), "table_of": TABLE_OF.tolist(), "episodes": agent.episodes}
    path = MODELS / "ntuple.bin.gz"
    MODELS.mkdir(parents=True, exist_ok=True)
    write_bundle(path, arrays, meta)
    kept = sum(len(a) for k, a in arrays.items() if k.startswith("keys"))
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1e6:.2f} MB, {kept:,} weights)")
    return load_ntuple(path)


def load_ntuple(path):
    _, arrays = read_bundle(path)
    agent = NTupleAgent()
    for t in range(len(PATTERNS)):
        keys = np.cumsum(arrays[f"keys{t}"], dtype=np.int64)
        agent.lut[t][keys] = arrays[f"values{t}"]
    return agent


def export_ntuple_fixtures(agent, boards):
    search = ExpectimaxAgent(agent)
    cases = []
    for b in boards:
        afters, _ = game.all_moves(b)
        mask = game.valid_mask(b, afters)
        _, _, q = search.search(b)
        cases.append(
            {
                "board": b.ravel().tolist(),
                "values": rounded(agent.value(afters)),
                "search": rounded(q, mask),
            }
        )
    write_json(FIXTURES / "ntuple.json", cases)


# ---- neural nets ---------------------------------------------------------


def export_net(name, agent_cls):
    agent = agent_cls()
    agent.load(latest_checkpoint(name, ".pt"))
    weights = {k: v.detach().numpy() for k, v in agent.net.state_dict().items()}
    path = MODELS / f"{name}.bin.gz"
    write_bundle(path, weights)
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1e3:.0f} KB)")

    # Reference outputs come from the dequantised weights the browser gets.
    _, arrays = read_bundle(path)
    agent.net.load_state_dict({k: torch.from_numpy(arrays[k].copy()) for k in weights})
    return agent


def export_net_fixtures(dqn, ppo, boards):
    cases = []
    for b in boards:
        mask = game.valid_mask(b)
        probs, value = ppo.policy(b[None], mask[None])
        cases.append(
            {
                "board": b.ravel().tolist(),
                "q": rounded(dqn.q_values(b[None])[0]),
                "probs": rounded(probs[0], mask),
                "value": round(float(value[0]), 4),
            }
        )
    write_json(FIXTURES / "nets.json", cases)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("what", choices=["fixtures", "models"])
    parser.add_argument(
        "--min-weight", type=float, default=0.0, help="drop n-tuple weights at or below this size"
    )
    args = parser.parse_args()

    if args.what == "fixtures":
        export_engine_fixtures()
        return
    boards = realistic_boards(60)
    export_ntuple_fixtures(export_ntuple(args.min_weight), boards)
    export_net_fixtures(export_net("dqn", DQNAgent), export_net("ppo", PPOAgent), boards)


if __name__ == "__main__":
    main()
