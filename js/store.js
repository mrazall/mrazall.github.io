// Карта гостя — только в этом браузере, как бумажная в кошельке: без входа, без сервера.
// Порт LocalLoyaltyRepository.kt: число отметок, рисунки бариста в квадратах и на кольцах подарков.
//
// Почему localStorage, а не IndexedDB: карта — один JSON в десятки килобайт; синхронная запись
// атомарна и не требует очередей транзакций. Правила хранения (в т. ч. удаление Safari сайтов,
// которые не открывали неделю, и navigator.storage.persist()) у localStorage и IndexedDB одни и те же.

import { CARD_VERSION, InvalidCardError, readBackup, upgraded, writeBackup } from "./backup.js";
import { decodeBase64, encodeBase64 } from "./codec.js";

const REQUIRED = 6;

/**
 * Состояние карты (как LoyaltyCard.kt). Кольцо N принадлежит ряду N; выданный подарок —
 * рисунок бариста на кольце. Подарок можно взять авансом — на кольце незаполненного ряда.
 */
export function makeCard(total, drawings, giftDrawings) {
  const earned = Math.floor(total / REQUIRED);
  let nextGift = null;
  let available = 0;
  for (let n = 1; n <= earned; n++) {
    if (giftDrawings.has(n)) continue;
    available++;
    nextGift ??= n;
  }
  const currentRow = earned + 1;
  const currentRowPrepaid = giftDrawings.has(currentRow);
  const canTakeAhead = nextGift == null && !currentRowPrepaid;
  return {
    total,
    req: REQUIRED,
    stamps: total % REQUIRED,
    toGift: REQUIRED - (total % REQUIRED),
    earned,
    available,
    nextGift,
    currentRow,
    currentRowPrepaid,
    canTakeAhead,
    giftToGive: nextGift ?? (canTakeAhead ? currentRow : null),
    drawings,
    giftDrawings,
    giftState(n) {
      if (n <= 0) return null;
      if (giftDrawings.has(n)) return "used";
      if (n <= earned) return "unused";
      return null;
    },
  };
}

export class Store {
  /** seed — сколько отметок у новой карты (демо показывает карту не пустой). */
  constructor({ key = "kom_card", seed = 0 } = {}) {
    this.key = key;
    this.seed = seed;
    this.card = null;
    this.listeners = new Set();
    this.decoded = new Map();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  load() {
    const raw = localStorage.getItem(this.key);
    let data = null;
    try {
      const parsed = JSON.parse(raw);
      const version = parsed?.version ?? 1;
      if (Number.isInteger(parsed?.total) && version <= CARD_VERSION) data = upgraded({ marks: {}, gifts: {}, ...parsed });
    } catch {
      data = null;
    }
    if (raw !== null && !data) {
      // Повреждено или записано более новой версией сайта — не затираем, а откладываем в сторону.
      localStorage.setItem(`${this.key}_unreadable_${Date.now()}`, raw);
    }
    this.data = data ?? upgraded({ total: this.seed, marks: {}, gifts: {} });
    if (!data) this.save();
    // Просим браузер не стирать карту при нехватке места. Работает не везде и не всегда соглашается —
    // карта от этого не зависит, это лишь дополнительная страховка.
    navigator.storage?.persist?.().catch(() => {});
    return this.publish();
  }

  save() {
    // Бросает, если хранилище переполнено или запрещено, — экран покажет ошибку, а не «поставит» отметку.
    localStorage.setItem(this.key, JSON.stringify(this.data));
  }

  /** Текст файла резервной копии. */
  exportBackup() {
    if (!this.data) this.load();
    return writeBackup(this.data);
  }

  /** Проверить файл, ничего не меняя. Бросает InvalidCardError. → { card, exportedAt } */
  checkBackup(text) {
    return readBackup(text);
  }

  /** Заменить карту картой из файла — только после полной проверки. */
  restoreBackup(text) {
    const { card } = readBackup(text);
    const before = this.data;
    this.data = card;
    try {
      this.save();
    } catch (e) {
      this.data = before;
      throw e;
    }
    return this.publish();
  }

  /** Удалить все отметки и рисунки в этой карте, сохранив пустую карту и обходя demo seed. */
  deleteCard() {
    const before = this.data;
    this.data = upgraded({ total: 0, marks: {}, gifts: {} });
    try {
      this.save();
    } catch (e) {
      this.data = before;
      throw e;
    }
    this.decoded.clear();
    return this.publish();
  }

  publish() {
    const d = this.data;
    this.card = makeCard(d.total, this.decodeAll(d.marks), this.decodeAll(d.gifts));
    this.emit();
    return this.card;
  }

  decodeAll(obj) {
    const map = new Map();
    for (const [n, b64] of Object.entries(obj)) {
      if (!this.decoded.has(b64)) {
        try {
          this.decoded.set(b64, decodeBase64(b64));
        } catch {
          continue;
        }
      }
      map.set(Number(n), this.decoded.get(b64));
    }
    return map;
  }

  /** Отметка в следующий квадрат. earnedGift — номер кольца, если ряд закрылся и подарок за него ещё не брали. */
  addStamp(strokes) {
    const before = this.data;
    const number = before.total + 1;
    this.data = { ...before, total: number, marks: { ...before.marks, [number]: encodeBase64(strokes) } };
    try {
      this.save();
    } catch (e) {
      this.data = before;
      throw e;
    }
    const card = this.publish();
    const closesRow = number % REQUIRED === 0;
    const row = number / REQUIRED;
    const earnedGift = closesRow && !card.giftDrawings.has(row) ? row : null;
    return { card, stampNumber: number, earnedGift, closedPrepaidRow: closesRow && !earnedGift };
  }

  /** Выдать подарок: рисунок бариста на кольце card.giftToGive. Возвращает номер кольца. */
  useGift(strokes) {
    const ring = this.card?.giftToGive;
    if (!ring) throw new Error("нет подарка, который можно выдать");
    const before = this.data;
    this.data = { ...before, gifts: { ...before.gifts, [ring]: encodeBase64(strokes) } };
    try {
      this.save();
    } catch (e) {
      this.data = before;
      throw e;
    }
    this.publish();
    return ring;
  }
}

/** Человеческий текст ошибки — как Errors.kt. Сети нет, ошибиться может только хранилище браузера. */
export function userMessage(e) {
  if (e instanceof InvalidCardError) return e.message;
  return "не удалось сохранить — возможно, браузер в приватном режиме";
}
