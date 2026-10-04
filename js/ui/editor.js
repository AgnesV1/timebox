// 改一个任务：名字、日期、分钟、分类、项目、可选、说明、删除。改了就存，没有「保存」按钮。

import * as store from "../store.js";
import * as E from "../engine.js";
import { esc, on, icon } from "../dom.js";
import { fmtMin } from "../dates.js";
import { CATS } from "./common.js";
import { openModal, closeModal, modalSheet } from "./modal.js";

let editing = "";

function editorHTML(t) {
  const c = store.ctx();
  const projects = c.projects.filter((p) => E.isActive(p) || p.id === t.projectId);
  const item = t.itemId ? store.get("items", t.itemId) : null;
  const st = item ? E.itemState(c, item) : null;
  return '<div class="task-editor" data-task="' + t.id + '"><h2 class="sheet-title">Edit task</h2>' +
    '<label class="field"><span>Task</span><input data-f="title" value="' + esc(t.title) + '"></label>' +
    '<div class="field-row"><label class="field"><span>Date</span><input type="date" data-f="date" value="' + esc(t.date) + '"></label>' +
    '<label class="field"><span>Minutes</span><input type="number" class="num" min="0" step="5" data-f="est" value="' + esc(t.est) + '"></label></div>' +
    '<div class="field"><span>Category</span><div class="cats">' +
    ["", ...CATS].map((k) => '<label class="cat"><input type="radio" name="ecat" data-f="category" value="' + k + '"' + ((t.category || "") === k ? " checked" : "") + '><i style="--c:' + (k ? "var(--c-" + k + ")" : "var(--c-None)") + '"></i>' + (k || "None") + "</label>").join("") +
    "</div></div>" +
    '<label class="field"><span>Project</span><select data-f="projectId"><option value="">No project</option>' +
    projects.map((p) => '<option value="' + p.id + '"' + (p.id === t.projectId ? " selected" : "") + ">" + esc(p.name) + "</option>").join("") + "</select></label>" +
    (item ? '<p class="hint">Part of <b>' + esc(item.title) + "</b> · " + fmtMin(st.progress) + " of " + fmtMin(st.est) + " done</p>" : "") +
    '<label class="check"><input type="checkbox" data-f="optional"' + (t.optional ? " checked" : "") + "> Optional — nice to do, not a must</label>" +
    '<label class="field"><span>Details</span><textarea data-f="desc" rows="4" placeholder="Steps, links, anything">' + esc(t.desc || "") + "</textarea></label>" +
    '<div class="sheet-foot"><button type="button" class="btn danger" data-act="del">' + icon("trash") + " Delete</button>" +
    '<button type="button" class="btn primary" data-modal-close>Done</button></div></div>';
}

export function openTaskEditor(id) {
  const t = store.get("tasks", id);
  if (!t) return;
  editing = id;
  openModal(editorHTML(t), { close: () => { editing = ""; } });
}

export function initEditor() {
  const save = (el) => {
    const f = el.dataset.f;
    if (!editing) return;
    if (f === "projectId") return store.setTaskProject(editing, el.value);
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (f === "est") v = Math.max(0, Number(v) || 0);
    if (f === "title" && !String(v).trim()) return;
    if (f === "date" && !v) return;
    store.updateTask(editing, { [f]: v }, null, { quiet: f === "desc" || f === "title" });
  };
  on(document, "input", ".task-editor [data-f=desc], .task-editor [data-f=title]", (e, el) => save(el));
  on(document, "change", ".task-editor [data-f]", (e, el) => {
    save(el);
    if (el.dataset.f === "title") store.updateTask(editing, {});   // 名字改完离开时整页刷新一次
  });
  on(document, "click", ".task-editor [data-act=del]", () => {
    const id = editing;
    closeModal();
    store.deleteTask(id);
  });
}

// 数据变了（比如另一台设备同步过来），弹窗开着的话重画一下，正在打字的框不动
export function refreshEditor() {
  const sheet = modalSheet();
  if (!editing || !sheet?.querySelector(".task-editor")) return;
  const t = store.get("tasks", editing);
  if (!t) return closeModal();
  if (sheet.contains(document.activeElement) && document.activeElement.matches("input[type=text],input:not([type]),textarea")) return;
  const scroll = sheet.scrollTop;
  sheet.querySelector(".task-editor").outerHTML = editorHTML(t);
  sheet.scrollTop = scroll;
}
