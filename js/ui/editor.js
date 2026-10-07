// 改一个任务：名字、日期、分钟、计划、可选、说明、重复、删除。改了就存，没有「保存」按钮（重复要点按钮才生效）。
// 重复的任务：顶上选「只改这次 / 这次和以后 / 全部」；删的时候问删哪些。

import * as store from "../store.js";
import * as E from "../engine.js";
import * as R from "../routines.js";
import { esc, on, icon } from "../dom.js";
import { fmtMin, fmtShort, weekday, WEEKDAYS } from "../dates.js";
import { projectOptions } from "./common.js";
import { openModal, closeModal, modalSheet } from "./modal.js";

let editing = "";
let scope = "this";    // 重复任务改动作用到哪些：this / following / all
let delAsk = false;    // 删重复任务时正在问删哪些
let rep = null;        // 正在设重复：{pattern, days, len, until}

const SERIES_FIELDS = ["title", "est", "projectId", "optional"];
const PATTERNS = [["", "Doesn't repeat"], ["daily", "Every day"], ["weekdays", "Weekdays (Mon–Fri)"], ["weekly", "Every week, same day"], ["custom", "Pick days…"]];
const weekOrder = () => (store.prefs().weekStartsOn === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]);

// 重复的设置面板：方式、一周七天各几分钟、多久（或到哪天）、预览会排几次
function repPanelHTML(t, rule) {
  const n = R.occurrences({ days: rep.days, start: t.date, end: rep.until, skip: rule?.skip || [] }, t.date).length;
  return '<div class="rep-panel">' +
    '<label class="field"><span>Repeat</span><select data-r="pattern">' + PATTERNS.slice(rule ? 1 : 0).map(([v, l]) => '<option value="' + v + '"' + (rep.pattern === v ? " selected" : "") + ">" +
      (v === "weekly" ? "Every " + WEEKDAYS[weekday(t.date)] : l) + "</option>").join("") + "</select></label>" +
    '<div class="field"><span>Minutes on each day — empty = skip that day</span><div class="weekly">' +
    weekOrder().map((d) => "<label><b>" + WEEKDAYS[d] + '</b><input class="num" type="number" min="0" step="5" data-r-day="' + d + '" value="' + (Number(rep.days[d]) > 0 ? Number(rep.days[d]) : "") + '"></label>').join("") + "</div></div>" +
    '<div class="field-row"><label class="field"><span>For</span><select data-r="len">' +
    R.LENGTHS.map(([v, l]) => '<option value="' + v + '"' + (String(rep.len) === String(v) ? " selected" : "") + ">" + l + "</option>").join("") +
    '<option value="until"' + (rep.len === "until" ? " selected" : "") + ">Until a date…</option></select></label>" +
    '<label class="field"><span>Last day</span><input type="date" data-r="until" min="' + t.date + '" value="' + esc(rep.until) + '"></label></div>' +
    '<div class="rep-go"><span class="hint" data-r-preview>' + previewText(t, n) + "</span>" +
    '<button type="button" class="btn cta" data-act="rep-apply">' + (rule ? "Update this & following" : "Repeat") + "</button></div></div>";
}

const previewText = (t, n) => n + " time" + (n === 1 ? "" : "s") + " · " + fmtShort(t.date) + " → " + (rep.until ? fmtShort(rep.until) : "?");

function startRep(t, rule) {
  if (rule) {
    const p = R.patternOf(rule.days, rule.start);
    rep = { pattern: p, days: (rule.days || []).slice(), len: "until", until: rule.end || R.endFor(t.date, R.DEFAULT_LENGTH) };
  } else rep = { pattern: "", days: [0, 0, 0, 0, 0, 0, 0], len: R.DEFAULT_LENGTH, until: R.endFor(t.date, R.DEFAULT_LENGTH) };
}

function repeatHTML(t, rule) {
  if (rule && !rep) {
    const left = store.seriesTasks(rule.id).filter((x) => x.date >= store.today() && !x.status).length;
    return '<div class="field"><span>Repeat</span><div class="rep-sum">↻ <b>' + esc(R.describe(rule, store.prefs().weekStartsOn)) + "</b>" +
      (rule.end ? " · until " + fmtShort(rule.end) : "") + " · " + left + " to go" +
      '<button type="button" class="link" data-act="rep-open">Change…</button></div></div>';
  }
  if (!rep) startRep(t, null);
  if (!rule && !rep.pattern) {
    return '<label class="field"><span>Repeat</span><select data-r="pattern">' + PATTERNS.map(([v, l]) => '<option value="' + v + '">' +
      (v === "weekly" ? "Every " + WEEKDAYS[weekday(t.date)] : l) + "</option>").join("") + "</select></label>";
  }
  return repPanelHTML(t, rule);
}

function footHTML(t, rule) {
  if (delAsk && rule) {
    const n = (s) => store.seriesScope(t.id, s).length;
    return '<div class="del-ask"><p>Delete which? <span class="hint">Ones you already did or timed stay as records.</span></p><div class="btns">' +
      '<button type="button" class="btn danger" data-act="del-scope" data-scope="this">Only this</button>' +
      '<button type="button" class="btn danger" data-act="del-scope" data-scope="following">This & following (' + n("following") + ")</button>" +
      '<button type="button" class="btn danger" data-act="del-scope" data-scope="earlier">This & earlier (' + n("earlier") + ")</button>" +
      '<button type="button" class="btn danger" data-act="del-scope" data-scope="all">All (' + n("all") + ")</button>" +
      '<button type="button" class="btn ghosty" data-act="del-cancel">Cancel</button></div></div>';
  }
  return '<div class="sheet-foot"><button type="button" class="btn danger" data-act="del">' + icon("trash") + " Delete</button>" +
    '<button type="button" class="btn primary" data-modal-close>Done</button></div>';
}

function editorHTML(t) {
  const c = store.ctx();
  const projects = c.projects.filter((p) => E.isActive(p) || p.id === t.projectId);
  const item = t.itemId ? store.get("items", t.itemId) : null;
  const st = item ? E.itemState(c, item) : null;
  const rule = store.routineOf(t.id);
  if (!rule) scope = "this";
  return '<div class="task-editor" data-task="' + t.id + '"><h2 class="sheet-title">Edit task' + (rule ? " <small>↻ repeating</small>" : "") + "</h2>" +
    (rule ? '<div class="field scope"><span>Changes apply to</span><span class="seg">' +
      [["this", "This one"], ["following", "This & following"], ["all", "All"]].map(([v, l]) => '<button type="button" data-act="scope" data-scope="' + v + '"' + (scope === v ? ' class="on"' : "") + ">" + l + "</button>").join("") +
      "</span></div>" : "") +
    '<label class="field"><span>Task</span><input data-f="title" value="' + esc(t.title) + '"></label>' +
    '<div class="field-row"><label class="field"><span>Date</span><input type="date" data-f="date" value="' + esc(t.date) + '"></label>' +
    '<label class="field"><span>Minutes</span><input type="number" class="num" min="0" step="5" data-f="est" value="' + esc(t.est) + '"></label></div>' +
    '<label class="field"><span>Sub-project</span><select data-f="projectId">' + projectOptions(projects, t.projectId) + "</select></label>" +
    (item ? '<p class="hint">Part of <b>' + esc(item.title) + "</b> · " + fmtMin(st.progress) + " of " + fmtMin(st.est) + " done</p>" : "") +
    '<label class="check"><input type="checkbox" data-f="optional"' + (t.optional ? " checked" : "") + "> Optional — nice to do, not a must</label>" +
    repeatHTML(t, rule) +
    '<label class="field"><span>Details</span><textarea data-f="desc" rows="4" placeholder="Steps, links, anything">' + esc(t.desc || "") + "</textarea></label>" +
    footHTML(t, rule) + "</div>";
}

export function openTaskEditor(id) {
  const t = store.get("tasks", id);
  if (!t) return;
  editing = id;
  scope = "this";
  delAsk = false;
  rep = null;
  openModal(editorHTML(t), { close: () => { editing = ""; rep = null; delAsk = false; } });
}

function redraw() {
  const sheet = modalSheet();
  const t = editing && store.get("tasks", editing);
  if (!sheet || !t) return;
  const scroll = sheet.scrollTop;
  sheet.querySelector(".task-editor").outerHTML = editorHTML(t);
  sheet.scrollTop = scroll;
}

function readRep(sheet) {
  sheet.querySelectorAll("[data-r-day]").forEach((el) => { rep.days[Number(el.dataset.rDay)] = Math.max(0, Math.round(Number(el.value) || 0)); });
}

function paintPreview(sheet) {
  const t = store.get("tasks", editing);
  const rule = store.routineOf(editing);
  const n = R.occurrences({ days: rep.days, start: t.date, end: rep.until, skip: rule?.skip || [] }, t.date).length;
  const el = sheet.querySelector("[data-r-preview]");
  if (el) el.textContent = previewText(t, n);
}

export function initEditor() {
  const save = (el) => {
    const f = el.dataset.f;
    if (!editing) return;
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (f === "est") v = Math.max(0, Number(v) || 0);
    if (f === "title" && !String(v).trim()) return;
    if (f === "date" && !v) return;
    if (scope !== "this" && SERIES_FIELDS.includes(f) && store.routineOf(editing)) return store.editSeries(editing, { [f]: v }, scope);
    if (f === "projectId") return store.setTaskProject(editing, el.value);
    store.updateTask(editing, { [f]: v }, null, { quiet: f === "desc" || f === "title" });
  };
  on(document, "input", ".task-editor [data-f=desc], .task-editor [data-f=title]", (e, el) => save(el));
  on(document, "change", ".task-editor [data-f]", (e, el) => {
    save(el);
    if (el.dataset.f === "title") store.updateTask(editing, {});   // 名字改完离开时整页刷新一次
  });

  on(document, "click", ".task-editor [data-act]", (e, el) => {
    const act = el.dataset.act, id = editing;
    if (act === "scope") { scope = el.dataset.scope; redraw(); }
    else if (act === "del") {
      if (store.routineOf(id)) { delAsk = true; redraw(); return; }
      closeModal();
      store.deleteTask(id);
    } else if (act === "del-cancel") { delAsk = false; redraw(); }
    else if (act === "del-scope") { closeModal(); store.deleteSeries(id, el.dataset.scope); }
    else if (act === "rep-open") { startRep(store.get("tasks", id), store.routineOf(id)); redraw(); }
    else if (act === "rep-apply") {
      const sheet = modalSheet();
      readRep(sheet);
      const days = rep.days.slice();
      if (!days.some((v) => v > 0)) { sheet.querySelector("[data-r-day]")?.focus(); return; }
      const until = rep.until, rule = store.routineOf(id);
      rep = null;
      if (rule) store.replanSeries(id, days, until);
      else editing = store.repeatTask(id, days, until);
      redraw();
    }
  });

  // 选重复方式：按任务的分钟数把七天填好；「Pick days」先只勾这一天，自己再加
  on(document, "change", ".task-editor [data-r=pattern]", (e, el) => {
    const t = store.get("tasks", editing);
    if (!t) return;
    if (!rep) startRep(t, store.routineOf(editing));
    rep.pattern = el.value;
    if (el.value === "custom") { if (!rep.days.some((v) => v > 0)) rep.days = R.daysFor("weekly", t.date, t.est); }
    else if (el.value) rep.days = R.daysFor(el.value, t.date, Number(rep.days.find((v) => v > 0)) || t.est);
    else if (!store.routineOf(editing)) rep = null;
    redraw();
  });
  on(document, "input", ".task-editor [data-r-day]", () => { const sheet = modalSheet(); readRep(sheet); paintPreview(sheet); });
  on(document, "change", ".task-editor [data-r=len]", (e, el) => {
    rep.len = el.value;
    if (el.value !== "until") rep.until = R.endFor(store.get("tasks", editing).date, Number(el.value));
    const sheet = modalSheet();
    sheet.querySelector("[data-r=until]").value = rep.until;
    paintPreview(sheet);
  });
  on(document, "change", ".task-editor [data-r=until]", (e, el) => {
    const t = store.get("tasks", editing);
    rep.until = R.clampEnd(t.date, el.value);
    rep.len = "until";
    const sheet = modalSheet();
    el.value = rep.until;
    sheet.querySelector("[data-r=len]").value = "until";
    paintPreview(sheet);
  });
}

// 数据变了（比如另一台设备同步过来），弹窗开着的话重画一下，正在打字的框不动
export function refreshEditor() {
  const sheet = modalSheet();
  if (!editing || !sheet?.querySelector(".task-editor")) return;
  const t = store.get("tasks", editing);
  if (!t) return closeModal();
  if (sheet.contains(document.activeElement) && document.activeElement.matches("input[type=text],input:not([type]),input[type=number],input[type=date],textarea")) return;
  if (rep) readRep(sheet);
  redraw();
}
