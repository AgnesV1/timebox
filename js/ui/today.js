// 「今天」页：安全线、当天的任务块、昨天的账单、过期没做的、任务列表、加任务、给这天的备注。
// 手机上只有这一页；电脑上左边是清单，右边是安全线和账单。日历里点开某一天也用它。

import * as store from "../store.js";
import * as E from "../engine.js";
import { esc, on, icon, debounce } from "../dom.js";
import { fmtDay, fmtShort, addDays } from "../dates.js";
import { heroHTML, stripHTML, billHTML, colorOf, projectOf, STATUS, CATS } from "./common.js";
import { openTaskEditor } from "./editor.js";

const openDesc = new Set();
const seen = new Set();
let overdueOpen = false;
let viewDate = "";

export const shownDate = () => viewDate || store.today();
export function showDate(d) { viewDate = d === store.today() ? "" : d; }

function rowHTML(c, t, tasks) {
  const p = projectOf(t);
  const fin = t.status === "done" || t.status === "partial";
  const why = t.status === "partial" || t.status === "later" || t.status === "drop";
  const open = openDesc.has(t.id);
  const fresh = !seen.has(t.id);
  seen.add(t.id);
  const movedOn = t.status === "later" && c.tasks.some((x) => !x.status && x.date > t.date && x.title === t.title);
  return '<div class="row st-' + (t.status || "open") + (t.optional ? " opt" : "") + (fresh ? " enter" : "") + '" data-id="' + t.id + '" style="--i:' + tasks.indexOf(t) + '">' +
    '<div class="est num" data-drag-row title="Drag to reorder"><b>' + t.est + '</b><i class="grip"></i></div>' +
    '<div class="bar" style="--bar:' + colorOf(t) + ";min-height:" + Math.max(20, Math.min(t.est * 0.6, 90)) + 'px"></div>' +
    '<div class="body"><div class="line">' +
    '<div class="task" data-act="desc">' + (t.optional ? '<span class="tag">Optional</span>' : "") + esc(t.title) +
    (p && p.name.trim().toLowerCase() !== t.title.trim().toLowerCase() ? ' <span class="pj" style="--pc:' + esc(p.color) + '">' + esc(p.name) + "</span>" : "") +
    (t.desc && !open ? '<span class="more"> ⋯</span>' : "") + "</div>" +
    (fin ? '<label class="act"><input class="num" data-act="actual" inputmode="numeric" placeholder="—" value="' + esc(t.actual ?? "") + '" aria-label="Actual minutes">min</label>' : "") +
    '<button class="icon-btn" type="button" data-act="edit" aria-label="Edit task">' + icon("more") + "</button>" +
    "</div>" +
    (open ? '<textarea class="desc" data-act="desc-input" data-keep="desc-' + t.id + '" placeholder="Details">' + esc(t.desc || "") + "</textarea>" : "") +
    '<div class="chips">' + STATUS.map(([s, label]) => '<button type="button" class="chip' + (t.status === s ? " on" : "") + '" data-act="status" data-s="' + s + '">' + label + "</button>").join("") +
    (t.status === "later" && !movedOn ? '<button type="button" class="chip ghost" data-act="tomorrow">→ Tomorrow</button>' : "") + "</div>" +
    (why ? '<input class="reason" data-act="reason" data-keep="reason-' + t.id + '" placeholder="Why?" value="' + esc(t.reason || "") + '">' : "") +
    "</div></div>";
}

function overdueHTML(c) {
  const od = c.tasks.filter((t) => !t.status && t.date && t.date < c.today).sort((a, b) => a.date.localeCompare(b.date));
  if (!od.length) return "";
  return '<section class="overdue"><div class="od-head"><b>' + od.length + " left behind</b><span>from earlier days</span>" +
    '<button type="button" class="link" data-act="od-toggle">' + (overdueOpen ? "Hide" : "Show") + "</button></div>" +
    (overdueOpen ? "<ul>" + od.map((t) => '<li><i style="background:' + colorOf(t) + '"></i><span>' + esc(t.title) + "</span><em>" + fmtShort(t.date) + " · " + t.est + "m</em></li>").join("") + "</ul>" : "") +
    '<div class="od-actions"><button type="button" class="btn primary" data-act="spread">Spread them out</button><button type="button" class="btn" data-act="all-today">All to today</button></div></section>';
}

function addHTML(c, d) {
  const projects = c.projects.filter(E.isActive);
  return '<form class="add" data-add="' + d + '" autocomplete="off">' +
    '<div class="add-main"><input name="title" data-keep="add-title-' + d + '" placeholder="Add a task" enterkeyhint="done">' +
    '<input name="est" class="min num" data-keep="add-est-' + d + '" type="number" inputmode="numeric" value="30" min="5" step="5" aria-label="Minutes">' +
    '<button class="btn cta" type="submit">Add</button></div>' +
    '<div class="add-more"><div class="cats">' +
    ["", ...CATS].map((k) => '<label class="cat"><input type="radio" name="cat" value="' + k + '"' + (k ? "" : " checked") + '><i style="--c:' + (k ? "var(--c-" + k + ")" : "var(--c-None)") + '"></i>' + (k || "None") + "</label>").join("") +
    "</div>" + (projects.length ? '<select name="project" aria-label="Project"><option value="">No project</option>' + projects.map((p) => '<option value="' + p.id + '">' + esc(p.name) + "</option>").join("") + "</select>" : "") +
    "</div></form>";
}

function noteHTML(d) {
  const note = store.get("notes", d)?.note || "";
  return '<section class="note"><label for="note-' + d + '">Note to self</label><textarea id="note-' + d + '" data-act="note" data-date="' + d + '" data-keep="note-' + d + '" rows="2" placeholder="Stuck points, ideas, how the day went…">' + esc(note) + "</textarea></section>";
}

export function dayParts(c, d) {
  const tasks = store.tasksOn(d);
  const isToday = d === c.today;
  return {
    hero: heroHTML(c, d),
    strip: stripHTML(c, d, tasks),
    bill: isToday ? billHTML(E.yesterdayBill(c)) : "",
    overdue: isToday ? overdueHTML(c) : "",
    list: '<div class="list" data-list="' + d + '">' + (tasks.length ? tasks.map((t) => rowHTML(c, t, tasks)).join("") : '<div class="empty">No tasks for this day.</div>') + "</div>",
    add: addHTML(c, d),
    note: noteHTML(d)
  };
}

// 日历里点开某一天：同一套，竖着排
export function dayModalHTML(c, d) {
  const x = dayParts(c, d);
  return '<div class="dayview" data-date="' + d + '"><h2 class="sheet-title">' + fmtDay(d) + (d === c.today ? " <small>Today</small>" : "") + "</h2>" + x.hero + x.strip + x.list + x.add + x.note + "</div>";
}

export function todayHTML(c, phone) {
  const d = shownDate();
  const x = dayParts(c, d);
  const isToday = d === c.today;
  if (phone) {
    return '<div class="dayview phone-day" data-date="' + d + '">' +
      '<header class="phead"><div class="l"><button type="button" class="nav" data-act="day-prev" aria-label="Previous day">‹</button>' +
      '<h1 data-act="day-today">' + fmtDay(d) + '</h1><span class="ball" data-act="ball" role="button" aria-label="Sparkles"></span>' +
      '<button type="button" class="nav" data-act="day-next" aria-label="Next day">›</button></div><a class="nav" href="#settings">Settings</a></header>' +
      (isToday ? "" : '<button type="button" class="back-today" data-act="day-today">← Back to today</button>') +
      x.hero + x.strip + x.bill + x.overdue + x.list + x.add + x.note +
      '<footer class="pfoot"><button type="button" class="btn" data-act="sync">Sync now</button><span class="sync-status" data-sync-status></span></footer></div>';
  }
  return '<div class="dayview" data-date="' + d + '">' +
    '<header class="page-head"><div><p class="eyebrow">' + (isToday ? "Today" : d < store.today() ? "Looking back" : "Looking ahead") + "</p><h2>" + fmtDay(d) + "</h2></div>" +
    '<div class="tools"><button type="button" class="nav" data-act="day-prev" aria-label="Previous day">' + icon("left") + '</button><button type="button" class="nav" data-act="day-today">Today</button><button type="button" class="nav" data-act="day-next" aria-label="Next day">' + icon("right") + "</button></div></header>" +
    '<div class="today-grid"><div class="today-main">' + x.strip + x.list + x.add + "</div>" +
    '<div class="today-side">' + x.hero + x.bill + x.overdue + x.note + "</div></div></div>";
}

// ---------- 交互（挂在 document 上，今天页和弹出的某一天都能用） ----------

const saveNote = debounce((d, v) => store.setNote(d, v), 500);
const rowId = (el) => el.closest(".row")?.dataset.id;

export function initToday(rerender) {
  on(document, "click", ".dayview [data-act]", (e, el) => {
    const act = el.dataset.act, id = rowId(el);
    if (act === "status") store.setStatus(id, el.dataset.s);
    else if (act === "desc") { if (openDesc.has(id)) openDesc.delete(id); else openDesc.add(id); rerender(); }
    else if (act === "edit") openTaskEditor(id);
    else if (act === "tomorrow") store.toTomorrow(id);
    else if (act === "od-toggle") { overdueOpen = !overdueOpen; rerender(); }
    else if (act === "spread") store.spreadOverdue();
    else if (act === "all-today") {
      const c = store.ctx();
      store.moveMany(c.tasks.filter((t) => !t.status && t.date && t.date < c.today).map((t) => t.id), c.today);
    } else if (act === "day-prev") { showDate(addDays(shownDate(), -1)); rerender(); }
    else if (act === "day-next") { showDate(addDays(shownDate(), 1)); rerender(); }
    else if (act === "day-today") { showDate(store.today()); rerender(); }
  });

  on(document, "input", ".dayview [data-act]", (e, el) => {
    const act = el.dataset.act, id = rowId(el);
    if (act === "actual") {
      el.value = el.value.replace(/\D/g, "").slice(0, 3);
      store.updateTask(id, { actual: el.value === "" ? null : Number(el.value) }, null, { quiet: true });
    } else if (act === "reason") store.updateTask(id, { reason: el.value }, null, { quiet: true });
    else if (act === "desc-input") {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
      store.updateTask(id, { desc: el.value }, null, { quiet: true });
    } else if (act === "note") saveNote(el.dataset.date, el.value);
  });

  // 填完实际分钟离开输入框时，再整页更新一次数字
  on(document, "change", ".dayview [data-act=actual]", () => rerender());

  on(document, "submit", ".dayview form[data-add]", (e, form) => {
    e.preventDefault();
    const f = new FormData(form);
    let title = String(f.get("title") || "").trim();
    if (!title) return;
    let est = Number(f.get("est")) || 30;
    // 「Gym 40」「Gym 40m」：末尾的数字当分钟
    const m = title.match(/^(.*\S)\s+(\d{1,3})\s*(m|min|mins)?$/i);
    if (m && Number(m[2]) >= 5) { title = m[1]; est = Number(m[2]); }
    store.addTask({ date: form.dataset.add, title, est, category: String(f.get("cat") || ""), projectId: String(f.get("project") || "") });
    const input = document.querySelector('[data-keep="add-title-' + form.dataset.add + '"]');
    if (input) { input.value = ""; input.focus(); }
  });

  // 按住左边的分钟数上下拖，调整顺序；拖到屏幕边缘会自动滚动
  on(document, "pointerdown", ".dayview [data-drag-row]", (e, handle) => {
    if (e.button > 0) return;
    e.preventDefault();
    const list = handle.closest(".list");
    const rows = [...list.querySelectorAll(".row")];
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
