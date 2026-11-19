import { decide } from "./ai/client.js";
import { DEFAULT_MODEL, MODELS, modelInfo } from "./ai/models.js";
import { AiPlayer } from "./ai/player.js";
import { Game } from "./game.js";
import { onKeyboardMove, onSwipe } from "./input.js";
import { randomSeed } from "./rng.js";
import * as store from "./store.js";
import { BoardView } from "./view.js";
import { ARROWS, NAMES, fmt } from "./watch/draw.js";
import { Explainer } from "./watch/explainer.js";
import { MindPanel } from "./watch/mind.js";

const $ = (id) => document.getElementById(id);
const saved = store.load();

function persist() {
  store.save({ seed, best, you: you.serialize(), model: ai.model, pace: ai.pace, inside: $("inside").open });
}

// ---- Tabs ---------------------------------------------------------------------

const TABS = { watch: $("tab-watch"), play: $("tab-play") };

function showTab(name, { focus = false } = {}) {
  for (const [key, tab] of Object.entries(TABS)) {
    const on = key === name;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    $(key).hidden = !on;
    if (on && focus) tab.focus();
  }
  document.body.dataset.tab = name;
  if (name === "play") ai.pause(); // nobody is watching
}

const tabFromHash = () => (location.hash === "#play" ? "play" : "watch");
for (const [key, tab] of Object.entries(TABS)) {
  tab.addEventListener("click", () => {
    history.replaceState(null, "", key === "play" ? "#play" : location.pathname + location.search);
    showTab(key);
  });
}
$("tab-watch").parentElement.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  event.stopPropagation();
  const next = document.body.dataset.tab === "watch" ? "play" : "watch";
  TABS[next].click();
  TABS[next].focus();
});
addEventListener("hashchange", () => showTab(tabFromHash()));

// ---- Watch the AI ---------------------------------------------------------------

const aiView = new BoardView($("ai-board"));
const mind = new MindPanel({ futures: $("futures"), verdict: $("verdict"), why: $("why"), whyTitle: $("why-title") });
const explainer = new Explainer({
  figure: $("ex-figure"),
  caption: $("ex-caption"),
  steps: $("ex-steps"),
  play: $("ex-play"),
});

// "Inside the numbers" stays folded unless the reader opened it last time.
$("inside").open = Boolean(saved.inside);
$("inside").addEventListener("toggle", () => persist());

const ai = new AiPlayer(aiView, {
  model: MODELS.some((m) => m.id === saved.model) ? saved.model : DEFAULT_MODEL,
  pace: saved.pace,
  onDecision(decision) {
    if (!ai.game) return;
    if (!decision) {
      if (!ai.game.over) mind.loading();
      return;
    }
    mind.show(decision, modelInfo(ai.model).lede);
    // Stepping one move at a time redraws the explanation for every move.
    explainer.offer(decision, { moveNumber: ai.game.moves + 1, force: ai.pace === "step" && ai.game.moves > 0 });
  },
  onMove() {
    mind.played();
  },
  onChange: () => showAi(),
  onError(error) {
    console.error(error);
    aiView.showMessage("Couldn't load this model", [
      { label: "Try again", onClick: () => ai.setModel(ai.model), primary: true },
    ]);
  },
});

function goLabel() {
  if (ai.finished) return "New game";
  if (ai.pace === "step") return "Next move";
  return ai.running ? "Pause" : "Play";
}

function showAi() {
  const { game } = ai;
  if (!game) return;
  $("ai-score").textContent = game.score.toLocaleString();
  $("ai-moves").textContent = game.moves.toLocaleString();
  $("ai-best").textContent = (2 ** Math.max(...game.board)).toLocaleString();
  $("ai-go").textContent = goLabel();
  $("ai-go").classList.toggle("is-running", ai.running);
  for (const button of $("pace").children) {
    button.setAttribute("aria-checked", String(button.dataset.pace === ai.pace));
  }
  for (const button of $("model").children) {
    button.setAttribute("aria-checked", String(button.dataset.model === ai.model));
  }
  $("model-blurb").textContent = modelInfo(ai.model).blurb;

  if (game.over) {
    mind.ended(game);
    aiView.showMessage(`Final score ${game.score.toLocaleString()}`, [
      { label: "New game", onClick: newAiGame, primary: true },
    ]);
  } else {
    aiView.hideMessage();
  }
}

function newAiGame() {
  explainer.clear("Thinking about the first move…");
  ai.newGame();
}

function go() {
  if (ai.finished) return newAiGame();
  if (ai.pace === "step") return ai.step();
  if (ai.running) ai.pause();
  else ai.play();
}

function setPace(pace) {
  const wasRunning = ai.running;
  ai.setPace(pace);
  // Switching between slow and fast keeps it playing.
  if (wasRunning && pace !== "step") ai.play();
  persist();
}

function setModel(model) {
  if (model === ai.model) return;
  explainer.clear("Loading the model…");
  ai.setModel(model);
  showAi();
  persist();
}

$("model").append(
  ...MODELS.map((m) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "radio");
    button.dataset.model = m.id;
    button.textContent = m.short;
    button.title = m.label;
    return button;
  }),
);
$("model").addEventListener("click", (event) => {
  const { model } = event.target.closest("[data-model]")?.dataset ?? {};
  if (model) setModel(model);
});
$("pace").addEventListener("click", (event) => {
  const { pace } = event.target.closest("[data-pace]")?.dataset ?? {};
  if (pace) setPace(pace);
});
$("ai-go").addEventListener("click", go);
$("ai-new").addEventListener("click", newAiGame);

// Space steps or plays, unless a control has focus and will handle it.
document.addEventListener("keydown", (event) => {
  if (document.body.dataset.tab !== "watch" || event.key !== " ") return;
  if (event.target.closest("button, a, input, select, textarea")) return;
  event.preventDefault();
  go();
});

// ---- Play yourself --------------------------------------------------------------

let seed = saved.seed ?? randomSeed();
let best = saved.best ?? 0;
let you = new Game(seed, saved.you);
const youView = new BoardView($("you-board"));

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
  if (document.body.dataset.tab !== "play") return;
  const change = you.move(dir);
  if (!change) return;
  $("hint-text").textContent = "";
  youView.update(you, change);
  showYou();
  persist();
}

function keepGoing() {
  you.continueAfterWin();
  showYou();
  persist();
}

function newGame() {
  seed = randomSeed();
  you = new Game(seed);
  youView.reset(you);
  $("hint-text").textContent = "";
  showYou();
  persist();
}

async function hint() {
  if (you.over) return;
  const out = $("hint-text");
  out.textContent = "Thinking…";
  const board = you.board;
  try {
    const d = await decide("expectimax", board);
    if (String(you.board) !== String(board)) return; // you moved meanwhile
    const others = d.values.map((v, dir) => ({ v, dir })).filter(({ v, dir }) => v !== null && dir !== d.action);
    const next = others.sort((a, b) => b.v - a.v)[0];
    out.textContent = next
      ? `The search would play ${ARROWS[d.action]} ${NAMES[d.action]}: it averages ${fmt(d.values[d.action])}, against ${fmt(next.v)} for ${NAMES[next.dir]}.`
      : `Only one move is possible: ${ARROWS[d.action]} ${NAMES[d.action]}.`;
  } catch {
    out.textContent = "Couldn't load the search model.";
  }
}

onKeyboardMove(play);
onSwipe($("you-board"), play);
$("new-game").addEventListener("click", newGame);
$("hint").addEventListener("click", hint);

// ---- Start -------------------------------------------------------------------------

youView.reset(you);
showYou();
showTab(tabFromHash());
newAiGame();
