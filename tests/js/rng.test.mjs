import assert from "node:assert/strict";
import { test } from "node:test";

import { createRng } from "../../site/js/rng.js";

test("same seed, same sequence", () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test("resuming from a saved state continues the sequence", () => {
  const a = createRng(7);
  for (let i = 0; i < 10; i++) a.next();
  const b = createRng(a.state);
  assert.equal(a.next(), b.next());
});

test("draws are uniform enough for tile spawns", () => {
  const rng = createRng(1);
  const n = 20000;
  let below = 0;
  for (let i = 0; i < n; i++) if (rng.next() < 0.9) below++;
  assert.ok(Math.abs(below / n - 0.9) < 0.01);
});
