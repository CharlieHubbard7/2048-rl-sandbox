// Promise wrapper around the model worker.
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
const pending = new Map();
let nextId = 0;

worker.addEventListener("message", ({ data }) => {
  const request = pending.get(data.id);
  pending.delete(data.id);
  if (data.error) request.reject(new Error(data.error));
  else request.resolve(data.decision);
});

export function decide(model, board) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, model, board: Array.from(board) });
  });
}
