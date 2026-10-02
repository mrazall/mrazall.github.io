// Главный экран — порт CardScreen.kt + CardViewModel.kt + StampPanel.kt.
// Карта лежит на «столе»; касание → подъём, 3D-переворот, карта едет наверх, под ней — холст бариста.
// После отметки холст сразу готов к следующей: несколько отметок подряд — без повторного переворота.

import { Animated, FAST_OUT_SLOW_IN, FLIP, LINEAR_OUT_SLOW_IN, lerp, springPop, wait } from "./anim.js";
import { renderBack, renderFront, ringImage } from "./card.js";
import { ASPECT, ROWS, cellInk, cellOf, cellRect, cellStroke, ringCenter, ringInk, ringRadius, sheetOf, sheetOfGift } from "./geometry.js";
import { COLORS, drawStamp } from "./marker.js";
import { iosBrowserTab } from "./keep.js";
import { DrawingPad, verifyDrawing } from "./pad.js";
import { el, markerRing, stampsWord } from "./screens.js";
import { userMessage } from "./store.js";

// confirming — отметка летит в ячейку; redeeming — рисунок летит на кольцо подарка.
const OPEN_STAGES = new Set(["drawing", "confirming", "gift", "redeem", "redeeming"]);
const GIFT_STAGES = new Set(["gift", "redeem", "redeeming"]);

/** Раскладка как cardLayout() в CardScreen.kt: портрет — карта сверху, ландшафт — слева. */
function layout(W, H) {
  const topBar = 52;
  if (W <= H * 1.1) {
    const vw = Math.min(W - 48, 460, (H - 200) * ASPECT);
    const vh = vw / ASPECT;
    const view = { x: (W - vw) / 2, y: Math.max(16, (H - vh) / 2 - 40), w: vw, h: vh };
    const ow = Math.min(W - 32, 540, H * 0.3 * ASPECT);
    const oh = ow / ASPECT;
    const open = { x: (W - ow) / 2, y: topBar, w: ow, h: oh };
    const panelTop = topBar + oh + 8;
    return { view, open, panel: { x: 0, y: panelTop, w: W, h: H - panelTop } };
  }
  const vw = Math.min(W * 0.5, (H - 150) * ASPECT, 520);
  const vh = vw / ASPECT;
  const view = { x: (W - vw) / 2, y: Math.max(12, (H - vh) / 2 - 30), w: vw, h: vh };
  const ow = Math.min(W * 0.47, (H - topBar - 16) * ASPECT, 560);
  const oh = ow / ASPECT;
  const open = { x: 24, y: (H - oh) / 2, w: ow, h: oh };
  const px = 24 + ow + 12;
  return { view, open, panel: { x: px, y: topBar - 8, w: W - px - 12, h: H - topBar + 8 } };
}

const lerpRect = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });

export function mountCardScreen(root, store) {
  const screen = el(`
    <section class="screen card-screen">
      <div class="stage">
        <div class="chrome">
          <p class="hint">коснитесь карты, чтобы поставить отметку</p>
          <button class="gift-badge" hidden><canvas></canvas><span class="link small underline">у вас есть подарочный кофе</span></button>
        </div>
        <div class="keep-hint" hidden>
          <p></p>
          <a class="link small underline" href="#/keep">сохранить или перенести</a>
        </div>
        <div class="topbar">
          <div class="sheets" hidden>
            <button class="link prev" aria-label="предыдущий лист">‹</button>
            <span class="sheet-label"></span>
            <button class="link next" aria-label="следующий лист">›</button>
          </div>
          <span></span>
          <button class="link small close">закрыть</button>
        </div>
        <div class="card-slot" role="button" tabindex="0" aria-label="карта лояльности">
          <div class="lift"><div class="flip">
            <div class="face front"><canvas></canvas><div class="sheen"><i></i></div><div class="shade"></div></div>
            <div class="face back"><canvas></canvas><div class="glow cell-glow" hidden></div><div class="glow ring-glow" hidden></div><canvas class="pop" hidden></canvas><div class="shade"></div></div>
          </div></div>
        </div>
        <div class="panel"></div>
      </div>
    </section>`);
  root.replaceChildren(screen);

  const $ = (sel) => screen.querySelector(sel);
  const stageEl = $(".stage");
  const slot = $(".card-slot");
  const liftEl = $(".lift");
  const flipEl = $(".flip");
  const frontCanvas = $(".front canvas");
  const backCanvas = $(".back canvas");
  const shades = screen.querySelectorAll(".shade");
  const sheenEl = $(".sheen");
  const sheenBar = $(".sheen i");
  const cellGlow = $(".cell-glow");
  const ringGlow = $(".ring-glow");
  const popCanvas = $("canvas.pop");
  const chrome = $(".chrome");
  const hint = $(".hint");
  const badge = $(".gift-badge");
  const keepHint = $(".keep-hint");
  const topbar = $(".topbar");
  const sheetsEl = $(".sheets");
  const sheetLabel = $(".sheet-label");
  const panelEl = $(".panel");
  const flightCanvas = document.getElementById("flight");

  // ── состояние (как CardUiState)
  const s = {
    stage: "view",
    strokes: [],
    hint: null, // подсказка-ошибка под холстом
    note: null, // что только что произошло — пока бариста не начал новый рисунок
    busy: false,
    flight: null,
    pop: null, // { cell, ring } — ячейка или кольцо ряда, которые пружинят
    focusGift: null,
    justEarned: false,
    browseSheet: null,
    loadError: null,
  };
  let frozen = null;
  let pending = null;
  let nextStep = null;
  let openToGift = false;
  let pad = null;
  let panelMode = null;
  let destroyed = false;

  const card = () => frozen ?? store.card;
  const isOpen = () => OPEN_STAGES.has(s.stage);
  const autoSheet = () => {
    const total = card()?.total ?? 0;
    if (s.focusGift && GIFT_STAGES.has(s.stage)) return sheetOfGift(s.focusGift);
    return s.stage === "drawing" || s.stage === "confirming" ? sheetOf(total) : sheetOf(total - 1);
  };
  const sheet = () => s.browseSheet ?? autoSheet();
  const lastSheet = () => Math.max(autoSheet(), sheetOf((card()?.total ?? 0) - 1));
  const targetCell = () => (s.stage === "drawing" && sheet() === autoSheet() ? cellOf(card()?.total ?? 0) : null);
  const giftFocus = () => {
    if (!s.focusGift) return null;
    if (s.stage === "gift" || s.stage === "redeem") return { number: s.focusGift, mode: "pulse" };
    if (s.stage === "redeeming") return { number: s.focusGift, mode: "steady" };
    return null;
  };
  /** Подарок выдаётся авансом — за ряд, который ещё не заполнен. */
  const giftAhead = () => !!s.focusGift && !!card() && s.focusGift > card().earned;

  // ── анимируемые величины
  const rotation = new Animated(0, frame);
  const liftA = new Animated(0, frame);
  const move = new Animated(0, frame);
  const panelA = new Animated(0, frame);

  let popToken = 0;
  let L = null;
  let dpr = 1;

  function resize() {
    const W = stageEl.clientWidth;
    const H = stageEl.clientHeight;
    if (!W || !H) return;
    L = layout(W, H);
    // Размер поверхности постоянен: движение и уменьшение — только transform.
    slot.style.width = `${L.view.w}px`;
    slot.style.height = `${L.view.h}px`;
    dpr = window.devicePixelRatio || 1;
    const maxW = Math.max(L.view.w, L.open.w) * dpr;
    for (const c of [frontCanvas, backCanvas]) {
      c.width = Math.round(maxW);
      c.height = Math.round(maxW / ASPECT);
    }
    chrome.style.top = `${L.view.y + L.view.h + 20}px`;
    Object.assign(panelEl.style, { left: `${L.panel.x}px`, top: `${L.panel.y}px`, width: `${L.panel.w}px`, height: `${L.panel.h}px` });
    drawFront(true);
    drawBack(true);
    frame();
    if (panelMode) renderPanel(true);
  }

  /** Кадр анимации: положение карты, поворот, подъём, затенение, панель. */
  function frame() {
    if (!L) return;
    const box = lerpRect(L.view, L.open, move.value);
    slot.style.transform = `translate3d(${box.x}px, ${box.y}px, 0) scale(${box.w / L.view.w})`;
    const r = rotation.value;
    liftEl.style.transform = `scale(${1 + 0.05 * liftA.value})`;
    flipEl.style.transform = `rotateY(${r}deg)`;
    const shade = (1 - Math.abs(Math.cos((r * Math.PI) / 180))) * 0.35;
    shades.forEach((x) => (x.style.opacity = shade));
    // Блик на глянцевом логотипе — готовый слой, двигается только transform.
    const sheenOn = r > 1 && r < 90;
    sheenEl.style.visibility = sheenOn ? "visible" : "hidden";
    if (sheenOn) sheenBar.style.transform = `translateX(${((-0.5 + (r / 90) * 1.8) / 0.32) * 100}%)`;

    const m = move.value;
    chrome.style.opacity = keepHint.style.opacity = Math.max(0, Math.min(1, 1 - m * 2.2));
    chrome.style.pointerEvents = keepHint.style.pointerEvents = m < 0.01 ? "auto" : "none";
    topbar.style.opacity = m;
    topbar.classList.toggle("visible", m > 0.5);
    panelEl.style.opacity = panelA.value;
    panelEl.style.transform = `translateY(${(1 - panelA.value) * 28}px)`;
    panelEl.classList.toggle("visible", panelA.value > 0.5);
  }

  // Холсты карты рисуются только когда меняется сама карта или лист — не в анимации.
  let drawnFront = null;
  let drawnBack = null;

  function drawFront(force = false) {
    if (!frontCanvas.width) return;
    const c = card();
    if (!force && drawnFront === c) return;
    drawnFront = c;
    renderFront(frontCanvas, c);
  }

  function drawBack(force = false) {
    if (!backCanvas.width) return;
    const c = card();
    const sh = sheet();
    if (force || !drawnBack || drawnBack.card !== c || drawnBack.sheet !== sh) {
      drawnBack = { card: c, sheet: sh };
      renderBack(backCanvas, c, { sheet: sh });
    }
    updateGlow();
  }

  /** Процентный прямоугольник внутри стороны карты (геометрия задана в долях ширины и высоты). */
  function place(node, x, y, w, h) {
    Object.assign(node.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
  }

  /**
   * Мерцание ячейки под отметку и кольца под подарок — два готовых слоя с CSS-анимацией прозрачности.
   * Раньше ради них весь оборот перерисовывался 60 раз в секунду, пока бариста рисует.
   */
  function updateGlow() {
    const cell = targetCell();
    cellGlow.hidden = cell === null;
    if (cell !== null) {
      const r = cellRect(1, 1, cell);
      const sx = cellStroke(1);
      const sy = sx * ASPECT; // толщина контура в долях высоты
      place(cellGlow, r.x + sx, r.y + sy, r.w - 2 * sx, r.h - 2 * sy);
    }

    const focus = giftFocus();
    const c = card();
    const onSheet = focus && c && sheetOfGift(focus.number) === sheet() && c.giftState(focus.number) !== "used";
    ringGlow.hidden = !onSheet;
    if (onSheet) {
      const center = ringCenter(1, 1, (focus.number - 1) % ROWS);
      const rx = ringRadius(1) * 0.82;
      const ry = rx * ASPECT;
      place(ringGlow, center.x - rx, center.y - ry, 2 * rx, 2 * ry);
      ringGlow.classList.toggle("steady", focus.mode !== "pulse");
    }
  }

  // ── общий рендер «интерфейса вокруг» (не анимационный)
  function render() {
    const c = card();
    if (!c) {
      hint.textContent = s.loadError ? `${s.loadError}. коснитесь карты, чтобы повторить` : "…";
      badge.hidden = true;
    } else {
      hint.textContent = "коснитесь карты, чтобы поставить отметку";
      badge.hidden = c.available <= 0;
      badge.querySelector("span").textContent = c.available > 1 ? `у вас есть подарочный кофе ×${c.available}` : "у вас есть подарочный кофе";
    }
    slot.setAttribute("aria-label", c ? `карта лояльности: ${c.stamps} из ${c.req} отметок, подарков: ${c.available}` : "карта лояльности");
    // Тихо, внизу: где живёт карта и как её не потерять. На iPhone в Safari — ещё и про экран «Домой».
    keepHint.hidden = !c;
    keepHint.querySelector("p").textContent = iosBrowserTab()
      ? "карта хранится в этом браузере — добавьте сайт на экран «Домой»"
      : "карта хранится в этом браузере";
    const showSheets = isOpen() && lastSheet() > 0;
    sheetsEl.hidden = !showSheets;
    if (showSheets) {
      sheetLabel.textContent = `лист ${sheet() + 1} из ${lastSheet() + 1}`;
      const enabled = !s.busy && !s.flight;
      $(".prev").disabled = !enabled || sheet() <= 0;
      $(".next").disabled = !enabled || sheet() >= lastSheet();
    }
    $(".close").disabled = s.busy || !!s.flight;
    drawFront();
    drawBack();
    const mode = modeFor(s.stage);
    if (mode && mode !== panelMode) renderPanel();
    else if (mode) updatePanel();
  }

  // ── панель под картой (как StampPanel.kt)
  const modeFor = (stage) => ({ drawing: "draw", confirming: "draw", gift: "gift", redeem: "redeem", redeeming: "redeem" })[stage] ?? null;

  function padSize() {
    return Math.max(150, Math.min(L.panel.w - 64, L.panel.h - 140, 420));
  }

  function renderPanel(force = false) {
    const mode = modeFor(s.stage) ?? panelMode;
    if (!force && mode === panelMode) return;
    panelMode = mode;
    pad?.destroy();
    pad = null;
    let html = "";
    if (mode === "draw" || mode === "redeem") {
      const size = padSize();
      html = `
        <div class="panel-inner">
          <div class="panel-head" style="width:${size}px">
            <span class="status"></span>
            ${mode === "draw" ? `<button class="link small underline show-gift" hidden></button>` : ""}
          </div>
          <canvas class="pad" style="width:${size}px;height:${size}px"></canvas>
          <p class="caption" style="width:${size + 48}px"></p>
          <div class="row ${mode === "redeem" ? "tight" : ""}">
            ${mode === "redeem" ? `<button class="link underline back">назад</button>` : ""}
            <button class="link underline clear">стереть</button>
            <button class="link underline confirm">готово</button>
          </div>
        </div>`;
    } else {
      html = `
        <div class="panel-inner gift-offer">
          <canvas class="ring"></canvas>
          <h2>у вас есть подарочный кофе</h2>
          <p class="fine count" hidden></p>
          <div class="row" style="gap:32px;margin-top:10px">
            <button class="link underline use">использовать сейчас</button>
            <button class="link underline save"></button>
          </div>
          <p class="fine note"></p>
        </div>`;
    }
    panelEl.innerHTML = html;
    const q = (sel) => panelEl.querySelector(sel);

    if (mode === "draw" || mode === "redeem") {
      pad = new DrawingPad(q(".pad"), {
        onChange: (strokes) => {
          s.strokes = strokes;
          s.hint = null;
          s.note = null;
          updatePanel();
        },
        underlay:
          mode === "redeem"
            ? (ctx, inner) => {
                // Под рукой бариста — то самое кольцо с карты, бледно.
                const side = inner.w * 0.62;
                ctx.save();
                ctx.globalAlpha = 0.22;
                ctx.drawImage(tinted(COLORS.ink), inner.x + inner.w / 2 - side / 2, inner.y + inner.h / 2 - side / 2, side, side);
                ctx.restore();
              }
            : null,
      });
      pad.setStrokes(s.strokes);
      q(".clear").onclick = () => {
        // Пустой холст после отметки: левая кнопка закрывает карту.
        if (closeInsteadOfClear()) return close();
        s.strokes = [];
        s.hint = null;
        pad.setStrokes([]);
        updatePanel();
      };
      q(".confirm").onclick = mode === "draw" ? confirmStamp : confirmRedeem;
      if (mode === "redeem") q(".back").onclick = cancelRedeem;
      q(".show-gift")?.addEventListener("click", () => (card()?.available ? showGift() : takeGiftAhead()));
    } else {
      markerRing(q(".ring"), s.focusGift ?? 1);
      q(".use").onclick = useGiftNow;
      q(".save").onclick = saveGift;
    }
    updatePanel();
  }

  const closeInsteadOfClear = () => panelMode === "draw" && !!s.note && s.strokes.length === 0;

  function updatePanel() {
    const q = (sel) => panelEl.querySelector(sel);
    const c = card();
    if (panelMode === "draw" || panelMode === "redeem") {
      const drawing = panelMode === "draw" ? s.stage === "drawing" : s.stage === "redeem" && !s.busy;
      pad?.setEnabled(drawing);
      const ahead = giftAhead();
      // Над холстом — сколько осталось до подарка в этом ряду, без общего счёта отметок.
      let status = "";
      if (panelMode === "redeem") status = ahead ? "подарочный кофе авансом" : "подарочный кофе";
      else if (c) status = c.currentRowPrepaid ? "подарок этого ряда уже выдан" : `ещё ${c.toGift} до подарка`;
      q(".status").textContent = status;

      const left = c?.toGift ?? 0;
      let idle;
      if (panelMode === "draw") idle = s.busy || s.flight ? "ставим отметку…" : "рисует бариста";
      else if (s.busy || s.flight) idle = "выдаём подарок…";
      else idle = ahead ? `бариста рисует на кольце, а ${left} ${stampsWord(left)} ряда — потом` : "бариста рисует на кольце";
      const caption = q(".caption");
      caption.textContent = s.hint ?? s.note ?? idle;
      caption.classList.toggle("alert", !!(s.hint || s.note));

      const clear = q(".clear");
      if (closeInsteadOfClear()) {
        clear.textContent = "закрыть";
        clear.disabled = !drawing;
      } else {
        clear.textContent = "стереть";
        clear.disabled = !drawing || s.strokes.length === 0;
      }
      q(".confirm").disabled = !drawing || s.strokes.length === 0;
      if (q(".back")) q(".back").disabled = !drawing;

      const giftBtn = q(".show-gift");
      if (giftBtn) {
        const gifts = c?.available ?? 0;
        // Нет денег с собой — седьмой кофе сейчас, отметки ряда потом.
        giftBtn.hidden = !(s.stage === "drawing" && (gifts > 0 || c?.canTakeAhead));
        giftBtn.textContent = gifts > 1 ? `подарок ×${gifts}` : gifts === 1 ? "подарок" : "кофе авансом";
      }
    } else if (panelMode === "gift") {
      const count = c?.available ?? 0;
      q(".count").hidden = count <= 1;
      q(".count").textContent = `на карте подарков: ${count}`;
      q(".save").textContent = s.justEarned ? "сохранить" : "не сейчас";
      q(".use").disabled = q(".save").disabled = s.busy;
      q(".note").textContent = s.hint ?? "подарок не сгорит — можно забрать в любой день";
    }
  }

  let tintCache = null;
  function tinted(color) {
    if (tintCache) return tintCache;
    const img = ringImage();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return (tintCache = c);
  }

  // ── переходы (как CardViewModel)
  function set(patch) {
    Object.assign(s, patch);
    render();
  }

  function refresh() {
    try {
      store.load();
      set({ loadError: null });
    } catch (e) {
      set({ loadError: userMessage(e) });
    }
  }

  function tapCard() {
    if (!store.card) return refresh();
    if (s.stage !== "view") return;
    openToGift = false;
    open();
  }

  function tapBadge() {
    if (s.stage !== "view" || !store.card?.nextGift) return;
    openToGift = true;
    open();
  }

  async function open() {
    set({ stage: "opening" });
    // 1) карта приподнимается  2) переворачивается и едет наверх  3) проявляется поле отметки
    await liftA.to(1, 160, FAST_OUT_SLOW_IN);
    await Promise.all([
      rotation.to(180, 620, FLIP),
      move.to(1, 600, FAST_OUT_SLOW_IN, 90),
      liftA.to(0, 380, FAST_OUT_SLOW_IN, 330),
      (async () => {
        await wait(470);
        onOpened();
        await panelA.to(1, 300, LINEAR_OUT_SLOW_IN);
      })(),
    ]);
    drawFront();
  }

  function onOpened() {
    if (s.stage !== "opening") return;
    const gift = openToGift ? card()?.nextGift : null;
    if (gift) set({ stage: "gift", focusGift: gift, justEarned: false, browseSheet: null, note: null });
    else set({ stage: "drawing", focusGift: null, browseSheet: null, note: null });
  }

  async function close() {
    if (!isOpen() || s.busy || s.flight) return;
    clearTimeout(nextStep);
    set({ stage: "closing", strokes: [], hint: null, browseSheet: null });
    await Promise.all([
      panelA.to(0, 180),
      (async () => {
        await wait(60);
        await liftA.to(1, 160, FAST_OUT_SLOW_IN);
        await wait(260);
        await liftA.to(0, 360, FAST_OUT_SLOW_IN);
      })(),
      rotation.to(0, 600, FLIP, 120),
      move.to(0, 580, FAST_OUT_SLOW_IN, 160),
    ]);
    if (s.stage !== "closing") return;
    panelMode = null;
    pad?.destroy();
    pad = null;
    panelEl.innerHTML = "";
    set({ stage: "view", focusGift: null, pop: null, note: null });
  }

  function later(ms, fn) {
    clearTimeout(nextStep);
    nextStep = setTimeout(fn, ms);
  }

  function reject(message) {
    s.hint = message;
    pad?.shake();
    updatePanel();
  }

  async function confirmStamp() {
    if (s.stage !== "drawing" || s.busy) return;
    const before = card();
    if (!before) return;
    const strokes = s.strokes;
    const problem = verifyDrawing(strokes);
    if (problem) return reject(problem);
    frozen = before;
    set({ stage: "confirming", busy: true, browseSheet: null });
    try {
      pending = store.addStamp(strokes);
    } catch (e) {
      frozen = null;
      return set({ stage: "drawing", busy: false, hint: userMessage(e) });
    }
    s.busy = false;
    s.strokes = [];
    pad?.setStrokes([]);
    s.flight = { strokes, index: before.total };
    render();
    await flyTo(s.flight);
    onFlightFinished();
  }

  async function confirmRedeem() {
    const before = card();
    if (s.stage !== "redeem" || s.busy || !before?.giftToGive) return;
    const strokes = s.strokes;
    const problem = verifyDrawing(strokes);
    if (problem) return reject(problem);
    frozen = before;
    set({ stage: "redeeming", busy: true, browseSheet: null });
    let ring;
    try {
      ring = store.useGift(strokes);
    } catch (e) {
      frozen = null;
      return set({ stage: "redeem", busy: false, hint: userMessage(e) });
    }
    s.busy = false;
    s.strokes = [];
    s.focusGift = ring;
    pad?.setStrokes([]);
    s.flight = { strokes, index: before.total, ring };
    render();
    await flyTo(s.flight);
    onFlightFinished();
  }

  /** Рисунок перелетает из холста в свою ячейку (или на кольцо подарка) по небольшой дуге (560 мс). */
  async function flyTo(flight) {
    const padEl = panelEl.querySelector(".pad");
    if (!padEl) return;
    const pb = padEl.getBoundingClientRect();
    const inner = pad.innerRect();
    const from = { x: pb.left + inner.x, y: pb.top + inner.y, w: inner.w, h: inner.h };
    const cb = slot.getBoundingClientRect();
    const ink = flight.ring ? ringInk(cb.width, cb.height, (flight.ring - 1) % ROWS) : cellInk(cb.width, cb.height, cellOf(flight.index));
    const to = { x: cb.left + ink.x, y: cb.top + ink.y, w: ink.w, h: ink.h };

    // Рисунок рисуется один раз в маленький холст; дальше двигается и уменьшается только transform.
    const d = window.devicePixelRatio || 1;
    const pad2 = from.w * 0.12; // запас: маркер заходит за край квадрата
    const side = from.w + 2 * pad2;
    flightCanvas.width = flightCanvas.height = Math.round(side * d);
    flightCanvas.style.width = flightCanvas.style.height = `${side}px`;
    const ctx = flightCanvas.getContext("2d");
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, side, side);
    drawStamp(ctx, flight.strokes, { x: pad2, y: pad2, w: from.w, h: from.h });
    const place = (v) => {
      const r = lerpRect(from, to, v);
      const k = r.w / from.w;
      flightCanvas.style.transform = `translate3d(${r.x - pad2 * k}px, ${r.y - Math.sin(v * Math.PI) * 56 - pad2 * k}px, 0) scale(${k})`;
    };
    place(0);
    flightCanvas.hidden = false;
    await new Animated(0, place).to(1, 560, FAST_OUT_SLOW_IN);
    flightCanvas.hidden = true;
  }

  /**
   * «Пружинка» ячейки или кольца, получивших рисунок: кусок готового оборота копируется в маленький
   * слой над картой, и масштабируется уже он — оборот целиком не перерисовывается.
   */
  function popTarget(target) {
    s.pop = target;
    drawBack(); // на обороте уже новая отметка
    const w = backCanvas.width;
    const h = backCanvas.height;
    let box;
    if (target.ring) {
      const c = ringCenter(w, h, target.cell);
      const r = ringRadius(w) * 1.15;
      box = { x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r };
    } else {
      const r = cellRect(w, h, target.cell);
      const m = cellStroke(w) * 0.5;
      box = { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
    }
    popCanvas.width = Math.round(box.w);
    popCanvas.height = Math.round(box.h);
    popCanvas.getContext("2d").drawImage(backCanvas, box.x, box.y, box.w, box.h, 0, 0, popCanvas.width, popCanvas.height);
    place(popCanvas, box.x / w, box.y / h, box.w / w, box.h / h);
    popCanvas.style.transform = "scale(1)";
    popCanvas.hidden = false;
    const token = (popToken += 1);
    springPop((v) => {
      if (token === popToken) popCanvas.style.transform = `scale(${v})`;
    }).then(() => {
      if (token !== popToken) return;
      popCanvas.hidden = true;
      s.pop = null;
    });
  }

  /** Рисунок долетел: показываем настоящую карту и «пружиним» ячейку или кольцо. */
  function onFlightFinished() {
    const flight = s.flight;
    frozen = null;
    s.flight = null;
    if (flight.ring) return ringLanded(flight.ring);

    const result = pending;
    pending = null;
    const earned = result?.earnedGift;
    popTarget({ cell: cellOf(flight.index), ring: false });
    let note = "отметка на карте — можно поставить ещё";
    if (earned) note = "ряд заполнен!";
    else if (result?.closedPrepaidRow) note = "ряд заполнен — подарок за него уже выдан";
    // Ряд закрылся и принёс подарок — холст пока не трогаем, сейчас будет выбор.
    set({ stage: earned ? "confirming" : "drawing", note });
    if (earned) later(700, () => s.stage === "confirming" && set({ stage: "gift", focusGift: earned, justEarned: true, note: null }));
  }

  function ringLanded(ring) {
    const ahead = ring > (card()?.earned ?? 0);
    popTarget({ cell: (ring - 1) % ROWS, ring: true });
    set({ note: ahead ? "приятного кофе! отметки этого ряда — потом" : "приятного кофе!" });
    // Даём увидеть рисунок на кольце, затем холст снова готов к отметке.
    later(1100, () => s.stage === "redeeming" && set({ stage: "drawing", focusGift: null, browseSheet: null }));
  }

  function showGift() {
    const gift = card()?.nextGift;
    if (!gift || s.stage !== "drawing") return;
    openToGift = false;
    set({ stage: "gift", focusGift: gift, justEarned: false, strokes: [], hint: null, note: null, browseSheet: null });
  }

  /** Заработанных подарков нет — бариста рисует на кольце текущего ряда, отметки ряда гость добирает потом. */
  function takeGiftAhead() {
    const c = card();
    if (s.stage !== "drawing" || !c?.canTakeAhead) return;
    set({ stage: "redeem", focusGift: c.currentRow, strokes: [], hint: null, note: null, browseSheet: null });
  }

  function useGiftNow() {
    if (s.stage !== "gift") return;
    const oldest = card()?.nextGift;
    if (!oldest) return;
    // Выдаётся самый старый неиспользованный подарок — его кольцо и подсвечиваем.
    set({ stage: "redeem", focusGift: oldest, strokes: [], hint: null, browseSheet: null });
  }

  function cancelRedeem() {
    if (s.stage !== "redeem" || s.busy) return;
    if (giftAhead()) set({ stage: "drawing", focusGift: null, strokes: [], hint: null });
    else set({ stage: "gift", strokes: [], hint: null });
  }

  /** «Сохранить» — подарок остаётся на карте, холст снова готов; «не сейчас» после значка подарка — закрыть. */
  function saveGift() {
    if (s.stage !== "gift" || s.busy) return;
    if (!s.justEarned && openToGift) return close();
    set({ stage: "drawing", focusGift: null, justEarned: false, browseSheet: null, note: s.justEarned ? "подарок сохранён — ждёт на карте" : null });
  }

  function browse(delta) {
    if (!isOpen() || s.busy || s.flight) return;
    const target = Math.min(lastSheet(), Math.max(0, sheet() + delta));
    if (target === sheet()) return;
    set({ browseSheet: target === autoSheet() ? null : target });
  }

  // ── события
  slot.addEventListener("click", () => {
    if (swiped) return;
    if (s.stage === "view") tapCard();
  });
  slot.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && s.stage === "view") {
      e.preventDefault();
      tapCard();
    }
  });
  slot.addEventListener("pointerdown", () => s.stage === "view" && ((liftEl.style.transition = "transform .11s"), (liftEl.style.transform = "scale(0.975)")));
  const release = () => {
    liftEl.style.transform = `scale(${1 + 0.05 * liftA.value})`;
    setTimeout(() => (liftEl.style.transition = ""), 120);
  };
  slot.addEventListener("pointerup", release);
  slot.addEventListener("pointerleave", release);

  // Свайп по открытой карте — перелистывание листов.
  let swipeStart = null;
  let swiped = false;
  slot.addEventListener("pointerdown", (e) => {
    swiped = false;
    swipeStart = isOpen() ? e.clientX : null;
  });
  slot.addEventListener("pointerup", (e) => {
    if (swipeStart == null) return;
    const dx = e.clientX - swipeStart;
    swipeStart = null;
    if (Math.abs(dx) > 48) {
      swiped = true;
      browse(dx < 0 ? 1 : -1);
    }
  });

  badge.addEventListener("click", tapBadge);
  markerRing(badge.querySelector("canvas"), 2);
  $(".close").addEventListener("click", () => close());
  $(".prev").addEventListener("click", () => browse(-1));
  $(".next").addEventListener("click", () => browse(1));
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);

  const unsubscribe = store.subscribe(() => render());
  const ro = new ResizeObserver(resize);
  ro.observe(stageEl);
  resize();
  render();
  refresh();

  return () => {
    destroyed = true;
    clearTimeout(nextStep);
    unsubscribe();
    ro.disconnect();
    pad?.destroy();
    document.removeEventListener("keydown", onKey);
  };
}
