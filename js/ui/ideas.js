// 灵感池（Projects 页头的 Plans | Ideas 切到 Ideas，电脑）：想去哪玩、想吃什么、想参加什么活动——没有时长，大多也没有期限。
// 顶上一格直接加（粘几行 = 几条；选着的类别、日子这几条都带上）。下面按类别分组，没归类的在最上面，每条带类别按钮（Outing / Eat）。
// 点文字就改；Plan = 放到哪天（建一条任务、挂上）；排了的划掉、写着哪天，Put back 放回池子；任务做完 = 去过了，这条就不再列出来。
// 在 Leisure / Friends 下加任务时也能挑（见 js/ui/today.js 的 pickHTML）；手机上只能随手记一条。怎么算见 js/ideas.js。

import * as store from "../store.js";
import * as I from "../ideas.js";
import * as GR from "../groups.js";
import { esc, on } from "../dom.js";
import { fmtShort, weekday, WEEKDAYS } from "../dates.js";
import { toast } from "./common.js";

let kind = "";          // 加的那一格选着的类别
let dated = false;      // 加的那一格开着日子
let by = false;
let edit = "";          // 正在改的那条
let planning = "";      // 正在挑日子的那条

const afterRender = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));
const taskOf = (id) => store.get("tasks", id);
const dayText = (d) => WEEKDAYS[weekday(d)] + " " + fmtShort(d);
const chip = (act, v, label, cur) => '<button type="button" class="chip' + (cur ? " on" : "") + '" data-act="' + act + '" data-v="' + v + '" aria-pressed="' + cur + '">' + label + "</button>";
const kindChips = (act, cur) => '<span class="idea-kinds">' + I.KINDS.map(([k, l]) => chip(act, k, l, cur === k)).join("") + "</span>";
const bySeg = (act, cur) => '<span class="seg">' + [["on", "On"], ["by", "By"]].map(([v, l]) => '<button type="button" data-act="' + act + '" data-v="' + v + '"' + ((v === "by") === Boolean(cur) ? ' class="on"' : "") + ">" + l + "</button>").join("") + "</span>";
// 能挑灵感的大类：Plan 的时候放进哪个
const homes = () => store.groups().filter(GR.ideasOf);

function addHTML() {
  return '<form class="idea-add" autocomplete="off">' +
    '<input name="text" data-keep="idea-add" placeholder="Add an idea — or paste a list, one per line" aria-label="New idea" enterkeyhint="done">' +
    kindChips("idea-kind", kind) +
    (dated ? '<input type="date" name="date" data-keep="idea-add-date" aria-label="Date">' + bySeg("idea-by", by) : '<button type="button" class="link" data-act="idea-dated">+ date</button>') +
    '<button class="btn cta" type="submit">Add</button></form>';
}

// 放到哪天：日子（它自己有日子、还没过就用那天）、哪个大类、多少分钟
function planHTML(idea) {
  const T = store.today(), list = homes();
  return '<form class="idea-plan"><input type="date" name="date" value="' + (idea.date && idea.date >= T ? idea.date : T) + '" aria-label="Day">' +
    (list.length > 1 ? '<select name="group" aria-label="Project">' + list.map((g) => '<option value="' + esc(g.name) + '">' + esc(g.name) + "</option>").join("") + "</select>"
      : '<input type="hidden" name="group" value="' + esc(list[0]?.name || "") + '">') +
    '<label><input class="num" type="number" name="est" value="60" min="5" step="5" aria-label="Minutes"> min</label>' +
    '<button class="btn" type="submit">Add to that day</button><button type="button" class="link" data-act="idea-plan-x">Cancel</button></form>';
}

function editHTML(idea) {
  const id = esc(idea.id);
  return '<li class="idea-row editing" data-idea="' + id + '">' +
    '<input class="idea-in" data-if="text" data-keep="idea-text-' + id + '" value="' + esc(idea.text) + '" aria-label="Idea">' +
    kindChips("idea-set-kind", I.kindOf(idea)) +
    '<input type="date" data-if="date" value="' + esc(idea.date || "") + '" aria-label="Date">' + (idea.date ? bySeg("idea-set-by", idea.by) : "") +
    '<input class="idea-in note" data-if="note" data-keep="idea-note-' + id + '" value="' + esc(idea.note || "") + '" placeholder="Note" aria-label="Note">' +
    '<button type="button" class="btn" data-act="idea-edit-done">Done</button><button type="button" class="link" data-act="idea-del">Delete</button></li>';
}

function rowHTML({ idea, state, day }) {
  if (edit === idea.id) return editHTML(idea);
  const when = state === "planned" ? "→ " + dayText(day) : state === "missed" ? "was " + fmtShort(idea.date) : I.whenText(idea);
  return '<li class="idea-row ' + state + '" data-idea="' + esc(idea.id) + '">' +
    '<button type="button" class="idea-text" data-act="idea-edit" title="Edit">' + esc(idea.text) + "</button>" +
    (when ? '<span class="idea-when">' + esc(when) + "</span>" : "") +
    (idea.note ? '<span class="idea-note">' + esc(idea.note) + "</span>" : "") +
    (I.kindOf(idea) || state === "planned" ? "" : kindChips("idea-sort", "")) +
    '<span class="idea-acts">' + (state === "planned" ? '<button type="button" class="link" data-act="idea-back">Put back</button>' : '<button type="button" class="link" data-act="idea-plan">Plan</button>') + "</span>" +
    (planning === idea.id ? planHTML(idea) : "") + "</li>";
}

export function ideasHTML(c) {
  const b = I.board(store.ideas(), taskOf, c.today);
  return '<div class="idea-page">' + addHTML() +
    (b.groups.length ? "" : '<p class="hint idea-intro">Places to go, things to eat, events to catch — no hours, no deadline. When you add a task under ' +
      esc(homes().map((g) => g.name).join(" or ") || "a project") + ", pick one and it's crossed off here; once that task is done, it's gone.</p>") +
    b.groups.map((g) => '<section class="idea-group"><h3 class="idea-h">' + g.title + " <small>" + g.items.length + '</small></h3><ul class="idea-list">' + g.items.map(rowHTML).join("") + "</ul></section>").join("") + "</div>";
}

// 加进去：一行一条；池子里已经有的不重复加（去过的不算，可以再加）
function addLines(text, form) {
  const lines = I.parseLines(text, I.left(store.ideas(), taskOf, store.today()));
  if (!lines.length) { if (String(text).trim()) toast("Already in your ideas"); return; }
  const date = dated ? form.date?.value || "" : "";
  store.addIdeas(lines, { kind, date, by: Boolean(date) && by });
  form.text.value = "";
  form.text.focus();
}

export function initIdeas(rerender) {
  on(document, "click", ".idea-page [data-act]", (e, el) => {
    const { act, v } = el.dataset, id = el.closest("[data-idea]")?.dataset.idea || "", idea = id ? store.ideaOf(id) : null;
    if (act === "idea-kind") kind = kind === v ? "" : v;
    else if (act === "idea-dated") { dated = true; afterRender(() => document.querySelector(".idea-add [name=date]")?.focus()); }
    else if (act === "idea-by") by = v === "by";
    else if (act === "idea-edit") { edit = id; planning = ""; afterRender(() => document.querySelector('.idea-row.editing [data-if="text"]')?.focus()); }
    else if (act === "idea-edit-done") edit = "";
    else if (act === "idea-plan") planning = planning === id ? "" : id;
    else if (act === "idea-plan-x") planning = "";
    else if (!idea) return;
    else if (act === "idea-del") { edit = ""; store.deleteIdea(id); return; }
    else if (act === "idea-sort") { store.saveIdea({ id, kind: v }); return; }
    else if (act === "idea-set-kind") { store.saveIdea({ id, kind: I.kindOf(idea) === v ? "" : v }); return; }
    else if (act === "idea-set-by") { store.saveIdea({ id, by: v === "by" }); return; }
    else if (act === "idea-back") { store.unpickIdea(id); return; }
    else return;
    rerender();
  });

  on(document, "submit", ".idea-add", (e, form) => {
    e.preventDefault();
    if (!form.text.value.trim()) { form.text.focus(); return; }
    addLines(form.text.value, form);
  });
  // 粘进来的是好几行：一行一条，直接加（输入框自己会把换行吃掉）
  on(document, "paste", ".idea-add [name=text]", (e, el) => {
    const text = e.clipboardData?.getData("text") || "";
    if (!/\n/.test(text.trim())) return;
    e.preventDefault();
    addLines(text, el.form);
  });

  // 改一条：每一格改完就存；回车收起来，Esc 不要了
  on(document, "change", ".idea-row.editing [data-if]", (e, el) => {
    const id = el.closest("[data-idea]").dataset.idea, f = el.dataset.if, value = el.value.trim();
    if (f === "text" && !value) return;
    store.saveIdea({ id, [f]: value, ...(f === "date" && !value ? { by: false } : {}) }, null, { quiet: f !== "date" });
  });
  on(document, "keydown", ".idea-row.editing [data-if]", (e, el) => {
    if (e.key === "Enter") { e.preventDefault(); el.blur(); edit = ""; rerender(); }
    if (e.key === "Escape") { e.stopPropagation(); edit = ""; rerender(); }
  });

  on(document, "submit", ".idea-plan", (e, form) => {
    e.preventDefault();
    const idea = store.ideaOf(form.closest("[data-idea]").dataset.idea), date = form.date.value;
    if (!idea || !date) return;
    const task = store.addTask({ date, title: idea.text, est: Math.max(5, Number(form.est.value) || 60), group: form.group.value });
    store.pickIdea(idea.id, task);
    planning = "";
    toast("On " + dayText(date));
  });
}
