// Plays seeded games with the browser models, exactly as the site runs them,
// and prints a Markdown table for the README.
//
//   node scripts/benchmark.mjs [games] [model ...]
//   node scripts/benchmark.mjs 50 expectimax ntuple
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { parseBundle } from "../site/js/ai/bundle.js";
import { expectimaxAgent } from "../site/js/ai/expectimax.js";
import { heuristicAgent } from "../site/js/ai/heuristic.js";
import { dqnAgent, ppoAgent } from "../site/js/ai/nets.js";
import { NTupleNetwork, ntupleAgent } from "../site/js/ai/ntuple.js";
import { Game } from "../site/js/game.js";

function bundle(name) {
  const bytes = gunzipSync(readFileSync(new URL(`../site/models/${name}.bin.gz`, import.meta.url)));
  return parseBundle(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
}

let network;
const ntuple = () => (network ??= new NTupleNetwork(bundle("ntuple")));

const MODELS = {
  expectimax: ["Search + N-tuple", () => expectimaxAgent(ntuple())],
  ntuple: ["N-tuple network", () => ntupleAgent(ntuple())],
  ppo: ["PPO", () => ppoAgent(bundle("ppo").arrays)],
  dqn: ["Deep Q-network", () => dqnAgent(bundle("dqn").arrays)],
  heuristic: ["Heuristic", () => heuristicAgent],
};

function play(agent, seed) {
  const game = new Game(seed);
  game.continueAfterWin();
  while (!game.over) game.move(agent.decide(game.board, { explain: false }).action);
  return { score: game.score, tile: 2 ** Math.max(...game.board) };
}

const [gamesArg, ...names] = process.argv.slice(2);
const games = Number(gamesArg) || 50;
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const rate = (results, tile) => `${Math.round((100 * results.filter((r) => r.tile >= tile).length) / results.length)}%`;

console.log(`| Model | Mean score | Median | Reached 2048 | Reached 4096 | Best tile |`);
console.log(`|---|---:|---:|---:|---:|---:|`);
for (const name of names.length ? names : Object.keys(MODELS)) {
  const [label, build] = MODELS[name];
  const agent = build();
  const results = [];
  const started = Date.now();
  for (let seed = 1; seed <= games; seed++) results.push(play(agent, seed));
  const scores = results.map((r) => r.score);
  const mean = Math.round(scores.reduce((a, b) => a + b, 0) / games);
  console.log(
    `| ${label} | ${mean.toLocaleString("en")} | ${median(scores).toLocaleString("en")} | ` +
      `${rate(results, 2048)} | ${rate(results, 4096)} | ${Math.max(...results.map((r) => r.tile))} |`,
  );
  console.error(`  ${name}: ${games} games in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
