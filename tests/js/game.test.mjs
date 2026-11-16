import assert from "node:assert/strict";
import { test } from "node:test";

import { DIRECTIONS, LEFT, legalMoves, move } from "../../site/js/engine.js";
import { Game } from "../../site/js/game.js";

const withBoard = (game, board) => {
  game.cells = board.map((exp, i) => (exp ? { id: 100 + i, exp, merged: false, spawned: false } : null));
  game.over = false;
  return game;
};

test("a new game starts with two tiles", () => {
  assert.equal(new Game(1).tiles.length, 2);
});

test("same seed gives the same opening", () => {
  assert.deepEqual(new Game(9).board, new Game(9).board);
});

test("moves agree with the engine and track merges", () => {
  const game = withBoard(new Game(3), [1, 1, 2, 0, ...Array(12).fill(0)]);
  const expected = move(game.board, LEFT);
  const result = game.move(LEFT);
  assert.equal(result.gained, expected.gained);
  assert.deepEqual(result.absorbed, [{ id: 101, cell: 0 }]);
  const kept = game.tiles.find((t) => t.id === 100);
  assert.equal(kept.exp, 2);
  assert.ok(kept.merged);
  assert.equal(game.tiles.filter((t) => t.spawned).length, 1);
});

test("illegal moves are ignored", () => {
  const game = withBoard(new Game(3), [1, 2, 3, 4, ...Array(12).fill(0)]);
  assert.equal(game.move(0), null);
  assert.equal(game.moves, 0);
});

test("reaching 2048 pauses until the player chooses to keep going", () => {
  const game = withBoard(new Game(5), [10, 10, ...Array(14).fill(0)]);
  game.move(LEFT);
  assert.ok(game.won && game.paused);
  assert.equal(game.move(1), null);
  game.continueAfterWin();
  assert.ok(!game.paused);
});

test("a saved game restores exactly, including future spawns", () => {
  const a = new Game(11);
  for (let i = 0; i < 30 && !a.over; i++) a.move(legalMoves(a.board)[0]);
  const b = new Game(0, structuredClone(a.serialize()));
  assert.deepEqual(b.board, a.board);
  for (const dir of DIRECTIONS) {
    if (!move(a.board, dir).moved) continue;
    a.move(dir);
    b.move(dir);
    break;
  }
  assert.deepEqual(b.board, a.board);
});
