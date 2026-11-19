import { Game } from "../game.js";
import { randomSeed } from "../rng.js";
import { decide } from "./client.js";

// How long a tile slide takes, and how long the decision stays on screen
// before the move is played, in milliseconds.
export const PACE = {
  step: { slide: 160, dwell: 0 },
  slow: { slide: 160, dwell: 900 },
  fast: { slide: 60, dwell: 10 },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

// Drives the AI's board. The model always thinks about the board in front of
// it before anything moves, so the thinking panel shows the reasoning for the
// move that is about to happen, then the move happens.
export class AiPlayer {
  // Bumped whenever the game or model changes, so work still awaiting the
  // worker can tell it has been superseded and quietly drop its result.
  #epoch = 0;
  #thinking = null; // promise of the decision for the current board
  #busy = false; // a single step is in flight

  constructor(view, { model, pace, onDecision, onMove, onChange, onError }) {
    this.view = view;
    this.running = false;
    this.decision = null; // the decision for the current board, once known
    Object.assign(this, { onDecision, onMove, onChange, onError });
    this.model = model;
    this.pace = pace in PACE ? pace : "step";
    view.setSlide(PACE[this.pace].slide);
  }

  get finished() {
    return this.game.over;
  }

  setPace(pace) {
    this.pace = pace in PACE ? pace : "step";
    this.view.setSlide(PACE[this.pace].slide);
    if (this.pace === "step") this.pause();
    this.onChange();
  }

  setModel(model) {
    this.model = model;
    this.#forget();
    this.think();
  }

  newGame(seed = randomSeed()) {
    this.seed = seed;
    this.running = false;
    this.game = new Game(seed);
    this.game.continueAfterWin(); // the AI plays on past 2048
    this.view.reset(this.game);
    this.#forget();
    this.onChange();
    this.think();
  }

  #forget() {
    this.#epoch++;
    this.#thinking = null;
    this.decision = null;
    this.onDecision(null);
  }

  // The decision for the current board, asking the model only once.
  think() {
    if (this.game.over) return Promise.resolve(null);
    if (this.#thinking) return this.#thinking;
    const epoch = this.#epoch;
    this.#thinking = decide(this.model, this.game.board, { explain: true, detail: true }).then(
      (decision) => {
        if (epoch !== this.#epoch) return null;
        this.decision = decision;
        this.onDecision(decision);
        return decision;
      },
      (error) => {
        if (epoch !== this.#epoch) return null;
        this.#thinking = null;
        this.running = false;
        this.onChange();
        this.onError(error);
        return null;
      },
    );
    return this.#thinking;
  }

  // Plays the move the model already chose for this board.
  async #play() {
    const epoch = this.#epoch;
    const decision = await this.think();
    if (!decision || epoch !== this.#epoch) return false;
    const change = this.game.move(decision.action);
    this.#epoch++;
    this.#thinking = null;
    this.decision = null;
    this.view.update(this.game, change);
    this.onMove(decision, change);
    this.onChange();
    return true;
  }

  async step() {
    if (this.running) this.pause();
    if (this.#busy || this.game.over) return;
    this.#busy = true;
    try {
      if (await this.#play()) {
        await sleep(PACE[this.pace].slide);
        this.think();
      }
    } finally {
      this.#busy = false;
    }
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    this.onChange();
  }

  async play() {
    if (this.running || this.game.over) return;
    this.running = true;
    this.onChange();
    const seed = this.seed;
    while (this.running && !this.game.over && seed === this.seed) {
      const decision = await this.think();
      if (!this.running) break;
      if (!decision) continue; // the model changed mid-thought: ask the new one
      // Leave the reasoning on screen for a moment before acting on it.
      await sleep(PACE[this.pace].dwell);
      if (!this.running || seed !== this.seed) break;
      if (!(await this.#play())) continue; // the model changed mid-thought
      await sleep(PACE[this.pace].slide);
    }
    if (this.running) {
      this.running = false;
      this.onChange();
    }
    this.think();
  }
}
