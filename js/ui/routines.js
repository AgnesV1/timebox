// 重复任务页（电脑）：每条规则一张卡，看得到一周七天各做多少分钟；
// 点开编辑：名字、分类、挂在哪个子项目下、可选、周一到周日的分钟数、开始和结束日期。
// 编辑框有「Save」按钮（不是改一个字存一次），因为每次保存都会改日历上未来的那几次。

import * as store from "../store.js";
import * as R from "../routines.js";
import { esc, on, icon } from "../dom.js";
import { fmtMin, fmtShort, WEEKDAYS } from "../dates.js";
import { CATS, projectOptions, fullName } from "./common.js";
import { openModal, closeModal } from "./modal.js";

const weekOrder = () => (store.prefs().weekStartsOn === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]);
const colorOfRoutine = (r) => (CATS.includes(r.category) ? "var(--c-" + r.category + ")" : store.get("projects", r.projectId)?.color || "var(--c-None)");

function cardHTML(r) {
  const p = r.projectId ? store.get("projects", r.projectId) : null;
  const days = r.days || [];
  const max = Math.max(1, ...days.map((v) => Number(v) || 0));
  const when = [r.start && r.start > store.today() ? "from " + fmtShort(r.start) : "", r.end ? "until " + fmtShort(r.end) : ""].filter(Boolean).join(" · ");
  return '<article class="rcard" data-routine="' + r.id + '" style="--rc:' + colorOfRoutine(r) + '">' +
    '<header><button type="button" class="rname" data-act="edit-routine"><i></i>' + esc(r.title || "Untitled") + "</button>" +
    '<span class="rtotal num">' + fmtMin(R.weeklyMinutes(r)) + " a week</span></header>" +
    '<p class="rsub">' + esc([r.category, p ? fullName(p) : "", r.optional ? "optional" : "", when].filter(Boolean).join(" · ") || "No category") + "</p>" +
    '<div class="rweek">' + weekOrder().map((d) => {
      const v = Number(days[d]) || 0;
      return '<div class="rday' + (v ? "" : " off") + '"><span class="rbar"><i style="height:' + ((v / max) * 100).toFixed(0) + '%"></i></span><b class="num">' + (v || "·") + "</b><em>" + WEEKDAYS[d].slice(0, 2) + "</em></div>";
    }).join("") + "</div></article>";
}

export function routinesHTML() {
  const list = store.routines();
  return '<div class="routines"><header class="page-head"><div><p class="eyebrow">Routines</p><h2>Things you repeat</h2></div>' +
    '<div class="tools"><button type="button" class="btn cta" data-act="new-routine">' + icon("plus") + " New routine</button></div></header>" +
    (list.length ? '<div class="rgrid">' + list.map(cardHTML).join("") + "</div>" +
      '<p class="hint page-hint">Routines fill the calendar two weeks ahead. Change a routine and the days that haven\'t started follow; days you already did stay as they were. Missed routine days don\'t pile up as “left behind”.</p>'
      : '<div class="empty big"><p>No routines yet.</p><p>A routine is something you do every week — the gym, vocab, a weekly review. Set how many minutes on each weekday (more on some days, less or none on others) and it appears on your calendar and phone by itself.</p><button type="button" class="btn cta" data-act="new-routine">Make the first one</button></div>') +
    "</div>";
}

// ---------- 编辑框 ----------

let editing = "";

function editorHTML(r) {
  const c = store.ctx();
  const days = r.days || [0, 0, 0, 0, 0, 0, 0];
  return '<form class="routine-editor" autocomplete="off"><h2 class="sheet-title">' + (r.id ? "Edit routine" : "New routine") + "</h2>" +
    '<label class="field"><span>What</span><input name="title" value="' + esc(r.title || "") + '" placeholder="Gym, French vocab, Weekly review…" required></label>' +
    '<div class="field"><span>Minutes on each day — leave empty for days off</span><div class="weekly">' +
    weekOrder().map((d) => "<label><b>" + WEEKDAYS[d] + '</b><input name="d' + d + '" class="num" type="number" min="0" step="5" value="' + (Number(days[d]) > 0 ? Number(days[d]) : "") + '"></label>').join("") +
    '</div><div class="fill-row"><input name="every" class="num" type="number" min="0" step="5" placeholder="30" aria-label="Minutes for every day"><button type="button" class="btn" data-act="fill-all">Same every day</button><button type="button" class="btn" data-act="fill-weekdays">Weekdays only</button></div></div>' +
    '<div class="field"><span>Category</span><div class="cats">' +
    ["", ...CATS].map((k) => '<label class="cat"><input type="radio" name="category" value="' + k + '"' + ((r.category || "") === k ? " checked" : "") + '><i style="--c:' + (k ? "var(--c-" + k + ")" : "var(--c-None)") + '"></i>' + (k || "None") + "</label>").join("") +
    "</div></div>" +
    '<label class="field"><span>Sub-project (optional — time counts toward it)</span><select name="projectId">' + projectOptions(c.projects.filter((p) => p.status !== "done" && p.status !== "dropped" || p.id === r.projectId), r.projectId || "") + "</select></label>" +
    '<div class="field-row"><label class="field"><span>Starts</span><input type="date" name="start" value="' + esc(r.start || store.today()) + '"></label>' +
    '<label class="field"><span>Ends (optional)</span><input type="date" name="end" value="' + esc(r.end || "") + '"></label></div>' +
    '<label class="check"><input type="checkbox" name="optional"' + (r.optional ? " checked" : "") + "> Optional — nice to do, not a must</label>" +
    '<div class="sheet-foot">' + (r.id ? '<button type="button" class="btn danger" data-act="del-routine">' + icon("trash") + " Delete routine</button>" : "<span></span>") +
    '<button type="submit" class="btn cta">Save</button></div></form>';
}

export function openRoutineEditor(id) {
  editing = id || "";
  const r = id ? store.routines().find((x) => x.id === id) : {};
  const sheet = openModal(editorHTML(r || {}), { wide: true, close: () => { editing = ""; } });
  if (!id) sheet.querySelector("[name=title]")?.focus();
}

export function initRoutines() {
  on(document, "click", ".routines [data-act]", (e, el) => {
    if (el.dataset.act === "new-routine") openRoutineEditor("");
    else if (el.dataset.act === "edit-routine") openRoutineEditor(el.closest("[data-routine]").dataset.routine);
  });
  on(document, "click", ".routine-editor [data-act]", (e, el) => {
    const f = el.closest("form").elements;   // 用 elements 取，form.title 会拿到表单自己的 title 属性
    if (el.dataset.act === "fill-all" || el.dataset.act === "fill-weekdays") {
      const v = f.every.value || "30";
      for (let d = 0; d < 7; d++) f["d" + d].value = el.dataset.act === "fill-all" || (d > 0 && d < 6) ? v : "";
    } else if (el.dataset.act === "del-routine") {
      if (!confirm("Delete this routine? Days you already did stay on the calendar; the ones ahead are removed.")) return;
      const id = editing;
      closeModal();
      store.deleteRoutine(id);
    }
  });
  on(document, "submit", ".routine-editor", (e, form) => {
    e.preventDefault();
    const f = form.elements;
    const title = f.title.value.trim();
    if (!title) return f.title.focus();
    const days = Array.from({ length: 7 }, (_, d) => Math.max(0, Math.round(Number(f["d" + d].value) || 0)));
    if (!days.some((v) => v > 0)) { f.d1.focus(); f.d1.placeholder = "min"; return; }
    store.saveRoutine({
      ...(editing ? { id: editing } : {}),
      title, days,
      category: f.category.value || "",
      projectId: f.projectId.value || "",
      start: f.start.value || store.today(),
      end: f.end.value && f.end.value >= (f.start.value || "") ? f.end.value : "",
      optional: f.optional.checked
    });
    closeModal();
  });
}
