import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { WEIGHTS, heuristicAgent, evaluate } from "../../site/js/ai/heuristic.js";
import { DIRECTIONS, move } from "../../site/js/engine.js";

const cases = JSON.parse(readFileSync(new URL("./fixtures/engine.json", import.meta.url)));

test("evaluation matches the python heuristic", () => {
  for (const c of cases) {
    for (const dir of DIRECTIONS) {
      const { after } = move(Uint8Array.from(c.board), dir);
      assert.ok(Math.abs(evaluate(after) - c.heuristic[dir]) < 1e-6);
    }
  }
});

test("only legal moves get a value", () => {
  const board = Uint8Array.from([1, 2, 3, 4, ...Array(12).fill(0)]);
  const { action, values } = heuristicAgent.decide(board);
  assert.equal(values[0], null);
  assert.notEqual(action, 0);
});

test("the weighted terms add up to the evaluation", () => {
  for (const c of cases) {
    const board = Uint8Array.from(c.board);
    const { values, detail } = heuristicAgent.decide(board, { detail: true });
    values.forEach((v, dir) => {
      if (v === null) return;
      const t = detail.terms[dir];
      const sum = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * t[k], 0);
      assert.ok(Math.abs(sum - v) < 1e-9);
    });
  }
});
