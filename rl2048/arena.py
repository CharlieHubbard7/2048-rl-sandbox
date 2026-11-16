"""Head-to-head evaluation of agents over many seeded games."""

from collections import Counter

import numpy as np

from .env import Game


def play_episode(agent, seed=None, max_moves=100_000):
    g = Game(seed)
    while not g.done and g.moves < max_moves:
        g.step(agent.act(g.board))
    return {"score": g.score, "max_tile": g.max_tile, "moves": g.moves}


def benchmark(agent, games=100, seed=0, on_game=None):
    # Seeding each game by index means every agent faces identical tile spawns
    # as long as it makes identical moves, which keeps comparisons fair.
    results = []
    for i in range(games):
        results.append(play_episode(agent, seed=seed + i))
        if on_game:
            on_game(i + 1, results[-1])
    return summarize(results)


def summarize(results):
    scores = np.array([r["score"] for r in results])
    tiles = Counter(r["max_tile"] for r in results)
    return {
        "games": len(results),
        "mean_score": float(scores.mean()),
        "median_score": float(np.median(scores)),
        "best_score": int(scores.max()),
        "win_rate": float(np.mean([r["max_tile"] >= 2048 for r in results])),
        "tiles": {str(k): tiles[k] for k in sorted(tiles)},
    }
