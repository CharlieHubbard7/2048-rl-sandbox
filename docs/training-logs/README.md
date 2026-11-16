# Training logs

Console output from the runs that produced the shipped models
(`python -m rl2048.train <agent> --minutes N`). The trainer prints one line
roughly every 10 seconds: episodes so far, average score and 2048 rate over the
last 100 games, and the best tile in those games.

| File | Run |
|---|---|
| `ntuple.log` | 60 minutes |
| `dqn.log` | 30 minutes |
| `ppo.log` | 30 minutes |

All three ran at the same time on one laptop CPU. `scripts/figures.py` turns them
into the learning-curve charts on the methodology page.
