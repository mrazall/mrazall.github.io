// Белый маркер бариста, рукописные кольца и буквы-заглушки — как Marker.kt и FallbackMarks.kt.

export const MARKER_WIDTH = 0.075; // толщина маркера в долях стороны квадрата
export const COLORS = {
  red: "#E3352A",
  ink: "#261614",
  marker: "#F7F0E8",
  table: "#1B1413",
};

function smoothPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) {
    ctx.lineTo(pts[0].x + 0.01, pts[0].y);
    return;
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

/** Штрих маркера: плотная краска + светлая «влажная» середина. pts — в пикселях. */
export function drawMarkerStroke(ctx, pts, width, alpha = 1) {
  if (!pts.length) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  smoothPath(ctx, pts);
  ctx.globalAlpha = 0.94 * alpha;
  ctx.strokeStyle = COLORS.marker;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.globalAlpha = 0.28 * alpha;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = width * 0.38;
  ctx.stroke();
  ctx.restore();
}

/** Рисунок (штрихи в долях квадрата) внутри прямоугольника rect. */
export function drawStamp(ctx, strokes, rect, alpha = 1) {
  const width = MARKER_WIDTH * rect.w;
  for (const s of strokes) {
    drawMarkerStroke(ctx, s.map((p) => ({ x: rect.x + p.x * rect.w, y: rect.y + p.y * rect.h })), width, alpha);
  }
}

/** Неровный круг маркером — так обводят кольцо-подарок. progress — доля прорисовки. */
export function handCircle(cx, cy, radius, seed, progress = 1) {
  const steps = 40;
  const turns = 1.12;
  const count = Math.max(1, Math.floor(steps * progress));
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / steps;
    const a = -Math.PI / 1.7 + t * turns * 2 * Math.PI + seed;
    const wobble = 1 + 0.06 * Math.sin(a * 3 + seed * 1.7) + 0.03 * Math.cos(a * 5 + seed);
    const r = radius * wobble * (1 - 0.05 * t);
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

// ── Буквы-заглушки: для отметок без рисунка (демо). Первые две — «В» и «О», как на фото карты.

const line = (a, b, steps = 10) =>
  Array.from({ length: steps + 1 }, (_, i) => ({ x: a[0] + (b[0] - a[0]) * (i / steps), y: a[1] + (b[1] - a[1]) * (i / steps) }));

const quad = (a, c, b, steps = 14) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return { x: u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], y: u * u * a[1] + 2 * u * t * c[1] + t * t * b[1] };
  });

const LETTERS = [
  [line([0.3, 0.14], [0.28, 0.86]), [...quad([0.3, 0.14], [0.78, 0.16], [0.32, 0.47]), ...quad([0.32, 0.47], [0.86, 0.62], [0.28, 0.86]).slice(1)]],
  [
    Array.from({ length: 47 }, (_, i) => {
      const t = i / 46;
      const a = -Math.PI / 2 + t * 1.6 * 2 * Math.PI;
      const r = 1 - 0.07 * t;
      return { x: 0.5 + 0.28 * r * Math.cos(a) + 0.02 * t, y: 0.52 + 0.36 * r * Math.sin(a) };
    }),
  ],
  [line([0.32, 0.14], [0.33, 0.87]), [...line([0.72, 0.15], [0.36, 0.52]), ...line([0.36, 0.52], [0.74, 0.86]).slice(1)]],
  [[...line([0.2, 0.86], [0.25, 0.16]), ...line([0.25, 0.16], [0.5, 0.62]).slice(1), ...line([0.5, 0.62], [0.74, 0.15]).slice(1), ...line([0.74, 0.15], [0.81, 0.86]).slice(1)]],
];

export const fallbackMark = (stampNumber) => LETTERS[(((stampNumber - 1) % LETTERS.length) + LETTERS.length) % LETTERS.length];

// ── Бумажное зерно: едва заметная фактура поверх заливки.

let grain = null;

export function paperPattern(ctx) {
  if (!grain) {
    const size = 160;
    grain = document.createElement("canvas");
    grain.width = grain.height = size;
    const g = grain.getContext("2d");
    const img = g.createImageData(size, size);
    let seed = 45; // проспект Мира, 45
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < size * size; i++) {
      const r = rnd();
      const o = i * 4;
      if (r < 0.1) img.data.set([255, 255, 255, 22], o);
      else if (r < 0.22) img.data.set([40, 10, 8, 18], o);
      else if (r < 0.24) img.data.set([30, 8, 6, 34], o);
    }
    g.putImageData(img, 0, 0);
  }
  return ctx.createPattern(grain, "repeat");
}
