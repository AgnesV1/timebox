// 灵感池（Projects 页头的 Plans | Ideas 切到 Ideas，电脑）：想去哪玩、想吃什么、想参加什么活动——没有时长，大多也没有期限。
// 顶上一格直接加（粘几行 = 几条；选着的类别、日子这几条都带上）。下面按类别分组，没归类的在最上面，每条带类别按钮（🎭 ✈️ 🍽️ 🍹 🛰️，见 js/ideas.js 的 KINDS），顶上一排能按类别筛。
// 点文字就改；Plan = 放到哪天（建一条任务、挂上）；排了的划掉、写着哪天，Put back 放回池子；任务做完 = 去过了，这条就不再列出来。
// 在 Leisure / Friends 下加任务时也能挑（见 js/ui/today.js 的 pickHTML）。怎么算见 js/ideas.js。
// 手机上：随手记一条（加任务那行的 Idea 开关），再加一页只用来查的（顶栏的灯泡，#ideas）——一格搜索，下面按类别列出来，不能改。

import * as store from "../store.js";
import * as I from "../ideas.js";
import * as GR from "../groups.js";
import { esc, on } from "../dom.js";
import { fmtShort, fmtMin, weekday, WEEKDAYS } from "../dates.js";
import { toast, tagFilterHTML } from "./common.js";

let kind = "";          // 加的那一格选着的类别
let dated = false;      // 加的那一格开着日子
let by = false;
let edit = "";          // 正在改的那条
let planning = "";      // 正在挑日子的那条
let seek = "";          // 手机上查的那一页：搜索框里的字

const afterRender = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));
const taskOf = (id) => store.get("tasks", id);
const dayText = (d) => WEEKDAYS[weekday(d)] + " " + fmtShort(d);
const chip = (act, v, label, cur, name) => '<button type="button" class="chip' + (cur ? " on" : "") + '" data-act="' + act + '" data-v="' + v + '" aria-pressed="' + cur + '" title="' + esc(name) + '" aria-label="' + esc(name) + '">' + label + "</button>";
const kindChips = (act, cur) => '<span class="idea-kinds">' + I.KINDS.map(([k, e, name]) => chip(act, k, e, cur === k, name)).join("") + "</span>";
// 顶上筛着哪个类别（记在这台设备上）；空 = 全部
const kindFilter = () => (I.KINDS.some(([k]) => k === store.local().ideaKind) ? store.local().ideaKind : "");
const lead = (idea) => (I.emojiOf(idea) ? I.emojiOf(idea) + " " : "");
const groupTitle = (g) => (g.emoji ? g.emoji + " " : "") + g.title + " <small>" + g.items.length + "</small>";
const bySeg = (act, cur) => '<span class="seg">' + [["on", "On"], ["by", "By"]].map(([v, l]) => '<button type="button" data-act="' + act + '" data-v="' + v + '"' + ((v === "by") === Boolean(cur) ? ' class="on"' : "") + ">" + l + "</button>").join("") + "</span>";
// 能挑灵感的大类：Plan 的时候放进哪个；没另外选就是 Leisure（没有这个名字的话，第一个）
const homes = () => store.groups().filter(GR.ideasOf);
const home = () => { const list = homes(); return (list.find((g) => g.name === "Leisure") || list[0])?.name || ""; };

// 放到某天：建一条任务、挂上，算一次改动（提示条上能撤销）。Ideas 页的 Plan、日历任务池里的 Add 都走这里
function planIdea(idea, { date, group = home(), est = I.defaultEst(idea) }) {
  store.change(() => {
    const task = store.addTask({ date, title: idea.text, est: Math.max(5, Number(est) || I.defaultEst(idea)), group });
    store.pickIdea(idea.id, task);
  }, "On " + dayText(date));
}

function addHTML() {
  return '<form class="idea-add" autocomplete="off">' +
    '<input name="text" data-keep="idea-add" placeholder="Add an idea — or paste a list, one per line" aria-label="New idea" enterkeyhint="done">' +
    kindChips("idea-kind", kind) +
    (dated ? '<input type="date" name="date" data-keep="idea-add-date" aria-label="Date">' + bySeg("idea-by", by) : '<button type="button" class="link" data-act="idea-dated">+ date</button>') +
    '<button class="btn cta" type="submit">Add</button></form>';
}

// 放到哪天：日子（它自己有日子、还没过就用那天）、哪个大类（先选着 Leisure）、多少分钟（按类别：出门 6 小时、吃 3 小时）
function planHTML(idea) {
  const T = store.today(), list = homes(), cur = home();
  return '<form class="idea-plan"><input type="date" name="date" value="' + (idea.date && idea.date >= T ? idea.date : T) + '" aria-label="Day">' +
    (list.length > 1 ? '<select name="group" aria-label="Project">' + list.map((g) => '<option value="' + esc(g.name) + '"' + (g.name === cur ? " selected" : "") + ">" + esc(g.name) + "</option>").join("") + "</select>"
      : '<input type="hidden" name="group" value="' + esc(cur) + '">') +
    '<label><input class="num" type="number" name="est" value="' + I.defaultEst(idea) + '" min="5" step="5" aria-label="Minutes"> min</label>' +
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

// 日历任务池里的一小节：有日子、还没排的灵感，只把字列出来——不生成任务，也不算进要排的时长。
// 鼠标停着的那行露出一个 + = 放到它自己的那天（by 的放在最后那天，之后照常在日历上拖），Leisure，时长按类别
export function ideasPoolHTML(c) {
  const list = I.upcoming(store.ideas(), taskOf, c.today), g = store.groupByName(home());
  if (!list.length) return "";
  return '<section class="pg idea-due"><div class="pg-head" style="--pc:' + esc(g?.color || "var(--c-None)") + '"><i></i><span>Ideas</span></div><ul>' + list.map((i) =>
    '<li data-idea="' + esc(i.id) + '"><span class="idea-due-t">' + lead(i) + esc(i.text) + "</span><em>" + esc(I.whenText(i)) + "</em>" +
    '<button type="button" data-act="idea-to-day" title="' + esc("Add to " + dayText(i.date) + " · " + home() + " · " + fmtMin(I.defaultEst(i))) + '" aria-label="' + esc("Add to " + dayText(i.date)) + '">+</button></li>').join("") + "</ul></section>";
}

export function ideasHTML(c) {
  const b = I.board(store.ideas(), taskOf, c.today), f = kindFilter();
  const groups = b.groups.filter((g) => !f || g.kind === f);
  return '<div class="idea-page">' + addHTML() + tagFilterHTML("idea-filter", I.KINDS, I.kindCounts(store.ideas(), taskOf, c.today), f) +
    (b.groups.length ? "" : '<p class="hint idea-intro">Places to go, things to eat, events to catch — no hours, no deadline. When you add a task under ' +
      esc(homes().map((g) => g.name).join(" or ") || "a project") + ", pick one and it's crossed off here; once that task is done, it's gone.</p>") +
    groups.map((g) => '<section class="idea-group"><h3 class="idea-h">' + groupTitle(g) + '</h3><ul class="idea-list">' + g.items.map(rowHTML).join("") + "</ul></section>").join("") + "</div>";
}

// 手机上查的那一页：名字、日子、备注；排了的划掉、写着哪天。搜的是名字和备注
function foundHTML(c) {
  const q = seek.trim().toLowerCase();
  const groups = I.board(store.ideas(), taskOf, c.today).groups
    .map((g) => ({ ...g, items: g.items.filter((r) => !q || (r.idea.text + " " + (r.idea.note || "")).toLowerCase().includes(q)) })).filter((g) => g.items.length);
  if (!groups.length) return '<p class="empty">' + (q ? "Nothing matches." : "No ideas yet. To save one, switch on Idea when you add a task.") + "</p>";
  return groups.map((g) => '<section class="idea-group"><h3 class="idea-h">' + groupTitle(g) + '</h3><ul class="idea-list">' + g.items.map(({ idea, state, day }) => {
    const when = state === "planned" ? "→ " + dayText(day) : state === "missed" ? "was " + fmtShort(idea.date) : I.whenText(idea);
    return '<li class="idea-row ' + state + '"><span class="idea-text">' + esc(idea.text) + "</span>" + (when ? '<span class="idea-when">' + esc(when) + "</span>" : "") +
      (idea.note ? '<span class="idea-note">' + esc(idea.note) + "</span>" : "") + "</li>";
  }).join("") + "</ul></section>").join("");
}

export function ideasPhoneHTML(c) {
  return '<div class="idea-page phone-ideas"><header class="phead"><div class="l"><a class="nav" href="#today">‹ Today</a></div></header>' +
    '<header class="page-head"><div><h2>Ideas</h2></div></header>' +
    '<input type="search" class="idea-seek" data-keep="idea-seek" value="' + esc(seek) + '" placeholder="Search ideas" aria-label="Search ideas" autocomplete="off" enterkeyhint="search">' +
    '<div data-idea-found>' + foundHTML(c) + "</div></div>";
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
    else if (act === "idea-filter") { store.setLocal({ ideaKind: v }); return; }
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
    planning = "";
    planIdea(idea, { date, group: form.group.value, est: form.est.value });
  });
  // 手机上查：边打边筛，只换下面那一块（整页重画的话输入框也跟着换）
  on(document, "input", ".phone-ideas .idea-seek", (e, el) => {
    seek = el.value;
    el.closest(".phone-ideas").querySelector("[data-idea-found]").innerHTML = foundHTML(store.ctx());
  });
  on(document, "click", ".idea-due [data-act=idea-to-day]", (e, el) => {
    const idea = store.ideaOf(el.closest("[data-idea]").dataset.idea);
    if (idea?.date) planIdea(idea, { date: idea.date });
  });
}
