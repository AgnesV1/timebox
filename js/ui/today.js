// 「今天」页：安全线、当天的任务块、昨天的账单、过期没做的、任务列表、加任务、给这天的备注。
// 电脑上左边是清单，右边是安全线和账单；日历里点开某一天也用它。
// 手机上：看今天前后各 5 天的任务、给任务标结果、计时、加任务；右上角齿轮进去只有白天黑夜和连表格。计划都在电脑上做。

import * as store from "../store.js";
import * as E from "../engine.js";
import { esc, on, icon } from "../dom.js";
import { fmtDay, fmtShort, fmtMin, addDays, diffDays, weekday, WEEKDAYS } from "../dates.js";
import * as R from "../routines.js";
import { heroHTML, stripHTML, billHTML, colorOf, projectOf, projectOptions, segStyle, lineInfo, toast, STATUS } from "./common.js";
import { openTaskEditor } from "./editor.js";
import { pickedId, pick, timeable, elapsed } from "./timer.js";

const openDesc = new Set();
const logOpen = new Set();   // 已经有计时记录、又点了「+ time」要再补一段的任务
const seen = new Set();
let overdueOpen = false;
let viewDate = "";

export const shownDate = () => viewDate || store.today();
export function showDate(d) { viewDate = d === store.today() ? "" : d; }

// 计时记录：「09:10–09:40 · 30m ×」；正在计时的那个显示走着的时间
function timesHTML(c, t, list, form) {
  const run = store.timer();
  const live = run?.taskId === t.id;
  const fin = t.status === "done" || t.status === "partial";
  if (!list.length && !live) return "";
  return '<div class="times">' + (live ? '<span class="tm live"><i></i><b class="num" data-since="' + run.start + '">' + elapsed(run.start) + "</b></span>" : "") +
    list.map((x) => '<span class="tm">' + (x.from ? '<span class="num">' + esc(x.from) + "–" + esc(x.to) + "</span> · " : "") + fmtMin(x.min) +
      '<button type="button" class="tm-x" data-act="time-del" data-tid="' + x.id + '" aria-label="Delete this time">×</button></span>').join("") +
    (list.length > 1 ? '<span class="tm sum">= ' + fmtMin(store.timeTotal(t.id)) + "</span>" : "") +
    (fin && !form ? '<button type="button" class="tm more-time" data-act="time-more">+ time</button>' : "") + "</div>";
}

// 标了 Done / Partial：填「用了几小时几分、几点结束」记一段。没计过时的直接出来；计过的点「+ time」再补
function logFormHTML(c, t, list) {
  const base = list.length ? 0 : Number(t.actual) > 0 ? Number(t.actual) : t.status === "done" ? Number(t.est) || 0 : 0;
  const k = (f) => 'data-lt="' + f + '" data-keep="lt-' + f + "-" + t.id + '"';
  return '<div class="logtime"><span>Took</span>' +
    '<input class="num" ' + k("h") + ' inputmode="numeric" value="' + (base ? Math.floor(base / 60) : "") + '" placeholder="0" aria-label="Hours"><span>h</span>' +
    '<input class="num" ' + k("m") + ' inputmode="numeric" value="' + (base ? base % 60 : "") + '" placeholder="0" aria-label="Minutes"><span>m</span>' +
    '<span>ended</span><input type="time" ' + k("to") + ' value="' + (t.date === c.today ? store.clockNow() : "") + '" aria-label="Ended at">' +
    '<button type="button" class="btn" data-act="time-log">Log</button></div>';
}

function rowHTML(c, t, tasks, phone = false) {
  const p = projectOf(t);
  const fin = t.status === "done" || t.status === "partial";
  const why = t.status === "partial" || t.status === "later" || t.status === "drop";
  const open = openDesc.has(t.id);
  const fresh = !seen.has(t.id);
  seen.add(t.id);
  const movedOn = t.status === "later" && c.tasks.some((x) => !x.status && x.date > t.date && x.title === t.title);
  const list = store.timeOf(t.id);
  const form = fin && t.date <= c.today && (!list.length || logOpen.has(t.id));
  const picked = timeable(t, c.today) && pickedId(c) === t.id;
  const running = store.timer()?.taskId === t.id;
  return '<div class="row st-' + (t.status || "open") + (t.optional ? " opt" : "") + (fresh ? " enter" : "") + (picked ? " picked" : "") + (running ? " running" : "") + '" data-id="' + t.id + '" style="--i:' + tasks.indexOf(t) + '">' +
    '<div class="est num" data-drag-row title="Drag to reorder"><b>' + t.est + '</b><i class="grip"></i></div>' +
    '<div class="bar" style="--bar:' + colorOf(t) + ";min-height:" + Math.max(20, Math.min(t.est * 0.6, 90)) + 'px"></div>' +
    '<div class="body"><div class="line">' +
    '<div class="task" data-act="desc">' + (t.optional ? '<span class="tag">Optional</span>' : "") + esc(t.title) +
    (E.isRoutine(t) ? ' <span class="rt" title="Routine">↻</span>' : "") +
    (p && p.name.trim().toLowerCase() !== t.title.trim().toLowerCase() ? ' <span class="pj" style="--pc:' + esc(p.color) + '">' + esc(p.name) + "</span>" : "") +
    (t.desc && !open ? '<span class="more"> ⋯</span>' : "") + "</div>" +
    (phone ? "" : '<button class="icon-btn" type="button" data-act="edit" aria-label="Edit task">' + icon("more") + "</button>") +
    "</div>" + timesHTML(c, t, list, form) +
    (open ? '<textarea class="desc" data-act="desc-input" data-keep="desc-' + t.id + '" placeholder="Details">' + esc(t.desc || "") + "</textarea>" : "") +
    '<div class="chips">' + STATUS.map(([s, label]) => '<button type="button" class="chip' + (t.status === s ? " on" : "") + '" data-act="status" data-s="' + s + '">' + label + "</button>").join("") +
    (t.status === "later" && !movedOn && !phone ? '<button type="button" class="chip ghost" data-act="tomorrow">→ Tomorrow</button>' : "") + "</div>" +
    (form ? logFormHTML(c, t, list) : "") +
    (why ? '<input class="reason" data-act="reason" data-keep="reason-' + t.id + '" placeholder="Why?" value="' + esc(t.reason || "") + '">' : "") +
    "</div></div>";
}

// 以后某天：自动排的计划画成淡色预览（只看，不存；到那天才变成任务）
function ghostsHTML(c, d) {
  return E.ghostsOn(c, d).map((g) => '<div class="row ghost" title="' + (g.kind === "regular" ? "Repeats — shows up on the day" : "Projected share — shows up on the day") + '">' +
    '<div class="est num"><b>' + g.est + '</b></div><div class="bar" style="--bar:' + esc(g.plan.color) + '"></div>' +
    '<div class="body"><div class="line"><div class="task">' + esc(g.title) + (g.kind === "regular" ? ' <span class="rt">↻</span>' : "") + "</div></div></div></div>").join("");
}

function overdueHTML(c) {
  const od = c.tasks.filter((t) => !t.status && t.date && t.date < c.today && !E.isAutoTask(t)).sort((a, b) => a.date.localeCompare(b.date));
  if (!od.length) return "";
  return '<section class="overdue"><div class="od-head"><b>' + od.length + " left behind</b><span>from earlier days</span>" +
    '<button type="button" class="link" data-act="od-toggle">' + (overdueOpen ? "Hide" : "Show") + "</button></div>" +
    (overdueOpen ? "<ul>" + od.map((t) => '<li><i style="background:' + colorOf(t) + '"></i><span>' + esc(t.title) + "</span><em>" + fmtShort(t.date) + " · " + t.est + "m</em></li>").join("") + "</ul>" : "") +
    '<div class="od-actions"><button type="button" class="btn primary" data-act="spread">Spread them out</button><button type="button" class="btn" data-act="all-today">All to today</button></div></section>';
}

// 加任务；电脑上多两个下拉：怎么重复、重复多久（一键排好整段时间）
function addHTML(c, d, phone = false) {
  const projects = c.projects.filter(E.isActive);
  return '<form class="add" data-add="' + d + '" autocomplete="off">' +
    '<div class="add-main"><input name="title" data-keep="add-title-' + d + '" placeholder="Add a task" enterkeyhint="done">' +
    '<input name="est" class="min num" data-keep="add-est-' + d + '" type="number" inputmode="numeric" value="30" min="5" step="5" aria-label="Minutes">' +
    '<button class="btn cta" type="submit">Add</button></div>' +
    '<div class="add-more">' + (projects.length ? '<select name="project" aria-label="Plan">' + projectOptions(projects) + "</select>" : "") +
    (phone ? "" : '<select name="repeat" aria-label="Repeat"><option value="">Doesn\'t repeat</option><option value="daily">↻ Every day</option>' +
      '<option value="weekdays">↻ Weekdays</option><option value="weekly">↻ Every ' + WEEKDAYS[weekday(d)] + "</option></select>" +
      '<select name="for" aria-label="For how long">' + R.LENGTHS.map(([v, l]) => '<option value="' + v + '"' + (v === R.DEFAULT_LENGTH ? " selected" : "") + ">for " + l + "</option>").join("") + "</select>") +
    "</div></form>";
}

export function dayParts(c, d) {
  const tasks = store.tasksOn(d);
  const isToday = d === c.today;
  return {
    hero: heroHTML(c, d),
    strip: stripHTML(c, d, tasks),
    bill: isToday ? billHTML(E.yesterdayBill(c)) : "",
    overdue: isToday ? overdueHTML(c) : "",
    list: '<div class="list" data-list="' + d + '">' + (tasks.length ? tasks.map((t) => rowHTML(c, t, tasks)).join("") : E.ghostsOn(c, d).length ? "" : '<div class="empty">No tasks for this day.</div>') + ghostsHTML(c, d) + "</div>",
    add: addHTML(c, d)
  };
}

// 日历里点开某一天：同一套，竖着排
export function dayModalHTML(c, d) {
  const x = dayParts(c, d);
  return '<div class="dayview" data-date="' + d + '"><h2 class="sheet-title">' + fmtDay(d) + (d === c.today ? " <small>Today</small>" : "") + "</h2>" + x.hero + x.strip + x.list + x.add + "</div>";
}

// ---------- 手机 ----------

const PHONE_SPAN = 5;

// 一天的小圆点：全标完 = 实心；还有没标的 = 空心；没有任务 = 不画
function dayDot(tasks) {
  if (!tasks.length) return "";
  const open = tasks.filter((t) => !t.status && !t.optional).length;
  return '<i class="' + (open ? (open < tasks.length ? "some" : "todo") : "all") + '"></i>';
}

// 还没连表格（比如换了新手机）：只在这时候让人填网址和口令
function connectHTML() {
  const l = store.local();
  return '<section class="settings connect"><h2>Connect your Sheet</h2><p class="hint">Paste the Apps Script URL and the secret once. After that this screen goes away.</p>' +
    '<label class="field"><span>Apps Script URL</span><input data-local="url" value="' + esc(l.url) + '" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" spellcheck="false"></label>' +
    '<label class="field"><span>Secret</span><input data-local="secret" type="password" value="' + esc(l.secret) + '" autocomplete="off"></label></section>';
}

function phoneHTML(c) {
  let d = shownDate();
  if (Math.abs(diffDays(c.today, d)) > PHONE_SPAN) { showDate(c.today); d = c.today; }
  const tasks = store.tasksOn(d);
  const days = Array.from({ length: PHONE_SPAN * 2 + 1 }, (_, i) => addDays(c.today, i - PHONE_SPAN));
  const strip = '<nav class="daystrip" aria-label="Days">' + days.map((x) =>
    '<button type="button" class="dpill' + (x === c.today ? " today" : "") + (x === d ? " on" : "") + (x < c.today ? " past" : "") + '" data-act="day-pick" data-date="' + x + '" aria-label="' + fmtDay(x) + '">' +
    "<span>" + WEEKDAYS[weekday(x)].slice(0, 2) + "</span><b>" + Number(x.slice(8)) + "</b>" + dayDot(store.tasksOn(x)) + "</button>").join("") + "</nav>";
  const day = E.daySummary(c, d);
  const { line, done } = lineInfo(c, d);
  const lineText = line > 0 ? (done >= line - 1 ? "Line " + fmtMin(line) + " ✓" : "Line " + fmtMin(line) + " · " + fmtMin(line - done) + " to go") : "";
  const meta = '<div class="stripmeta' + (day.cap > 0 && day.planned > day.cap ? " over" : "") + '"><span>' + Math.round(day.done) + " / " + day.planned + " min done</span><span>" + lineText + "</span></div>";
  const bar = '<div class="strip">' + tasks.map((t) => '<i style="flex-grow:' + Math.max(5, Number(t.est) || 0) + ";" + segStyle(t) + '"></i>').join("") + "</div>";
  return '<div class="dayview phone-day" data-date="' + d + '">' +
    '<header class="phead"><div class="l"><h1 data-act="day-today">' + fmtDay(d) + '</h1><span class="ball" data-act="ball" role="button" aria-label="Sparkles"></span></div>' +
    '<div class="r"><span class="psync" data-sync-status></span><a class="icon-btn pset" href="#reading" aria-label="Reading">' + icon("reading") + '</a><a class="icon-btn pset" href="#settings" aria-label="Settings">' + icon("settings") + "</a></div></header>" + strip +
    (store.local().url ? bar + meta + '<div class="list" data-list="' + d + '">' +
      (tasks.length ? tasks.map((t) => rowHTML(c, t, tasks, true)).join("") : E.ghostsOn(c, d).length ? "" : '<div class="empty">' + (d < c.today ? "Nothing was planned this day." : "Nothing planned yet.") + "</div>") + ghostsHTML(c, d) + "</div>" + addHTML(c, d, true)
      : connectHTML()) + "</div>";
}

export function todayHTML(c, phone) {
  const d = shownDate();
  const x = dayParts(c, d);
  const isToday = d === c.today;
  if (phone) return phoneHTML(c);
  return '<div class="dayview" data-date="' + d + '">' +
    '<header class="page-head"><div><p class="eyebrow">' + (isToday ? "Today" : d < store.today() ? "Looking back" : "Looking ahead") + "</p><h2>" + fmtDay(d) + "</h2></div>" +
    '<div class="tools"><button type="button" class="nav" data-act="day-prev" aria-label="Previous day">' + icon("left") + '</button><button type="button" class="nav" data-act="day-today">Today</button><button type="button" class="nav" data-act="day-next" aria-label="Next day">' + icon("right") + "</button></div></header>" +
    '<div class="today-grid"><div class="today-main">' + x.strip + x.list + x.add + "</div>" +
    '<div class="today-side">' + x.hero + x.bill + x.overdue + "</div></div></div>";
}

// ---------- 交互（挂在 document 上，今天页和弹出的某一天都能用） ----------

function logFromRow(row) {
  if (!row) return;
  const val = (f) => row.querySelector('[data-lt="' + f + '"]')?.value || "";
  const min = (Number(val("h")) || 0) * 60 + (Number(val("m")) || 0);
  if (min < 1) { toast("How long did it take?"); row.querySelector("[data-lt=h]")?.focus(); return; }
  logOpen.delete(row.dataset.id);
  store.logTime(row.dataset.id, min, val("to"));
}
const rowId = (el) => el.closest(".row")?.dataset.id;

export function initToday(rerender) {
  on(document, "click", ".dayview [data-act]", (e, el) => {
    const act = el.dataset.act, id = rowId(el);
    if (act === "status") { logOpen.delete(id); store.setStatus(id, el.dataset.s); }
    else if (act === "edit") openTaskEditor(id);
    else if (act === "time-del") store.deleteTime(el.dataset.tid);
    else if (act === "time-more") { logOpen.add(id); rerender(); }
    else if (act === "time-log") logFromRow(el.closest(".row"));
    else if (act === "tomorrow") store.toTomorrow(id);
    else if (act === "od-toggle") { overdueOpen = !overdueOpen; rerender(); }
    else if (act === "spread") store.spreadOverdue();
    else if (act === "all-today") {
      const c = store.ctx();
      store.moveMany(c.tasks.filter((t) => !t.status && t.date && t.date < c.today && !E.isAutoTask(t)).map((t) => t.id), c.today);
    } else if (act === "day-prev") { showDate(addDays(shownDate(), -1)); rerender(); }
    else if (act === "day-next") { showDate(addDays(shownDate(), 1)); rerender(); }
    else if (act === "day-today") { showDate(store.today()); rerender(); }
    else if (act === "day-pick") { showDate(el.dataset.date); rerender(); }
  });

  // 点任务：今天能计时的、还没选中的 → 选中它（底部浮条换成它）；已经选中的再点名字 → 展开说明
  on(document, "click", ".dayview .row", (e, row) => {
    if (e.target.closest("button, input, textarea, select, label, a, [data-drag-row]")) return;
    const id = row.dataset.id, c = store.ctx();
    if (timeable(store.get("tasks", id), c.today) && pickedId(c) !== id) { pick(id); rerender(); return; }
    if (!e.target.closest("[data-act=desc]")) return;
    if (openDesc.has(id)) openDesc.delete(id); else openDesc.add(id);
    rerender();
  });

  // 「几小时几分」只留数字
  on(document, "input", ".logtime [data-lt=h], .logtime [data-lt=m]", (e, el) => { el.value = el.value.replace(/\D/g, "").slice(0, 3); });
  on(document, "keydown", ".logtime input", (e, el) => { if (e.key === "Enter") { e.preventDefault(); logFromRow(el.closest(".row")); } });

  on(document, "input", ".dayview [data-act]", (e, el) => {
    const act = el.dataset.act, id = rowId(el);
    if (act === "reason") store.updateTask(id, { reason: el.value }, null, { quiet: true });
    else if (act === "desc-input") {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
      store.updateTask(id, { desc: el.value }, null, { quiet: true });
    }
  });

  on(document, "submit", ".dayview form[data-add]", (e, form) => {
    e.preventDefault();
    const f = new FormData(form);
    let title = String(f.get("title") || "").trim();
    if (!title) return;
    let est = Number(f.get("est")) || 30;
    // 「Gym 40」「Gym 40m」：末尾的数字当分钟
    const m = title.match(/^(.*\S)\s+(\d{1,3})\s*(m|min|mins)?$/i);
    if (m && Number(m[2]) >= 5) { title = m[1]; est = Number(m[2]); }
    const fields = { date: form.dataset.add, title, est, projectId: String(f.get("project") || "") };
    const how = String(f.get("repeat") || "");
    const id = how ? store.addRepeating(fields, R.daysFor(how, fields.date, est), R.endFor(fields.date, Number(f.get("for")))) : store.addTask(fields);
    if (how) form.querySelector("[name=repeat]").value = "";
    if (form.dataset.add === store.today()) { pick(id); rerender(); }   // 加完就选中，底部点 Start 就能开始
    const input = document.querySelector('[data-keep="add-title-' + form.dataset.add + '"]');
    if (input) { input.value = ""; input.focus(); }
  });

  // 按住左边的分钟数上下拖，调整顺序；拖到屏幕边缘会自动滚动
  on(document, "pointerdown", ".dayview [data-drag-row]", (e, handle) => {
    if (e.button > 0) return;
    e.preventDefault();
    const list = handle.closest(".list");
    const rows = [...list.querySelectorAll(".row[data-id]")];
    const row = handle.closest(".row"), i = rows.indexOf(row);
    const cs = getComputedStyle(row);
    const h = row.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    const mids = rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + scrollY + b.height / 2; });
    const y0 = e.clientY + scrollY;
    let to = i, cy = e.clientY, raf = 0;
    row.classList.add("dragging");
    const update = () => {
      const dy = cy + scrollY - y0;
      row.style.transform = "translateY(" + dy + "px)";
      to = mids.filter((m, k) => k !== i && m < mids[i] + dy).length;
      rows.forEach((r, k) => {
        if (k === i) return;
        const s = k > i && k <= to ? -h : k < i && k >= to ? h : 0;
        r.style.transform = s ? "translateY(" + s + "px)" : "";
      });
    };
    const edge = () => {
      const v = cy < 70 ? -8 : cy > innerHeight - 70 ? 8 : 0;
      if (v) { scrollBy(0, v); update(); }
      raf = requestAnimationFrame(edge);
    };
    const move = (ev) => { cy = ev.clientY; update(); };
    const up = () => {
      cancelAnimationFrame(raf);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      rows.forEach((r) => { r.style.transform = ""; });
      row.classList.remove("dragging");
      if (to === i) return;
      const ids = rows.map((r) => r.dataset.id);
      ids.splice(to, 0, ids.splice(i, 1)[0]);
      store.reorder(ids);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    raf = requestAnimationFrame(edge);
  });
}
