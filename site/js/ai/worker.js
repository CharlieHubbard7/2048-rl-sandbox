// Runs the models off the main thread so animations never stutter while a
// search is thinking. Each model loads (and fetches its weights) on first use.
import { loadBundle } from "./bundle.js";
import { expectimaxAgent } from "./expectimax.js";
import { heuristicAgent } from "./heuristic.js";
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

self.addEventListener("message", async ({ data: { id, model, board, explain } }) => {
  try {
    const agent = await load(model);
    const decision = agent.decide(Uint8Array.from(board), { explain });
    self.postMessage({ id, decision: { ...decision, kind: agent.kind } });
  } catch (error) {
    agents.delete(model); // let the next request retry a failed download
    self.postMessage({ id, error: String(error) });
  }
});
