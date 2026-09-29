// Компактная запись рисунка бариста — тот же формат, что DrawingCodec.kt в приложении
// и DrawingValidator на сервере: [версия=1][varint штрихов]{[varint точек][x,y по байту]…}.
// Линия упрощается (Рамер–Дуглас–Пекер, 0.4 % стороны), координата — 1 байт. Буква ≈ 100–150 байт.

const EPSILON = 0.004;
const MAX_BYTES = 2048;

/** strokes: [[{x,y}, …], …] в долях квадрата → Uint8Array */
export function encode(strokes) {
  let eps = EPSILON;
  for (;;) {
    const bytes = encodeWith(strokes, eps);
    if (bytes.length <= MAX_BYTES || eps > 0.1) return bytes;
    eps *= 2;
  }
}

export function decode(bytes) {
  let pos = 0;
  const byte = () => {
    if (pos >= bytes.length) throw new Error("truncated drawing");
    return bytes[pos++];
  };
  const varint = () => {
    let result = 0;
    for (let shift = 0; shift < 28; shift += 7) {
      const b = byte();
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result;
    }
    throw new Error("bad varint");
  };
  if (byte() !== 1) throw new Error("unknown drawing version");
  const count = varint();
  if (count > bytes.length) throw new Error("bad stroke count");
  const strokes = [];
  for (let i = 0; i < count; i++) {
    const n = varint();
    if (n * 2 > bytes.length) throw new Error("bad point count");
    const stroke = [];
    for (let j = 0; j < n; j++) stroke.push({ x: byte() / 255, y: byte() / 255 });
    strokes.push(stroke);
  }
  if (pos !== bytes.length) throw new Error("trailing bytes");
  return strokes;
}

export const encodeBase64 = (strokes) => toBase64(encode(strokes));
export const decodeBase64 = (text) => decode(fromBase64(text));

function toBase64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function encodeWith(strokes, eps) {
  const list = strokes.map((s) => simplify(s, eps)).filter((s) => s.length > 0);
  const out = [1];
  varint(out, list.length);
  for (const points of list) {
    varint(out, points.length);
    for (const p of points) out.push(quantize(p.x), quantize(p.y));
  }
  return Uint8Array.from(out);
}

const quantize = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);

function varint(out, value) {
  let v = value;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}

/** Рамер–Дуглас–Пекер без рекурсии. */
function simplify(points, eps) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop();
    const a = points[from];
    const b = points[to];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    let far = -1;
    let max = 0;
    for (let i = from + 1; i < to; i++) {
      const p = points[i];
      const d = len < 1e-6 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
      if (d > max) {
        max = d;
        far = i;
      }
    }
    if (far >= 0 && max > eps) {
      keep[far] = 1;
      stack.push([from, far], [far, to]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
