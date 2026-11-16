import { Game } from "./game.js";
import { onKeyboardMove, onSwipe } from "./input.js";
import { randomSeed } from "./rng.js";
import * as store from "./store.js";
import { BoardView } from "./view.js";

const $ = (id) => document.getElementById(id);
const saved = store.load();

let seed = saved.seed ?? randomSeed();
let best = saved.best ?? 0;
let you = new Game(seed, saved.you);
const youView = new BoardView($("you-board"));

function persist() {
  store.save({ seed, best, you: you.serialize() });
}

function showScore() {
  best = Math.max(best, you.score);
  $("you-score").textContent = you.score.toLocaleString();
  $("you-best").textContent = best.toLocaleString();
}

function showOutcome() {
  if (you.over) {
    youView.showMessage("Game over", [{ label: "Try again", onClick: newGame, primary: true }]);
  } else if (you.paused) {
    youView.showMessage("You made 2048", [
      { label: "Keep going", onClick: keepGoing, primary: true },
      { label: "New game", onClick: newGame },
    ]);
  } else {
    youView.hideMessage();
  }
}

function play(dir) {
  const change = you.move(dir);
  if (!change) return;
  youView.update(you, change);
  showScore();
  showOutcome();
  persist();
}

function keepGoing() {
  you.continueAfterWin();
  showOutcome();
  persist();
}

function newGame() {
  seed = randomSeed();
  you = new Game(seed);
  youView.reset(you);
  showScore();
  showOutcome();
  persist();
}

onKeyboardMove(play);
onSwipe($("you-board"), play);
$("new-game").addEventListener("click", newGame);

youView.reset(you);
showScore();
showOutcome();
