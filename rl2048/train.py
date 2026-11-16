"""Headless training from the command line.

    python -m rl2048.train ntuple --minutes 10

Checkpoints land in checkpoints/ with the same naming the sandbox uses, so
the server picks up the newest one automatically on its next start.
"""
import argparse
import time
from collections import deque
from pathlib import Path

import numpy as np

from .agents import build_agents

CHECKPOINTS = Path(__file__).resolve().parent.parent / "checkpoints"


def main():
    agents = {n: a for n, a in build_agents().items() if a.trainable}
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("agent", choices=sorted(agents))
    parser.add_argument("--minutes", type=float, default=5.0)
    parser.add_argument("--resume", type=Path, help="checkpoint to continue from")
    parser.add_argument("--seed", type=int, default=None)
    args = parser.parse_args()

    agent = agents[args.agent]
    if args.resume:
        agent.load(args.resume)

    scores, tiles = deque(maxlen=100), deque(maxlen=100)
    deadline = time.time() + args.minutes * 60
    last_report = time.time()
    try:
        for episode, stats in enumerate(agent.train(seed=args.seed), start=1):
            scores.append(stats["score"])
            tiles.append(stats["max_tile"])
            if time.time() - last_report > 10:
                last_report = time.time()
                print(f"episode {episode:>7}  avg {np.mean(scores):>8.0f}  "
                      f"2048 rate {np.mean(np.array(tiles) >= 2048):5.1%}  best tile {max(tiles)}")
            if time.time() > deadline:
                break
    except KeyboardInterrupt:
        print("\nstopping early")

    CHECKPOINTS.mkdir(exist_ok=True)
    path = CHECKPOINTS / f"{agent.name}-{time.strftime('%Y%m%d-%H%M%S')}{agent.checkpoint_ext}"
    agent.save(path)
    print(f"saved {path}")


if __name__ == "__main__":
    main()
