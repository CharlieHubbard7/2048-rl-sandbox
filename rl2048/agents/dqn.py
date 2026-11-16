"""Double DQN over one-hot boards, with experience replay and a Polyak-averaged
target network. Illegal moves are masked out of both action selection and the
bootstrap max, so the network never wastes capacity learning they're bad."""
import copy

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from .. import game
from ..env import BatchEnv
from .base import Decision, masked_argmax, with_nans
from .nets import ConvTrunk, TorchAgent, one_hot, saliency, shape_reward


class QNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.trunk = ConvTrunk()
        self.head = nn.Linear(self.trunk.out_features, 4)

    def forward(self, x):
        return self.head(self.trunk(x))


class ReplayBuffer:
    def __init__(self, capacity):
        self.capacity, self.size, self.pos = capacity, 0, 0
        self.s = np.zeros((capacity, 4, 4), np.uint8)
        self.s2 = np.zeros((capacity, 4, 4), np.uint8)
        self.a = np.zeros(capacity, np.int64)
        self.r = np.zeros(capacity, np.float32)
        self.done = np.zeros(capacity, np.float32)
        self.mask2 = np.zeros((capacity, 4), bool)

    def add(self, s, a, r, s2, done, mask2):
        n = len(a)
        idx = (self.pos + np.arange(n)) % self.capacity
        self.s[idx], self.a[idx], self.r[idx] = s, a, r
        self.s2[idx], self.done[idx], self.mask2[idx] = s2, done, mask2
        self.pos = (self.pos + n) % self.capacity
        self.size = min(self.size + n, self.capacity)

    def sample(self, n, rng):
        i = rng.integers(0, self.size, n)
        return self.s[i], self.a[i], self.r[i], self.s2[i], self.done[i], self.mask2[i]


class DQNAgent(TorchAgent):
    name = "dqn"
    trainable = True

    def __init__(self, lr=3e-4, gamma=0.99, batch_size=256, n_envs=32,
                 buffer_size=200_000, warmup=5_000, eps_decay_steps=150_000, tau=0.005):
        self.net = QNet()
        self.target = copy.deepcopy(self.net).requires_grad_(False)
        self.opt = torch.optim.Adam(self.net.parameters(), lr=lr)
        self.gamma, self.batch_size, self.tau = gamma, batch_size, tau
        self.n_envs, self.buffer_size, self.warmup = n_envs, buffer_size, warmup
        self.eps_end, self.eps_decay_steps = 0.01, eps_decay_steps
        self.steps = 0

    @property
    def epsilon(self):
        frac = min(1.0, self.steps / self.eps_decay_steps)
        return 1.0 + frac * (self.eps_end - 1.0)

    @torch.no_grad()
    def q_values(self, boards):
        return self.net(one_hot(boards)).numpy()

    def act(self, board):
        return masked_argmax(self.q_values(board[None])[0], game.valid_mask(board))

    def decide(self, board):
        mask = game.valid_mask(board)
        q = self.q_values(board[None])[0]
        a = masked_argmax(q, mask)
        heat = saliency(lambda x: self.net(x)[0, a], board)
        return Decision(a, with_nans(q, mask), "q", heat)

    def train(self, seed=None):
        rng = np.random.default_rng(seed)
        env = BatchEnv(self.n_envs, seed)
        buf = ReplayBuffer(self.buffer_size)
        losses = []
        while True:
            boards, masks = env.boards.copy(), env.masks.copy()
            actions = self._explore(boards, masks, rng)
            next_boards, rewards, dones, info = env.step(actions)
            buf.add(boards, actions, shape_reward(rewards), next_boards, dones, env.masks)
            self.steps += self.n_envs

            if buf.size >= self.warmup:
                losses = (losses + [self._update(buf, rng)])[-100:]
            for ep in info["finished"]:
                loss = float(np.mean(losses)) if losses else None
                yield {**ep, "loss": loss, "epsilon": self.epsilon}

    def _explore(self, boards, masks, rng):
        greedy = np.where(masks, self.q_values(boards), -np.inf).argmax(axis=1)
        random = (rng.random(masks.shape) * masks).argmax(axis=1)
        return np.where(rng.random(len(boards)) < self.epsilon, random, greedy)

    def _update(self, buf, rng):
        s, a, r, s2, done, mask2 = buf.sample(self.batch_size, rng)
        x, x2 = one_hot(s), one_hot(s2)
        r, done = torch.as_tensor(r), torch.as_tensor(done)
        with torch.no_grad():
            # Double DQN: the online net picks the move, the target net scores
            # it, which curbs the max-operator's optimism.
            best = self.net(x2).masked_fill(~torch.as_tensor(mask2), -torch.inf).argmax(1, keepdim=True)
            target = r + self.gamma * (1 - done) * self.target(x2).gather(1, best).squeeze(1)

        q = self.net(x).gather(1, torch.as_tensor(a)[:, None]).squeeze(1)
        loss = F.smooth_l1_loss(q, target)
        self.opt.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(self.net.parameters(), 10.0)
        self.opt.step()

        with torch.no_grad():
            for p, tp in zip(self.net.parameters(), self.target.parameters()):
                tp.lerp_(p, self.tau)
        return loss.item()

    def state_dict(self):
        return {"net": self.net.state_dict(), "target": self.target.state_dict(), "steps": self.steps}

    def load_state_dict(self, state):
        self.net.load_state_dict(state["net"])
        self.target.load_state_dict(state["target"])
        self.steps = state["steps"]
