// 弹出层：一次只开一个。点背景、按 Esc 或 × 关掉

let onClose = null;

export function openModal(html, { wide = false, close } = {}) {
  const box = document.getElementById("modal");
  box.innerHTML = '<div class="sheet' + (wide ? " wide" : "") + '" role="dialog" aria-modal="true">' +
    '<button class="icon-btn sheet-x" type="button" data-modal-close aria-label="Close"><svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' + html + "</div>";
  box.hidden = false;
  document.body.classList.add("modal-open");
  onClose = close || null;
  return box.querySelector(".sheet");
}

export function closeModal() {
  const box = document.getElementById("modal");
  if (box.hidden) return;
  box.hidden = true;
  box.innerHTML = "";
  document.body.classList.remove("modal-open");
  const fn = onClose;
  onClose = null;
  fn?.();
}

// 焦点正在弹层里的某个日期框上：这时候把它所在的编辑框整块重画，分段输入（月 / 日 / 年）会跳回第一段、没填完的还会被清掉。
// 各个编辑框重画前先问这一句，是就先不画；它失去焦点后 main.js 补画一次
export const fillingDate = () => { const a = document.activeElement; return a?.type === "date" && Boolean(a.closest("#modal")); };

export function modalSheet() {
  const box = document.getElementById("modal");
  return box.hidden ? null : box.querySelector(".sheet");
}

export function initModal() {
  const box = document.getElementById("modal");
  box.addEventListener("click", (e) => {
    if (e.target === box || e.target.closest("[data-modal-close]")) closeModal();
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}
