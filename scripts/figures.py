"""Draw the charts and diagrams for site/methodology.html as plain SVG.

    python scripts/figures.py

No plotting library: every figure is a handful of shapes, and writing them by
hand keeps them in the site's palette and type. Charts read the real training
logs in docs/training-logs; the few numbers that came from one-off
measurements during development are written out below with where they came from.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
OUT = ROOT / "site" / "img" / "methodology"
LOGS = ROOT / "docs" / "training-logs"

INK = "#1d2738"
MUTED = "#687488"
GRID = "#e3e8ef"
SURFACE = "#ffffff"
FONT = "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif"

# Series colours, validated together for colour-blind separation. The gold is
# light on white, so every chart that uses it labels its lines directly.
SERIES = {"ntuple": "#d9694f", "dqn": "#4b73b5", "ppo": "#c4952a"}
LABELS = {"ntuple": "N-tuple network", "dqn": "Deep Q-network", "ppo": "PPO"}

# The board tile ramp from site/css/style.css, by exponent.
TILE = {
    1: ("#d9e0eb", "#33415a"), 2: ("#c3d0e2", "#33415a"), 3: ("#a6bddc", "#233049"),
    4: ("#8eaad3", "#fff"), 5: ("#6c8fc6", "#fff"), 6: ("#4b73b5", "#fff"),
    7: ("#f0b9a6", "#5a2618"), 8: ("#ea9c82", "#fff"), 9: ("#e2805f", "#fff"),
    10: ("#d9694f", "#fff"), 11: ("#1d2738", "#fff"),
}  # fmt: skip


class Svg:
    def __init__(self, width, height, title):
        self.width, self.height = width, height
        self.parts = [
            f"<title>{title}</title>",
            f'<rect width="{width}" height="{height}" fill="{SURFACE}"/>',
        ]

    def add(self, markup):
        self.parts.append(markup)

    def text(self, x, y, s, size=13, fill=INK, anchor="start", weight=500):
        self.add(
            f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{fill}" '
            f'text-anchor="{anchor}" font-weight="{weight}">{s}</text>'
        )

    def line(self, x1, y1, x2, y2, stroke=GRID, width=1):
        self.add(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{width}"/>'
        )

    def save(self, name):
        OUT.mkdir(parents=True, exist_ok=True)
        body = "\n".join(self.parts)
        (OUT / name).write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.width} {self.height}" '
            f'font-family="{FONT}">\n{body}\n</svg>\n'
        )
        print(f"wrote {name}")


def compact(v):
    return f"{v / 1000:g}k" if v >= 1000 else f"{v:g}"


# ---- charts ---------------------------------------------------------------


def read_log(name):
    """(minutes, average score, 2048 rate) per line; one line is ~10 seconds."""
    rows = []
    for i, line in enumerate((LOGS / f"{name}.log").read_text().splitlines()):
        m = re.search(r"avg\s+(\d+)\s+2048 rate\s+([\d.]+)%", line)
        if m:
            rows.append(((i + 1) / 6, int(m.group(1)), float(m.group(2))))
    return rows


def line_chart(name, title, series, y_max, y_step, y_fmt, x_max=60, x_step=10, x_label="minutes of training"):
    w, h = 720, 340
    left, right, top, bottom = 56, 150, 24, 44
    pw, ph = w - left - right, h - top - bottom
    svg = Svg(w, h, title)
    x = lambda v: left + v / x_max * pw  # noqa: E731
    y = lambda v: top + ph - v / y_max * ph  # noqa: E731

    for v in range(0, y_max + 1, y_step):
        svg.line(left, y(v), left + pw, y(v))
        svg.text(left - 10, y(v) + 4, y_fmt(v), 12, MUTED, "end")
    for v in range(0, x_max + 1, x_step):
        svg.text(x(v), h - bottom + 22, str(v), 12, MUTED, "middle")
    svg.text(left + pw, h - 6, x_label, 12, MUTED, "end")

    ends = []
    for key, points in series:
        path = " ".join(
            f"{'M' if i == 0 else 'L'}{x(px):.1f},{y(py):.1f}" for i, (px, py) in enumerate(points)
        )
        svg.add(
            f'<path d="{path}" fill="none" stroke="{SERIES[key]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
        )
        ends.append((key, *points[-1]))

    # Direct labels at the line ends: spaced at least `gap` apart, then the
    # whole stack is lifted if it would run into the x-axis labels.
    gap, floor = 34, top + ph - 16
    ends.sort(key=lambda e: y(e[2]))
    spots = []
    for _, _, ey in ends:
        spots.append(max(y(ey), spots[-1] + gap) if spots else y(ey))
    lift = max(0, spots[-1] - floor) if spots else 0
    for (key, ex, ey), ly in zip(ends, spots, strict=True):
        ly -= lift
        svg.add(
            f'<circle cx="{x(ex):.1f}" cy="{y(ey):.1f}" r="4" fill="{SERIES[key]}" stroke="{SURFACE}" stroke-width="2"/>'
        )
        svg.text(x(ex) + 12, ly - 2, LABELS[key], 12, INK, weight=700)
        svg.text(x(ex) + 12, ly + 13, y_fmt(ey), 12, MUTED)
    svg.save(name)


def learning_curves():
    logs = {k: read_log(k) for k in SERIES}
    line_chart(
        "learning-curves.svg",
        "Average score of the last 100 training games, by minutes of training",
        [(k, [(m, s) for m, s, _ in rows]) for k, rows in logs.items()],
        y_max=60000, y_step=10000, y_fmt=lambda v: compact(round(v, -2)),
    )  # fmt: skip
    line_chart(
        "ntuple-2048-rate.svg",
        "Share of the last 100 N-tuple training games that reached 2048",
        [("ntuple", [(m, r) for m, _, r in logs["ntuple"]])],
        y_max=100, y_step=25, y_fmt=lambda v: f"{v:g}%",
    )  # fmt: skip


def bar_chart(name, title, rows, fmt, color=SERIES["dqn"], highlight=None):
    """Horizontal bars: rows of (label, value)."""
    w, row_h, left, right = 720, 44, 170, 90
    h = 24 + row_h * len(rows)
    svg = Svg(w, h, title)
    top = max(v for _, v in rows)
    for i, (label, value) in enumerate(rows):
        cy = 12 + i * row_h + row_h / 2
        length = max(4, value / top * (w - left - right))
        fill = SERIES["ntuple"] if label == highlight else color
        # Rounded at the data end only: a rect with a square cap drawn over its left edge.
        svg.add(f'<rect x="{left}" y="{cy - 11}" width="{length:.1f}" height="22" rx="4" fill="{fill}"/>')
        svg.add(f'<rect x="{left}" y="{cy - 11}" width="{min(8, length):.1f}" height="22" fill="{fill}"/>')
        svg.text(left - 14, cy + 4, label, 13, INK, "end", 600)
        svg.text(left + length + 10, cy + 4, fmt(value), 13, MUTED)
    svg.save(name)


def benchmark():
    # `npm run benchmark -- 30`: thirty seeded games each, in the browser code.
    rows = [
        ("Search + N-tuple", 109744), ("N-tuple network", 55334), ("Heuristic", 10007),
        ("Deep Q-network", 7687), ("PPO", 7351),
    ]  # fmt: skip
    bar_chart(
        "benchmark.svg",
        "Mean score over 30 seeded games",
        rows,
        lambda v: f"{v:,}",
        highlight="Search + N-tuple",
    )


def conv_speed():
    # One forward and backward pass on a batch of 256 boards, CPU torch without
    # MKLDNN, measured while chasing slow DQN training.
    rows = [("nn.Conv2d", 16.0), ("PairConv", 2.16)]
    bar_chart(
        "conv-speed.svg", "Milliseconds per training step for the same network", rows, lambda v: f"{v:g} ms"
    )


def pruning():
    # The pruning sweep: (threshold, MB on disk, mean score of the search over
    # 30 games). Dropping small weights barely moves the score.
    sweep = [(0, 10.16, 97021), (2, 8.40, 96721), (5, 6.67, 90839), (10, 4.98, 98593),
             (20, 3.28, 98104), (30, 2.45, 99055), (50, 1.64, 103799)]  # fmt: skip
    w, h = 720, 320
    left, right, top, bottom = 64, 40, 24, 48
    pw, ph = w - left - right, h - top - bottom
    svg = Svg(w, h, "Model file size against search strength at each pruning threshold")
    x = lambda mb: left + mb / 11 * pw  # noqa: E731
    y = lambda s: top + ph - s / 120000 * ph  # noqa: E731
    for v in range(0, 120001, 30000):
        svg.line(left, y(v), left + pw, y(v))
        svg.text(left - 10, y(v) + 4, compact(v), 12, MUTED, "end")
    for mb in range(0, 12, 2):
        svg.text(x(mb), h - bottom + 22, f"{mb} MB", 12, MUTED, "middle")
    svg.text(left + pw, h - 6, "size of ntuple.bin.gz", 12, MUTED, "end")
    path = " ".join(f"{'M' if i == 0 else 'L'}{x(mb):.1f},{y(s):.1f}" for i, (_, mb, s) in enumerate(sweep))
    svg.add(f'<path d="{path}" fill="none" stroke="{SERIES["ntuple"]}" stroke-width="2"/>')
    for t, mb, s in sweep:
        svg.add(
            f'<circle cx="{x(mb):.1f}" cy="{y(s):.1f}" r="4" fill="{SERIES["ntuple"]}" stroke="{SURFACE}" stroke-width="2"/>'
        )
        if t in (0, 10, 50):
            svg.text(x(mb), y(s) - 14, f"drop |w| ≤ {t}", 12, INK, "middle", 600)
    svg.save("pruning.svg")


# ---- diagrams ---------------------------------------------------------------


def tile(svg, x, y, size, exp, radius=6):
    if not exp:
        svg.add(f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{radius}" fill="#edf0f4"/>')
        return
    bg, fg = TILE[min(exp, 11)]
    svg.add(f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{radius}" fill="{bg}"/>')
    svg.text(x + size / 2, y + size / 2 + size * 0.14, 2**exp, size * 0.4, fg, "middle", 800)


def box(svg, x, y, w, h, title, sub=None, fill="#f4f6f9"):
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="#d5dce6"/>')
    ty = y + h / 2 + (-4 if sub else 5)
    svg.text(x + w / 2, ty, title, 13, INK, "middle", 700)
    if sub:
        svg.text(x + w / 2, ty + 17, sub, 12, MUTED, "middle")


def arrow(svg, x1, y1, x2, y2, dashed=False):
    dash = ' stroke-dasharray="4 4"' if dashed else ""
    svg.add(
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{MUTED}" stroke-width="1.5"{dash} marker-end="url(#head)"/>'
    )


ARROW_HEAD = (
    '<defs><marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
    f'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{MUTED}"/></marker></defs>'
)


def line_lookup():
    import numpy as np

    from rl2048 import game

    row = [1, 1, 2, 0]  # 2, 2, 4, empty
    after, reward = game.move(np.array([row, [0] * 4, [0] * 4, [0] * 4], np.uint8), game.LEFT)
    key = (row[0] << 12) | (row[1] << 8) | (row[2] << 4) | row[3]

    svg = Svg(720, 190, "Sliding a row left is one table lookup")
    svg.add(ARROW_HEAD)
    for i, e in enumerate(row):
        tile(svg, 24 + i * 52, 40, 46, e)
    svg.text(24, 26, "the row", 12, MUTED)
    svg.text(24, 118, "exponents  " + "  ".join(str(e) for e in row), 13, INK, weight=600)
    arrow(svg, 236, 63, 286, 63)
    box(svg, 292, 34, 160, 58, f"key = {key:,}", "4 bits per cell")
    arrow(svg, 456, 63, 496, 63)
    for i, e in enumerate(after[0]):
        tile(svg, 504 + i * 52, 40, 46, int(e))
    svg.text(504, 26, "table[key]: the slid row", 12, MUTED)
    svg.text(504, 118, f"+{int(reward)} points, also from the table", 13, INK, weight=600)
    svg.text(
        24,
        164,
        "All 65,536 possible rows are solved once at startup. Every move, in Python and in the",
        13,
        MUTED,
    )
    svg.text(24, 182, "browser, is then a flip or transpose plus four lookups.", 13, MUTED)
    svg.save("line-lookup.svg")


def ntuple_patterns():
    from rl2048.agents.ntuple import PATTERNS

    cell, gap = 26, 4
    svg = Svg(720, 200, "The four six-cell patterns of the N-tuple network")
    for p, pattern in enumerate(PATTERNS):
        ox = 24 + p * 176
        svg.text(ox, 22, f"Pattern {p + 1}", 13, INK, weight=700)
        for c in range(16):
            x, y = ox + (c % 4) * (cell + gap), 34 + (c // 4) * (cell + gap)
            fill = SERIES["ntuple"] if c in pattern else "#edf0f4"
            svg.add(f'<rect x="{x}" y="{y}" width="{cell}" height="{cell}" rx="4" fill="{fill}"/>')
    svg.text(
        24, 180, "Each pattern is reused in all 8 rotations and reflections of the board, so one", 13, MUTED
    )
    svg.text(
        24, 198, "board becomes 32 table lookups, and one game teaches every orientation at once.", 13, MUTED
    )
    svg.save("ntuple-patterns.svg")


def expectimax_tree():
    svg = Svg(720, 300, "Expectimax: maximise over moves, average over random tiles")
    svg.add(ARROW_HEAD)
    box(svg, 285, 16, 150, 46, "Board", "you choose: max", "#fff")
    moves = [("↑ Up", 70), ("← Left", 290), ("→ Right", 510)]
    for label, x in moves:
        arrow(svg, 360, 62, x + 70, 104)
        box(svg, x, 106, 140, 46, label, "tile appears: average")
    for i, (label, sub) in enumerate(
        [("2 here", "p = 0.9 / empties"), ("4 here", "p = 0.1 / empties"), ("2 there", "…")]
    ):
        x = 165 + i * 135
        arrow(svg, 360, 152, x + 60, 194, dashed=i == 2)
        box(svg, x, 196, 120, 44, label, sub, "#fff")
    svg.text(
        360,
        270,
        "…until the depth runs out, where the N-tuple network scores the board.",
        13,
        MUTED,
        "middle",
    )
    svg.text(360, 290, "One ply normally, two when fewer than four cells are empty.", 13, MUTED, "middle")
    svg.save("expectimax-tree.svg")


def networks():
    svg = Svg(720, 250, "The shared network shape for DQN and PPO")
    svg.add(ARROW_HEAD)
    stages = [
        ("Board", "16 one-hot planes"),
        ("2×2 conv", "128 × 3 × 3"),
        ("2×2 conv", "128 × 2 × 2"),
        ("Dense", "256"),
    ]
    for i, (title, sub) in enumerate(stages):
        x = 16 + i * 140
        box(svg, x, 96, 120, 54, title, sub)
        if i:
            arrow(svg, x - 18, 123, x - 2, 123)
    arrow(svg, 576, 112, 596, 60)
    arrow(svg, 576, 134, 596, 186)
    box(svg, 598, 30, 110, 54, "DQN head", "4 Q-values", "#fff")
    box(svg, 598, 166, 110, 54, "PPO heads", "4 probs + value", "#fff")
    svg.text(16, 30, "Same trunk, different heads.", 13, INK, weight=700)
    svg.text(16, 50, "2×2 kernels look at exactly the neighbour pairs that can merge.", 13, MUTED)
    svg.save("networks.svg")


def pipeline():
    svg = Svg(720, 170, "From training in Python to playing in the browser")
    svg.add(ARROW_HEAD)
    steps = [("Train", "NumPy + PyTorch"), ("Export", "prune, int16, gzip"), ("Ship", "site/models"),
             ("Worker", "plain JavaScript"), ("Board", "your browser")]  # fmt: skip
    for i, (title, sub) in enumerate(steps):
        x = 12 + i * 142
        box(svg, x, 20, 124, 56, title, sub, "#fff" if i in (0, 4) else "#f4f6f9")
        if i:
            arrow(svg, x - 16, 48, x - 2, 48)
    svg.add(
        f'<path d="M 216 92 v 14 h 284 v -14" fill="none" stroke="{SERIES["ntuple"]}" stroke-width="1.5"/>'
    )
    svg.text(358, 128, "parity tests: the JavaScript must reproduce", 13, INK, "middle", 600)
    svg.text(358, 146, "Python's moves, values and network outputs", 13, MUTED, "middle")
    svg.save("pipeline.svg")


if __name__ == "__main__":
    learning_curves()
    benchmark()
    conv_speed()
    pruning()
    line_lookup()
    ntuple_patterns()
    expectimax_tree()
    networks()
    pipeline()
