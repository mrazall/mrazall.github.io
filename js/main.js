// Точка входа сайта: сразу карта, без входа и сервера — карта хранится в этом браузере.
// Второй экран (#/keep) — сохранить карту в файл или восстановить из файла.

import { loadArt } from "./card.js";
import { initInstall } from "./install.js";
import { mountCardScreen } from "./cardScreen.js";
import { mountKeepScreen } from "./keep.js";
import { Store } from "./store.js";

initInstall(); // событие «сайт можно установить» приходит рано — слушаем с самого начала

const store = new Store();

const app = document.getElementById("app");
let unmount = () => {};

function route() {
  unmount();
  if (location.hash === "#/keep") unmount = mountKeepScreen(app, store, { onBack: () => (location.hash = "") });
  else unmount = mountCardScreen(app, store);
}

async function boot() {
  await Promise.all([loadArt(), document.fonts?.load("21px Neucha").catch(() => {})]);
  try {
    store.load(); // карта нужна любому экрану, в том числе если сайт открыт сразу на #/keep
  } catch {
    /* хранилище недоступно — экран карты покажет ошибку и предложит повторить */
  }
  window.addEventListener("hashchange", route);
  route();
  // Офлайн-оболочка — только на HTTPS (в бою); на локальном http не мешает разработке.
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
