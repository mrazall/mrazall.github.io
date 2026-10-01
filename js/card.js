// Стороны карты на <canvas> — порт CardFaces.kt: слои с фотографии карты, сетка 5×6, кольца.

import { COLUMNS, CELLS, ROWS, STRIP_LEFT, cellInk, cellRect, cellStroke, giftNumberFor, ringCenter, ringInk, ringRadius } from "./geometry.js";
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

/** Рисунок отметки, иначе (стартовые отметки демо-карты) — рукописная буква-заглушка. */
const markFor = (card, n) => card.drawings.get(n) ?? fallbackMark(n);

function base(ctx, w, h) {
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = paperPattern(ctx);
  ctx.fillRect(0, 0, w, h);
}

// Слой краски с бликом — в отдельном canvas, чтобы блик ложился только на глянцевый логотип.
let inkLayer = null;

/**
 * Лицевая сторона. sheen 0..1 — блик во время переворота (null — без блика).
 * В пустом правом нижнем углу — текущий ряд: 6 квадратиков и кольцо, тем же языком, что оборот.
 */
export function renderFront(canvas, card, sheen = null) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  base(ctx, w, h);

  if (sheen == null) {
    ctx.drawImage(art.card_front_ink, 0, 0, w, h);
  } else {
    if (!inkLayer || inkLayer.width !== w || inkLayer.height !== h) {
      inkLayer = document.createElement("canvas");
      inkLayer.width = w;
      inkLayer.height = h;
    }
    const l = inkLayer.getContext("2d");
    l.globalCompositeOperation = "source-over";
    l.clearRect(0, 0, w, h);
    l.drawImage(art.card_front_ink, 0, 0, w, h);
    const x = -0.5 * w + sheen * 1.8 * w;
    const g = l.createLinearGradient(x, 0, x + w * 0.32, h);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.26)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    l.globalCompositeOperation = "source-atop";
    l.fillStyle = g;
    l.fillRect(0, 0, w, h);
    ctx.drawImage(inkLayer, 0, 0);
  }
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
 * Оборот. opts: sheet, highlightCell, pulse (0..1), pop {cell, scale, ring}, giftFocus {number, mode: pulse|steady}.
 * Выданный подарок — рисунок бариста на кольце ряда.
 */
export function renderBack(canvas, card, opts = {}) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const { sheet = 0, highlightCell = null, pulse = 0, pop = null, giftFocus = null } = opts;
  base(ctx, w, h);

  const stripLeft = Math.round(STRIP_LEFT * w);
  ctx.drawImage(art.card_back_strip, stripLeft, 0, w - stripLeft, h);

  const total = card?.total ?? 0;
  const stroke = cellStroke(w);
  for (let cell = 0; cell < CELLS; cell++) {
    const r = cellRect(w, h, cell);
    const number = sheet * CELLS + cell + 1;
    const scale = pop && !pop.ring && pop.cell === cell ? pop.scale : 1;
    ctx.save();
    if (scale !== 1) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
    }
    if (cell === highlightCell) {
      ctx.fillStyle = `rgba(247,240,232,${0.1 + 0.2 * pulse})`;
      ctx.fillRect(r.x + stroke, r.y + stroke, r.w - 2 * stroke, r.h - 2 * stroke);
    }
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = stroke;
    ctx.strokeRect(r.x + stroke / 2, r.y + stroke / 2, r.w - stroke, r.h - stroke);
    if (card && number <= total) drawStamp(ctx, markFor(card, number), cellInk(w, h, cell));
    ctx.restore();
  }

  if (!card) return;
  const radius = ringRadius(w);
  for (let row = 0; row < ROWS; row++) {
    const number = giftNumberFor(sheet, row);
    const state = card.giftState(number);
    const c = ringCenter(w, h, row);
    const pulsing = giftFocus?.number === number && giftFocus.mode === "pulse";
    const scale = pop && pop.ring && pop.cell === row ? pop.scale : 1;
    ctx.save();
    if (scale !== 1) {
      ctx.translate(c.x, c.y);
      ctx.scale(scale, scale);
      ctx.translate(-c.x, -c.y);
    }
    // Кольца не обводятся. Кольцо, на котором сейчас рисует бариста (заработанный подарок
    // или авансом), мерцает изнутри — как ячейка под отметку.
    if (giftFocus?.number === number && state !== "used") {
      ctx.fillStyle = `rgba(247,240,232,${pulsing ? 0.1 + 0.2 * pulse : 0.2})`;
      ctx.beginPath();
      ctx.arc(c.x, c.y, radius * 0.82, 0, 2 * Math.PI);
      ctx.fill();
    }
    const mark = card.giftDrawings.get(number);
    if (mark) drawStamp(ctx, mark, ringInk(w, h, row));
    ctx.restore();
  }
}
