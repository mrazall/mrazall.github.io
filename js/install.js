// Ненавязчивое предложение добавить карту на экран «Домой».
//
// Android (Chrome и родственные): браузер сам сообщает, что сайт можно установить (beforeinstallprompt), —
// по нажатию показываем системный диалог. iPhone/iPad: такого события нет, можно только подсказать путь
// через «Поделиться». Уже установленным и тем, кто отказался, не показываем.

import { iosBrowserTab } from "./keep.js";

const DISMISSED = "kom_install_dismissed";
const SILENCE_DAYS = 60;

let deferred = null; // событие beforeinstallprompt, пока им не воспользовались
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

const standalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISSED));
    return at > 0 && Date.now() - at < SILENCE_DAYS * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

/** Вызывается один раз при запуске: событие установки приходит рано и только однажды. */
export function initInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // свой, тихий вариант вместо баннера браузера
    deferred = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** "prompt" — можно показать системный диалог; "ios" — только подсказка; null — не предлагать. */
export function installMode() {
  if (standalone() || dismissedRecently()) return null;
  if (deferred) return "prompt";
  return iosBrowserTab() ? "ios" : null;
}

/** Системный диалог установки (Android). Отказ запоминаем, чтобы не надоедать. */
export async function promptInstall() {
  const e = deferred;
  if (!e) return;
  deferred = null; // событие одноразовое
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  if (choice?.outcome !== "accepted") dismissInstall();
  notify();
}

/** «Не предлагать» — на пару месяцев. */
export function dismissInstall() {
  try {
    localStorage.setItem(DISMISSED, String(Date.now()));
  } catch {
    /* хранилище недоступно — просто спрячем до перезагрузки */
  }
  deferred = null;
  notify();
}
