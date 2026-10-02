// Общие помощники экранов: разметка, склонения, знак подарочного кофе.

import { ringImage } from "./card.js";
import { COLORS, drawMarkerStroke, handCircle, pixelRatio } from "./marker.js";

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function plural(n, one, few, many) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}
export const stampsWord = (n) => plural(n, "отметка", "отметки", "отметок");

/** Кольцо с карты фирменным красным, обведённое белым маркером, — знак подарочного кофе. */
export function markerRing(canvas, seed = 2) {
  const css = canvas.clientWidth || parseInt(getComputedStyle(canvas).width) || 34;
  const d = pixelRatio();
  canvas.width = canvas.height = Math.round(css * d);
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const img = ringImage();
  const inset = size * 0.16;
  const tmp = document.createElement("canvas");
  tmp.width = tmp.height = size;
  const t = tmp.getContext("2d");
  t.drawImage(img, inset, inset, size - 2 * inset, size - 2 * inset);
  t.globalCompositeOperation = "source-in";
  t.fillStyle = COLORS.red;
  t.fillRect(0, 0, size, size);
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(tmp, 0, 0);
  drawMarkerStroke(ctx, handCircle(size / 2, size / 2, size * 0.44, seed), size * 0.07);
  return ctx;
}
