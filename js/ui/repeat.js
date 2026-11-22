// 重复的小框（她 2026-11-22 要的，照苹果闹钟）：日历 Pool 里把计划名旁边的 ↻ 拖到某天，或者点 Pool 底下 Repeats 清单的一行、计划编辑框里的 Change。
// 一排星期几（落下那天先选上，可以多选）、最后一天（她说「我自己选择日期吧」：没有默认，必须挑；没挑就点 Done 会提示）、一行字说一共几次、最后一次哪天。
// 重复只是临时起意的几个月，不写在计划卡片上；存法见 js/store/series.js 的 setPlanRepeat。
// 已经在重复的：再拖一次 ↻ 到别的天 = 多一个星期几（从原来那天起算），小框里也能 Stop repeating。

import * as store from "../store.js";
import * as R from "../routines.js";
import { esc } from "../dom.js";
import { WEEKDAYS, weekday, fmtDay, fmtShort } from "../dates.js";
import { openModal, closeModal, modalSheet } from "./modal.js";

let st = null;   // { pid, on: Set(0 = 周日 … 6 = 周六), start, end, err, had 原来就在重复, back 关掉以后回哪 }

const order = () => (store.prefs().weekStartsOn === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]);
// 原来就在重复、还没过结束日的：带出它的星期几和起止
function current(p, today) {
  if (!p || p.place !== "auto") return null;
  const r = R.ruleOf(p), on = [0, 1, 2, 3, 4, 5, 6].filter((d) => Number(r.days[d]) > 0);
  return on.length && (!r.end || r.end >= today) ? { on, start: r.start || today, end: r.end || "" } : null;
}

// 一共几次、最后一次哪天（按现在选的星期几和起止算；off 不管）
function countText() {
  if (!st.end || st.end < st.start) return "";
  const list = R.occurrences({ days: [0, 1, 2, 3, 4, 5, 6].map((d) => (st.on.has(d) ? 1 : 0)), start: st.start, end: st.end, skip: [] }, st.start, st.end);
  return list.length ? list.length + " time" + (list.length === 1 ? "" : "s") + " · last one " + fmtDay(list[list.length - 1].date) : "No day in this range";
}

function sheetHTML() {
  const p = store.get("projects", st.pid);
  return '<div class="rep-sheet" style="--pc:' + esc(p?.color || "var(--c-None)") + '"><h2 class="sheet-title"><span class="rt">↻</span> ' + esc(p?.name || "Plan") + "</h2>" +
    '<p class="hint">From ' + fmtDay(st.start) + "</p>" +
    '<div class="field"><span>Every</span><div class="rp-days">' + order().map((d) => '<button type="button" class="chip' + (st.on.has(d) ? " on" : "") + '" data-act="rp-day" data-d="' + d + '" aria-pressed="' + st.on.has(d) + '">' + WEEKDAYS[d] + "</button>").join("") + "</div></div>" +
    '<label class="field rp-end"><span>Last day</span><input type="date" data-rp-end min="' + st.start + '" value="' + esc(st.end) + '" aria-describedby="rp-msg"></label>' +
    '<p class="hint rp-msg" id="rp-msg"' + (st.err ? ' role="alert"' : "") + ">" + (st.err ? '<b class="rp-err">' + esc(st.err) + "</b>" : esc(countText())) + "</p>" +
    '<div class="sheet-foot">' + (st.had ? '<button type="button" class="btn danger" data-act="rp-stop">Stop repeating</button>' : "<span></span>") +
    '<span class="rp-go"><button type="button" class="btn ghosty" data-act="rp-cancel">Cancel</button><button type="button" class="btn primary" data-act="rp-done">Done</button></span></div></div>';
}

const redraw = () => { const box = modalSheet()?.querySelector(".rep-sheet"); if (box) box.outerHTML = sheetHTML(); };

// date = 落到哪天（拖 ↻ 时）；back = 关掉以后做什么（从计划编辑框来的就回编辑框）
export function openRepeat(pid, { date = "", back = null } = {}) {
  const p = store.get("projects", pid);
  if (!p) return;
  const today = store.today(), cur = current(p, today), day = date || today;
  const on = new Set(cur ? cur.on : []);
  if (date || !cur) on.add(weekday(day));
  st = { pid, on, start: cur ? (date && date < cur.start ? date : cur.start) : day, end: cur?.end || "", err: "", had: Boolean(cur), back };
  openModal(sheetHTML(), { close: () => { const b = st?.back; st = null; if (b) queueMicrotask(b); } });
  modalSheet()?.querySelector("[data-rp-end]")?.focus();
}

export function initRepeat() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest?.(".rep-sheet [data-act]");
    if (!el || !st) return;
    const act = el.dataset.act;
    if (act === "rp-day") {
      const d = Number(el.dataset.d);
      if (st.on.has(d) && st.on.size > 1) st.on.delete(d); else st.on.add(d);
      st.err = "";
      redraw();
    } else if (act === "rp-cancel") closeModal();
    else if (act === "rp-stop") { store.stopRepeat(st.pid); closeModal(); }
    else if (act === "rp-done") {
      if (!st.end) { st.err = "Pick the last day"; redraw(); modalSheet()?.querySelector("[data-rp-end]")?.focus(); return; }
      if (st.end < st.start) { st.err = "The last day can't be before " + fmtShort(st.start); redraw(); modalSheet()?.querySelector("[data-rp-end]")?.focus(); return; }
      store.setPlanRepeat(st.pid, { on: [...st.on], start: st.start, end: st.end });
      closeModal();
    }
  });
  // 日期框：改了就算几次（只换那一行字，框里的光标不动）
  const readEnd = (input) => {
    if (!st) return;
    st.end = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? input.value : "";
    st.err = "";
    const msg = modalSheet()?.querySelector("#rp-msg");
    if (msg) { msg.removeAttribute("role"); msg.textContent = countText(); }
  };
  document.addEventListener("change", (e) => { if (e.target.matches?.("[data-rp-end]")) readEnd(e.target); });
  document.addEventListener("input", (e) => { if (e.target.matches?.("[data-rp-end]")) readEnd(e.target); });
}
