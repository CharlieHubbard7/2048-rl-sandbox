import { Game } from "../game.js";
import { decide } from "./client.js";

// Slide length and the minimum time between moves, in milliseconds.
const PACE = {
  slow: { slide: 110, interval: 280 },
  fast: { slide: 60, interval: 70 },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Drives the AI's board: ask the worker for a move, play it, repeat.
export class AiPlayer {
  // Bumped on every start, stop and reset, so a loop that is still awaiting
  // the worker can tell it has been superseded and quietly exit.
  #run = 0;

  constructor(view, { model, speed, explain, onMove, onChange, onError }) {
    this.view = view;
    this.model = model;
    this.running = false;
    // Asked before each move: explanations cost extra work, so they are only
    // computed while someone is looking at them.
    this.explain = explain;
    Object.assign(this, { onMove, onChange, onError });
    this.setSpeed(speed);
  }

  get finished() {
    return this.game.over;
  }

  setSpeed(speed) {
    this.speed = speed in PACE ? speed : "slow";
    this.view.setSlide(PACE[this.speed].slide);
  }

  reset(seed) {
    const resume = this.running;
    this.#run++;
    this.running = false;
    this.game = new Game(seed);
    this.game.continueAfterWin(); // the AI plays on past 2048
    this.view.reset(this.game);
    this.onMove(null);
    if (resume) this.start();
    else this.onChange();
  }

  stop() {
    this.#run++;
    this.running = false;
    this.onChange();
  }

  async start() {
    if (this.running || this.game.over) return;
    const run = ++this.#run;
    this.running = true;
    this.onChange();

    while (run === this.#run && !this.game.over) {
      const started = performance.now();
      let decision;
      try {
        decision = await decide(this.model, this.game.board, { explain: this.explain() });
      } catch (error) {
        if (run === this.#run) this.stop();
        this.onError(error);
        return;
      }
      if (run !== this.#run) return;

      const change = this.game.move(decision.action);
      this.view.update(this.game, change);
      this.onMove(decision);
      await sleep(PACE[this.speed].interval - (performance.now() - started));
    }

    if (run === this.#run) {
      this.running = false;
      this.onChange();
    }
  }
}
