// A deliberately tiny line chart: a few hundred points, redrawn on demand.
// Chart.js would work too, but this keeps the page dependency-free.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function compact(v) {
  if (v == null) return "–";
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (a >= 1e4) return (v / 1e3).toFixed(1) + "k";
  if (a >= 100) return Math.round(v).toString();
  return v.toFixed(a >= 10 ? 1 : 3);
}

export class LineChart {
  // series: [{ color, format, log2 }]. The first series owns the y axis;
  // any further series are scaled to their own range and only labelled.
  constructor(canvas, series) {
    this.canvas = canvas;
    this.series = series;
    this.data = series.map(() => []);
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  set(data) {
    this.data = data;
    this.draw();
  }

  draw() {
    const { canvas } = this;
    const dpr = devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.font = `11px ${css("--ui")}`;

    const pad = { l: 40, r: 6, t: 18, b: 6 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;

    if (!this.data[0]?.length) {
      ctx.fillStyle = css("--muted");
      ctx.fillText("No episodes yet", pad.l, pad.t + ph / 2);
      return;
    }

    this.series.forEach((s, i) => {
      const raw = this.data[i].filter((v) => v != null);
      if (!raw.length) return;
      const vals = this.data[i].map((v) => (v == null ? null : s.log2 ? Math.log2(v) : v));
      const clean = vals.filter((v) => v != null);
      let lo = Math.min(...clean);
      let hi = Math.max(...clean);
      if (s.log2) { lo = Math.floor(lo); hi = Math.ceil(hi); }
      if (hi === lo) { hi += 1; lo -= s.log2 ? 0 : 1; }
      const x = (j) => pad.l + (vals.length === 1 ? pw : (j / (vals.length - 1)) * pw);
      const y = (v) => pad.t + ph - ((v - lo) / (hi - lo)) * ph;
      const fmt = s.format || compact;

      if (i === 0) {
        ctx.strokeStyle = css("--line");
        ctx.fillStyle = css("--muted");
        ctx.lineWidth = 1;
        for (const t of [0, 0.5, 1]) {
          const v = lo + t * (hi - lo);
          const yy = Math.round(y(v)) + 0.5;
          ctx.beginPath();
          ctx.moveTo(pad.l, yy);
          ctx.lineTo(w - pad.r, yy);
          ctx.stroke();
          ctx.fillText(fmt(s.log2 ? 2 ** Math.round(v) : v), 0, yy + 4);
        }
      }

      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.75;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let started = false;
      vals.forEach((v, j) => {
        if (v == null) return;
        started ? ctx.lineTo(x(j), y(v)) : ctx.moveTo(x(j), y(v));
        started = true;
      });
      ctx.stroke();

      // Latest value, right-aligned along the top edge.
      ctx.fillStyle = s.color;
      ctx.textAlign = "right";
      const label = (s.label ? s.label + " " : "") + fmt(raw[raw.length - 1]);
      ctx.fillText(label, w - pad.r - i * 110, 11);
      ctx.textAlign = "left";
    });
  }
}
