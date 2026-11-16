import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";

import { parseBundle } from "../../site/js/ai/bundle.js";
import { dqnAgent, ppoAgent, trunk } from "../../site/js/ai/nets.js";

function weights(name) {
  const bytes = gunzipSync(readFileSync(new URL(`../../site/models/${name}.bin.gz`, import.meta.url)));
  return parseBundle(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)).arrays;
}

const cases = JSON.parse(readFileSync(new URL("./fixtures/nets.json", import.meta.url)));
const dqn = weights("dqn");
const ppo = weights("ppo");
const close = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol * (1 + Math.abs(b));

test("dqn q-values match pytorch", () => {
  const agent = dqnAgent(dqn);
  for (const c of cases) {
    const { values } = agent.decide(Uint8Array.from(c.board), { explain: false });
    values.forEach((v, dir) => {
      if (v !== null) assert.ok(close(v, c.q[dir]), `${v} vs ${c.q[dir]}`);
    });
  }
});

test("ppo move probabilities and value match pytorch", () => {
  const agent = ppoAgent(ppo);
  for (const c of cases) {
    const board = Uint8Array.from(c.board);
    const { values } = agent.decide(board, { explain: false });
    values.forEach((p, dir) => {
      if (c.probs[dir] === null) assert.equal(p, null);
      else assert.ok(Math.abs(p - c.probs[dir]) < 1e-3, `${p} vs ${c.probs[dir]}`);
    });
    const h = trunk(ppo, board);
    const value = ppo["v.bias"][0] + h.reduce((sum, x, i) => sum + x * ppo["v.weight"][i], 0);
    assert.ok(close(value, c.value), `${value} vs ${c.value}`);
  }
});

test("explanations mark only occupied cells", () => {
  const board = Uint8Array.from([1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const { heat } = dqnAgent(dqn).decide(board);
  assert.equal(heat.length, 16);
  heat.forEach((h, cell) => (board[cell] ? assert.ok(h >= 0) : assert.equal(h, 0)));
});
