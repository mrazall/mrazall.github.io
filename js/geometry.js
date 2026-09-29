// Координаты оборота карты, измеренные по выпрямленному скану (1716 × 1100 px) —
// те же числа, что CardGeometry.kt в приложении. Всё в долях размера карты.

const SCAN_W = 1716;
const SCAN_H = 1100;

export const ASPECT = SCAN_W / SCAN_H;
export const COLUMNS = 6;
export const ROWS = 5;
export const CELLS = COLUMNS * ROWS;
export const STRIP_LEFT = 1235 / SCAN_W;

const GRID_LEFT = 42;
const GRID_TOP = 39;
const PITCH_X = 202.8;
const PITCH_Y = 206.5;
const CELL_W = 143;
const CELL_H = 145;
const CELL_STROKE = 17.5;

export function cellRect(w, h, cell) {
  const col = cell % COLUMNS;
  const row = Math.floor(cell / COLUMNS);
  return {
    x: ((GRID_LEFT + col * PITCH_X) / SCAN_W) * w,
    y: ((GRID_TOP + row * PITCH_Y) / SCAN_H) * h,
    w: (CELL_W / SCAN_W) * w,
    h: (CELL_H / SCAN_H) * h,
  };
}

export const cellStroke = (w) => (CELL_STROKE / SCAN_W) * w;

/** Где пишет бариста: ячейка чуть внутрь контура (маркер заходит на контур, как на карте). */
export function cellInk(w, h, cell) {
  const r = cellRect(w, h, cell);
  const d = cellStroke(w) * 0.55;
  return { x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d };
}

export const ringCenter = (w, h, row) => ({
  x: (1330 / SCAN_W) * w,
  y: ((GRID_TOP + row * PITCH_Y + CELL_H / 2) / SCAN_H) * h,
});

export const ringRadius = (w) => (74 / SCAN_W) * w;

/** Где рисует бариста, выдавая подарок: квадрат по кольцу, буква того же размера, что в ячейке. */
export function ringInk(w, h, row) {
  const c = ringCenter(w, h, row);
  const r = ringRadius(w) * 0.86;
  return { x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r };
}

// Правила листа — как CardSheet.kt.
export const sheetOf = (stampIndex) => Math.floor(Math.max(0, stampIndex) / CELLS);
export const cellOf = (stampIndex) => Math.max(0, stampIndex) % CELLS;
export const sheetOfGift = (giftNumber) => Math.floor(Math.max(0, giftNumber - 1) / ROWS);
export const giftNumberFor = (sheet, row) => sheet * ROWS + row + 1;
