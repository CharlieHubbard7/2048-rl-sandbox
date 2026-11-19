// The models offered in the picker, strongest first.
//
// `blurb` says what the model is; `lede` says, in one sentence, what the
// numbers in the thinking panel mean for it.
export const MODELS = [
  {
    id: "expectimax",
    label: "Search + N-tuple",
    short: "Search",
    blurb: "Looks ahead at every move and every tile that could appear next, then asks the N-tuple network which future is best.",
    lede: "Each number is the average outcome of the move, over every tile that could appear next.",
  },
  {
    id: "ntuple",
    label: "N-tuple network",
    short: "N-tuple",
    blurb: "Scores each move with lookup tables it learned over 55,000 games against itself.",
    lede: "Each number is points from merging plus how good the network thinks the board is afterwards.",
  },
  {
    id: "heuristic",
    label: "Heuristic",
    short: "Heuristic",
    blurb: "A formula written by hand. No learning at all.",
    lede: "Each number is the hand-written formula applied to the board after the move.",
  },
  {
    id: "dqn",
    label: "Deep Q-network",
    short: "DQN",
    blurb: "A neural network that rates each move at a glance, without looking ahead.",
    lede: "Each number is how much future merging it predicts after the move, on the log scale it was trained with. It never tries the moves; it guesses from this board alone.",
  },
  {
    id: "ppo",
    label: "PPO",
    short: "PPO",
    blurb: "A neural network that picks moves by probability, without looking ahead.",
    lede: "Each number is how likely it is to choose the move. It never tries the moves; it reads them off this board.",
  },
];

export const DEFAULT_MODEL = MODELS[0].id;
export const modelInfo = (id) => MODELS.find((m) => m.id === id) ?? MODELS[0];
