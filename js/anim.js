// Небольшой движок анимаций: кривые Безье как в Compose и «анимируемое значение».

export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const dx = sampleX(t) - x;
      const d = slopeX(t);
      if (Math.abs(dx) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= dx / d;
    }
    return sampleY(Math.min(1, Math.max(0, t)));
  };
}

export const FAST_OUT_SLOW_IN = bezier(0.4, 0, 0.2, 1);
export const LINEAR_OUT_SLOW_IN = bezier(0, 0, 0.2, 1);
export const FLIP = bezier(0.4, 0, 0.2, 1);
export const LINEAR = (t) => t;

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Значение, которое плавно едет к цели; новая цель отменяет старую анимацию. */
export class Animated {
  constructor(value, onChange) {
    this.value = value;
    this.onChange = onChange;
    this.run = 0;
  }

  snap(value) {
    this.run++;
    this.value = value;
    this.onChange?.(value);
  }

  to(target, duration, easing = FAST_OUT_SLOW_IN, delay = 0) {
    const run = ++this.run;
    const from = this.value;
    const total = reduced() ? 1 : duration;
    return new Promise((resolve) => {
      const begin = () => {
        const start = performance.now();
        const frame = (now) => {
          if (run !== this.run) return resolve(false);
          const t = Math.min(1, (now - start) / total);
          this.value = from + (target - from) * easing(t);
          this.onChange?.(this.value);
          if (t < 1) requestAnimationFrame(frame);
          else resolve(true);
        };
        requestAnimationFrame(frame);
      };
      if (delay > 0 && !reduced()) setTimeout(begin, delay);
      else begin();
    });
  }
}

export const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

/** Пружинка: 1 → peak → затухающие колебания → 1 (ячейка, получившая отметку). */
export function springPop(onValue, peak = 1.3, duration = 600) {
  const start = performance.now();
  return new Promise((resolve) => {
    const frame = (now) => {
      const t = (now - start) / duration;
      if (t >= 1 || reduced()) {
        onValue(1);
        return resolve();
      }
      const rise = 0.25;
      const v = t < rise ? 1 + (peak - 1) * FAST_OUT_SLOW_IN(t / rise) : 1 + (peak - 1) * Math.exp(-5 * (t - rise)) * Math.cos(11 * (t - rise));
      onValue(v);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

export const lerp = (a, b, t) => a + (b - a) * t;
