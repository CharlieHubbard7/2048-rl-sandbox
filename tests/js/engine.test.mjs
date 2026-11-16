import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DIRECTIONS, isOver, legalMoves, mergeLine, move, spawn } from "../../site/js/engine.js";

const cases = JSON.parse(readFileSync(new URL("./fixtures/engine.json", import.meta.url)));

test("every move matches the python engine", () => {
  for (const c of cases) {
    const board = Uint8Array.from(c.board);
    for (const dir of DIRECTIONS) {
      const { after, gained, moved } = move(board, dir);
      assert.deepEqual(Array.from(after), c.after[dir]);
      assert.equal(gained, c.reward[dir]);
      assert.equal(moved, c.legal[dir]);
    }
  }
});

test("a merged tile does not merge again in the same move", () => {
  assert.deepEqual(mergeLine([1, 1, 2, 0]).out, [2, 2, 0, 0]);
  assert.deepEqual(mergeLine([1, 1, 1, 1]).sources, [[0, 1], [2, 3]]);
  assert.deepEqual(mergeLine([2, 0, 2, 2]).out, [3, 2, 0, 0]);
});

test("game over only when the board is full and nothing merges", () => {
  const stuck = Uint8Array.from([1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1]);
  assert.ok(isOver(stuck));
  assert.deepEqual(legalMoves(stuck), []);
  stuck[15] = 2;
  assert.ok(!isOver(stuck));
});

test("spawn fills an empty cell with a 2 or a 4", () => {
  const board = new Uint8Array(16).fill(3);
  board[6] = 0;
  assert.equal(spawn(board, () => 0.95), 6);
  assert.equal(board[6], 2);
  assert.equal(spawn(board, Math.random), -1);
});
