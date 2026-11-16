// Forward passes for the DQN and PPO networks in rl2048/agents/{dqn,ppo}.py.
//
// The trunk is two 2x2 convolutions and a dense layer. The input is a one-hot
// plane per tile exponent, so the first convolution needs no multiplications:
// each cell just selects a column of weights. Weights are row-major
// (out, in), exactly as torch stores them.
import { DIRECTIONS, legalMoves } from "../engine.js";

const PATCH = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
]; // PairConv's patch order: top-left, top-right, bottom-left, bottom-right
const PLANES = 16;

function dense(weight, bias, input, out) {
  const n = input.length;
  const result = new Float32Array(out);
  for (let o = 0; o < out; o++) {
    let sum = bias ? bias[o] : 0;
    const row = o * n;
    for (let i = 0; i < n; i++) sum += weight[row + i] * input[i];
    result[o] = sum;
  }
  return result;
}

const relu = (values) => values.map((v) => (v > 0 ? v : 0));

export function trunk(w, board) {
  const w1 = w["trunk.conv1.linear.weight"];
  const b1 = w["trunk.conv1.linear.bias"];
  const width = b1.length;

  // conv1 on the one-hot board -> (width, 3, 3)
  const h1 = new Float32Array(width * 9);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const columns = PATCH.map(([dy, dx], k) => k * PLANES + board[(y + dy) * 4 + x + dx]);
      for (let o = 0; o < width; o++) {
        let sum = b1[o];
        for (const c of columns) sum += w1[o * PLANES * 4 + c];
        h1[o * 9 + y * 3 + x] = sum > 0 ? sum : 0;
      }
    }
  }

  // conv2 -> (width, 2, 2), laid out channel-major to match torch's flatten
  const w2 = w["trunk.conv2.linear.weight"];
  const b2 = w["trunk.conv2.linear.bias"];
  const h2 = new Float32Array(width * 4);
  const patch = new Float32Array(width * 4);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      PATCH.forEach(([dy, dx], k) => {
        for (let c = 0; c < width; c++) patch[k * width + c] = h1[c * 9 + (y + dy) * 3 + x + dx];
      });
      const out = dense(w2, b2, patch, width);
      for (let o = 0; o < width; o++) h2[o * 4 + y * 2 + x] = out[o] > 0 ? out[o] : 0;
    }
  }

  const bf = w["trunk.fc.bias"];
  return relu(dense(w["trunk.fc.weight"], bf, h2, bf.length));
}

// Which tiles matter: how much the score moves when each tile is removed.
function occlusion(board, score) {
  const base = score(board);
  return Array.from(board, (exp, cell) => {
    if (!exp) return 0;
    const without = board.slice();
    without[cell] = 0;
    return Math.abs(base - score(without));
  });
}

export function dqnAgent(w) {
  const qValues = (board) => dense(w["head.weight"], w["head.bias"], trunk(w, board), 4);
  return {
    kind: "q",
    decide(board, { explain = true } = {}) {
      const q = qValues(board);
      const legal = legalMoves(board);
      const action = legal.reduce((a, b) => (q[b] > q[a] ? b : a));
      return {
        action,
        values: DIRECTIONS.map((d) => (legal.includes(d) ? q[d] : null)),
        heat: explain ? occlusion(board, (b) => qValues(b)[action]) : null,
      };
    },
  };
}

export function ppoAgent(w) {
  return {
    kind: "prob",
    decide(board, { explain = true } = {}) {
      const h = trunk(w, board);
      const logits = dense(w["pi.weight"], w["pi.bias"], h, 4);
      const legal = legalMoves(board);
      // Softmax over legal moves only: illegal ones are masked, as in training.
      const top = Math.max(...legal.map((d) => logits[d]));
      const exp = DIRECTIONS.map((d) => (legal.includes(d) ? Math.exp(logits[d] - top) : 0));
      const total = exp.reduce((a, b) => a + b, 0);
      const probs = exp.map((e) => e / total);
      const action = legal.reduce((a, b) => (probs[b] > probs[a] ? b : a));
      const value = (b) => dense(w["v.weight"], w["v.bias"], trunk(w, b), 1)[0];
      return {
        action,
        values: DIRECTIONS.map((d) => (legal.includes(d) ? probs[d] : null)),
        heat: explain ? occlusion(board, value) : null,
      };
    },
  };
}
