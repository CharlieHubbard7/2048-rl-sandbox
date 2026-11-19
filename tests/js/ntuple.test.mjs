import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";

import { parseBundle } from "../../site/js/ai/bundle.js";
import { expectimaxAgent } from "../../site/js/ai/expectimax.js";
import { NTupleNetwork } from "../../site/js/ai/ntuple.js";
import { DIRECTIONS, move } from "../../site/js/engine.js";

const bytes = gunzipSync(readFileSync(new URL("../../site/models/ntuple.bin.gz", import.meta.url)));
const net = new NTupleNetwork(parseBundle(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)));
const cases = JSON.parse(readFileSync(new URL("./fixtures/ntuple.json", import.meta.url)));

// Python sums float32 weights, JS sums in float64: allow for rounding only.
const close = (a, b) => Math.abs(a - b) <= 0.05 + 1e-5 * Math.abs(b);

test("board values match the python network", () => {
  for (const c of cases) {
    const board = Uint8Array.from(c.board);
    for (const dir of DIRECTIONS) {
      const value = net.value(move(board, dir).after);
      assert.ok(close(value, c.values[dir]), `${value} vs ${c.values[dir]}`);
    }
  }
});

test("search values match the python expectimax", () => {
  const search = expectimaxAgent(net);
  for (const c of cases) {
    const { values } = search.decide(Uint8Array.from(c.board));
    values.forEach((v, dir) => {
      if (c.search[dir] === null) assert.equal(v, null);
      else assert.ok(close(v, c.search[dir]), `${v} vs ${c.search[dir]}`);
    });
  }
});

test("the search explains itself without changing its answer", () => {
  const search = expectimaxAgent(net);
  for (const c of cases) {
    const board = Uint8Array.from(c.board);
    const plain = search.decide(board);
    const { values, action, detail } = search.decide(board, { detail: true });
    assert.deepEqual(values, plain.values);
    assert.equal(action, plain.action);
    values.forEach((v, dir) => {
      if (v === null) return assert.equal(detail.outcomes[dir], null);
      // Every empty cell of the afterstate appears once, with both tiles.
      const empty = move(board, dir).after.filter((x) => x === 0).length;
      assert.equal(detail.outcomes[dir].length, empty);
    });
    assert.ok(detail.searched > 0);
  }
});

test("the 32 lookups add up to the board value", () => {
  for (const c of cases) {
    const after = move(Uint8Array.from(c.board), 0).after;
    const features = net.features(after);
    assert.equal(features.length, 32);
    const total = features.reduce((s, f) => s + f.weight, 0);
    assert.ok(Math.abs(total - net.value(after)) < 1e-6);
  }
});
