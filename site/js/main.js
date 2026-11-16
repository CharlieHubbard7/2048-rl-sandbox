import { DEFAULT_MODEL, MODELS } from "./ai/models.js";
import { AiPlayer } from "./ai/player.js";
import { Game } from "./game.js";
import { onKeyboardMove, onSwipe } from "./input.js";
import { randomSeed } from "./rng.js";
import * as store from "./store.js";
import { ThinkingPanel } from "./thinking.js";
import { BoardView } from "./view.js";

const $ = (id) => document.getElementById(id);
const saved = store.load();

let seed = saved.seed ?? randomSeed();
let best = saved.best ?? 0;
let you = new Game(seed, saved.you);
let lastDecision = null;

const youView = new BoardView($("you-board"));
const aiView = new BoardView($("ai-board"), { heat: true });
const thinking = new ThinkingPanel($("thinking"), showAi);

const ai = new AiPlayer(aiView, {
  model: MODELS.some((m) => m.id === saved.model) ? saved.model : DEFAULT_MODEL,
  speed: saved.speed,
  explain: () => thinking.open,
  onMove(decision) {
    lastDecision = decision;
    showAi();
  },
  onChange: showAi,
  onError(error) {
    console.error(error);
    aiView.showMessage("Couldn't load this model", [
      { label: "Try again", onClick: () => ai.start(), primary: true },
    ]);
  },
});

function persist() {
  store.save({ seed, best, you: you.serialize(), model: ai.model, speed: ai.speed });
}

// ---- Your board -------------------------------------------------------------

function showYou() {
  best = Math.max(best, you.score);
  $("you-score").textContent = you.score.toLocaleString();
  $("you-best").textContent = best.toLocaleString();

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
  showYou();
  persist();
}

function keepGoing() {
  you.continueAfterWin();
  showYou();
  persist();
}

// Both boards restart from one new seed, so they get the same tiles.
function newGame() {
  seed = randomSeed();
  you = new Game(seed);
  youView.reset(you);
  ai.reset(seed);
  showYou();
  persist();
}

// ---- AI board ---------------------------------------------------------------

function showAi() {
  const { game } = ai;
  $("ai-score").textContent = game.score.toLocaleString();
  $("ai-toggle").textContent = ai.running ? "Pause" : ai.finished ? "Run again" : game.moves ? "Resume" : "Start";

  if (ai.finished) aiView.showMessage(`Final score ${game.score.toLocaleString()}`);
  else aiView.hideMessage();

  thinking.show(lastDecision);
  aiView.setHeat(thinking.open && lastDecision ? lastDecision.heat : null);
}

function toggleAi() {
  if (ai.running) ai.stop();
  else if (ai.finished) {
    ai.reset(seed);
    ai.start();
  } else ai.start();
}

function setSpeed(speed) {
  ai.setSpeed(speed);
  for (const button of $("ai-speed").children) {
    button.setAttribute("aria-checked", button.dataset.speed === ai.speed);
  }
  persist();
}

const picker = $("model");
picker.append(...MODELS.map((m) => new Option(m.label, m.id)));
picker.value = ai.model;
picker.addEventListener("change", () => {
  ai.model = picker.value;
  picker.blur(); // hand the arrow keys back to your board
  persist();
});

// ---- Wiring -------------------------------------------------------------------

onKeyboardMove(play);
onSwipe($("you-board"), play);
$("new-game").addEventListener("click", newGame);
$("ai-toggle").addEventListener("click", toggleAi);
$("ai-speed").addEventListener("click", (event) => {
  const { speed } = event.target.dataset;
  if (speed) setSpeed(speed);
});
$("open-about").addEventListener("click", () => $("about").showModal());

youView.reset(you);
showYou();
ai.reset(seed);
setSpeed(ai.speed);
