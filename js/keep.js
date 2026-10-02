// «Карта хранится в этом браузере»: объяснение и сохранение / восстановление из файла — порт KeepCardScreen.kt.
// Файл остаётся у гостя (облако, «Файлы», мессенджер себе); сервер в переносе не участвует.

import { el } from "./screens.js";
import { userMessage } from "./store.js";

const DAY = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

/** iPhone/iPad в Safari, не с экрана «Домой». */
export const iosBrowserTab = () =>
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) &&
  !navigator.standalone &&
  !matchMedia("(display-mode: standalone)").matches;

export function mountKeepScreen(root, store, { onBack }) {
  const screen = el(`
    <section class="screen keep">
      <div class="keep-inner">
        <button class="link small back">← назад</button>
        <h1>карта хранится в этом браузере</h1>
        <p class="keep-place">кофейня «Он мой» · просп. Мира, 45, Москва</p>
        <p>как бумажная: без аккаунта, и у кофейни копии нет. если очистить данные браузера или сменить телефон, карта пропадёт.</p>
        <p>сохраните её в файл — например, в облако или себе в мессенджер — и откройте этот файл на новом телефоне, в приложении или на этом сайте.</p>
        <p class="ios" hidden>на iPhone добавьте сайт на экран «Домой» (поделиться → на экран «Домой»): так Safari не сотрёт карту. карта на экране «Домой» и карта во вкладке Safari хранятся отдельно — перенесите её файлом.</p>
        <div class="actions">
          <button class="link underline save">сохранить в файл</button>
          <button class="link underline open">восстановить из файла</button>
        </div>
        <div class="confirm" hidden>
          <p class="question"></p>
          <p class="fine">отметки, которые сейчас в этом браузере, заменятся.</p>
          <div class="row"><button class="link underline yes">заменить</button><button class="link underline no">отмена</button></div>
        </div>
        <div class="delete-confirm" hidden>
          <p class="delete-question">вы уверены? удалить все отметки?</p>
          <div class="delete-actions">
            <button class="link underline delete-yes">да, удалить все отметки</button>
            <button class="link underline delete-no">нет, я сюда случайно нажал</button>
          </div>
        </div>
        <p class="message" role="status"></p>
        <button class="link small underline delete-card">удалить карту</button>
        <p class="keep-privacy"><a class="link small underline" href="privacy.html">политика конфиденциальности</a></p>
        <input type="file" accept=".json,application/json,text/plain" hidden>
      </div>
    </section>`);
  root.replaceChildren(screen);
  const $ = (sel) => screen.querySelector(sel);
  const message = $(".message");
  const actions = $(".actions");
  const confirm = $(".confirm");
  const deleteCard = $(".delete-card");
  const deleteConfirm = $(".delete-confirm");
  const input = $("input");
  let pending = null;

  $(".ios").hidden = !iosBrowserTab();
  $(".back").onclick = onBack;
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    if (!deleteConfirm.hidden) cancelDelete();
    else onBack();
  };
  document.addEventListener("keydown", onKey);

  const show = (text) => (message.textContent = text ?? "");
  const askToReplace = (value) => {
    pending = value;
    actions.hidden = !!value || !deleteConfirm.hidden;
    confirm.hidden = !value;
    deleteCard.hidden = !!value;
    if (value) $(".question").textContent = `заменить карту картой из файла${value.at ? ` от ${DAY.format(value.at).replace(/\s*г\.$/, "")}` : ""}?`;
  };

  function cancelDelete() {
    deleteConfirm.hidden = true;
    actions.hidden = !!pending;
    deleteCard.hidden = false;
    show(null);
  }

  deleteCard.onclick = () => {
    show(null);
    deleteCard.hidden = true;
    actions.hidden = true;
    deleteConfirm.hidden = false;
  };
  $(".delete-no").onclick = cancelDelete;
  $(".delete-yes").onclick = () => {
    try {
      store.deleteCard();
      show("карта удалена");
    } catch (e) {
      show(userMessage(e));
    }
    deleteConfirm.hidden = true;
    actions.hidden = false;
    deleteCard.hidden = false;
  };

  $(".save").onclick = async () => {
    show(null);
    const file = new File([store.exportBackup()], `кофе-он-мой-карта-${new Date().toISOString().slice(0, 10)}.json`, { type: "application/json" });
    // На телефоне — системное «Поделиться»: «Сохранить в Файлы», облако, мессенджер себе. На компьютере — скачать.
    const touch = matchMedia("(pointer: coarse)").matches;
    if (touch && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        show("карта сохранена в файл");
      } catch (e) {
        if (e?.name !== "AbortError") download(file);
      }
      return;
    }
    download(file);
  };

  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    show("файл карты скачан");
  }

  $(".open").onclick = () => {
    show(null);
    input.value = "";
    input.click();
  };

  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = file.size > 5_000_000 ? "" : await file.text();
      const { exportedAt } = store.checkBackup(text); // ничего не меняет — только проверка
      show(null);
      askToReplace({ text, at: exportedAt });
    } catch (e) {
      askToReplace(null);
      show(userMessage(e));
    }
  };

  $(".yes").onclick = () => {
    try {
      store.restoreBackup(pending.text);
      show("карта восстановлена");
    } catch (e) {
      show(userMessage(e));
    }
    askToReplace(null);
  };
  $(".no").onclick = () => {
    askToReplace(null);
    show(null);
  };

  return () => document.removeEventListener("keydown", onKey);
}
