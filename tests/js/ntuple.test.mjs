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
