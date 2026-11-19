// The models offered in the picker, strongest first.
//
// `blurb` says what the model is; `lede` says, in one sentence, what the
// numbers in the thinking panel mean for it.
export const MODELS = [
  {
    id: "expectimax",
    label: "Search + N-tuple",
    short: "Search",
    blurb: "Looks ahead: tries every move, imagines every tile that could appear, and asks a learned network how good each result is.",
    lede: "Each number is the average outcome of the move, over every tile that could appear next.",
  },
  {
    id: "ntuple",
    label: "N-tuple network",
    short: "N-tuple",
    blurb: "Tries each move once and scores the result with lookup tables learned over 55,000 games of self-play.",
    lede: "Each number is points from merging plus how good the network thinks the board is afterwards.",
  },
  {
    id: "heuristic",
    label: "Heuristic",
    short: "Heuristic",
    blurb: "No learning at all: a formula written by hand that likes big tiles in a corner, empty space and tiles that can merge.",
    lede: "Each number is the hand-written formula applied to the board after the move.",
  },
  {
    id: "dqn",
    label: "Deep Q-network",
    short: "DQN",
    blurb: "A neural network that looks at the board once and guesses how much each move is worth in future merges.",
    lede: "Each number is how much future merging it predicts after the move, on the log scale it was trained with. It never tries the moves; it guesses from this board alone.",
  },
  {
    id: "ppo",
    label: "PPO",
    short: "PPO",
    blurb: "A neural network that looks at the board once and says how likely it should be to choose each move.",
    lede: "Each number is how likely it is to choose the move. It never tries the moves; it reads them off this board.",
  },
];

export const DEFAULT_MODEL = MODELS[0].id;
export const modelInfo = (id) => MODELS.find((m) => m.id === id) ?? MODELS[0];
