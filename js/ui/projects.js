// 项目页：按「项目」分区（项目 = 计划的 group），每区汇总进度和今天要做多少；
// 区里每个计划一张卡。计划两种（Kind）× 两种放法（Place），建的时候自由选：
//   Total（总时长 + 截止日）：健康度、进度、今天要做多少、时间轴、模块进度、估时校准建议
//   Regular（规律）：怎么重复、这周做了几次
//   Auto = 自动排到每天；Pool = 进任务池，自己拖到哪天
// 点开是编辑框：属于哪个项目、名字、种类、放法、颜色，Total 填 Deadline 和条目，Regular 填星期几 / 每周几次。

import * as store from "../store.js";
import * as E from "../engine.js";
import * as R from "../routines.js";
import { esc, on, icon } from "../dom.js";
import { addDays, diffDays, fmtShort, fmtMin, WEEKDAYS } from "../dates.js";
import { healthPill, groupsOf } from "./common.js";
import { openModal, closeModal, modalSheet } from "./modal.js";

const GROUPS = ["Work 1", "Work 2", "Main - English", "Main - French", "Main - Fitness", "Fun"];
let editing = "";
let draft = null;      // 新建时还没存的：{kind, place, 各个框的值}
let showClosed = false;
let renaming = null;   // 正在改名的项目（group 名字）

function timeline(c, p, plan) {
  if (!p.deadline) return "";
  const start = E.projectStart(c, p);
  const span = Math.max(1, diffDays(start, p.deadline));
  const at = (d) => Math.min(100, Math.max(0, (diffDays(start, d) / span) * 100)).toFixed(1) + "%";
  const finish = addDays(p.deadline, -E.earlyDays(p));
  return '<div class="axis"><i class="track"></i><i class="done" style="width:' + at(c.today) + '"></i>' +
    (E.earlyDays(p) ? '<i class="buffer" style="left:' + at(finish) + ";right:0" + '"></i>' : "") +
    '<b class="mark now" style="left:' + at(c.today) + '" title="Today"></b>' +
    '<b class="mark goal" style="left:' + at(finish) + '" title="Aim: ' + fmtShort(finish) + '"></b>' +
    '<span class="lab l">' + fmtShort(start) + '</span><span class="lab r">' + fmtShort(p.deadline) + "</span></div>";
}

const placeTag = (p) => '<span class="ptag">' + (E.isAuto(p) ? "Auto" : "Pool") + "</span>";

function regularCardHTML(c, p) {
  const r = R.ruleOf(p);
  const w = E.regularWeek(c, p);
  const today = E.isAuto(p) ? R.dueOn(r, c.today) : 0;
  const sub = [R.describe(r, store.prefs().weekStartsOn, p.place), r.end ? "until " + fmtShort(r.end) : "", today ? "today " + fmtMin(today) : ""].filter(Boolean).join(" · ");
  return '<article class="pcard regular" data-project="' + p.id + '" style="--pc:' + esc(p.color) + '">' +
    '<header><button type="button" class="pname" data-act="edit-project"><i></i>' + esc(p.name || "Untitled") + "</button>" + placeTag(p) + "</header>" +
    '<p class="psub">↻ ' + esc(sub) + "</p>" +
    (w.target ? '<div class="pweek" title="This week">' + Array.from({ length: w.target }, (_, k) => '<i class="' + (k < w.done ? "d" : k < w.placed ? "s" : "") + '"></i>').join("") +
      '<span class="num">' + w.done + "/" + w.target + " this week</span></div>" : "") + "</article>";
}

function cardHTML(c, p) {
  if (E.isRegular(p)) return regularCardHTML(c, p);
  const h = E.health(c, p);
  const plan = h.plan;
  const pct = plan.total ? Math.round((plan.done / plan.total) * 100) : 0;
  const w = (v) => (plan.total ? ((v / plan.total) * 100).toFixed(1) : 0) + "%";
  const today = Math.round(E.needOn(c, p, c.today));
  const mods = E.modulesOf(c, p).map((m) => {
    const items = E.itemsOf(c, p.id).filter((i) => (i.module || "") === m);
    const done = items.filter((i) => E.itemState(c, i).done).length;
    return '<span class="mod">' + esc(m || "Items") + " <b>" + done + "/" + items.length + "</b></span>";
  }).join("");
  const tips = E.modulesOf(c, p).map((m) => E.moduleStats(c, p, m)).filter((s) => s.suggest).map((s) =>
    '<div class="calib"><p><b>' + esc(s.module || "Items") + ":</b> you take about " + s.ratio.toFixed(1) + "× the estimate (" + s.samples.length + " done). " +
    "Update the " + s.open.length + " unstarted to match? " + fmtMin(s.oldRemaining) + " → " + fmtMin(s.newRemaining) + "</p>" +
    '<div><button type="button" class="btn primary" data-act="calib-apply" data-module="' + esc(s.module) + '">Update</button><button type="button" class="btn" data-act="calib-keep" data-module="' + esc(s.module) + '">Keep plan</button></div></div>').join("");
  const sub = [p.deadline ? "due " + fmtShort(p.deadline) : "no deadline", E.earlyDays(p) && p.deadline ? "aim " + E.earlyDays(p) + "d early" : ""].filter(Boolean).join(" · ");
  return '<article class="pcard" data-project="' + p.id + '" style="--pc:' + esc(p.color) + '">' +
    '<header><button type="button" class="pname" data-act="edit-project"><i></i>' + esc(p.name || "Untitled") + "</button>" + placeTag(p) + healthPill(h) + "</header>" +
    '<p class="psub">' + esc(sub) + "</p>" +
    '<div class="pbar" title="Done · on the calendar · not placed yet"><i class="d" style="width:' + w(plan.done) + '"></i><i class="s" style="width:' + w(plan.scheduled) + '"></i></div>' +
    '<p class="pnums num">' + pct + "% · " + fmtMin(plan.remaining) + " left" + (plan.unscheduled > 0.5 && !E.isAuto(p) ? " · " + fmtMin(plan.unscheduled) + " in pool" : "") + (today ? " · <b>today " + fmtMin(today) + "</b>" : "") + "</p>" +
    timeline(c, p, plan) +
    (mods ? '<div class="mods">' + mods + "</div>" : "") + tips + "</article>";
}

const WORST = ["danger", "tight", "safe", "waiting", "open", "empty", "done", "dropped"];

// 一个项目（一组子项目）的汇总：进度、今天要做多少、最差的那个健康度
function groupHead(c, name, subs) {
  let total = 0, done = 0, today = 0, worst = "done", deadline = "";
  for (const p of subs.filter((x) => !E.isRegular(x))) {
    const h = E.health(c, p);
    total += h.plan.total; done += h.plan.done;
    today += E.needOn(c, p, c.today);
    if (WORST.indexOf(h.level) < WORST.indexOf(worst)) worst = h.level;
    if (p.deadline && p.deadline > deadline) deadline = p.deadline;
  }
  const pct = total ? Math.round((done / total) * 100) : 0;
  const title = renaming === name
    ? '<input class="rename" data-rename="' + esc(name) + '" data-keep="rename-group" value="' + esc(name) + '" aria-label="Project name">'
    : "<h3>" + esc(name || "No project") + "</h3>";
  const meta = [subs.length + " plan" + (subs.length > 1 ? "s" : ""), total ? pct + "% done" : "", deadline ? "until " + fmtShort(deadline) : "", today >= 0.5 ? "today " + fmtMin(today) : ""].filter(Boolean).join(" · ");
  return '<header class="pg-top">' + title + '<span class="pg-meta">' + esc(meta) + "</span>" +
    (name && subs.some((x) => !E.isRegular(x)) ? '<span class="health h-' + worst + ' dot-only" title="Most at risk: ' + worst + '">●</span>' : "") +
    '<span class="pg-actions">' + (name && renaming !== name ? '<button type="button" class="btn ghosty" data-act="rename-group">Rename</button>' : "") +
    '<button type="button" class="btn" data-act="new-sub">' + icon("plus") + " Plan</button></span></header>" +
    (total ? '<div class="gbar"><i style="width:' + pct + '%"></i></div>' : "");
}

export function projectsHTML(c) {
  const open = c.projects.filter(E.isActive);
  const closed = c.projects.filter((p) => !E.isActive(p));
  const groups = groupsOf(open);
  return '<div class="projects"><header class="page-head"><div><h2>Projects</h2></div>' +
    '<div class="tools"><button type="button" class="btn cta" data-act="new-project">' + icon("plus") + " New plan</button></div></header>" +
    (groups.length ? groups.map((g) => '<section class="pgroup" data-group="' + esc(g.name) + '">' + groupHead(c, g.name, g.subs) +
      '<div class="pgrid">' + g.subs.map((p) => cardHTML(c, p)).join("") + "</div></section>").join("")
      : '<div class="empty big"><p>No plans yet.</p><p>A project is a big goal — French, Work 1, Fitness. Under it go plans: a <b>Total</b> (so many hours by a deadline) or a <b>Regular</b> one (every Monday, three times a week). Each can be placed on your days automatically, or wait in the pool for you to drag.</p><button type="button" class="btn cta" data-act="new-project">Make the first one</button></div>') +
    (closed.length ? '<button type="button" class="link" data-act="toggle-closed">' + (showClosed ? "Hide" : "Show") + " " + closed.length + " closed</button>" +
      (showClosed ? '<div class="pgrid closed">' + closed.map((p) => cardHTML(c, p)).join("") + "</div>" : "") : "") + "</div>";
}

// ---------- 编辑框 ----------

const weekOrder = () => (store.prefs().weekStartsOn === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]);
const HINT = {
  "total auto": "Today's share shows up on its own each day. Time you miss spreads over the days left.",
  "total pool": "Its items wait in the pool. Drag them onto days.",
  "regular auto": "Shows up by itself on the days below.",
  "regular pool": "Waits in the pool each week. Drag it to whichever days suit you."
};

function seg(name, value, options, locked = false) {
  return '<span class="seg">' + options.map(([v, l]) => '<button type="button" data-act="' + name + '" data-v="' + v + '"' +
    (value === v ? ' class="on"' : "") + (locked && value !== v ? " disabled" : "") + ">" + l + "</button>").join("") + "</span>";
}

function regularFields(p) {
  const r = R.ruleOf(p);
  const days = E.isAuto(p)
    ? '<div class="field"><span>Minutes on each day — empty = not that day</span><div class="weekly">' + weekOrder().map((d) =>
      "<label><b>" + WEEKDAYS[d] + '</b><input class="num" type="number" min="0" step="5" data-rday="' + d + '" value="' + (Number(r.days[d]) > 0 ? Number(r.days[d]) : "") + '"></label>').join("") + "</div></div>"
    : '<div class="field-row"><label class="field"><span>Times a week</span><input class="num" type="number" min="1" max="21" data-rf="perWeek" value="' + esc(r.perWeek || 3) + '"></label>' +
      '<label class="field"><span>Minutes each</span><input class="num" type="number" min="5" step="5" data-rf="min" value="' + esc(r.min || 30) + '"></label></div>';
  return days + '<div class="field-row"><label class="field"><span>Starts</span><input type="date" data-rf="start" value="' + esc(r.start || "") + '"></label>' +
    '<label class="field"><span>Ends (empty = keeps going)</span><input type="date" data-rf="end" value="' + esc(r.end || "") + '"></label></div>';
}

function totalFields(p, isNew) {
  const early = E.earlyDays(p);
  return '<div class="field-row three"><label class="field"><span>Deadline</span><input type="date" data-pf="deadline" value="' + esc(p.deadline || "") + '"></label>' +
    '<label class="field"><span>Finish early (days)</span><input type="number" class="num" min="0" max="60" data-pf="early" value="' + early + '"></label>' +
    '<label class="field"><span>Start (optional)</span><input type="date" data-pf="start" value="' + esc(p.start || "") + '"></label></div>' +
    (isNew ? '<label class="field small"><span>Total hours (or add items after)</span><input type="number" class="num" min="0" step="0.5" data-pf="total" value="' + esc(p.total || "") + '"></label>' : "") +
    (p.deadline ? '<p class="hint">Aim to be done by <b>' + fmtShort(addDays(p.deadline, -early)) + "</b>; the days after that are your buffer.</p>"
      : '<p class="hint">' + (E.isAuto(p) ? "Add a deadline so its time can be spread over your days." : "Without a deadline it still collects time, but it won't add to your daily line.") + "</p>");
}

function editorHTML(p) {
  const c = store.ctx();
  const isNew = !p.id;
  const groups = [...new Set([...GROUPS, ...c.projects.map((x) => x.group).filter(Boolean)])];
  const kind = E.isRegular(p) ? "regular" : "total", place = E.isAuto(p) ? "auto" : "pool";
  let h = '<div class="project-editor" data-pid="' + (p.id || "") + '"><h2 class="sheet-title">' + (isNew ? "New plan" : "Edit plan") + "</h2>" +
    '<div class="field-row"><label class="field"><span>Project</span><input data-pf="group" list="groups" value="' + esc(p.group || "") + '" placeholder="Main - French, Work 1…"><datalist id="groups">' + groups.map((g) => '<option value="' + esc(g) + '">').join("") + "</datalist></label>" +
    '<label class="field"><span>Plan</span><input data-pf="name" value="' + esc(p.name || "") + '" placeholder="B2 exam, Gym, Q4 report…"></label></div>' +
    '<div class="field-row"><div class="field"><span>Kind</span>' + seg("pkind", kind, [["total", "Total"], ["regular", "Regular"]], !isNew) + "</div>" +
    '<div class="field"><span>Place</span>' + seg("pplace", place, [["auto", "Auto"], ["pool", "Pool"]]) + "</div></div>" +
    '<p class="hint">' + HINT[kind + " " + place] + "</p>" +
    '<div class="field"><span>Color</span><div class="swatches">' + store.PROJECT_COLORS.map((col) => '<label><input type="radio" name="pcolor" data-pf="color" value="' + col + '"' + (p.color === col ? " checked" : "") + '><i style="background:' + col + '"></i></label>').join("") + "</div></div>" +
    (kind === "regular" ? regularFields(p) : totalFields(p, isNew));
  if (isNew) {
    return h + '<div class="sheet-foot"><span></span><button type="button" class="btn cta" data-act="create-project">Create</button></div></div>';
  }
  h += '<div class="field"><span>Status</span><div class="seg">' + [["active", "Active"], ["done", "Done"], ["dropped", "Dropped"]].map(([v, l]) => '<button type="button" data-act="pstatus" data-v="' + v + '"' + ((p.status || "active") === v ? ' class="on"' : "") + ">" + l + "</button>").join("") + "</div></div>";
  if (kind === "total") h += itemsHTML(c, p);
  h += '<div class="sheet-foot"><button type="button" class="btn danger" data-act="del-project">' + icon("trash") + ' Delete plan</button><button type="button" class="btn primary" data-modal-close>Done</button></div></div>';
  return h;
}

// 条目（Total 计划的分块）
function itemsHTML(c, p) {
  const items = E.itemsOf(c, p.id);
  const mods = E.modulesOf(c, p);
  let h = '<h3 class="sub">Items <small>' + items.length + " · " + fmtMin(items.reduce((a, i) => a + (Number(i.est) || 0), 0)) + "</small></h3>";
  if (!items.length) h += '<p class="hint">Items are the pieces of work: chapters, papers, sessions. Each gets an estimate in minutes.</p>';
  mods.forEach((m) => {
    h += '<div class="imod"><div class="imod-head">' + esc(m || "Items") + "</div>";
    items.filter((i) => (i.module || "") === m).forEach((i) => {
      const st = E.itemState(c, i);
      h += '<div class="irow' + (st.done ? " done" : "") + '" data-item="' + i.id + '"><input data-if="title" value="' + esc(i.title) + '" aria-label="Item">' +
        '<input class="num" type="number" min="0" step="5" data-if="est" value="' + esc(i.est) + '" aria-label="Minutes"><span class="ist num">' + (st.progress ? fmtMin(st.progress) + " done" : st.scheduled ? "planned" : "") + "</span>" +
        '<button type="button" class="icon-btn" data-act="del-item" aria-label="Delete item">' + icon("close") + "</button></div>";
    });
    h += "</div>";
  });
  h += '<form class="iadd" autocomplete="off"><div class="field-row three"><label class="field"><span>Module</span><input name="module" list="mods" placeholder="optional"><datalist id="mods">' + mods.filter(Boolean).map((m) => '<option value="' + esc(m) + '">').join("") + "</datalist></label>" +
    '<label class="field"><span>Minutes each</span><input name="est" class="num" type="number" min="5" step="5" value="45"></label>' +
    '<label class="field"><span>Numbered</span><span class="numbered"><input name="prefix" placeholder="Unit"><input name="count" class="num" type="number" min="1" max="200" placeholder="10"><button type="button" class="btn" data-act="fill-numbered">Fill</button></span></label></div>' +
    '<label class="field"><span>Items — one per line</span><textarea name="titles" rows="3" placeholder="Chapter 1&#10;Chapter 2&#10;Past paper 2024"></textarea></label>' +
    '<button type="submit" class="btn cta">' + icon("plus") + " Add items</button></form>";
  return h;
}

// 新建时可以带上它属于哪个项目；focus 指定先让光标落在哪个框
export function openProjectEditor(id, { group = "", focus = "" } = {}) {
  editing = id || "";
  draft = id ? null : { group, kind: "total", place: "pool", early: 2, color: store.PROJECT_COLORS[store.all("projects").length % store.PROJECT_COLORS.length], rule: { start: store.today(), perWeek: 3, min: 30 } };
  const p = id ? store.get("projects", id) : draft;
  const sheet = openModal(editorHTML(p), { wide: true, close: () => { editing = ""; draft = null; } });
  if (!id) sheet.querySelector('[data-pf="' + (focus || (group ? "name" : "group")) + '"]')?.focus();
}

const readDays = (box) => {
  const days = [0, 0, 0, 0, 0, 0, 0];
  box.querySelectorAll("[data-rday]").forEach((el) => { days[Number(el.dataset.rday)] = Math.max(0, Math.round(Number(el.value) || 0)); });
  return days;
};

// 新建框里已经填了的值收进 draft（换种类 / 放法要重画时不丢）
function readDraft(box) {
  box.querySelectorAll("[data-pf]").forEach((el) => {
    if (el.type === "radio") { if (el.checked) draft.color = el.value; }
    else draft[el.dataset.pf] = el.value;
  });
  draft.rule = { ...(draft.rule || {}) };
  box.querySelectorAll("[data-rf]").forEach((el) => { draft.rule[el.dataset.rf] = el.value; });
  if (box.querySelector("[data-rday]")) draft.rule.days = readDays(box);
}

function redrawDraft() {
  const sheet = modalSheet();
  if (sheet && draft) sheet.querySelector(".project-editor").outerHTML = editorHTML(draft);
}

// force：刚点了 Create，不管光标在哪都要换成完整的编辑框（Safari 点按钮不会把光标移走）
export function refreshProjectEditor(force = false) {
  const sheet = modalSheet();
  if (!editing || !sheet?.querySelector(".project-editor")) return;
  const p = store.get("projects", editing);
  if (!p) return closeModal();
  const a = document.activeElement;
  if (!force && sheet.contains(a) && a.matches("input:not([type]),input[type=text],input[type=number],textarea")) return;
  const scroll = sheet.scrollTop;
  sheet.querySelector(".project-editor").outerHTML = editorHTML(p);
  sheet.scrollTop = scroll;
}

// 新建：规律计划（Auto）至少要有一天有分钟数
function createPlan(box) {
  readDraft(box);
  const name = String(draft.name || "").trim();
  if (!name) { box.querySelector('[data-pf="name"]').focus(); return; }
  const regular = draft.kind === "regular", r = draft.rule || {};
  const start = r.start || store.today(), end = R.clampEnd(start, r.end || "");
  const rule = !regular ? null : draft.place === "auto"
    ? { days: r.days || [0, 0, 0, 0, 0, 0, 0], start, end }
    : { perWeek: Math.max(1, Number(r.perWeek) || 1), min: Math.max(5, Number(r.min) || 30), start, end };
  if (regular && draft.place === "auto" && !rule.days.some((v) => v > 0)) { box.querySelector("[data-rday]")?.focus(); return; }
  editing = store.saveProject({
    name, group: String(draft.group || "").trim(), color: draft.color, kind: draft.kind, place: draft.place, rule,
    ...(regular ? {} : { deadline: draft.deadline || "", start: draft.start || "", early: Math.max(0, Math.min(60, Number(draft.early) || 0)), total: Math.round((Number(draft.total) || 0) * 60) })
  });
  draft = null;
  refreshProjectEditor(true);
}

export function initProjects(rerender) {
  on(document, "click", ".projects [data-act], .project-editor [data-act]", (e, el) => {
    const act = el.dataset.act;
    const pid = el.closest("[data-project]")?.dataset.project || el.closest("[data-pid]")?.dataset.pid;
    const group = el.closest("[data-group]")?.dataset.group ?? "";
    if (act === "new-project") openProjectEditor("", { focus: "group" });
    else if (act === "new-sub") openProjectEditor("", { group });
    else if (act === "rename-group") {
      renaming = group;
      rerender();
      requestAnimationFrame(() => { const i = document.querySelector("[data-rename]"); i?.focus(); i?.select(); });
    }
    else if (act === "edit-project") openProjectEditor(pid);
    else if ((act === "pkind" || act === "pplace") && !pid) {
      readDraft(el.closest(".project-editor"));
      draft[act === "pkind" ? "kind" : "place"] = el.dataset.v;
      redrawDraft();
    } else if (act === "pplace") store.saveProject({ id: pid, place: el.dataset.v });
    else if (act === "toggle-closed") { showClosed = !showClosed; rerender(); }
    else if (act === "calib-apply") store.applyCalibration(pid, el.dataset.module);
    else if (act === "calib-keep") store.keepPlan(pid, el.dataset.module);
    else if (act === "create-project") {
      if (!editing) createPlan(el.closest(".project-editor"));   // editing 有值 = 已经建过了，别再建一个
    } else if (act === "pstatus") store.saveProject({ id: pid, status: el.dataset.v });
    else if (act === "del-item") store.deleteItem(el.closest("[data-item]").dataset.item);
    else if (act === "del-project") {
      if (!confirm("Delete this plan and its items? Tasks you've done stay on the calendar.")) return;
      closeModal();
      store.deleteProject(pid);
    } else if (act === "fill-numbered") {
      const form = el.closest("form");
      const prefix = form.prefix.value.trim() || "Part";
      const n = Math.min(200, Number(form.count.value) || 0);
      if (n) form.titles.value = Array.from({ length: n }, (_, i) => prefix + " " + (i + 1)).join("\n");
    }
  });

  const saveRename = (input) => {
    if (renaming === null || renaming !== input.dataset.rename) return;
    const from = renaming;
    renaming = null;
    if (input.value.trim() && input.value.trim() !== from) store.renameGroup(from, input.value);
    else rerender();
  };
  on(document, "keydown", "[data-rename]", (e, input) => {
    if (e.key === "Enter") saveRename(input);
    if (e.key === "Escape") { renaming = null; rerender(); }
  });
  on(document, "focusout", "[data-rename]", (e, input) => saveRename(input));

  // 已有计划：字段改了就存
  on(document, "change", ".project-editor [data-pf]", (e, el) => {
    const pid = el.closest("[data-pid]").dataset.pid;
    if (!pid || el.dataset.pf === "total") return;
    const f = el.dataset.pf;
    let v = el.value;
    if (f === "early") v = Math.max(0, Math.min(60, Number(v) || 0));
    if (f === "name" && !v.trim()) return;
    store.saveProject({ id: pid, [f]: v });
    refreshProjectEditor();
  });

  // 规律计划的规则：星期几的分钟数、每周几次、每次几分钟、开始 / 结束
  on(document, "change", ".project-editor [data-rf], .project-editor [data-rday]", (e, el) => {
    const pid = el.closest("[data-pid]").dataset.pid;
    const p = pid && store.get("projects", pid);
    if (!p) return;
    const rule = { ...(p.rule || {}) };
    if (el.dataset.rday !== undefined) rule.days = readDays(el.closest(".project-editor"));
    else {
      const f = el.dataset.rf;
      rule[f] = f === "perWeek" ? Math.max(1, Number(el.value) || 1) : f === "min" ? Math.max(5, Number(el.value) || 5) : el.value;
      rule.end = R.clampEnd(rule.start || store.today(), rule.end || "");
    }
    store.saveProject({ id: pid, rule });
    refreshProjectEditor();
  });

  on(document, "change", ".project-editor [data-if]", (e, el) => {
    const f = el.dataset.if;
    let v = el.value;
    if (f === "est") v = Math.max(0, Number(v) || 0);
    if (f === "title" && !v.trim()) return;
    store.updateItem(el.closest("[data-item]").dataset.item, { [f]: v });
  });

  on(document, "submit", ".project-editor .iadd", (e, form) => {
    e.preventDefault();
    const pid = form.closest("[data-pid]").dataset.pid;
    const titles = form.titles.value.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!pid || !titles.length) return;
    store.addItems(pid, form.module.value.trim(), titles, Number(form.est.value) || 45);
    form.titles.value = "";
    refreshProjectEditor();
  });
}
