"""Torch building blocks shared by the DQN and PPO agents."""

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from .base import BaseAgent

torch.set_num_threads(min(4, torch.get_num_threads()))


def one_hot(boards):
    """(N, 4, 4) exponent boards -> (N, 16, 4, 4) float planes.

    One plane per exponent: a tile's identity matters far more than its
    magnitude (a 1024 and a 2048 next to each other can't merge), and raw
    values would span four orders of magnitude.
    """
    b = torch.as_tensor(np.ascontiguousarray(boards), dtype=torch.long)
    return F.one_hot(b, 16).permute(0, 3, 1, 2).float()


def shape_reward(r):
    # Raw merge scores grow exponentially with tile size, which makes Q
    # targets explode late in a game. log2 keeps every merge in a 1..16 band.
    return np.log2(1.0 + r) / 4.0


class PairConv(nn.Module):
    """A 2x2, stride-1 convolution written as a Linear over stacked patches.

    Mathematically identical to nn.Conv2d(kernel_size=2), but CPU builds of
    torch without MKLDNN run convolutions this tiny ~7x slower than the
    equivalent matmul, and update speed is what bounds DQN wall-clock time.
    """

    def __init__(self, c_in, c_out):
        super().__init__()
        self.linear = nn.Linear(4 * c_in, c_out)

    def forward(self, x):  # (N, C, H, W) -> (N, c_out, H-1, W-1)
        patches = torch.cat([x[:, :, :-1, :-1], x[:, :, :-1, 1:], x[:, :, 1:, :-1], x[:, :, 1:, 1:]], dim=1)
        return self.linear(patches.permute(0, 2, 3, 1)).permute(0, 3, 1, 2)


class ConvTrunk(nn.Module):
    """2x2 kernels see exactly the neighbour pairs that can merge."""

    def __init__(self, width=128, out=256):
        super().__init__()
        self.conv1 = PairConv(16, width)
        self.conv2 = PairConv(width, width)
        self.fc = nn.Linear(width * 2 * 2, out)
        self.out_features = out

    def forward(self, x):
        x = F.relu(self.conv1(x))
        x = F.relu(self.conv2(x))
        return F.relu(self.fc(x.flatten(1)))


def saliency(score_fn, board):
    """Gradient x input on the one-hot planes, collapsed to a 4x4 map.

    Because the input is one-hot this picks out, for each cell, how much
    the output would move if that cell's tile were removed.
    """
    x = one_hot(board[None]).requires_grad_(True)
    # autograd.grad (not .backward) so we never touch parameter .grad
    # buffers that a background training thread may be using.
    (grad,) = torch.autograd.grad(score_fn(x), x)
    return (grad * x).sum(dim=1)[0].abs().detach().numpy()


class TorchAgent(BaseAgent):
    checkpoint_ext = ".pt"

    def save(self, path):
        torch.save(self.state_dict(), path)

    def load(self, path):
        self.load_state_dict(torch.load(path, weights_only=True))
