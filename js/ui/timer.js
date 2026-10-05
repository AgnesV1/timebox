// 计时：在今天的列表里点一个任务选中它，底部浮条点 Start；计时中浮条显示走着的时间和 Stop，
// 停下后浮条上可以顺手标 Done / Partial。手机和电脑一样；开着的计时器跟着表格同步，哪台设备都能停。

import * as store from "../store.js";
import { esc, on } from "../dom.js";
import { fmtMin } from "../dates.js";
import { colorOf, toast } from "./common.js";

let picked = "";     // 这台设备上选中的任务
let stopped = null;  // 刚停下的那段 {taskId, min}：浮条上给 Done / Partial
const TITLE = document.title;

// 能计时的：今天的、还没做完的（Partial 可以接着做）
export const timeable = (t, today) => Boolean(t) && t.date === today && (!t.status || t.status === "partial");

// 选中的任务；没手动选过（或者选的那个已经做完了）：正在计时的那个，再不然今天第一个没做的（先挑不是 Optional 的）
export function pickedId(c) {
  const tasks = store.tasksOn(c.today).filter((t) => timeable(t, c.today));
  const run = store.timer()?.taskId;
  const hit = (id) => id && tasks.some((t) => t.id === id);
  if (hit(picked)) return picked;
  if (hit(run)) return run;
  return (tasks.find((t) => !t.status && !t.optional) || tasks.find((t) => !t.status) || tasks[0])?.id || "";
}

export function pick(id) { picked = id; stopped = null; }

const pad = (n) => String(n).padStart(2, "0");
// 12:34、1:02:34
export function elapsed(start) {
  const s = Math.max(0, Math.floor((Date.now() - Number(start)) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return (h ? h + ":" + pad(m) : m) + ":" + pad(s % 60);
}

const titleOf = (t) => '<b class="dk-title">' + esc(t.title) + "</b>";

// 浮条：在计时 → 时间 + Stop；刚停下 → Done / Partial；看着今天 → 选中的任务 + Start；别的时候不出现
export function dockHTML(c, onToday) {
  const run = store.timer();
  const rt = run && store.get("tasks", run.taskId);
  if (rt) {
    const p = pickedId(c);
    const next = p && p !== rt.id && onToday ? store.get("tasks", p) : null;
    return '<div class="dock run" style="--bar:' + colorOf(rt) + '">' +
      '<i class="pulse" aria-hidden="true"></i><div class="dk-main"><span class="dk-k">Since ' + store.clockOf(run.start) + "</span>" + titleOf(rt) + "</div>" +
      '<span class="dk-time num" data-since="' + run.start + '">' + elapsed(run.start) + "</span>" +
      '<button type="button" class="dk-btn stop" data-act="timer-stop"><i class="sq"></i>Stop</button>' +
      '<button type="button" class="icon-btn dk-x" data-act="timer-discard" aria-label="Discard this timer" title="Discard">×</button>' +
      (next ? '<button type="button" class="dk-switch" data-act="timer-start" data-id="' + next.id + '">Switch to <b>' + esc(next.title) + "</b> ▶</button>" : "") + "</div>";
  }
  const st = stopped && store.get("tasks", stopped.taskId);
  if (st && st.status !== "done") {
    return '<div class="dock logged" style="--bar:' + colorOf(st) + '">' +
      '<div class="dk-main"><span class="dk-k">Logged ' + fmtMin(stopped.min) + "</span>" + titleOf(st) + "</div>" +
      '<button type="button" class="dk-btn" data-act="dock-status" data-s="done">Done</button>' +
      '<button type="button" class="dk-btn ghost" data-act="dock-status" data-s="partial">Partial</button>' +
      '<button type="button" class="icon-btn dk-x" data-act="dock-close" aria-label="Close">×</button></div>';
  }
  if (!onToday) return "";
  const t = store.get("tasks", pickedId(c));
  if (!t) return "";
  return '<div class="dock idle" style="--bar:' + colorOf(t) + '">' +
    '<i class="dot" aria-hidden="true"></i><div class="dk-main"><span class="dk-k">Selected · ' + t.est + " min planned</span>" + titleOf(t) + "</div>" +
    '<button type="button" class="dk-btn start" data-act="timer-start" data-id="' + t.id + '"><i class="tri"></i>Start</button></div>';
}

// 每秒只改走着的数字和标签页标题，不整页重画；整页重画完也调一次
export function tick() {
  const run = store.timer();
  const t = run && store.get("tasks", run.taskId);
  if (!t) { if (document.title !== TITLE) document.title = TITLE; return; }
  const e = elapsed(run.start);
  document.querySelectorAll("[data-since]").forEach((el) => { el.textContent = elapsed(el.dataset.since); });
  document.title = e + " · " + t.title;
}

function stop() {
  const r = store.stopTimer();
  if (!r) return;
  if (r.min < 1) { toast("Under a minute — not logged"); return; }
  stopped = r;
}

export function initTimer(rerender) {
  on(document, "click", "[data-act=timer-start]", (e, el) => {
    const r = store.startTimer(el.dataset.id);
    picked = el.dataset.id;
    stopped = null;
    if (r?.min) toast("Logged " + fmtMin(r.min) + " on the last one");
    rerender();
  });
  on(document, "click", "[data-act=timer-stop]", () => { stop(); rerender(); });
  on(document, "click", "[data-act=timer-discard]", () => { store.discardTimer(); rerender(); });
  on(document, "click", "[data-act=dock-status]", (e, el) => {
    const id = stopped?.taskId;
    stopped = null;
    if (id && store.get("tasks", id)?.status !== el.dataset.s) store.setStatus(id, el.dataset.s);   // 再点同一个会取消，这里不要
    else rerender();
  });
  on(document, "click", "[data-act=dock-close]", () => { stopped = null; rerender(); });
  setInterval(tick, 1000);
}
