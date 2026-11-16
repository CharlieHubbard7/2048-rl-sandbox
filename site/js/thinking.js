const MOVES = ["↑ Up", "↓ Down", "← Left", "→ Right"];

// What the four numbers mean, in plain words, for each kind of model.
const EXPLANATIONS = {
  prob: "How likely it is to choose each move.",
  q: "How many more points it expects after each move.",
  value: "How promising the board looks after each move.",
  search: "The average outcome of each move over every tile that could appear next.",
};

const formatValue = (v, kind) => {
  if (kind === "prob") return `${Math.round(v * 100)}%`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(1);
};

// The collapsible "Show what it's thinking" panel under the AI board.
export class ThinkingPanel {
  constructor(details, onToggle) {
    this.details = details;
    this.label = details.querySelector(".thinking-label");
    this.rows = MOVES.map((name) => {
      const row = document.createElement("div");
      row.className = "bar";
      row.innerHTML = `<span class="bar-name">${name}</span><span class="bar-track"><span class="bar-fill"></span></span><span class="bar-value"></span>`;
      details.querySelector(".bars").append(row);
      return { row, fill: row.querySelector(".bar-fill"), value: row.querySelector(".bar-value") };
    });
    details.addEventListener("toggle", onToggle);
  }

  get open() {
    return this.details.open;
  }

  show(decision) {
    if (!this.open) return;
    if (!decision) {
      this.label.textContent = "Press Start and the reasoning behind each move appears here.";
      this.rows.forEach(({ row, fill, value }) => {
        row.className = "bar";
        fill.style.width = "0%";
        value.textContent = "";
      });
      return;
    }

    const { values, action, kind } = decision;
    this.label.textContent = EXPLANATIONS[kind];
    const legal = values.filter((v) => v !== null);
    const lo = Math.min(...legal);
    const hi = Math.max(...legal);

    this.rows.forEach(({ row, fill, value }, dir) => {
      const v = values[dir];
      row.className = `bar${dir === action ? " is-chosen" : ""}${v === null ? " is-blocked" : ""}`;
      // Probabilities share a 0..1 scale already. Other values don't, so the
      // legal ones are stretched across the track with the worst still visible.
      let width = 0;
      if (v !== null) width = kind === "prob" ? v : hi > lo ? 0.12 + (0.88 * (v - lo)) / (hi - lo) : 1;
      fill.style.width = `${(width * 100).toFixed(1)}%`;
      value.textContent = v === null ? "can't move" : formatValue(v, kind);
    });
  }
}
