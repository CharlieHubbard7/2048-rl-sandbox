# 2048 RL Sandbox

A fast NumPy 2048 engine, six agents from random play up to search-plus-learning,
and a browser sandbox where you can watch them play, see what they were weighing
on each move, and train them live.

## Run it

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m server          # http://127.0.0.1:8048
```

Arrow keys or WASD play the game yourself. Pick an agent in the top bar and press
**Watch agent play**. At `Max` speed the agent plays headless and the board refreshes
about ten times a second.

## Agents

| Agent | Idea | Typical strength* |
|---|---|---|
| Random | Uniform over legal moves | ~1k points, 128 tiles |
| Heuristic | Greedy 1-ply over snake-corner weights, empty cells and merge pairs | ~10k, occasional 2048 |
| N-Tuple TD | 4×6-tuple network shared over 8 symmetries, backward TD(0) on afterstates | ~20k and ~30% 2048 after 4 min of training |
| DQN | Double DQN, one-hot CNN, replay buffer, Polyak target, masked max | ~4k after 4 min |
| PPO | Masked actor-critic with GAE | ~6k after 4 min |
| Expectimax | Searches tile spawns (2 plies when the board is crowded), N-Tuple values at the leaves | ~90% 2048 on a 2-min N-Tuple |

\*Single-machine CPU numbers from development runs. Treat them as orders of magnitude, not benchmarks.

The gap between N-Tuple and the deep agents is real, and it's the most interesting
thing the sandbox shows. The N-tuple model is linear over a huge sparse feature
space, so each update touches only the 32 weights that describe the board. The
networks have to learn that structure from scratch.

## What the brain panel shows

- **Bars**: Q-values (DQN), move probabilities (PPO), or merge reward plus the value of
  the resulting board (heuristic, N-Tuple, Expectimax). The amber bar is the move it picks.
  Illegal moves are shown as blocked and are masked out of every agent.
- **Heatmap**: for N-Tuple and Expectimax, the active tuple weights on the chosen
  afterstate spread over the cells they cover. For DQN and PPO, gradient × input
  saliency of the chosen Q-value or the critic. For the heuristic, its positional weights.

## Training

Train from the sandbox (one agent at a time, in a background thread), or headless:

```bash
.venv/bin/python -m rl2048.train ntuple --minutes 10
```

Checkpoints go to `checkpoints/` (`.pkl` for N-Tuple, `.pt` for the torch agents). The
server loads the newest one for each agent when it starts.

## Layout

```
rl2048/game.py      board mechanics: lookup-table slides, batched over any leading dims
rl2048/env.py       Game (single, stateful) and BatchEnv (N games, auto-reset)
rl2048/agents/      BaseAgent + the six agents; nets.py holds the shared torch trunk
rl2048/arena.py     seeded head-to-head benchmarks
server/             FastAPI app, WebSocket session state, training/benchmark threads
web/                vanilla JS sandbox (no build step)
tests/              pytest suite for the engine and agents
```

A few engine details:

- Boards store exponents in `uint8`. Every move is a flip/transpose plus a lookup into a
  65,536-entry table of precomputed row slides. One `Game` runs at about 23k steps/s,
  and `BatchEnv` steps every game in the batch with array ops.
- Cells are 4 bits in the lookup index, so 32768 is the largest tile. Merging two of them
  saturates rather than overflowing into the next cell.
- `PairConv` is a 2×2 convolution written as a `Linear` over stacked patches. It's
  mathematically identical to `Conv2d`, and about 7× faster on CPU builds of torch
  without MKLDNN.

## Tests

```bash
.venv/bin/pytest
```
