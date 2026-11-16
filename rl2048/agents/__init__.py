from .baseline import HeuristicAgent, RandomAgent
from .dqn import DQNAgent
from .expectimax import ExpectimaxAgent
from .ntuple import NTupleAgent
from .ppo import PPOAgent


def build_agents():
    # Expectimax shares the n-tuple instance, so training one improves both.
    ntuple = NTupleAgent()
    agents = [RandomAgent(), HeuristicAgent(), ntuple, DQNAgent(), PPOAgent(), ExpectimaxAgent(ntuple)]
    return {a.name: a for a in agents}
