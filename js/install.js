// Добавление карты на домашний экран — пункт на экране «сохранить или перенести» (keep.js).
//
// Android (Chrome и родственные): браузер сам сообщает, что сайт можно установить (beforeinstallprompt), —
// по нажатию показываем системный диалог. iPhone/iPad: такого события нет, можно только подсказать путь
// через «Поделиться». Если сайт уже открыт с домашнего экрана или браузер установку не умеет — пункта нет.

let deferred = null; // событие beforeinstallprompt, пока им не воспользовались
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

const standalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

/** iPhone/iPad в браузере, не с домашнего экрана. */
export const iosBrowserTab = () =>
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) && !standalone();

/** Вызывается один раз при запуске: событие установки приходит рано и только однажды. */
export function initInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // без баннера браузера: предложение живёт на экране «сохранить или перенести»
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

/** "prompt" — можно показать системный диалог; "ios" — только инструкция; null — пункта нет. */
export function installMode() {
  if (standalone()) return null;
  if (deferred) return "prompt";
  return iosBrowserTab() ? "ios" : null;
}

/** Системный диалог установки (Android). */
export async function promptInstall() {
  const e = deferred;
  if (!e) return;
  deferred = null; // событие одноразовое
  e.prompt();
  await e.userChoice.catch(() => null);
  notify();
}
