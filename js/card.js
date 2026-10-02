// Стороны карты на <canvas> — порт CardFaces.kt: слои с фотографии карты, сетка 5×6, кольца.

import { COLUMNS, CELLS, ROWS, STRIP_LEFT, cellInk, cellRect, cellStroke, giftNumberFor, ringInk } from "./geometry.js";
import { COLORS, drawStamp, fallbackMark, paperPattern } from "./marker.js";

const art = {};

export function loadArt() {
  const names = ["card_front_ink", "card_front_white", "card_back_strip", "card_ring", "card_logo"];
  return Promise.all(
    names.map(
      (n) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve((art[n] = img));
          img.onerror = reject;
          img.src = `assets/${n}.png`;
        }),
    ),
  );
}

export const ringImage = () => art.card_ring;
export const inkImage = () => art.card_front_ink;

/** Рисунок отметки; если его почему-то нет — рукописная буква-заглушка. */
const markFor = (card, n) => card.drawings.get(n) ?? fallbackMark(n);

function base(ctx, w, h) {
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = paperPattern(ctx);
  ctx.fillRect(0, 0, w, h);
}

/**
 * Лицевая сторона. Рисуется только при изменении карты; блик на логотипе во время переворота —
 * отдельный CSS-слой (.sheen), холст ради него не перерисовывается.
 * В пустом правом нижнем углу — текущий ряд: 6 квадратиков и кольцо, тем же языком, что оборот.
 */
export function renderFront(canvas, card) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  base(ctx, w, h);
  ctx.drawImage(art.card_front_ink, 0, 0, w, h);
  ctx.drawImage(art.card_front_white, 0, 0, w, h);
  if (card) drawFrontCounter(ctx, w, h, card);
}

function drawFrontCounter(ctx, w, h, card) {
  const cell = 0.036 * w;
  const gap = 0.0128 * w;
  const left = 0.615 * w;
  const top = 0.835 * h;
  const stroke = cell * 0.13;
  const first = card.total - card.stamps + 1;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = stroke;
  for (let i = 0; i < COLUMNS; i++) {
    const x = left + i * (cell + gap);
    ctx.strokeRect(x + stroke / 2, top + stroke / 2, cell - stroke, cell - stroke);
    if (i < card.stamps) {
      const d = stroke * 0.5;
      drawStamp(ctx, markFor(card, first + i), { x: x + d, y: top + d, w: cell - 2 * d, h: cell - 2 * d });
    }
  }
  const ring = cell * 1.2;
  const rx = left + COLUMNS * (cell + gap) + cell * 0.05;
  const ry = top + cell / 2 - ring / 2;
  ctx.drawImage(art.card_ring, rx, ry, ring, ring);
  const cx = rx + ring / 2;
  const cy = ry + ring / 2;
  // Подарок этого ряда взят авансом — на кольце рисунок бариста.
  const ahead = card.giftDrawings.get(card.currentRow);
  if (ahead) drawStamp(ctx, ahead, { x: cx - ring * 0.43, y: cy - ring * 0.43, w: ring * 0.86, h: ring * 0.86 });
  // Кольца не обводятся: о ждущем подарке говорит строка под картой, здесь — только счёт, если их несколько.
  if (card.available > 0) {
    if (card.available > 1) {
      ctx.fillStyle = COLORS.marker;
      ctx.font = `${cell * 0.9}px Neucha, cursive`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`×${card.available}`, cx, ry);
    }
  }
}

/**
 * Оборот листа `sheet`: сетка, отметки, рисунки бариста на кольцах. Рисуется только при изменении карты
 * или листа. Всё, что движется (мерцание ячейки и кольца, «пружинка»), — отдельные слои поверх холста,
 * см. cardScreen.js: холст ради анимации не перерисовывается.
 */
export function renderBack(canvas, card, { sheet = 0 } = {}) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  base(ctx, w, h);

  const stripLeft = Math.round(STRIP_LEFT * w);
  ctx.drawImage(art.card_back_strip, stripLeft, 0, w - stripLeft, h);

  const total = card?.total ?? 0;
  const stroke = cellStroke(w);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = stroke;
  for (let cell = 0; cell < CELLS; cell++) {
    const r = cellRect(w, h, cell);
    const number = sheet * CELLS + cell + 1;
    ctx.strokeRect(r.x + stroke / 2, r.y + stroke / 2, r.w - stroke, r.h - stroke);
    if (card && number <= total) drawStamp(ctx, markFor(card, number), cellInk(w, h, cell));
  }

  if (!card) return;
  for (let row = 0; row < ROWS; row++) {
    // Кольца не обводятся; выданный подарок — рисунок бариста на кольце.
    const mark = card.giftDrawings.get(giftNumberFor(sheet, row));
    if (mark) drawStamp(ctx, mark, ringInk(w, h, row));
  }
}
