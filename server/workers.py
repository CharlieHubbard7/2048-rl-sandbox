"""Background threads for training and benchmarking, plus the bookkeeping
that turns their raw output into something a chart can draw."""
import threading
from collections import deque

import numpy as np

from rl2048.arena import benchmark


class Trainer(threading.Thread):
    """Pulls episodes from an agent's train() generator until told to stop."""

    def __init__(self, agent):
        super().__init__(daemon=True, name=f"train-{agent.name}")
        self.agent = agent
        self.stopping = threading.Event()
        self.error = None
        self._lock = threading.Lock()
        self._pending = []

    def run(self):
        try:
            for stats in self.agent.train():
                with self._lock:
                    self._pending.append(stats)
                if self.stopping.is_set():
                    return
        except Exception as e:  # surface crashes in the UI, not a silent dead thread
            self.error = f"{type(e).__name__}: {e}"

    def stop(self):
        self.stopping.set()

    def drain(self):
        with self._lock:
            batch, self._pending = self._pending, []
        return batch


class TrainingLog:
    """Rolling stats over the last `window` episodes, emitted as chart points."""

    MAX_POINTS = 4000

    def __init__(self, window=100):
        self.episodes = 0
        self.scores = deque(maxlen=window)
        self.tiles = deque(maxlen=window)
        self.points = []

    def add(self, batch):
        if not batch:
            return None
        for s in batch:
            self.episodes += 1
            self.scores.append(s["score"])
            self.tiles.append(s["max_tile"])
        last = batch[-1]
        point = {
            "episode": self.episodes,
            "score": float(np.mean(self.scores)),
            "best_tile": int(max(self.tiles)),
            "win_rate": float(np.mean(np.array(self.tiles) >= 2048)),
            "loss": last.get("loss"),
            "epsilon": last.get("epsilon"),
            "entropy": last.get("entropy"),
        }
        self.points.append(point)
        if len(self.points) > self.MAX_POINTS:
            # Halve the resolution of old history instead of dropping it.
            self.points = self.points[::2]
        return point


class BenchmarkRunner(threading.Thread):
    def __init__(self, agents, games, report):
        super().__init__(daemon=True, name="benchmark")
        self.agents, self.games, self.report = agents, games, report

    def run(self):
        for agent in self.agents:
            def progress(done, _result, name=agent.name):
                self.report({"type": "benchmark", "agent": name, "done": done, "games": self.games})

            result = benchmark(agent, self.games, on_game=progress)
            self.report({"type": "benchmark", "agent": agent.name, "result": result})
        self.report({"type": "benchmark", "finished": True})
