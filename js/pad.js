// Холст бариста — увеличенная ячейка карты. Настоящий touch-canvas: линия под пальцем,
// промежуточные точки (getCoalescedEvents), координаты в долях стороны — как DrawingPad.kt.

import { COLORS, MARKER_WIDTH, drawMarkerStroke, drawStamp, paperPattern } from "./marker.js";

const BORDER = 0.045;
const MARGIN = 0.05;
const MIN_STEP = 0.004;

export class DrawingPad {
  /** onChange(strokes) — после каждого завершённого штриха. underlay(ctx, inner) — фон под рисунком. */
  constructor(canvas, { onChange, underlay = null } = {}) {
    this.canvas = canvas;
    this.onChange = onChange;
    this.underlay = underlay;
    this.strokes = [];
    this.current = null;
    this.enabled = true;
    this.dirty = true;

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", (e) => this.up(e));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.loop();
  }

  destroy() {
    this.destroyed = true;
    this.resizeObserver.disconnect();
  }

  setStrokes(strokes) {
    this.strokes = strokes;
    this.dirty = true;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /** Рабочая область в CSS-пикселях — сюда нормализуются координаты рисунка. */
  innerRect() {
    const size = this.canvas.clientWidth;
    const inset = size * (MARGIN + BORDER);
    return { x: inset, y: inset, w: size - 2 * inset, h: size - 2 * inset };
  }

  shake() {
    this.canvas.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-14px)" }, { transform: "translateX(12px)" }, { transform: "translateX(-8px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }],
      { duration: 420, easing: "ease-out" },
    );
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const size = Math.round(this.canvas.clientWidth * dpr);
    if (size && (this.canvas.width !== size || this.canvas.height !== size)) {
      this.canvas.width = this.canvas.height = size;
      this.dirty = true;
    }
  }

  norm(e) {
    const box = this.canvas.getBoundingClientRect();
    const inner = this.innerRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left - inner.x) / inner.w)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top - inner.y) / inner.h)),
    };
  }

  add(p) {
    const last = this.current[this.current.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > MIN_STEP) this.current.push(p);
  }

  down(e) {
    if (!this.enabled || this.current) return;
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId); // палец ушёл за край — линия всё равно дорисуется
    } catch {
      /* указатель уже не активен — рисуем без захвата */
    }
    this.pointerId = e.pointerId;
    this.current = [this.norm(e)];
    this.dirty = true;
  }

  move(e) {
    if (!this.current || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events.length ? events : [e]) this.add(this.norm(ev));
    this.dirty = true;
  }

  up(e) {
    if (!this.current || e.pointerId !== this.pointerId) return;
    const stroke = this.current;
    this.current = null;
    this.strokes = [...this.strokes, stroke];
    this.dirty = true;
    this.onChange?.(this.strokes);
  }

  loop() {
    if (this.destroyed) return;
    if (this.dirty) {
      this.dirty = false;
      this.draw();
    }
    requestAnimationFrame(() => this.loop());
  }

  /**
   * Фон, рамка и уже законченные штрихи «запечены» в отдельный слой: пока палец ведёт линию,
   * каждый кадр — это одна копия слоя и один текущий штрих, а не перерисовка всего холста.
   */
  bakedLayer(size, dpr) {
    const b = this.baked;
    if (b && b.strokes === this.strokes && b.canvas.width === size) return b.canvas;
    const canvas = b?.canvas ?? document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = paperPattern(ctx);
    ctx.fillRect(0, 0, size, size);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const css = size / dpr;
    const inner = this.innerRect();
    this.underlay?.(ctx, inner);
    const border = css * BORDER;
    const margin = css * MARGIN;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = border;
    ctx.strokeRect(margin + border / 2, margin + border / 2, css - 2 * margin - border, css - 2 * margin - border);
    drawStamp(ctx, this.strokes, inner);
    this.baked = { canvas, strokes: this.strokes };
    return canvas;
  }

  draw() {
    const ctx = this.canvas.getContext("2d");
    const size = this.canvas.width;
    if (!size) return;
    const dpr = size / (this.canvas.clientWidth || 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bakedLayer(size, dpr), 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const inner = this.innerRect();
    if (this.current) {
      drawMarkerStroke(
        ctx,
        this.current.map((p) => ({ x: inner.x + p.x * inner.w, y: inner.y + p.y * inner.h })),
        MARKER_WIDTH * inner.w,
      );
    }
  }
}

/** Та же проверка, что BasicStampVerifier: тычок пальцем — не отметка. */
export function verifyDrawing(strokes) {
  const points = strokes.flat();
  if (points.length < 2) return "бариста, нарисуйте букву";
  let length = 0;
  for (const s of strokes) for (let i = 1; i < s.length; i++) length += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return length < 0.6 || extent < 0.25 ? "крупнее — на весь квадрат" : null;
}
