// Счётчик кадров для проверки плавности на телефоне. Включается адресом ?fps (и запоминается),
// выключается ?fps=off. Гостям не показывается.
//
// Строки: сборка сайта · кадры сейчас / худшая секунда за последние 5 с · самый долгий кадр ·
// плотность экрана и плотность, с которой рисуются холсты.

import { pixelRatio } from "./marker.js";

export const BUILD = "9";

export function initFpsMeter() {
  const param = new URLSearchParams(location.search).get("fps");
  try {
    if (param === "off") localStorage.removeItem("kom_fps");
    else if (param !== null) localStorage.setItem("kom_fps", "1");
    if (!localStorage.getItem("kom_fps")) return;
  } catch {
    if (param === null || param === "off") return;
  }

  const box = document.createElement("pre");
  box.style.cssText =
    "position:fixed;left:4px;top:max(4px,env(safe-area-inset-top));z-index:99;margin:0;padding:4px 6px;font:11px/1.25 monospace;" +
    "color:#fff;background:rgba(0,0,0,.72);border-radius:4px;pointer-events:none;white-space:pre";
  document.body.append(box);

  let last = performance.now();
  let frames = 0;
  let windowStart = last;
  let worstFrame = 0;
  const seconds = []; // кадров в каждой из последних секунд

  const tick = (now) => {
    const dt = now - last;
    last = now;
    frames++;
    if (dt > worstFrame) worstFrame = dt;
    if (now - windowStart >= 1000) {
      seconds.push(Math.round((frames * 1000) / (now - windowStart)));
      if (seconds.length > 5) seconds.shift();
      const fps = seconds[seconds.length - 1];
      box.textContent =
        `сборка ${BUILD}\n` +
        `кадры ${fps} · мин ${Math.min(...seconds)}\n` +
        `долгий кадр ${Math.round(worstFrame)} мс\n` +
        `экран ×${(window.devicePixelRatio || 1).toFixed(2)} · холст ×${pixelRatio().toFixed(2)}`;
      frames = 0;
      windowStart = now;
      worstFrame = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
