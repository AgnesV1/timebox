// 弹出层：一次只开一个。点背景、按 Esc 或 × 关掉。
// 焦点：开的时候放进弹层（调用的地方自己把光标放到某一格的，就用它的）；后面的页面 inert（Tab 出不去、读屏也读不到）；
// 关掉以后回到点开它的那个按钮。弹层开着的时候页面整页重画过（比如同步拉下来新数据），那个按钮已经换成新的了：
// 开的时候记一句能重新找到它的选择器（它的 data-act，加上最近的 data-id / data-project / data-goal / data-idea），用它找新的那个；
// 都找不到就放到这一页的第一个标题上，用键盘的人不用从页面最上面重新 Tab

let onClose = null, opener = null, openerSel = "";
const BEHIND = [".app", "#dock", "#sun"];
const KEYS = ["data-id", "data-project", "data-goal", "data-idea"];
const q = (v) => '"' + String(v).replace(/["\\]/g, "\\$&") + '"';

// { act, own: [[属性, 值]…], up: [属性, 值] | null, cls } → 选择器（纯字符串，测试里直接调）
export function selectorOf({ act = "", own = [], up = null, cls = "" } = {}) {
  let me = (act ? "[data-act=" + q(act) + "]" : "") + own.map(([k, v]) => "[" + k + "=" + q(v) + "]").join("");
  if (!me && cls) me = "." + cls.replace(/[^\w-]/g, "");
  if (!me) return "";
  return (up ? "[" + up[0] + "=" + q(up[1]) + "] " : "") + me;
}
// 一个按钮 → 上面那个描述
function describe(el) {
  if (!el || el === document.body) return "";
  const own = KEYS.filter((k) => el.hasAttribute(k)).map((k) => [k, el.getAttribute(k)]);
  let up = null;
  for (let p = el.parentElement; p && p !== document.body && !up; p = p.parentElement) { const k = KEYS.find((x) => p.hasAttribute(x)); if (k) up = [k, p.getAttribute(k)]; }
  return selectorOf({ act: el.dataset?.act || "", own, up, cls: el.classList?.[0] || "" });
}
// 焦点放回去：原来那个还在就用它；不在了按选择器找新的；都没有就是这一页的第一个标题
function giveBack(back, sel) {
  const ok = (el) => el && el.isConnected && !el.closest("[inert]") && el.getClientRects().length;
  let el = ok(back) ? back : null;
  if (!el && sel) { try { el = [...document.querySelectorAll("#main " + sel + ", #side " + sel + ", #dock " + sel)].find(ok) || null; } catch { el = null; } }
  if (!el) {
    el = document.querySelector("#main h1, #main h2, #main h3");
    if (el && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  }
  el?.focus({ preventScroll: true });
}

export function openModal(html, { wide = false, close } = {}) {
  const box = document.getElementById("modal");
  if (box.hidden) {
    opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    openerSel = describe(opener);
  }
  box.innerHTML = '<div class="sheet' + (wide ? " wide" : "") + '" role="dialog" aria-modal="true" tabindex="-1">' +
    '<button class="icon-btn sheet-x" type="button" data-modal-close aria-label="Close"><svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' + html + "</div>";
  box.hidden = false;
  document.body.classList.add("modal-open");
  BEHIND.forEach((sel) => document.querySelector(sel)?.setAttribute("inert", ""));
  onClose = close || null;
  const sheet = box.querySelector(".sheet");
  queueMicrotask(() => { if (!box.hidden && !box.contains(document.activeElement)) sheet.focus({ preventScroll: true }); });
  return sheet;
}

export function closeModal() {
  const box = document.getElementById("modal");
  if (box.hidden) return;
  box.hidden = true;
  box.innerHTML = "";
  document.body.classList.remove("modal-open");
  BEHIND.forEach((sel) => document.querySelector(sel)?.removeAttribute("inert"));
  const fn = onClose, back = opener, sel = openerSel;
  onClose = null;
  opener = null;
  openerSel = "";
  fn?.();
  if (!back && !sel) return;
  giveBack(back, sel);
  // 关掉以后页面可能紧接着又重画一次（下一帧）：焦点掉到 body 上了就再放一次
  requestAnimationFrame(() => requestAnimationFrame(() => { if (document.getElementById("modal").hidden && (document.activeElement === document.body || !document.activeElement)) giveBack(back, sel); }));
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
