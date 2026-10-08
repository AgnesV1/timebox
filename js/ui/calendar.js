// 日历（电脑）：周视图 / 月视图，右边是任务池。
// 把任务池里的条目拖到某天就排进去；日历里的任务拖到别的天就挪过去，拖回任务池就撤回。
// 自动排的计划在以后的日子里画成淡色预览：规律的那一次可以拖走 / 点开（这时才变成真任务），整块的预计份额只看。
// 格子里的日程永远全部显示（名字完整换行）；格子有最小宽度，放不下就左右滑。格子顶上的小开关标「通勤日」。

import * as store from "../store.js";
import * as E from "../engine.js";
import { esc, on, icon } from "../dom.js";
import { addDays, addMonths, startOfWeek, startOfMonth, range, fmtShort, fmtMin, WEEKDAYS, MONTHS, MONTHS_LONG, weekday } from "../dates.js";
import { colorOf, lineInfo, projectOf, projectOptions, groupsOf, toast } from "./common.js";
import { openModal } from "./modal.js";
import { dayModalHTML } from "./today.js";
import { openTaskEditor } from "./editor.js";

let anchor = "";
let adding = "";      // 正在哪一天的格子里加任务
let openDay = "";     // 弹出来的是哪一天
let capEdit = "";     // 正在改哪一天的可用时间

const mode = () => store.local().calMode || "week";
const weekStart = () => store.prefs().weekStartsOn;

function chipHTML(t) {
  const p = projectOf(t);
  return '<div class="ev st-' + (t.status || "open") + (t.optional ? " opt" : "") + '" data-drag="task:' + t.id + '" data-act="edit-task" data-id="' + t.id + '" style="--c:' + colorOf(t) + '" title="' + esc(t.title + (p ? " · " + p.name : "")) + '">' +
    '<span class="t">' + (E.isRoutine(t) ? '<i class="rt">↻</i>' : "") + esc(t.title) + '</span><span class="m num">' + t.est + "</span></div>";
}

function ghostHTML(g) {
  const reg = g.kind === "regular";
  return '<div class="ev ghost' + (reg ? "" : " proj") + '"' + (reg ? ' data-drag="ghost:' + esc(g.key) + '" data-act="open-ghost" data-key="' + esc(g.key) + '"' : "") +
    ' style="--c:' + esc(g.plan.color) + '" title="' + esc(g.title + (reg ? " · repeats" : " · projected share")) + '">' +
    '<span class="t">' + (reg ? '<i class="rt">↻</i>' : "") + esc(g.title) + '</span><span class="m num">' + g.est + "</span></div>";
}

function cellHTML(c, d, { month = false, outside = false } = {}) {
  const tasks = store.tasksOn(d);
  const ghosts = E.ghostsOn(c, d);
  const sum = E.daySummary(c, d);
  const line = d >= c.today || c.log[d] ? lineInfo(c, d).line : 0;
  const capOver = c.capacity.overrides[d] !== undefined;
  const commute = store.isCommuteDay(d);
  const cls = ["cell", d === c.today ? "today" : "", d < c.today ? "past" : "", sum.rest ? "rest" : "", outside ? "outside" : "", sum.cap && sum.planned > sum.cap ? "over" : "", commute ? "commute" : ""].filter(Boolean).join(" ");
  const all = [...tasks.map(chipHTML), ...ghosts.map(ghostHTML)];
  const loadPct = sum.cap ? Math.min(100, (sum.planned / sum.cap) * 100) : 0;
  let h = '<div class="' + cls + '" data-drop="day:' + d + '">' +
    '<div class="cell-head"><button type="button" class="dn" data-act="open-day" data-date="' + d + '"><span>' + (month ? "" : WEEKDAYS[weekday(d)]) + "</span><b>" + Number(d.slice(8)) + "</b></button>" +
    '<button type="button" class="cm-t' + (commute ? " on" : "") + '" data-act="commute" data-date="' + d + '" aria-pressed="' + commute + '" title="' + (commute ? "Commute day — click to clear" : "Mark as a commute day") + '">' + icon("commute") + "</button>" +
    (month ? "" : capEdit === d
      ? '<input class="cap-input num" type="number" min="0" step="15" data-cap-input="' + d + '" data-keep="cap-' + d + '" value="' + sum.cap + '" title="Minutes available · 0 = rest day · empty = weekly default">'
      : '<button type="button" class="cap num' + (capOver ? " set" : "") + '" data-act="cap" data-date="' + d + '" title="Available minutes this day — click to change">' + (sum.rest ? "rest" : fmtMin(sum.cap)) + "</button>") + "</div>" +
    '<div class="load"><i style="width:' + loadPct + '%"></i></div>' +
    (commute ? '<div class="cm-band">Commute</div>' : "") +
    (line && !month ? '<div class="ln num">line ' + fmtMin(line) + "</div>" : "") +
    all.join("");
  if (!month) {
    h += adding === d
      ? '<form class="cell-form" data-cell-add="' + d + '"><input name="title" data-keep="cell-add-' + d + '" placeholder="Task 30" autocomplete="off"></form>'
      : '<button type="button" class="cell-add" data-act="cell-add" data-date="' + d + '" aria-label="Add a task">' + icon("plus") + "</button>";
  }
  return h + "</div>";
}

export function calendarHTML(c) {
  if (!anchor) anchor = c.today;
  const week = mode() === "week";
  let title, body;
  if (week) {
    const s = startOfWeek(anchor, weekStart());
    const e = addDays(s, 6);
    title = fmtShort(s) + " – " + (s.slice(5, 7) === e.slice(5, 7) ? Number(e.slice(8)) : fmtShort(e));
    body = '<div class="cal-scroll"><div class="week">' + range(s, e).map((d) => cellHTML(c, d)).join("") + "</div></div>";
  } else {
    const m0 = startOfMonth(anchor);
    const s = startOfWeek(m0, weekStart());
    title = MONTHS_LONG[Number(m0.slice(5, 7)) - 1] + " " + m0.slice(0, 4);
    const heads = range(s, addDays(s, 6)).map((d) => "<span>" + WEEKDAYS[weekday(d)] + "</span>").join("");
    body = '<div class="cal-scroll"><div class="month-head">' + heads + '</div><div class="month">' +
      range(s, addDays(s, 41)).map((d) => cellHTML(c, d, { month: true, outside: d.slice(0, 7) !== m0.slice(0, 7) })).join("") + "</div></div>";
  }
  const { line, done } = lineInfo(c, c.today);
  const scale = Math.max(line * 1.2, done, 60);
  return '<div class="calendar">' +
    '<header class="page-head"><div><h2>' + title + "</h2></div>" +
    '<div class="tools"><button type="button" class="nav" data-act="cal-today">Today</button>' +
    '<button type="button" class="nav" data-act="cal-prev" aria-label="Previous">' + icon("left") + '</button><button type="button" class="nav" data-act="cal-next" aria-label="Next">' + icon("right") + "</button>" +
    '<span class="seg"><button type="button" data-act="cal-mode" data-mode="week"' + (week ? ' class="on"' : "") + '>Week</button><button type="button" data-act="cal-mode" data-mode="month"' + (!week ? ' class="on"' : "") + ">Month</button></span>" +
    '<button type="button" class="nav' + (store.local().pool ? " on" : "") + '" data-act="pool-toggle">' + icon("pool") + " Pool</button></div></header>" +
    (line > 0 ? '<div class="lineband"><span>Today\'s line ' + fmtMin(line) + '</span><div class="meter"><div class="fill" style="width:' + Math.min(100, (done / scale) * 100) + '%"></div><i class="tick" style="left:' + Math.min(100, (line / scale) * 100) + '%"></i></div><em>' + fmtMin(done) + " done" + (E.streak(c) ? " · 🔥 " + E.streak(c) : "") + "</em></div>" : "") +
    body + "</div>";
}

// ---------- 任务池 ----------

export function poolHTML(c) {
  const projects = c.projects.filter((p) => E.isActive(p) && !E.isRegular(p));   // 条目只挂在整块计划上
  const list = E.poolItems(c);
  const regs = E.poolRegulars(c);
  const subs = projects.map((p) => ({ p, items: list.filter((x) => x.item.projectId === p.id) })).filter((g) => g.items.length);
  const total = list.reduce((a, x) => a + x.state.unscheduled, 0);
  let h = '<div class="pool-inner" data-drop="pool"><header class="pool-head"><div><h3>Pool</h3><p>' + (list.length ? list.length + " items · " + fmtMin(total) + " to place" : "Drag onto a day to plan it") + '</p></div>' +
    '<button type="button" class="icon-btn" data-act="pool-toggle" aria-label="Hide pool">' + icon("close") + "</button></header>";
  if (projects.length) {
    h += '<form class="pool-add" autocomplete="off"><select name="project" aria-label="Plan">' + projectOptions(projects, "", null) + "</select>" +
      '<div class="row2"><input name="title" data-keep="pool-add" placeholder="New item"><input name="est" class="num" type="number" value="45" min="5" step="5" aria-label="Minutes"><button class="btn cta" type="submit">' + icon("plus") + "</button></div></form>";
  }
  if (!projects.length) h += '<p class="empty">Make a plan first — its items land here.</p><a class="btn" href="#projects">Projects</a>';
  else if (!subs.length && !regs.length) h += '<p class="empty">Everything is on the calendar ✓</p>';
  // 规律计划（Pool）：这周还剩几次，拖一次排一次
  if (regs.length) {
    h += '<section class="pg"><div class="pg-head"><i></i><span>This week</span></div>' + regs.map((x) =>
      '<div class="pi" data-drag="regular:' + x.plan.id + '" style="--c:' + esc(x.plan.color) + '"><i class="g"></i><span>↻ ' + esc(x.plan.name) + '</span><b class="num">' + x.min + "m · " + x.left + " left</b></div>").join("") + "</section>";
  }
  // 项目 → 子项目 → 模块
  let lastGroup = null;
  groupsOf(subs.map((x) => x.p)).forEach((g) => g.subs.forEach((p) => {
    const { items } = subs.find((x) => x.p === p);
    if (g.name !== lastGroup) { lastGroup = g.name; if (g.name) h += '<div class="pg-group">' + esc(g.name) + "</div>"; }
    h += '<section class="pg"><div class="pg-head" style="--pc:' + esc(p.color) + '"><i></i><span>' + esc(p.name) + "</span><em>" + fmtMin(items.reduce((a, x) => a + x.state.unscheduled, 0)) + "</em></div>";
    let mod = null;
    items.forEach(({ item, state }) => {
      if ((item.module || "") !== mod) { mod = item.module || ""; if (mod) h += '<div class="pg-mod">' + esc(mod) + "</div>"; }
      const part = state.progress > 0 || state.scheduled > 0;
      h += '<div class="pi" data-drag="item:' + item.id + '" style="--c:' + esc(p.color) + '"><i class="g"></i><span>' + esc(item.title) + '</span><b class="num">' + fmtMin(state.unscheduled) + (part ? " left" : "") + "</b></div>";
    });
    h += "</section>";
  }));
  h += forecastHTML(c) + '<p class="pool-hint">Drag items onto a day. Drag a task back here to unschedule it.</p></div>';
  return h;
}

// 未来两周每天项目要多少时间 vs 当天容量
function forecastHTML(c) {
  const rows = E.forecast(c, 14);
  if (!rows.some((r) => r.total > 0)) return "";
  const max = Math.max(...rows.map((r) => Math.max(r.total, r.cap)), 60);
  return '<section class="forecast"><h4>Next 14 days</h4><div class="fc">' + rows.map((r) =>
    '<div class="fc-col' + (r.over ? " over" : "") + (r.rest ? " rest" : "") + '" title="' + fmtShort(r.date) + ": " + fmtMin(r.total) + (r.cap ? " of " + fmtMin(r.cap) : "") + '">' +
    '<i class="cap" style="height:' + (r.cap / max) * 100 + '%"></i><i class="need" style="height:' + (r.total / max) * 100 + '%"></i><span>' + WEEKDAYS[weekday(r.date)][0] + "</span></div>").join("") + "</div></section>";
}

// ---------- 交互 ----------

export function refreshDayModal() {
  const view = document.querySelector("#modal .dayview");
  if (!openDay || !view) return;
  const keep = document.activeElement?.dataset?.keep;
  view.outerHTML = dayModalHTML(store.ctx(), openDay);
  if (keep) document.querySelector('#modal [data-keep="' + keep + '"]')?.focus();
}

export function initCalendar(rerender) {
  on(document, "click", ".calendar [data-act], .pool-inner [data-act], .page-tools [data-act]", (e, el) => {
    const act = el.dataset.act;
    const step = (n) => { anchor = mode() === "week" ? addDays(anchor || store.today(), 7 * n) : addMonths(anchor || store.today(), n); rerender(); };
    if (act === "cal-prev") step(-1);
    else if (act === "cal-next") step(1);
    else if (act === "cal-today") { anchor = store.today(); rerender(); }
    else if (act === "cal-mode") store.setLocal({ calMode: el.dataset.mode });
    else if (act === "pool-toggle") store.setLocal({ pool: !store.local().pool });
    else if (act === "edit-task") openTaskEditor(el.dataset.id);
    else if (act === "open-ghost") { const id = store.materialize(el.dataset.key); if (id) openTaskEditor(id); }
    else if (act === "commute") store.toggleCommute(el.dataset.date);
    else if (act === "open-day") {
      openDay = el.dataset.date;
      openModal(dayModalHTML(store.ctx(), openDay), { wide: true, close: () => { openDay = ""; } });
    } else if (act === "cell-add") {
      adding = el.dataset.date;
      rerender();
      document.querySelector('[data-keep="cell-add-' + adding + '"]')?.focus();
    } else if (act === "cap") {
      capEdit = el.dataset.date;
      rerender();
      const input = document.querySelector('[data-cap-input="' + capEdit + '"]');
      input?.focus();
      input?.select();
    }
  });

  // 改某天的可用时间：回车或离开就存；清空 = 用每周默认；Esc 放弃
  const saveCap = (input) => {
    if (capEdit !== input.dataset.capInput) return;
    capEdit = "";
    const v = input.value.trim();
    store.setDayCapacity(input.dataset.capInput, v === "" ? null : Math.max(0, Number(v) || 0));
  };
  on(document, "keydown", "[data-cap-input]", (e, input) => {
    if (e.key === "Enter") saveCap(input);
    if (e.key === "Escape") { capEdit = ""; rerender(); }
  });
  on(document, "focusout", "[data-cap-input]", (e, input) => saveCap(input));

  on(document, "submit", ".cell-form", (e, form) => {
    e.preventDefault();
    let title = String(new FormData(form).get("title") || "").trim();
    const date = form.dataset.cellAdd;
    if (title) {
      let est = 30;
      const m = title.match(/^(.*\S)\s+(\d{1,3})\s*(m|min|mins)?$/i);
      if (m && Number(m[2]) >= 5) { title = m[1]; est = Number(m[2]); }
      store.addTask({ date, title, est });
    }
    adding = "";
    rerender();
  });
  on(document, "focusout", ".cell-form input", (e, input) => {
    if (!input.value.trim()) setTimeout(() => { if (adding) { adding = ""; rerender(); } }, 120);
  });
  on(document, "keydown", ".cell-form input", (e) => { if (e.key === "Escape") { adding = ""; rerender(); } });

  on(document, "submit", ".pool-add", (e, form) => {
    e.preventDefault();
    const f = new FormData(form);
    const title = String(f.get("title") || "").trim();
    if (!title) return;
    store.addItems(String(f.get("project")), "", [title], Number(f.get("est")) || 45);
    form.querySelector("[name=title]").value = "";
  });
}

export function handleDrop(payload, target) {
  const i = payload.indexOf(":");
  const kind = payload.slice(0, i), id = payload.slice(i + 1);   // 重复任务的 id 里也有冒号
  if (target === "pool") {
    if (kind === "task" && !store.unschedule(id)) toast("Only unstarted tasks that came from the pool can go back");
    return;
  }
  const date = target.slice(4);
  if (kind === "task") store.moveTask(id, date);
  else if (kind === "item") store.scheduleItem(id, date);
  else if (kind === "regular") store.placeRegular(id, date);
  else if (kind === "ghost") { const tid = store.materialize(id); if (tid) store.moveTask(tid, date); }
}
