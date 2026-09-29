// Точка входа сайта: сразу карта, без входа и сервера — карта хранится в этом браузере.
// Второй экран (#/keep) — сохранить карту в файл или восстановить из файла.

import { loadArt } from "./card.js";
import { mountCardScreen } from "./cardScreen.js";
import { mountKeepScreen } from "./keep.js";
import { Store } from "./store.js";

const cfg = window.KOM_CONFIG ?? {};
// Демо: demo: true в config.js или ?demo — отдельная карта с 4 стартовыми отметками, настоящую не трогает.
// Режим запоминается (чтобы с экрана «Домой» открывалось демо); ?demo=off — вернуться к настоящей карте.
const param = new URLSearchParams(location.search).get("demo");
if (param === "off") localStorage.removeItem("kom_mode");
else if (param !== null) localStorage.setItem("kom_mode", "demo");
const demo = cfg.demo === true || localStorage.getItem("kom_mode") === "demo";

const store = demo ? new Store({ key: "kom_demo_card", seed: 4 }) : new Store();

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
