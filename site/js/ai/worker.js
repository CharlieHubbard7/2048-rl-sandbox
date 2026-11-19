// Runs the models off the main thread so animations never stutter while a
// search is thinking. Each model loads (and fetches its weights) on first use.
import { loadBundle } from "./bundle.js";
import { expectimaxAgent } from "./expectimax.js";
import { heuristicAgent } from "./heuristic.js";
import { DIRECTIONS, move } from "../engine.js";
import { dqnAgent, ppoAgent } from "./nets.js";
import { NTupleNetwork, ntupleAgent } from "./ntuple.js";

const weights = (name) => loadBundle(new URL(`../../models/${name}.bin.gz`, import.meta.url));

// The greedy n-tuple agent and the search share a single download.
let ntuple;
function ntupleNetwork() {
  ntuple ??= weights("ntuple")
    .then((bundle) => new NTupleNetwork(bundle))
    .catch((error) => {
      ntuple = undefined;
      throw error;
    });
  return ntuple;
}

const loaders = {
  expectimax: async () => expectimaxAgent(await ntupleNetwork()),
  ntuple: async () => ntupleAgent(await ntupleNetwork()),
  ppo: async () => ppoAgent((await weights("ppo")).arrays),
  dqn: async () => dqnAgent((await weights("dqn")).arrays),
  heuristic: async () => heuristicAgent,
};

const agents = new Map();

function load(model) {
  if (!agents.has(model)) agents.set(model, loaders[model]());
  return agents.get(model);
}

self.addEventListener("message", async ({ data: { id, model, board, explain, detail } }) => {
  try {
    const agent = await load(model);
    const started = performance.now();
    const cells = Uint8Array.from(board);
    const decision = agent.decide(cells, { explain, detail });
    const ms = performance.now() - started;
    // The four boards the model compared: what each move does before a tile spawns.
    const futures = DIRECTIONS.map((dir) => {
      const { after, gained, moved } = move(cells, dir);
      return moved ? { after: Array.from(after), gained } : null;
    });
    self.postMessage({ id, decision: { ...decision, kind: agent.kind, model, board, futures, ms } });
  } catch (error) {
    agents.delete(model); // let the next request retry a failed download
    self.postMessage({ id, error: String(error) });
  }
});
