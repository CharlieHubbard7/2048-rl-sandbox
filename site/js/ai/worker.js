// Runs the models off the main thread so animations never stutter while a
// search is thinking. Each model loads (and fetches its weights) on first use.
import { heuristicAgent } from "./heuristic.js";

const loaders = {
  heuristic: async () => heuristicAgent,
};

const agents = new Map();

function load(model) {
  if (!agents.has(model)) agents.set(model, loaders[model]());
  return agents.get(model);
}

self.addEventListener("message", async ({ data: { id, model, board } }) => {
  try {
    const agent = await load(model);
    const decision = agent.decide(Uint8Array.from(board));
    self.postMessage({ id, decision: { ...decision, kind: agent.kind } });
  } catch (error) {
    agents.delete(model); // let the next request retry a failed download
    self.postMessage({ id, error: String(error) });
  }
});
