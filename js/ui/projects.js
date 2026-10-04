// 项目页：按「项目」分区（项目 = 子项目的 group），每区汇总进度和今天要做多少；
// 区里每个子项目一张卡（健康度、进度、今天要做多少、时间轴、模块进度、估时校准建议），
// 点开是编辑框：属于哪个项目、名字、颜色、Deadline、提前几天完成、条目（任务池里的东西）。

import * as store from "../store.js";
import * as E from "../engine.js";
import { esc, on, icon } from "../dom.js";
import { addDays, diffDays, fmtShort, fmtMin } from "../dates.js";
import { healthPill, groupsOf } from "./common.js";
import { openModal, closeModal, modalSheet } from "./modal.js";

const GROUPS = ["Work 1", "Work 2", "Main - English", "Main - French", "Main - Fitness", "Fun"];
let editing = "";
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

function cardHTML(c, p) {
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
    '<header><button type="button" class="pname" data-act="edit-project"><i></i>' + esc(p.name || "Untitled") + "</button>" + healthPill(h) + "</header>" +
    '<p class="psub">' + esc(sub) + "</p>" +
    '<div class="pbar" title="Done · on the calendar · not placed yet"><i class="d" style="width:' + w(plan.done) + '"></i><i class="s" style="width:' + w(plan.scheduled) + '"></i></div>' +
    '<p class="pnums num">' + pct + "% · " + fmtMin(plan.remaining) + " left" + (plan.unscheduled > 0.5 ? " · " + fmtMin(plan.unscheduled) + " in pool" : "") + (today ? " · <b>today " + fmtMin(today) + "</b>" : "") + "</p>" +
    timeline(c, p, plan) +
    (mods ? '<div class="mods">' + mods + "</div>" : "") + tips +
    '<footer><button type="button" class="btn" data-act="edit-project">' + icon("edit") + " Edit</button></footer></article>";
}

const WORST = ["danger", "tight", "safe", "waiting", "open", "empty", "done", "dropped"];

// 一个项目（一组子项目）的汇总：进度、今天要做多少、最差的那个健康度
function groupHead(c, name, subs) {
  let total = 0, done = 0, today = 0, worst = "done", deadline = "";
  for (const p of subs) {
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
  const meta = [subs.length + " sub-project" + (subs.length > 1 ? "s" : ""), total ? pct + "% done" : "", deadline ? "until " + fmtShort(deadline) : "", today >= 0.5 ? "today " + fmtMin(today) : ""].filter(Boolean).join(" · ");
  return '<header class="pg-top">' + title + '<span class="pg-meta">' + esc(meta) + "</span>" +
    (name ? '<span class="health h-' + worst + ' dot-only" title="Most at risk: ' + worst + '">●</span>' : "") +
    '<span class="pg-actions">' + (name && renaming !== name ? '<button type="button" class="btn ghosty" data-act="rename-group">Rename</button>' : "") +
    '<button type="button" class="btn" data-act="new-sub">' + icon("plus") + " Sub-project</button></span></header>" +
    (total ? '<div class="gbar"><i style="width:' + pct + '%"></i></div>' : "");
}

export function projectsHTML(c) {
  const open = c.projects.filter(E.isActive);
  const closed = c.projects.filter((p) => !E.isActive(p));
  const groups = groupsOf(open);
  return '<div class="projects"><header class="page-head"><div><p class="eyebrow">Projects</p><h2>Plan backwards from the deadline</h2></div>' +
    '<div class="tools"><button type="button" class="btn cta" data-act="new-project">' + icon("plus") + " New project</button></div></header>" +
    (groups.length ? groups.map((g) => '<section class="pgroup" data-group="' + esc(g.name) + '">' + groupHead(c, g.name, g.subs) +
      '<div class="pgrid">' + g.subs.map((p) => cardHTML(c, p)).join("") + "</div></section>").join("")
      : '<div class="empty big"><p>No projects yet.</p><p>A project is a big goal — French, Work 1, Fitness. Under it, sub-projects are the pieces with a deadline: a module, an exam, a delivery. Give a sub-project a deadline and a list of items, and the app works out how much to do each day.</p><button type="button" class="btn cta" data-act="new-project">Make the first one</button></div>') +
    (closed.length ? '<button type="button" class="link" data-act="toggle-closed">' + (showClosed ? "Hide" : "Show") + " " + closed.length + " closed</button>" +
      (showClosed ? '<div class="pgrid closed">' + closed.map((p) => cardHTML(c, p)).join("") + "</div>" : "") : "") + "</div>";
}

// ---------- 编辑框 ----------

function editorHTML(p) {
  const c = store.ctx();
  const isNew = !p.id;
  const groups = [...new Set([...GROUPS, ...c.projects.map((x) => x.group).filter(Boolean)])];
  const early = E.earlyDays(p);
  let h = '<div class="project-editor" data-pid="' + (p.id || "") + '"><h2 class="sheet-title">' + (isNew ? "New sub-project" : "Edit sub-project") + "</h2>" +
    '<div class="field-row"><label class="field"><span>Project</span><input data-pf="group" list="groups" value="' + esc(p.group || "") + '" placeholder="Main - French, Work 1…"><datalist id="groups">' + groups.map((g) => '<option value="' + esc(g) + '">').join("") + "</datalist></label>" +
    '<label class="field"><span>Sub-project</span><input data-pf="name" value="' + esc(p.name || "") + '" placeholder="Module #4, B2 exam, Q4 report…"></label></div>' +
    '<div class="field"><span>Color</span><div class="swatches">' + store.PROJECT_COLORS.map((col) => '<label><input type="radio" name="pcolor" data-pf="color" value="' + col + '"' + (p.color === col ? " checked" : "") + '><i style="background:' + col + '"></i></label>').join("") + "</div></div>" +
    '<div class="field-row three"><label class="field"><span>Deadline</span><input type="date" data-pf="deadline" value="' + esc(p.deadline || "") + '"></label>' +
    '<label class="field"><span>Finish early (days)</span><input type="number" class="num" min="0" max="60" data-pf="early" value="' + early + '"></label>' +
    '<label class="field"><span>Start (optional)</span><input type="date" data-pf="start" value="' + esc(p.start || "") + '"></label></div>' +
    (p.deadline ? '<p class="hint">Aim to be done by <b>' + fmtShort(addDays(p.deadline, -early)) + "</b>; the days after that are your buffer.</p>" : '<p class="hint">Without a deadline the sub-project still collects time, but it won\'t add to your daily line.</p>');
  if (isNew) {
    return h + '<div class="sheet-foot"><span></span><button type="button" class="btn cta" data-act="create-project">Create</button></div></div>';
  }
  h += '<div class="field"><span>Status</span><div class="seg">' + [["active", "Active"], ["done", "Done"], ["dropped", "Dropped"]].map(([v, l]) => '<button type="button" data-act="pstatus" data-v="' + v + '"' + ((p.status || "active") === v ? ' class="on"' : "") + ">" + l + "</button>").join("") + "</div></div>";
  // 条目
  const items = E.itemsOf(c, p.id);
  const mods = E.modulesOf(c, p);
  h += '<h3 class="sub">Items <small>' + items.length + " · " + fmtMin(items.reduce((a, i) => a + (Number(i.est) || 0), 0)) + "</small></h3>";
  if (!items.length) h += '<p class="hint">Items are the pieces of work: chapters, papers, sessions. Each gets an estimate in minutes; they wait in the pool until you drag them onto a day.</p>';
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
  h += '<div class="sheet-foot"><button type="button" class="btn danger" data-act="del-project">' + icon("trash") + ' Delete sub-project</button><button type="button" class="btn primary" data-modal-close>Done</button></div></div>';
  return h;
}

// 新建时可以带上它属于哪个项目；focus 指定先让光标落在哪个框
export function openProjectEditor(id, { group = "", focus = "" } = {}) {
  editing = id || "";
  const p = id ? store.get("projects", id) : { group, early: 2, color: store.PROJECT_COLORS[store.all("projects").length % store.PROJECT_COLORS.length] };
  const sheet = openModal(editorHTML(p), { wide: true, close: () => { editing = ""; } });
  if (!id) sheet.querySelector('[data-pf="' + (focus || (group ? "name" : "group")) + '"]')?.focus();
}

// force：刚点了 Create，不管光标在哪都要换成完整的编辑框（Safari 点按钮不会把光标移走）
export function refreshProjectEditor(force = false) {
  const sheet = modalSheet();
  if (!editing || !sheet?.querySelector(".project-editor")) return;
  const p = store.get("projects", editing);
  if (!p) return closeModal();
  const a = document.activeElement;
  if (!force && sheet.contains(a) && a.matches("input:not([type]),input[type=text],textarea")) return;
  const scroll = sheet.scrollTop;
  sheet.querySelector(".project-editor").outerHTML = editorHTML(p);
  sheet.scrollTop = scroll;
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
    else if (act === "toggle-closed") { showClosed = !showClosed; rerender(); }
    else if (act === "calib-apply") store.applyCalibration(pid, el.dataset.module);
    else if (act === "calib-keep") store.keepPlan(pid, el.dataset.module);
    else if (act === "create-project") {
      const box = el.closest(".project-editor");
      const val = (f) => box.querySelector('[data-pf="' + f + '"]' + (f === "color" ? ":checked" : ""))?.value || "";
      const name = val("name").trim();
      if (!name) { box.querySelector('[data-pf="name"]').focus(); return; }
      if (editing) return;   // 已经建过了，别再建一个
      editing = store.saveProject({ name, group: val("group").trim(), color: val("color"), deadline: val("deadline"), start: val("start"), early: Number(val("early")) || 0 });
      refreshProjectEditor(true);
    } else if (act === "pstatus") store.saveProject({ id: pid, status: el.dataset.v });
    else if (act === "del-item") store.deleteItem(el.closest("[data-item]").dataset.item);
    else if (act === "del-project") {
      if (!confirm("Delete this sub-project and its items? Tasks you've done stay on the calendar.")) return;
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

  // 已有子项目：字段改了就存
  on(document, "change", ".project-editor [data-pf]", (e, el) => {
    const pid = el.closest("[data-pid]").dataset.pid;
    if (!pid) return;
    const f = el.dataset.pf;
    let v = el.value;
    if (f === "early") v = Math.max(0, Math.min(60, Number(v) || 0));
    if (f === "name" && !v.trim()) return;
    store.saveProject({ id: pid, [f]: v });
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
