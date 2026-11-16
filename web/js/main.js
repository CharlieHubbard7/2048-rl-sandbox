import { Board, tileColors } from "./board.js";
import { LineChart, compact } from "./chart.js";

const $ = (id) => document.getElementById(id);
const MOVES = ["↑ Up", "↓ Down", "← Left", "→ Right"];
const KEYS = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3, w: 0, s: 1, a: 2, d: 3 };

const BAR_LABEL = {
  prob: "Move probability",
  q: "Q-value of each move",
  value: "Merge reward + value of the resulting board",
};
const HEAT_NOTE = {
  random: "Random play has no notion of what matters, so there is no heatmap.",
  heuristic: "Heatmap: positional weight × tile exponent on the board after the chosen move.",
  ntuple: "Heatmap: N-tuple weights active on the chosen afterstate, spread over the cells each tuple covers.",
  dqn: "Heatmap: gradient × input saliency of the chosen move's Q-value.",
  ppo: "Heatmap: gradient × input saliency of the critic's value estimate.",
  expectimax: "Heatmap: N-tuple leaf weights on the chosen afterstate.",
};

const ui = {
  agents: [],
  state: null,
  history: {}, // agent name -> training chart points
  bench: {}, // agent name -> { done, games, result }
};

let socket;
const send = (msg) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify(msg));

const board = new Board({ cells: $("cells"), tiles: $("tiles"), heat: $("heat") });
const charts = {
  score: new LineChart($("c-score"), [{ color: "#f2b33d" }]),
  tile: new LineChart($("c-tile"), [{ color: "#5ed6e6", log2: true, format: (v) => String(Math.round(v)) }]),
  loss: new LineChart($("c-loss"), [{ color: "#c98bdb", label: "loss" }, { color: "#8792a8", label: "" }]),
};

// ---- socket --------------------------------------------------------------

function connect() {
  socket = new WebSocket(`ws://${location.host}/ws`);
  socket.onopen = () => { $("conn").textContent = "Connected"; $("conn").classList.add("up"); };
  socket.onclose = () => {
    $("conn").textContent = "Reconnecting";
    $("conn").classList.remove("up");
    setTimeout(connect, 1000);
  };
  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handlers[msg.type]?.(msg);
  };
}

const handlers = {
  agents(msg) {
    ui.agents = msg.agents;
    renderAgents();
    renderBench();
  },
  state(msg) {
    const prev = ui.state;
    ui.state = msg;
    board.render(msg.board, msg.last_action, prev && msg.moves === prev.moves + 1);
    renderGame();
  },
  train_history(msg) {
    ui.history[msg.agent] = msg.points;
    renderTraining();
  },
  train_point(msg) {
    (ui.history[msg.agent] ??= []).push(msg.point);
    renderTraining();
  },
  benchmark(msg) {
    if (msg.finished) {
      ui.benchRunning = false;
    } else {
      const entry = (ui.bench[msg.agent] ??= {});
      Object.assign(entry, msg.result ? { result: msg.result } : { done: msg.done, games: msg.games });
    }
    renderBench();
  },
  toast(msg) {
    const t = $("toast");
    t.textContent = msg.message;
    t.hidden = false;
    clearTimeout(t.timer);
    t.timer = setTimeout(() => (t.hidden = true), 2600);
  },
};

// ---- rendering -------------------------------------------------------------

const agentInfo = (name) => ui.agents.find((a) => a.name === name);

function renderAgents() {
  const nav = $("agents");
  nav.replaceChildren(
    ...ui.agents.map((a) => {
      const b = document.createElement("button");
      b.textContent = a.label;
      b.title = a.blurb;
      b.setAttribute("aria-pressed", a.name === ui.state?.agent);
      b.onclick = () => send({ type: "select_agent", name: a.name });
      return b;
    }),
  );
}

function renderGame() {
  const s = ui.state;
  $("score").textContent = s.score.toLocaleString();
  $("moves").textContent = s.moves.toLocaleString();
  $("maxtile").textContent = s.max_tile.toLocaleString();
  $("over").hidden = !s.done;

  const play = $("play");
  play.textContent = s.playing ? "Pause" : "Watch agent play";
  play.classList.toggle("active", s.playing);
  play.disabled = s.done;
  for (const b of $("speed").children) b.setAttribute("aria-checked", b.dataset.speed === s.speed);

  renderAgents();
  renderBrain();
  renderTraining();
}

function renderBrain() {
  const s = ui.state;
  const info = agentInfo(s.agent);
  if (!info) return;
  $("brain-title").textContent = info.label;
  $("brain-blurb").textContent = info.blurb;
  $("heat-note").textContent = HEAT_NOTE[s.agent] ?? "";

  const d = s.decision;
  $("bars-label").textContent = d ? BAR_LABEL[d.kind] : "Game over";
  board.setHeat(d && $("show-heat").checked ? d.heatmap : null);

  const legal = d ? d.values.filter((v) => v != null) : [];
  const lo = Math.min(...legal);
  const hi = Math.max(...legal);
  $("bars").replaceChildren(
    ...MOVES.map((name, i) => {
      const v = d?.values[i];
      const row = document.createElement("div");
      row.className = "bar";
      if (v == null) row.classList.add("blocked");
      if (d && d.action === i) row.classList.add("chosen");

      // Probabilities are already on a shared 0..1 scale. Values aren't, so
      // stretch the legal ones across the track, keeping the worst visible.
      let width = 0;
      if (v != null) width = d.kind === "prob" ? v : hi > lo ? 0.15 + (0.85 * (v - lo)) / (hi - lo) : 1;
      const num = v == null ? "blocked" : d.kind === "prob" ? `${(v * 100).toFixed(1)}%` : compact(v);
      row.innerHTML = `<span class="name">${name}</span><span class="track"><span class="fill" style="width:${(width * 100).toFixed(1)}%"></span></span><span class="num">${num}</span>`;
      return row;
    }),
  );
}

function renderTraining() {
  const s = ui.state;
  if (!s) return;
  const info = agentInfo(s.agent);
  // Expectimax has no weights of its own; its charts are the N-tuple's.
  const target = s.agent === "expectimax" ? "ntuple" : s.agent;
  const targetInfo = agentInfo(target);
  const trainable = targetInfo?.trainable;
  const training = s.training;

  const btn = $("train");
  btn.disabled = !trainable && !training;
  btn.classList.toggle("active", Boolean(training));
  btn.textContent = training ? `Stop training ${agentInfo(training)?.label}` : `Train ${targetInfo?.label ?? ""}`;

  let status;
  if (training) status = `${agentInfo(training).label} is training in the background. Charts update twice a second.`;
  else if (!trainable) status = `${info?.label} doesn't learn. Pick N-Tuple, DQN or PPO to train one live.`;
  else if (s.agent === "expectimax") status = "Expectimax searches with the N-Tuple network, so training N-Tuple makes it stronger too.";
  else status = "Training runs in the background while you keep playing or watching.";
  $("train-status").textContent = status;

  const points = ui.history[target] ?? [];
  const last = points[points.length - 1];
  $("k-episodes").textContent = (last?.episode ?? 0).toLocaleString();
  $("k-score").textContent = last ? Math.round(last.score).toLocaleString() : "–";
  $("k-win").textContent = last ? `${(last.win_rate * 100).toFixed(0)}%` : "–";

  const explore = points.some((p) => p.epsilon != null) ? "epsilon" : points.some((p) => p.entropy != null) ? "entropy" : null;
  $("c-loss-label").textContent = explore ? `Loss and ${explore === "epsilon" ? "ε (exploration)" : "policy entropy"}` : "Loss";
  charts.loss.series[1].label = explore === "epsilon" ? "ε" : "entropy";
  charts.score.set([points.map((p) => p.score)]);
  charts.tile.set([points.map((p) => p.best_tile)]);
  charts.loss.set([points.map((p) => p.loss), explore ? points.map((p) => p[explore]) : []]);

  const files = targetInfo?.checkpoints ?? [];
  const select = $("ckpt");
  const current = select.value;
  select.replaceChildren(
    ...(files.length ? files : ["No saved checkpoints"]).map((f) => new Option(f, files.length ? f : "")),
  );
  if (files.includes(current)) select.value = current;
  $("save").disabled = !trainable;
  $("load").disabled = !files.length;
}

const BENCH_TILES = [64, 128, 256, 512, 1024, 2048, 4096, 8192];

function renderBench() {
  $("bench").disabled = Boolean(ui.benchRunning);
  $("bench").textContent = ui.benchRunning ? "Benchmark running…" : "Benchmark all agents";
  $("results").replaceChildren(
    ...ui.agents.map((a) => {
      const entry = ui.bench[a.name];
      const r = entry?.result;
      const tr = document.createElement("tr");
      const cell = (text, cls) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (cls) td.className = cls;
        tr.append(td);
        return td;
      };
      cell(a.label, "agent");
      cell(r ? Math.round(r.mean_score).toLocaleString() : "–");
      cell(r ? Math.round(r.median_score).toLocaleString() : "–");
      cell(r ? r.best_score.toLocaleString() : "–");
      cell(r ? `${(r.win_rate * 100).toFixed(0)}%` : "–");
      const dist = cell("");
      if (r) dist.append(distribution(r));
      else if (entry) dist.innerHTML = `<div class="progress"><span style="width:${(100 * entry.done) / entry.games}%"></span></div>`;
      else dist.textContent = ui.benchRunning ? "Waiting" : "";
      return tr;
    }),
  );
  $("legend").replaceChildren(
    ...BENCH_TILES.map((t) => {
      const span = document.createElement("span");
      span.innerHTML = `<i style="--tile:${tileColors(t).bg}"></i>${t === 64 ? "≤64" : t}`;
      return span;
    }),
  );
}

function distribution(result) {
  const bar = document.createElement("div");
  bar.className = "dist";
  const counts = {};
  for (const [tile, n] of Object.entries(result.tiles)) {
    const key = Math.max(64, Math.min(8192, Number(tile)));
    counts[key] = (counts[key] ?? 0) + n;
  }
  for (const t of BENCH_TILES) {
    if (!counts[t]) continue;
    const seg = document.createElement("span");
    seg.style.flex = counts[t];
    seg.style.setProperty("--tile", tileColors(t).bg);
    seg.title = `${t === 64 ? "≤64" : t}: ${counts[t]} of ${result.games} games`;
    bar.append(seg);
  }
  return bar;
}

// ---- input -------------------------------------------------------------

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, select") || e.metaKey || e.ctrlKey) return;
  const action = KEYS[e.key];
  if (action != null) {
    e.preventDefault();
    send({ type: "move", action });
  } else if (e.key === " " && !e.target.closest("button")) {
    e.preventDefault();
    send({ type: "play", on: !ui.state?.playing });
  } else if (e.key === "n") {
    send({ type: "new_game" });
  }
});

document.querySelectorAll("[data-cmd]").forEach((b) => (b.onclick = () => send({ type: b.dataset.cmd })));
$("speed").onclick = (e) => e.target.dataset.speed && send({ type: "speed", value: e.target.dataset.speed });
$("play").onclick = () => send({ type: "play", on: !ui.state?.playing });
$("show-heat").onchange = renderBrain;
$("train").onclick = () => {
  const s = ui.state;
  const name = s.agent === "expectimax" ? "ntuple" : s.agent;
  send(s.training ? { type: "train", on: false } : { type: "train", on: true, name });
};
$("save").onclick = () => send({ type: "save", name: ui.state.agent === "expectimax" ? "ntuple" : ui.state.agent });
$("load").onclick = () => {
  const name = ui.state.agent === "expectimax" ? "ntuple" : ui.state.agent;
  send({ type: "load", name, file: $("ckpt").value });
};
$("bench").onclick = () => {
  ui.bench = {};
  ui.benchRunning = true;
  renderBench();
  send({ type: "benchmark", games: Number($("bench-games").value) || 100 });
};

connect();
