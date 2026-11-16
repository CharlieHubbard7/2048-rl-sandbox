"""PPO with a shared actor-critic trunk and invalid-action masking.

Masking illegal moves (rather than penalising them) matters a lot in 2048:
late-game boards often have only one or two legal moves, and an unmasked
policy burns most of its probability mass discovering that the hard way.
"""
import numpy as np
import torch
import torch.nn as nn
from torch.distributions import Categorical

from .. import game
from ..env import BatchEnv
from .base import Decision, masked_argmax, with_nans
from .nets import ConvTrunk, TorchAgent, one_hot, saliency, shape_reward

# Large-negative rather than -inf so entropy stays finite (0 * -inf = NaN).
MASKED_LOGIT = -1e9


class ActorCritic(nn.Module):
    def __init__(self):
        super().__init__()
        self.trunk = ConvTrunk()
        self.pi = nn.Linear(self.trunk.out_features, 4)
        self.v = nn.Linear(self.trunk.out_features, 1)

    def forward(self, x, mask):
        h = self.trunk(x)
        return self.pi(h).masked_fill(~mask, MASKED_LOGIT), self.v(h).squeeze(-1)


class PPOAgent(TorchAgent):
    name = "ppo"
    trainable = True

    def __init__(self, lr=3e-4, gamma=0.99, lam=0.95, clip=0.2, n_envs=64, horizon=128,
                 epochs=4, minibatch=1024, ent_coef=0.01, vf_coef=0.5):
        self.net = ActorCritic()
        self.opt = torch.optim.Adam(self.net.parameters(), lr=lr)
        self.gamma, self.lam, self.clip = gamma, lam, clip
        self.n_envs, self.horizon, self.epochs, self.minibatch = n_envs, horizon, epochs, minibatch
        self.ent_coef, self.vf_coef = ent_coef, vf_coef
        self.updates = 0

    @torch.no_grad()
    def policy(self, boards, masks):
        logits, value = self.net(one_hot(boards), torch.as_tensor(masks))
        return torch.softmax(logits, dim=-1).numpy(), value.numpy()

    def act(self, board):
        mask = game.valid_mask(board)
        probs, _ = self.policy(board[None], mask[None])
        return masked_argmax(probs[0], mask)

    def decide(self, board):
        mask = game.valid_mask(board)
        probs, _ = self.policy(board[None], mask[None])
        action = masked_argmax(probs[0], mask)
        # Saliency of the critic: which cells the network thinks the
        # position's future hinges on.
        heat = saliency(lambda x: self.net(x, torch.as_tensor(mask[None]))[1][0], board)
        return Decision(action, with_nans(probs[0], mask), "prob", heat)

    def train(self, seed=None):
        rng = np.random.default_rng(seed)
        env = BatchEnv(self.n_envs, seed)
        T, N = self.horizon, self.n_envs
        stats = {"loss": None, "entropy": None}
        while True:
            obs = np.zeros((T, N, 4, 4), np.uint8)
            masks = np.zeros((T, N, 4), bool)
            actions = np.zeros((T, N), np.int64)
            logp = np.zeros((T, N), np.float32)
            values = np.zeros((T + 1, N), np.float32)
            rewards = np.zeros((T, N), np.float32)
            dones = np.zeros((T, N), np.float32)

            for t in range(T):
                obs[t], masks[t] = env.boards, env.masks
                probs, values[t] = self.policy(obs[t], masks[t])
                # Vectorised categorical sample: first bucket the uniform falls in.
                actions[t] = (rng.random((N, 1)) < probs.cumsum(axis=1)).argmax(axis=1)
                logp[t] = np.log(probs[np.arange(N), actions[t]] + 1e-12)
                _, r, d, info = env.step(actions[t])
                rewards[t], dones[t] = shape_reward(r), d
                for ep in info["finished"]:
                    yield {**ep, **stats}
            _, values[T] = self.policy(env.boards, env.masks)

            advantages = self._gae(rewards, values, dones)
            returns = advantages + values[:T]
            stats = self._update(obs, masks, actions, logp, advantages, returns)
            self.updates += 1

    def _gae(self, rewards, values, dones):
        adv = np.zeros_like(rewards)
        running = np.zeros(rewards.shape[1], np.float32)
        for t in reversed(range(len(rewards))):
            alive = 1.0 - dones[t]
            delta = rewards[t] + self.gamma * values[t + 1] * alive - values[t]
            running = delta + self.gamma * self.lam * alive * running
            adv[t] = running
        return adv

    def _update(self, obs, masks, actions, old_logp, advantages, returns):
        x = one_hot(obs.reshape(-1, 4, 4))
        m = torch.as_tensor(masks.reshape(-1, 4))
        a = torch.as_tensor(actions.ravel())
        old_logp = torch.as_tensor(old_logp.ravel())
        adv = torch.as_tensor(advantages.ravel())
        ret = torch.as_tensor(returns.ravel())

        losses, entropies = [], []
        for _ in range(self.epochs):
            for idx in torch.randperm(len(a)).split(self.minibatch):
                logits, v = self.net(x[idx], m[idx])
                dist = Categorical(logits=logits)
                ratio = (dist.log_prob(a[idx]) - old_logp[idx]).exp()
                mb_adv = (adv[idx] - adv[idx].mean()) / (adv[idx].std() + 1e-8)

                clipped = ratio.clamp(1 - self.clip, 1 + self.clip)
                policy_loss = -torch.min(ratio * mb_adv, clipped * mb_adv).mean()
                value_loss = 0.5 * (v - ret[idx]).pow(2).mean()
                entropy = dist.entropy().mean()
                loss = policy_loss + self.vf_coef * value_loss - self.ent_coef * entropy

                self.opt.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(self.net.parameters(), 0.5)
                self.opt.step()
                losses.append(loss.item())
                entropies.append(entropy.item())
        return {"loss": float(np.mean(losses)), "entropy": float(np.mean(entropies))}

    def state_dict(self):
        return {"net": self.net.state_dict(), "updates": self.updates}

    def load_state_dict(self, state):
        self.net.load_state_dict(state["net"])
        self.updates = state["updates"]
