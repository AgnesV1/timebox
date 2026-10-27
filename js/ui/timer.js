// 计时：在今天的列表里点一个任务选中它，底部浮条点 Start；计时中浮条显示走着的时间和 Stop，
// 停下后浮条上可以顺手标 Done / Delay。手机和电脑一样；开着的计时器跟着表格同步，哪台设备都能停。
// 忘了按 / 停晚了：计时中点「Since 09:10」改开始的钟点；Stop 旁边的 ⏱ = 按某个钟点停。浮条底下多一行小框，填完点按钮才算（钟点框边打边发 change，不能一改就停）。

import * as store from "../store.js";
import { esc, on } from "../dom.js";
import { fmtMin } from "../dates.js";
import { colorOf, toast } from "./common.js";
import * as L from "../lists.js";
import { animateNext } from "../motion.js";
import { cheer } from "../fx.js";

let picked = "";     // 这台设备上选中的任务
let stopped = null;  // 刚停下的那段 {taskId, min}：浮条上给 Done / Delay
let atEdit = "";     // 浮条上正在改的钟点：since = 其实几点开始的 / stop = 其实几点就停了
const TITLE = document.title;

// 能计时的：今天的、还没做完的（Delay 的也可以接着做）。计划下面那几项（便条）不单独计时，时间记在计划那一行上
export const timeable = (t, today) => Boolean(t) && t.date === today && (!t.status || t.status === "delay") && !L.isLine(t);
// 计划那一行（整块计时）
const isPlanRow = (t) => L.isRow(t) && Boolean(store.get("projects", t.projectId));

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
// ◆：这个任务是不是深度（要专心做的）。按 Start 的时候顺手定，计时中也能改
const deepBtn = (t) => '<button type="button" class="dk-deep' + (t.deep ? " on" : "") + '" data-act="dock-deep" data-id="' + t.id + '" aria-pressed="' + Boolean(t.deep) + '" title="Deep work">◆<span>Deep</span></button>';

// 浮条：在计时 → 时间 + Stop；刚停下 → Done / Delay；看着今天 → 选中的任务 + Start；别的时候不出现
// 浮条底下那一行：一个钟点框 + 按钮
function atForm(kind, value) {
  return '<form class="dk-at" data-at="' + kind + '" autocomplete="off"><span>' + (kind === "since" ? "Started at" : "Stopped at") + "</span>" +
    '<input type="time" name="at" value="' + value + '" data-keep="dock-at-' + kind + '" aria-label="' + (kind === "since" ? "Started at" : "Stopped at") + '">' +
    '<button type="submit" class="btn">' + (kind === "since" ? "Set" : "Stop") + '</button><button type="button" class="link" data-act="at-x">Cancel</button></form>';
}

// extra = 换掉 Deep 按钮的那一块（计时的是 Chore 键那条时，main.js 递进来四个记号）；返回 null 就照旧是 Deep
export function dockHTML(c, onToday, extra = () => null) {
  const run = store.timer();
  const rt = run && store.get("tasks", run.taskId);
  if (rt) {
    const p = pickedId(c);
    const next = p && p !== rt.id && onToday ? store.get("tasks", p) : null;
    return '<div class="dock run" style="--bar:' + colorOf(rt) + '">' +
      '<i class="pulse" aria-hidden="true"></i><div class="dk-main"><button type="button" class="dk-k dk-since' + (atEdit === "since" ? " on" : "") + '" data-act="at-edit" data-v="since" title="Started earlier? Change the time">Since ' + store.clockOf(run.start) + "</button>" + titleOf(rt) + "</div>" +
      (extra(rt) ?? deepBtn(rt)) + '<span class="dk-time num" data-since="' + run.start + '">' + elapsed(run.start) + "</span>" +
      '<button type="button" class="dk-early' + (atEdit === "stop" ? " on" : "") + '" data-act="at-edit" data-v="stop" title="Stopped earlier? Pick the time" aria-label="Stopped earlier? Pick the time">⏱</button>' +
      '<button type="button" class="dk-btn stop" data-act="timer-stop"><i class="sq"></i>Stop</button>' +
      '<button type="button" class="icon-btn dk-x" data-act="timer-discard" aria-label="Discard this timer" title="Discard">×</button>' +
      (atEdit ? atForm(atEdit, atEdit === "since" ? store.clockOf(run.start) : store.clockNow()) : "") +
      (next && !atEdit ? '<button type="button" class="dk-switch" data-act="timer-start" data-id="' + next.id + '">Switch to <b>' + esc(next.title) + "</b> ▶</button>" : "") + "</div>";
  }
  atEdit = "";
  const st = stopped && store.get("tasks", stopped.taskId);
  if (st && st.status !== "done") {
    return '<div class="dock logged" style="--bar:' + colorOf(st) + '">' +
      '<div class="dk-main"><span class="dk-k">Logged ' + fmtMin(stopped.min) + "</span>" + titleOf(st) + "</div>" +
      '<button type="button" class="dk-btn" data-act="dock-status" data-s="done">Done</button>' +
      '<button type="button" class="dk-btn ghost" data-act="dock-status" data-s="delay">Delay</button>' +
      '<button type="button" class="icon-btn dk-x" data-act="dock-close" aria-label="Close">×</button></div>';
  }
  if (!onToday) return "";
  const t = store.get("tasks", pickedId(c));
  if (!t) return "";
  return '<div class="dock idle" style="--bar:' + colorOf(t) + '">' +
    '<i class="dot" aria-hidden="true"></i><div class="dk-main"><span class="dk-k">Selected' + selectedText(t) + "</span>" + titleOf(t) + "</div>" + deepBtn(t) +
    '<button type="button" class="dk-btn start" data-act="timer-start" data-id="' + t.id + '"><i class="tri"></i>Start</button></div>';
}

// 「Selected · 30 min planned」；计划那一行写下面还没勾的几项加起来大概多久
function selectedText(t) {
  if (!isPlanRow(t)) return " · " + t.est + " min planned";
  const open = store.tasksOn(t.date).filter((x) => x.projectId === t.projectId && x.itemId && !x.status);
  const min = open.reduce((a, x) => a + (Number(x.est) || 0), 0);
  return open.length ? " · " + open.length + " to do" + (min ? " · ~" + L.sizeOf(min) : "") : "";
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

function stop(at = "") {
  const r = store.stopTimer(at);
  if (!r) return;
  if (r.error) { toast(r.error === "before" ? "That's before it started" : "That's later than now"); return; }
  atEdit = "";
  if (r.min < 1) { toast("Under a minute — not logged"); return; }
  stopped = r;
}

export function initTimer(rerender) {
  // 浮条上的按钮点了之后，浮条和列表平滑变成新样子
  on(document, "click", "#dock [data-act]", () => animateNext());
  on(document, "click", "[data-act=timer-start]", (e, el) => {
    const r = store.startTimer(el.dataset.id);
    picked = el.dataset.id;
    stopped = null;
    if (r?.min) toast("Logged " + fmtMin(r.min) + " on the last one");
    rerender();
  });
  on(document, "click", "[data-act=timer-stop]", () => { atEdit = ""; stop(); rerender(); });
  on(document, "click", "#dock [data-act=at-edit]", (e, el) => {
    atEdit = atEdit === el.dataset.v ? "" : el.dataset.v;
    rerender();
    if (atEdit) requestAnimationFrame(() => setTimeout(() => document.querySelector(".dk-at [name=at]")?.focus(), 0));
  });
  on(document, "click", "#dock [data-act=at-x]", () => { atEdit = ""; rerender(); });
  on(document, "submit", ".dk-at", (e, form) => {
    e.preventDefault();
    const v = form.at.value;
    if (!v) { form.at.focus(); return; }
    if (form.dataset.at === "stop") stop(v);
    else if (store.setTimerStart(v)) atEdit = "";
    else toast("That's later than now");
    rerender();
  });
  on(document, "click", "[data-act=timer-discard]", () => { store.discardTimer(); rerender(); });
  on(document, "click", "[data-act=dock-status]", (e, el) => {
    const id = stopped?.taskId;
    stopped = null;
    if (id && store.get("tasks", id)?.status !== el.dataset.s) { cheer(el, el.dataset.s); store.setStatus(id, el.dataset.s); }   // 再点同一个会取消，这里不要
    else rerender();
  });
  on(document, "click", "[data-act=dock-close]", () => { stopped = null; rerender(); });
  on(document, "click", "[data-act=dock-deep]", (e, el) => { const t = store.get("tasks", el.dataset.id); if (t) store.updateTask(t.id, { deep: !t.deep }); });
  setInterval(tick, 1000);
}
