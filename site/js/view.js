const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const el = (tag, className) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

// Renders one Game into a .board element. Both boards on the page use this
// class, so they look and move identically.
export class BoardView {
  #tiles = new Map(); // tile id -> element
  #pending = [];
  #timer = 0;

  constructor(root, { heat = false } = {}) {
    this.root = root;
    this.slideMs = 100;
    const grid = el("div", "board-grid");
    for (let i = 0; i < 16; i++) grid.append(el("div", "board-cell"));
    this.layer = el("div", "board-tiles");
    this.message = el("div", "board-message");
    root.append(grid, this.layer);

    if (heat) {
      this.heat = el("div", "board-heat");
      this.heatCells = Array.from({ length: 16 }, (_, i) => {
        const cell = el("span");
        place(cell, i);
        this.heat.append(cell);
        return cell;
      });
      root.append(this.heat);
    }
    root.append(this.message);
  }

  setSlide(ms) {
    this.slideMs = ms;
    this.root.style.setProperty("--slide", `${ms}ms`);
  }

  // Draws the game from scratch: used on load and for new games.
  reset(game) {
    this.#flush();
    this.layer.replaceChildren();
    this.#tiles.clear();
    for (const tile of game.tiles) this.#add(tile, "appear");
  }

  // Animates one move: every tile slides to its new cell, tiles that merged
  // away slide under their partner and vanish, then merges and the new tile
  // pop in once the slide has finished.
  update(game, { absorbed }) {
    this.#flush();
    const after = [];

    for (const { id, cell } of absorbed) {
      const node = this.#tiles.get(id);
      this.#tiles.delete(id);
      place(node, cell);
      node.style.zIndex = 0;
      after.push(() => node.remove());
    }

    for (const tile of game.tiles) {
      const node = this.#tiles.get(tile.id);
      if (!node) {
        after.push(() => this.#add(tile, "appear"));
        continue;
      }
      place(node, tile.cell);
      if (tile.merged) after.push(() => paint(node.firstChild, tile.exp, "merge"));
    }

    this.#pending = after;
    const delay = reducedMotion.matches ? 0 : this.slideMs;
    this.#timer = setTimeout(() => this.#flush(), delay);
  }

  // A quicker move arriving mid-animation finishes the previous one first.
  #flush() {
    clearTimeout(this.#timer);
    const work = this.#pending;
    this.#pending = [];
    work.forEach((fn) => fn());
  }

  #add(tile, animation) {
    const node = el("div", "tile");
    const face = el("div", "tile-face");
    node.append(face);
    place(node, tile.cell);
    paint(face, tile.exp, animation);
    this.layer.append(node);
    this.#tiles.set(tile.id, node);
  }

  showMessage(title, actions = []) {
    const heading = el("p", "board-message-title");
    heading.textContent = title;
    const row = el("div", "board-message-actions");
    for (const { label, onClick, primary } of actions) {
      const button = el("button", primary ? "button button-primary" : "button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", onClick);
      row.append(button);
    }
    this.message.replaceChildren(heading, row);
    this.message.classList.add("is-visible");
    row.querySelector("button")?.focus({ preventScroll: true });
  }

  hideMessage() {
    this.message.classList.remove("is-visible");
  }

  // Values are rescaled to 0..1 so the glow shows relative attention.
  setHeat(values) {
    if (!this.heat) return;
    const lo = values ? Math.min(...values) : 0;
    const hi = values ? Math.max(...values) : 0;
    this.heatCells.forEach((cell, i) => {
      const h = values && hi > lo ? (values[i] - lo) / (hi - lo) : 0;
      cell.style.setProperty("--h", h.toFixed(3));
    });
  }
}

function place(node, cell) {
  node.style.setProperty("--x", cell % 4);
  node.style.setProperty("--y", Math.floor(cell / 4));
}

function paint(face, exp, animation) {
  const value = 2 ** exp;
  face.textContent = value;
  face.dataset.exp = Math.min(exp, 12);
  face.dataset.digits = String(value).length;
  if (animation && !reducedMotion.matches) {
    face.classList.remove("appear", "merge");
    void face.offsetWidth; // restart the animation if it is already applied
    face.classList.add(animation);
  }
}
