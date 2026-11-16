"""State for one local sandbox: the live game, the agent driving it, and the
background workers. Every connected browser tab sees the same sandbox."""
import asyncio
import time
from pathlib import Path

import numpy as np

from rl2048 import game
from rl2048.agents import build_agents
from rl2048.env import Game

from .workers import BenchmarkRunner, Trainer, TrainingLog

CHECKPOINTS = Path(__file__).resolve().parent.parent / "checkpoints"
MOVE_DELAY = {"1x": 0.25, "10x": 0.025, "max": 0.0}
HEADLESS_FRAME = 0.1  # seconds of uninterrupted play between renders at max speed

INFO = {
    "random": ("Random", "Uniform over legal moves. The floor."),
    "heuristic": ("Heuristic", "Greedy 1-ply: snake-corner weights, empty cells, merge pairs."),
    "ntuple": ("N-Tuple TD", "4x6-tuple network, TD(0) on afterstates. Learns fast."),
    "dqn": ("DQN", "Double DQN, one-hot CNN, replay + Polyak target net."),
    "ppo": ("PPO", "Masked actor-critic with GAE. Bars are action probabilities."),
    "expectimax": ("Expectimax", "Searches tile spawns, scores leaves with the N-Tuple net."),
}


def _num(x):
    return None if x is None or not np.isfinite(x) else round(float(x), 4)


def decision_json(d):
    if d is None:
        return None
    return {
        "action": d.action,
        "kind": d.kind,
        "values": [_num(v) for v in d.values],
        "heatmap": None if d.heatmap is None else np.round(np.asarray(d.heatmap, float), 4).tolist(),
    }


class Sandbox:
    def __init__(self):
        self.agents = build_agents()
        self.logs = {name: TrainingLog() for name in self.agents}
        self.game = Game()
        self.agent_name = "heuristic"
        self.speed = "10x"
        self.playing = False
        self.decision = None
        self.last_action = None  # lets the client animate single moves
        self._decision_key = None
        self.trainer = None
        self.bench = None
        self.clients = set()
        CHECKPOINTS.mkdir(exist_ok=True)
        for name in self.agents:
            if files := self.checkpoints(name):
                self.agents[name].load(CHECKPOINTS / files[0])

    @property
    def agent(self):
        return self.agents[self.agent_name]

    def start(self):
        self.loop = asyncio.get_running_loop()
        self._ticker = asyncio.create_task(self._training_ticker())

    # -- messaging ---------------------------------------------------------

    async def broadcast(self, msg):
        for ws in list(self.clients):
            try:
                await ws.send_json(msg)
            except Exception:
                self.clients.discard(ws)

    def report(self, msg):
        """Thread-safe broadcast for worker threads."""
        asyncio.run_coroutine_threadsafe(self.broadcast(msg), self.loop)

    async def connect(self, ws):
        self.clients.add(ws)
        await ws.send_json(self.agents_msg())
        for name, log in self.logs.items():
            if log.points:
                await ws.send_json({"type": "train_history", "agent": name, "points": log.points})
        await self.send_state()

    def agents_msg(self):
        return {
            "type": "agents",
            "agents": [
                {"name": n, "label": INFO[n][0], "blurb": INFO[n][1],
                 "trainable": a.trainable, "checkpoints": self.checkpoints(n)}
                for n, a in self.agents.items()
            ],
        }

    async def send_state(self):
        if not self.game.done:
            await self._ensure_decision()
        g = self.game
        await self.broadcast({
            "type": "state",
            "board": game.decode(g.board).tolist(),
            "score": g.score, "moves": g.moves, "max_tile": g.max_tile, "done": g.done,
            "last_action": self.last_action,
            "agent": self.agent_name, "playing": self.playing, "speed": self.speed,
            "training": self.trainer.agent.name if self.trainer else None,
            "decision": None if g.done else decision_json(self.decision),
        })

    async def _ensure_decision(self):
        # The overlay always shows what the selected agent *would* do on the
        # current board, whether a human or the agent is the one moving.
        key = (self.agent_name, self.game.board.tobytes())
        if key != self._decision_key:
            self.decision = await asyncio.to_thread(self.agent.decide, self.game.board.copy())
            self._decision_key = key

    # -- playing -----------------------------------------------------------

    async def agent_step(self):
        await self._ensure_decision()
        self.last_action = self.decision.action
        self.game.step(self.last_action)

    def _headless_burst(self):
        agent, g = self.agent, self.game
        end = time.perf_counter() + HEADLESS_FRAME
        while not g.done and time.perf_counter() < end:
            g.step(agent.act(g.board))

    async def _play_loop(self):
        while self.playing and not self.game.done:
            if self.speed == "max":
                self.last_action = None
                await asyncio.to_thread(self._headless_burst)
            else:
                await self.agent_step()
            await self.send_state()
            await asyncio.sleep(MOVE_DELAY[self.speed])
        self.playing = False
        await self.send_state()

    # -- training ----------------------------------------------------------

    async def _training_ticker(self):
        while True:
            await asyncio.sleep(0.5)
            t = self.trainer
            if t is None:
                continue
            point = self.logs[t.agent.name].add(t.drain())
            if point:
                await self.broadcast({"type": "train_point", "agent": t.agent.name, "point": point})
            if t.error:
                await self.broadcast({"type": "toast", "message": f"Training crashed: {t.error}"})
                self.trainer = None
                await self.send_state()

    async def stop_training(self):
        if self.trainer:
            self.trainer.stop()
            await asyncio.to_thread(self.trainer.join, 10)
            self.logs[self.trainer.agent.name].add(self.trainer.drain())
            self.trainer = None

    # -- checkpoints -------------------------------------------------------

    def checkpoints(self, name):
        ext = self.agents[name].checkpoint_ext
        files = CHECKPOINTS.glob(f"{name}-*{ext}")
        return sorted((f.name for f in files), reverse=True)

    async def save(self, name):
        agent = self.agents[name]
        path = CHECKPOINTS / f"{name}-{time.strftime('%Y%m%d-%H%M%S')}{agent.checkpoint_ext}"
        await asyncio.to_thread(agent.save, path)
        await self.broadcast(self.agents_msg())
        await self.broadcast({"type": "toast", "message": f"Saved {path.name}"})

    async def load(self, name, filename):
        # Only accept names we listed ourselves, never an arbitrary path.
        if filename not in self.checkpoints(name):
            return
        await asyncio.to_thread(self.agents[name].load, CHECKPOINTS / filename)
        self._decision_key = None
        await self.broadcast({"type": "toast", "message": f"Loaded {filename}"})
        await self.send_state()

    # -- message handling --------------------------------------------------

    async def handle(self, msg):
        kind = msg.get("type")
        if kind == "move" and not self.game.done:
            self.playing = False
            self.last_action = int(msg["action"])
            self.game.step(self.last_action)
        elif kind == "new_game":
            self.playing = False
            self.last_action = None
            self.game.reset()
        elif kind == "select_agent" and msg.get("name") in self.agents:
            self.agent_name = msg["name"]
        elif kind == "speed" and msg.get("value") in MOVE_DELAY:
            self.speed = msg["value"]
        elif kind == "play":
            if msg.get("on") and not self.playing and not self.game.done:
                self.playing = True
                asyncio.create_task(self._play_loop())
                return
            self.playing = False
        elif kind == "step" and not self.game.done:
            self.playing = False
            await self.agent_step()
        elif kind == "train":
            await self.stop_training()
            agent = self.agents.get(msg.get("name"))
            if msg.get("on") and agent and agent.trainable:
                self.trainer = Trainer(agent)
                self.trainer.start()
        elif kind == "save" and msg.get("name") in self.agents:
            return await self.save(msg["name"])
        elif kind == "load" and msg.get("name") in self.agents:
            return await self.load(msg["name"], msg.get("file", ""))
        elif kind == "benchmark" and not (self.bench and self.bench.is_alive()):
            games = int(np.clip(msg.get("games", 100), 1, 1000))
            self.bench = BenchmarkRunner(list(self.agents.values()), games, self.report)
            self.bench.start()
        await self.send_state()
