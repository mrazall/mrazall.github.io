// Формат карты и файла резервной копии — тот же JSON, что в приложении (StoredCard.kt, CardBackup.kt),
// поэтому карту можно перенести с сайта в приложение и обратно. Без DOM — проверяется и в Node.

import { decodeBase64 } from "./codec.js";

export const CARD_VERSION = 1; // версия формата карты в хранилище
export const FORMAT = "kofeonmoy-card";
export const BACKUP_VERSION = 1; // версия файла резервной копии
export const MAX_CHARS = 5_000_000;
const MAX_STAMPS = 100_000;
const REQUIRED = 6;

export class InvalidCardError extends Error {}

const invalid = (message = "файл повреждён") => {
  throw new InvalidCardError(message);
};

/** Приводит карту старой версии формата к текущей. Пока версия одна — только проставляет номер. */
export const upgraded = (card) => ({ ...card, version: CARD_VERSION });

/** Проверка карты из файла (или из хранилища). Бросает InvalidCardError с понятным гостю текстом. */
export function validated(card) {
  if (!card || typeof card !== "object") invalid();
  const version = card.version ?? 1;
  if (!Number.isInteger(version) || version < 1) invalid();
  if (version > CARD_VERSION) invalid("карта сохранена более новой версией — обновите страницу");
  const { total } = card;
  if (!Number.isInteger(total) || total < 0 || total > MAX_STAMPS) invalid();
  const marks = card.marks ?? {};
  const gifts = card.gifts ?? {};
  if (typeof marks !== "object" || typeof gifts !== "object" || Array.isArray(marks) || Array.isArray(gifts)) invalid();
  const lastRing = Math.floor(total / REQUIRED) + 1; // кольцо — не дальше текущего ряда (аванс)
  const check = (obj, max) => {
    for (const [key, value] of Object.entries(obj)) {
      const n = Number(key);
      if (!Number.isInteger(n) || n < 1 || n > max || typeof value !== "string") invalid();
      try {
        decodeBase64(value);
      } catch {
        invalid();
      }
    }
  };
  check(marks, total);
  check(gifts, lastRing);
  return upgraded({ total, marks: { ...marks }, gifts: { ...gifts } });
}

/** Текст файла резервной копии. */
export function writeBackup(card, now = new Date()) {
  return JSON.stringify({ format: FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), card: upgraded(card) });
}

/** Разбирает и проверяет файл; ничего не сохраняет. → { card, exportedAt: Date | null } */
export function readBackup(text) {
  if (typeof text !== "string" || text.length > MAX_CHARS) invalid("это не файл карты");
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    invalid("это не файл карты");
  }
  if (!file || file.format !== FORMAT || !Number.isInteger(file.version)) invalid("это не файл карты");
  if (file.version > BACKUP_VERSION) invalid("карта сохранена более новой версией — обновите страницу");
  const card = validated(file.card);
  const at = file.exportedAt ? new Date(file.exportedAt) : null;
  return { card, exportedAt: at && !Number.isNaN(at.getTime()) ? at : null };
}
