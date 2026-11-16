// The models offered in the picker, strongest first.
export const MODELS = [
  { id: "expectimax", label: "Search + N-tuple" },
  { id: "ntuple", label: "N-tuple network" },
  { id: "heuristic", label: "Heuristic" },
  { id: "dqn", label: "Deep Q-network" },
  { id: "ppo", label: "PPO" },
];

export const DEFAULT_MODEL = MODELS[0].id;
