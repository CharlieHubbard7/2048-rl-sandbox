import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";

import { parseBundle } from "../../site/js/ai/bundle.js";

test("reads the python-written sample bundle", () => {
  const bytes = gunzipSync(readFileSync(new URL("./fixtures/sample.bin.gz", import.meta.url)));
  const { meta, arrays } = parseBundle(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  assert.deepEqual(meta, { note: "sample" });
  assert.deepEqual(Array.from(arrays.keys), [3, 17, 8388608]);
  assert.ok(Math.abs(arrays.w[0] - 1.5) < 1e-3);
  assert.ok(Math.abs(arrays.w[2] + 0.25) < 1e-3);
});
