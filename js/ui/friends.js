// Friends 页（电脑）：People 表（搜索 + 筛选）、Recent（最近的记录）、右边 To do（谁、做什么、哪天）。
// 每个人的资料有哪些格子是自己定的：右上齿轮 → Fields，一行一个；表格里手动加的列也会出现。
// 三个记号（🏛️ 🧠 ✨）：每个人可以点亮其中几个——表里那一行、点开的编辑框里都能点；筛选条上点亮哪个就只看带那个的人。
// 特别的日子：点开一个人，Dates 那块记生日、哪几个节要问候、自己的关键日子；页面右边 Coming up 列接下来的，
// 到了日子点一下名字 = 在他的记录里记一条。Gift 字段填了东西的人，生日那条带 🎁。
// 已经记在别的表格里的人：People 那块右上角 Import，整片粘进来。带着表头那一行（Name、各字段的名字）就按表头对列，
// 没带就按字段的顺序；不算资料的列里「5.17 一句话」是一次记录。
// 还有「和谁」那一小块（withHTML）：今天页点开的任务行、加任务框、任务编辑框都用它，手机上也有。

import * as store from "../store.js";
import * as F from "../friends.js";
import { esc, on, icon } from "../dom.js";
import { fmtShort, MONTHS } from "../dates.js";
import { toast } from "./common.js";
import { openModal, closeModal, modalSheet, fillingDate } from "./modal.js";

let q = "";                 // 搜索
let where = [];             // 筛选条件 [{ field, value }]
let pending = null;         // 正在加的那个条件：{ field, text: 是不是在打字 }
let td = "", seen = "";     // 两个现成的筛选：有没有要做的事、多久没联系
let editing = null;         // 弹出来的：{ kind: "friend" | "meet" | "fields", id, draft }
let doneFor = "";           // To do 里正在记「做完了」的那个人
let newFor = "";            // 正在当场新建一个人的那一块（key）
const markOn = new Set();   // 筛选：点亮了哪几个记号
let upSpan = 30;            // Coming up 往后看多少天：30 / 364（一整年少一天，免得今天的生日明年那次也冒出来）
const drafts = new Map();   // 还没存的「和谁」：加任务框 add:<日期>、新记录 meet:new
let redraw = () => {};

const low = (s) => String(s ?? "").trim().toLowerCase();
const afterRender = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));
const nameOf = (id) => store.get("friends", id)?.name || "";
const namesOf = (ids) => (ids || []).map(nameOf).filter(Boolean).join(", ");

// ---------- 「和谁」：几个名字的小签 + 一个加人的下拉（列的就是 Friends 页里的名字） ----------
// key 说明这一块是谁的：task:<任务 id>（存在任务带的那条记录里）/ meet:<记录 id> / add:<日期>、meet:new（先记在这里，建好再存）

export function withIds(key) {
  if (key.startsWith("task:")) return store.meetOfTask(key.slice(5))?.friends || [];
  if (key.startsWith("meet:") && key !== "meet:new") return store.get("meets", key.slice(5))?.friends || [];
  return drafts.get(key) || [];
}

function setWith(key, ids) {
  if (key.startsWith("task:")) store.setTaskMeet(key.slice(5), { friends: ids });
  else if (key.startsWith("meet:") && key !== "meet:new") store.saveMeet({ id: key.slice(5), friends: ids });
  else { drafts.set(key, ids); redraw(); }
}

// 加任务框里选好的人：建好任务后拿走
export function takeWith(key) {
  const ids = drafts.get(key) || [];
  drafts.delete(key);
  return ids;
}

export function withHTML(key) {
  const ids = withIds(key).filter((id) => store.get("friends", id));
  const rest = store.friends().filter((f) => !ids.includes(f.id));
  return '<div class="with" data-with="' + esc(key) + '">' +
    ids.map((id) => '<span class="wchip" data-fid="' + esc(id) + '">' + esc(nameOf(id)) + '<button type="button" data-act="with-x" aria-label="Remove ' + esc(nameOf(id)) + '">×</button></span>').join("") +
    (newFor === key
      ? '<input class="wnew" data-wnew data-keep="wnew-' + esc(key) + '" placeholder="Name, then Enter" autocomplete="off" aria-label="New person">'
      : '<select class="wadd" data-wadd aria-label="Add a person"><option value="">' + (ids.length ? "+ Add" : "+ With…") + "</option>" +
        rest.map((f) => '<option value="' + esc(f.id) + '">' + esc(f.name || "Untitled") + "</option>").join("") + '<option value="__new">New person…</option></select>') + "</div>";
}

// 任务带的那条记录：和谁 + 聊了什么 + 要记住的（边写边存）
export function taskMeetHTML(taskId) {
  const m = store.meetOfTask(taskId), k = esc(taskId);
  return '<div class="tmeet" data-tmeet="' + k + '">' + withHTML("task:" + taskId) +
    '<input data-meet="note" data-keep="tm-note-' + k + '" value="' + esc(m?.note || "") + '" placeholder="Notes" autocomplete="off" aria-label="Notes">' +
    '<input data-meet="watch" data-keep="tm-watch-' + k + '" value="' + esc(m?.watch || "") + '" placeholder="Remember" autocomplete="off" aria-label="Remember"></div>';
}

// 没点开的任务行上的一小句：「with Ana, Bo」
export function withText(taskId) {
  const names = namesOf(store.meetOfTask(taskId)?.friends);
  return names ? "with " + names : "";
}

// ---------- 页面 ----------

// 这个人的特别字段叫什么：字段清单里已经有（不管怎么写的）就用那个，没有就用标准的名字
const spName = (k) => store.friendSpecial()[k] || F.SPECIAL_NAME[k];
// 普通的字段：去掉有专门地方改的那几个（生日、问候、关键日子、记号）
const plainFields = () => { const sp = store.friendSpecial(); return store.friendFields().filter((k) => ![sp.birthday, sp.greet, sp.dates, sp.marks].includes(k)); };

// 三个记号：亮的 = 有。act = 点了做什么（mark 改这个人的 / mark-filter 改筛选）
const marksHTML = (have, act, label) => '<span class="fmarks" role="group" aria-label="' + label + '">' + F.MARKS.map((m) =>
  '<button type="button" class="fmark' + (have.includes(m) ? " on" : "") + '" data-act="' + act + '" data-m="' + m + '" aria-pressed="' + have.includes(m) + '" aria-label="' + m + '">' + m + "</button>").join("") + "</span>";

function filterBarHTML(all, fields) {
  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(l) + "</option>";
  const chips = where.map((w, i) => '<span class="fchip"><b>' + esc(w.field) + "</b> " + esc(w.value) + '<button type="button" data-act="where-x" data-i="' + i + '" aria-label="Remove this filter">×</button></span>').join("");
  let add = "";
  if (pending?.text) add = '<span class="fchip open"><b>' + esc(pending.field) + '</b><input data-fwtext data-keep="fr-wtext" placeholder="contains…" autocomplete="off" aria-label="' + esc(pending.field) + ' contains"></span>';
  else if (pending) add = '<select data-ff="value" aria-label="' + esc(pending.field) + '"><option value="">' + esc(pending.field) + " is…</option>" + F.valuesOf(all, pending.field).slice(0, 40).map((v) => opt(v, v, "")).join("") + '<option value="__text">Contains…</option><option value="__cancel">Cancel</option></select>';
  else if (fields.length) add = '<select data-ff="field" aria-label="Add a filter"><option value="">+ Filter…</option>' + fields.map((f) => opt(f, f, "")).join("") + "</select>";
  return '<div class="fr-bar"><input type="search" data-fq data-keep="fr-q" value="' + esc(q) + '" placeholder="Search" aria-label="Search people">' +
    marksHTML([...markOn], "mark-filter", "Only people with these marks") +
    '<select data-ff="todo" aria-label="To do">' + opt("", "To do: any", td) + opt("has", "Has a to-do", td) + opt("late", "Overdue", td) + "</select>" +
    '<select data-ff="seen" aria-label="Last contact">' + opt("", "Last: any time", seen) + opt("30", "30+ days ago", seen) + opt("90", "90+ days ago", seen) + opt("never", "Never", seen) + "</select>" +
    chips + add + (q || where.length || td || seen || markOn.size ? '<button type="button" class="link" data-act="fr-clear">Clear</button>' : "") + "</div>";
}

function peopleHTML(all, shown, fields, last, T) {
  const cols = fields.slice(0, 2);
  const next = (f) => (low(f.next) ? '<span class="fnext' + (f.nextDate && f.nextDate < T ? " late" : "") + '">' + esc(f.next) + (f.nextDate ? " <small>" + fmtShort(f.nextDate) + "</small>" : "") + "</span>" : "");
  const table = shown.length
    ? '<div class="table-wrap"><table class="ftable"><thead><tr><th>Name</th><th aria-label="Marks"></th>' + cols.map((f) => "<th>" + esc(f) + "</th>").join("") + "<th>Last</th><th>Next</th></tr></thead><tbody>" +
      shown.map((f) => '<tr data-act="edit-friend" data-id="' + esc(f.id) + '" tabindex="0"><td><b>' + esc(f.name || "Untitled") + '</b></td><td class="fm-cell">' + marksHTML(F.marksOf(f.more?.[spName("marks")]), "mark", "Marks") + "</td>" +
        cols.map((k) => "<td>" + esc(f.more?.[k] || "") + "</td>").join("") + '<td class="num">' + esc(F.ago(last[f.id], T)) + "</td><td>" + next(f) + "</td></tr>").join("") + "</tbody></table></div>"
    : '<p class="empty">' + (all.length ? "Nobody matches." : "Nobody here yet. Add a person, or pick “New person…” on a task.") + "</p>";
  return '<section class="card"><header class="fr-head"><h3>People</h3><span class="msub">' + (shown.length === all.length ? all.length : shown.length + " of " + all.length) + '</span><button type="button" class="link fr-import" data-act="fr-import">Import</button></header>' +
    filterBarHTML(all, fields) + table +
    (fields.length ? "" : '<p class="hint">What do you want to note about each person? <button type="button" class="link" data-act="fr-fields">Set up the fields</button> — one per line, in your own words.</p>') + "</section>";
}

function recentHTML(T) {
  const st = (id) => store.get("tasks", id)?.status || "";
  const list = store.meets().filter((m) => (m.friends || []).some(nameOf)).slice(0, 12);
  if (!list.length) return '<section class="card"><header class="fr-head"><h3>Recent</h3></header><p class="empty">Nothing noted yet.</p></section>';
  return '<section class="card"><header class="fr-head"><h3>Recent</h3></header><ul class="fmeets">' + list.map((m) =>
    '<li data-act="edit-meet" data-id="' + esc(m.id) + '" tabindex="0" class="' + (F.happened(m, T, st) ? "" : "soon") + '"><span class="num">' + fmtShort(m.date) + (m.date > T ? " · planned" : "") + "</span><b>" + esc(namesOf(m.friends)) + "</b>" +
    "<span>" + esc(m.note || "") + "</span>" + (m.watch ? '<em title="Remember">' + esc(m.watch) + "</em>" : "") + "</li>").join("") + "</ul></section>";
}

function todoHTML(t, T) {
  const row = (x) => {
    const f = x.friend, id = esc(f.id);
    return '<li class="' + (x.late ? "late" : "") + '" data-id="' + id + '"><div class="ft-main"><button type="button" class="link ft-name" data-act="edit-friend" data-id="' + id + '">' + esc(f.name || "Untitled") + "</button>" +
      "<span>" + esc(f.next) + "</span>" + (f.nextDate ? '<small class="num">' + fmtShort(f.nextDate) + " · " + F.ago(f.nextDate, T) + "</small>" : "") + "</div>" +
      (doneFor === f.id
        ? '<form class="fdone" data-id="' + id + '" autocomplete="off"><input name="note" data-keep="fdone-' + id + '" value="' + esc(f.next) + '" aria-label="What to note"><button type="submit" class="btn primary">Log</button><button type="button" class="link" data-act="done-cancel">Cancel</button></form>'
        : '<button type="button" class="chip" data-act="todo-done">Done</button>') + "</li>";
  };
  return '<section class="card ftodo-card"><header class="fr-head"><h3>To do</h3>' + (t.due ? '<span class="msub">' + t.due + " due</span>" : "") + "</header>" +
    (t.list.length ? '<ul class="ftodo">' + t.list.map(row).join("") + "</ul>" : '<p class="empty">Nothing to do. Write a “Next” on a person and it shows up here.</p>') + "</section>";
}

// 接下来的日子：同一天同一件事的人排一行，点名字 = 做了（在他的记录里记一条），再点 = 其实没做
function comingHTML(c) {
  const up = F.comingUp(store.friends(), store.friendSpecial(), c.today, { ahead: upSpan, back: 7 }, store.occasionDone);
  const seg = '<span class="seg">' + [[30, "30 days"], [364, "Year"]].map(([v, l]) => '<button type="button" data-act="up-span" data-v="' + v + '"' + (upSpan === v ? ' class="on"' : "") + ">" + l + "</button>").join("") + "</span>";
  const chip = (x) => '<button type="button" class="ochip' + (x.done ? " done" : "") + '" data-act="oc-toggle" data-oc="' + esc(x.id) + '" data-friend="' + esc(x.friend.id) + '" data-note="' + esc(x.label + (x.gift ? " (gift)" : "")) +
    '" aria-pressed="' + x.done + '" title="' + (x.done ? "Done — click to undo" : "Click when it's done") + '">' + (x.done ? "✓ " : "") + esc(x.friend.name || "Untitled") + (x.gift ? ' <span class="og">🎁 ' + esc(x.gift) + "</span>" : "") + "</button>";
  const row = (g) => '<li class="' + (g.late ? "late" : "") + '"><div class="oc-head"><b class="num">' + fmtShort(g.date) + "</b><span>" + esc(g.label) + "</span><small>" + F.ago(g.date, c.today) + '</small></div><div class="oc-people">' + g.items.map(chip).join("") + "</div></li>";
  return '<section class="card"><header class="fr-head"><h3>Coming up</h3>' + (up.due ? '<span class="msub">' + up.due + " soon</span>" : "") + seg + "</header>" +
    (up.groups.length ? '<ul class="fup">' + up.groups.map(row).join("") + "</ul>"
      : '<p class="empty">Nothing in the next ' + (upSpan > 31 ? "year" : "30 days") + ". Open a person to add a birthday, greetings or a key date.</p>") + "</section>";
}

export function friendsHTML(c) {
  const all = store.friends(), last = store.lastContact(), fields = plainFields();
  where = where.filter((w) => fields.includes(w.field));
  const shown = F.filter(all, { q, where, todo: td, seen, marks: [...markOn], marksField: spName("marks") }, last, c.today);
  return '<div class="friends"><header class="page-head"><div><h2>Friends</h2></div><div class="tools">' +
    '<button type="button" class="btn cta" data-act="new-friend">' + icon("plus") + " Person</button>" +
    '<button type="button" class="btn" data-act="new-meet">' + icon("plus") + " Catch-up</button>" +
    '<button type="button" class="icon-btn" data-act="fr-fields" title="Fields" aria-label="Fields">' + icon("settings") + "</button></div></header>" +
    '<div class="fr-grid"><div class="fr-main">' + peopleHTML(all, shown, fields, last, c.today) + recentHTML(c.today) + '</div><aside class="fr-side">' + comingHTML(c) + todoHTML(F.todo(all, c.today), c.today) + "</aside></div></div>";
}

// 侧栏角标：到今天为止该做的事 + 三天之内（含过了没做的）的日子
export const friendsDue = (today) => F.todo(store.all("friends"), today).due + F.comingUp(store.all("friends"), store.friendSpecial(), today, { ahead: 3, back: 7 }, store.occasionDone).due;

// ---------- 弹出来的三种：一个人、一条记录、字段清单 ----------

// 一个人的 Dates：生日（年份可以不填）、哪几个节要问候、自己记的关键日子（每年 / 只这一次）
function datesHTML(f) {
  const more = f.more || {}, names = store.friendSpecial();
  const b = F.parseDay(more[spName("birthday")]), greet = F.greetKeys(more[spName("greet")]), list = F.parseDates(more[spName("dates")]);
  const gift = names.gift ? String(more[names.gift] || "").trim() : "";
  const opt = (v, l, cur) => '<option value="' + v + '"' + (String(v) === String(cur ?? "") ? " selected" : "") + ">" + l + "</option>";
  return '<h3 class="sub">Dates</h3><div class="fdates">' +
    '<div class="fd-row"><span class="fd-l">Birthday</span><span class="fd-bd"><select data-bd="m" aria-label="Birthday month">' + opt("", "Month", b?.m) + MONTHS.map((m, i) => opt(i + 1, m, b?.m)).join("") + "</select>" +
    '<select data-bd="d" aria-label="Birthday day">' + opt("", "Day", b?.d) + Array.from({ length: 31 }, (_, i) => opt(i + 1, i + 1, b?.d)).join("") + "</select>" +
    '<input class="num" data-bd="y" inputmode="numeric" maxlength="4" placeholder="year" value="' + (b?.y || "") + '" aria-label="Birth year, optional"></span>' +
    (gift ? '<span class="fd-gift" title="From the Gift field">🎁 ' + esc(gift) + "</span>" : "") + "</div>" +
    '<div class="fd-row"><span class="fd-l">Greet on</span><span class="fd-greet">' + F.HOLIDAYS.map((h) => '<label class="fd-chip"><input type="checkbox" data-greet="' + h.key + '"' + (greet.includes(h.key) ? " checked" : "") + "><span>" + esc(h.name) + "</span></label>").join("") + "</span></div>" +
    '<div class="fd-row top"><span class="fd-l">Key dates</span><div class="fd-keys">' +
    list.map((x, i) => '<span class="fchip"><b>' + MONTHS[x.m - 1] + " " + x.d + (x.y ? ", " + x.y : "") + "</b> " + esc(x.label) + (x.y ? "" : " <small>every year</small>") + '<button type="button" data-act="kd-x" data-i="' + i + '" aria-label="Remove this date">×</button></span>').join("") +
    '<form class="kd-add" autocomplete="off"><input type="date" name="date" aria-label="Date"><input name="label" placeholder="What — graduation, moving day…" aria-label="What">' +
    '<label class="check"><input type="checkbox" name="yearly"> every year</label><button type="submit" class="btn">Add</button></form></div></div></div>';
}

function friendEditorHTML() {
  const isNew = !editing.id, f = isNew ? editing.draft : store.get("friends", editing.id);
  if (!f) return "";
  const fields = plainFields(), T = store.today();   // 生日、问候、关键日子在下面的 Dates 里改，记号在名字旁边
  const st = (id) => store.get("tasks", id)?.status || "";
  const hist = isNew ? [] : store.meets().filter((m) => (m.friends || []).includes(f.id));
  let h = '<div class="friend-editor" data-fid="' + esc(f.id || "") + '"><h2 class="sheet-title">' + (isNew ? "New person" : "Person") + "</h2>" +
    '<div class="fname-row"><label class="field"><span>Name</span><input data-pf="name" value="' + esc(f.name || "") + '" autocomplete="off"></label>' + marksHTML(F.marksOf(f.more?.[spName("marks")]), "mark", "Marks") + "</div>" +
    (fields.length ? '<div class="fgrid">' + fields.map((k) => '<label class="field"><span>' + esc(k) + '</span><textarea rows="1" data-more="' + esc(k) + '">' + esc(f.more?.[k] || "") + "</textarea></label>").join("") + "</div>" : "") +
    datesHTML(f) +
    '<div class="field-row"><label class="field"><span>Next — what to do</span><input data-pf="next" value="' + esc(f.next || "") + '" autocomplete="off"></label>' +
    '<label class="field small"><span>By</span><input type="date" data-pf="nextDate" value="' + esc(f.nextDate || "") + '"></label></div>';
  if (isNew) return h + '<div class="sheet-foot"><span></span><button type="button" class="btn cta" data-act="create-friend">Add</button></div></div>';
  h += '<h3 class="sub">History <small>' + hist.length + "</small></h3>" +
    '<form class="fhist-add" autocomplete="off"><input type="date" name="date" value="' + T + '" aria-label="Date"><input name="note" placeholder="What happened" aria-label="Note"><button type="submit" class="btn">Add</button></form>' +
    (hist.length ? '<ul class="fhist">' + hist.map((m) => '<li data-mid="' + esc(m.id) + '" class="' + (F.happened(m, T, st) ? "" : "soon") + '"><span class="num">' + fmtShort(m.date) + (m.date.slice(0, 4) !== T.slice(0, 4) ? " " + m.date.slice(0, 4) : "") + "</span>" +
      '<button type="button" class="fh-text" data-act="edit-meet" data-id="' + esc(m.id) + '">' + esc(m.note || "—") + (m.watch ? " <em>" + esc(m.watch) + "</em>" : "") + "</button>" +
      '<button type="button" class="icon-btn" data-act="del-meet" aria-label="Delete this record">' + icon("close") + "</button></li>").join("") + "</ul>" : "") +
    '<div class="sheet-foot"><button type="button" class="btn danger" data-act="del-friend">' + icon("trash") + ' Delete</button><button type="button" class="btn primary" data-modal-close>Done</button></div></div>';
  return h;
}

function meetEditorHTML() {
  const isNew = !editing.id, m = isNew ? editing.draft : store.get("meets", editing.id);
  if (!m) return "";
  const key = "meet:" + (isNew ? "new" : m.id), fromTask = !isNew && m.taskId && store.get("tasks", m.taskId);
  return '<div class="meet-editor" data-mid="' + esc(m.id || "") + '"><h2 class="sheet-title">' + (isNew ? "New catch-up" : "Catch-up") + "</h2>" +
    '<label class="field small"><span>Date' + (fromTask ? " — follows its task" : "") + '</span><input type="date" data-mf="date" value="' + esc(m.date || "") + '"' + (fromTask ? " disabled" : "") + "></label>" +
    '<div class="field"><span>With</span>' + withHTML(key) + "</div>" +
    '<label class="field"><span>Notes</span><textarea rows="3" data-mf="note">' + esc(m.note || "") + "</textarea></label>" +
    '<label class="field"><span>Remember</span><input data-mf="watch" value="' + esc(m.watch || "") + '" autocomplete="off"></label>' +
    (isNew ? '<div class="sheet-foot"><span></span><button type="button" class="btn cta" data-act="create-meet">Add</button></div>'
      : '<div class="sheet-foot"><button type="button" class="btn danger" data-act="del-meet-open">' + icon("trash") + ' Delete</button><button type="button" class="btn primary" data-modal-close>Done</button></div>') + "</div>";
}

function fieldsEditorHTML() {
  return '<form class="fields-editor" autocomplete="off"><h2 class="sheet-title">Fields</h2>' +
    '<p class="hint">What you note about each person, one per line, in the order you want. They become columns on the Friends tab of your Sheet; the names live there, not in the app.</p>' +
    '<label class="field"><span>One per line</span><textarea name="fields" rows="8" spellcheck="false">' + esc(store.friendFields().join("\n")) + "</textarea></label>" +
    '<div class="sheet-foot"><span class="hint">A field that already has values stays, even if you take its line out.</span><button type="submit" class="btn primary">Save</button></div></form>';
}

// 整片粘进来：从表格里复制的几行
function importEditorHTML() {
  const fields = store.friendFields();
  return '<form class="import-editor" autocomplete="off"><h2 class="sheet-title">Import people</h2>' +
    '<p class="hint">Paste rows copied from a spreadsheet. Best with the heading row on top — <b>Name</b> first, then a heading over each column: columns are matched to your fields by their headings, and a new heading becomes a new field. ' +
    (fields.length ? "Without headings, the columns after the name are taken in the order of your fields: <b>" + fields.map(esc).join("</b> · <b>") + "</b>. " : "") +
    "Cells in columns with no heading written like <b>5.17 coffee</b> become dated notes in that person's history. People already here are matched by name and filled in, never doubled.</p>" +
    '<label class="field"><span>Rows</span><textarea name="rows" rows="9" wrap="off" spellcheck="false"></textarea></label>' +
    '<label class="field small"><span>Year for dates like 5.17</span><input type="number" class="num" name="year" min="2000" max="2100" value="' + store.today().slice(0, 4) + '"></label>' +
    '<div class="sheet-foot"><span class="hint" data-import-count></span><button type="submit" class="btn primary">Import</button></div></form>';
}

const editorHTML = () => (editing.kind === "friend" ? friendEditorHTML() : editing.kind === "meet" ? meetEditorHTML() : editing.kind === "import" ? importEditorHTML() : fieldsEditorHTML());

function openEditor(next, focus = "") {
  editing = next;
  const html = editorHTML();
  if (!html) { editing = null; return; }
  const sheet = openModal(html, { wide: next.kind === "friend" || next.kind === "import", close: () => { editing = null; drafts.delete("meet:new"); } });
  if (focus) sheet.querySelector(focus)?.focus();
}

// 数据变了（或者换了「和谁」）：弹窗开着就重画，正在打字的框不动
export function refreshFriendEditor(force = false) {
  const sheet = modalSheet(), box = sheet?.querySelector(".friend-editor, .meet-editor");
  if (!editing || !box) return;
  const html = editorHTML();
  if (!html) return closeModal();
  if (fillingDate()) return;
  const a = document.activeElement;
  if (!force && sheet.contains(a) && a.matches("input:not([type=date]):not([type=checkbox]), textarea")) return;
  const scroll = sheet.scrollTop;
  box.outerHTML = html;
  sheet.scrollTop = scroll;
}

export function initFriends(rerender) {
  redraw = rerender;

  // ---- 「和谁」那一小块（哪个页面上的都归这里管） ----
  const keyOf = (el) => el.closest("[data-with]").dataset.with;
  on(document, "change", "[data-wadd]", (e, el) => {
    const key = keyOf(el), v = el.value;
    if (!v) return;
    if (v === "__new") {
      newFor = key;
      rerender();
      refreshFriendEditor(true);
      afterRender(() => document.querySelector('[data-with="' + CSS.escape(key) + '"] [data-wnew]')?.focus());
      return;
    }
    setWith(key, [...withIds(key), v]);
  });
  on(document, "click", "[data-with] [data-act=with-x]", (e, el) => {
    const key = keyOf(el), id = el.closest("[data-fid]").dataset.fid;
    setWith(key, withIds(key).filter((x) => x !== id));
  });
  const addNew = (el) => {
    const key = keyOf(el), name = el.value.trim();
    if (newFor !== key) return;
    newFor = "";
    if (!name) { rerender(); refreshFriendEditor(true); return; }
    const hit = store.friends().find((f) => low(f.name) === low(name));
    setWith(key, [...new Set([...withIds(key), hit ? hit.id : store.saveFriend({ name })])]);
  };
  on(document, "keydown", "[data-wnew]", (e, el) => {
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); addNew(el); }
    else if (e.key === "Escape") { e.stopPropagation(); el.value = ""; addNew(el); }
  });
  on(document, "focusout", "[data-wnew]", (e, el) => addNew(el));
  // 任务带的那条记录：聊了什么、要记住的，边写边存
  on(document, "input", "[data-tmeet] [data-meet]", (e, el) => store.setTaskMeet(el.closest("[data-tmeet]").dataset.tmeet, { [el.dataset.meet]: el.value }, { quiet: true }));

  // ---- 一个人的 Dates：生日、问候、关键日子。存在他的资料里（三个固定名字的字段），新建的先记在草稿里 ----
  const person = () => (editing?.kind !== "friend" ? null : editing.id ? store.get("friends", editing.id) : editing.draft);
  const setSpecial = (which, value) => {
    const f = person();
    if (!f) return;
    const more = { ...(f.more || {}), [spName(which)]: value };
    if (editing.id) store.saveFriend({ id: f.id, more });
    else editing.draft.more = more;
    refreshFriendEditor(true);
  };
  on(document, "change", ".friend-editor [data-bd]", (e, el) => {
    const box = el.closest(".fd-bd"), v = (k) => box.querySelector("[data-bd=" + k + "]").value.trim();
    const m = Number(v("m")), d = Number(v("d")), y = Number(v("y"));
    if (!m !== !d) return;   // 月和日只选了一个：等另一个
    if (!m) { setSpecial("birthday", ""); return; }
    const day = F.parseDay((y > 1900 && y < 2101 ? y + "-" : "") + m + "-" + d);
    if (!day) { toast("That date doesn't exist"); return; }
    setSpecial("birthday", F.formatDay(day));
  });
  on(document, "change", ".friend-editor [data-greet]", (e, el) => {
    setSpecial("greet", F.formatGreet([...el.closest(".fd-greet").querySelectorAll("[data-greet]:checked")].map((x) => x.dataset.greet)));
  });
  on(document, "submit", ".friend-editor .kd-add", (e, form) => {
    e.preventDefault();
    const day = F.parseDay(form.date.value);
    if (!day) { form.date.focus(); return; }
    const list = F.parseDates(person()?.more?.[spName("dates")]);
    list.push({ ...day, y: form.yearly.checked ? 0 : day.y, label: form.label.value.trim().replace(/\s*[;\n]+\s*/g, ", ") });
    setSpecial("dates", F.formatDates(list));
  });

  // ---- 页面 ----
  on(document, "click", ".friends [data-act], .friend-editor [data-act], .meet-editor [data-act], .import-editor [data-act]", (e, el) => {
    if (el.closest("[data-with]")) return;
    const act = el.dataset.act, id = el.dataset.id || el.closest("[data-id]")?.dataset.id || "";
    if (act === "new-friend") openEditor({ kind: "friend", id: "", draft: { name: "", more: {}, next: "", nextDate: "" } }, "[data-pf=name]");
    else if (act === "edit-friend") openEditor({ kind: "friend", id });
    else if (act === "new-meet") { drafts.set("meet:new", []); openEditor({ kind: "meet", id: "", draft: { date: store.today(), note: "", watch: "" } }); }
    else if (act === "edit-meet") openEditor({ kind: "meet", id });
    else if (act === "fr-fields") openEditor({ kind: "fields" }, "textarea");
    else if (act === "fr-import") openEditor({ kind: "import" }, "textarea");
    else if (act === "where-x") { where.splice(Number(el.dataset.i), 1); rerender(); }
    else if (act === "fr-clear") { q = ""; where = []; pending = null; td = ""; seen = ""; markOn.clear(); rerender(); }
    else if (act === "mark-filter") { if (markOn.has(el.dataset.m)) markOn.delete(el.dataset.m); else markOn.add(el.dataset.m); rerender(); }
    else if (act === "mark") {
      // 编辑框里点：改正在看的这个人（新建的记在草稿里）；表里点：改那一行的人
      if (el.closest(".friend-editor")) setSpecial("marks", F.toggleMark(person()?.more?.[spName("marks")], el.dataset.m));
      else { const f = store.get("friends", id); if (f) store.saveFriend({ id, more: { ...(f.more || {}), [spName("marks")]: F.toggleMark(f.more?.[spName("marks")], el.dataset.m) } }); }
    }
    else if (act === "up-span") { upSpan = Number(el.dataset.v) || 30; rerender(); }
    else if (act === "oc-toggle") store.toggleOccasion(el.dataset.oc, el.dataset.friend, el.dataset.note);
    else if (act === "kd-x") { const list = F.parseDates(person()?.more?.[spName("dates")]); list.splice(Number(el.dataset.i), 1); setSpecial("dates", F.formatDates(list)); }
    else if (act === "todo-done") { doneFor = id; rerender(); afterRender(() => document.querySelector(".fdone input")?.select()); }
    else if (act === "done-cancel") { doneFor = ""; rerender(); }
    else if (act === "create-friend") {
      const d = editing?.draft, name = String(d?.name || "").trim();
      if (!name) { modalSheet()?.querySelector("[data-pf=name]")?.focus(); return; }
      editing = { kind: "friend", id: store.saveFriend({ ...d, name }) };
      refreshFriendEditor(true);
    } else if (act === "del-friend") {
      const fid = el.closest("[data-fid]").dataset.fid;
      if (!confirm("Delete this person and their history?")) return;
      closeModal();
      store.deleteFriend(fid);
    } else if (act === "del-meet") store.deleteMeet(el.closest("[data-mid]").dataset.mid);
    else if (act === "del-meet-open") { const mid = editing?.id; closeModal(); if (mid) store.deleteMeet(mid); }
    else if (act === "create-meet") {
      const d = editing?.draft, ids = withIds("meet:new");
      if (!ids.length) { modalSheet()?.querySelector("[data-wadd]")?.focus(); return; }
      drafts.delete("meet:new");
      closeModal();
      store.saveMeet({ date: d.date || store.today(), friends: ids, note: d.note || "", watch: d.watch || "" }, "Noted");
    }
  });
  on(document, "keydown", ".friends tr[data-act], .friends li[data-act]", (e, el) => { if (e.key === "Enter" && e.target === el) el.click(); });

  on(document, "input", ".friends [data-fq]", (e, el) => { q = el.value; rerender(); });
  on(document, "change", ".friends [data-ff]", (e, el) => {
    const f = el.dataset.ff, v = el.value;
    if (f === "todo") td = v;
    else if (f === "seen") seen = v;
    else if (f === "field") pending = v ? { field: v } : null;
    else if (f === "value") {
      if (v === "__text") { pending = { ...pending, text: true }; afterRender(() => document.querySelector("[data-fwtext]")?.focus()); }
      else { if (v && v !== "__cancel") where.push({ field: pending.field, value: v }); pending = null; }
    }
    rerender();
  });
  const addText = (el) => {
    if (!pending?.text) return;
    const v = el.value.trim();
    if (v) where.push({ field: pending.field, value: v });
    pending = null;
    rerender();
  };
  on(document, "keydown", ".friends [data-fwtext]", (e, el) => { if (e.key === "Enter") addText(el); else if (e.key === "Escape") { el.value = ""; addText(el); } });
  on(document, "focusout", ".friends [data-fwtext]", (e, el) => addText(el));

  // To do 做完了：在这个人的记录里记一条，再把这件事清掉
  on(document, "submit", ".friends .fdone", (e, form) => {
    e.preventDefault();
    doneFor = "";
    store.doneNext(form.dataset.id, form.note.value);
  });

  // ---- 一个人：改了就存（新建的先记在草稿里，点 Add 才建） ----
  const saveFriendField = (el, quiet) => {
    if (editing?.kind !== "friend") return;
    const more = el.dataset.more, patch = more !== undefined ? null : { [el.dataset.pf]: el.value };
    if (!editing.id) {
      if (patch) Object.assign(editing.draft, patch);
      else editing.draft.more = { ...editing.draft.more, [more]: el.value };
      return;
    }
    const f = store.get("friends", editing.id);
    if (!f || (patch && "name" in patch && !patch.name.trim())) return;
    store.saveFriend(patch ? { id: f.id, ...patch } : { id: f.id, more: { ...(f.more || {}), [more]: el.value } }, "", { quiet });
  };
  on(document, "input", ".friend-editor [data-pf]:not([type=date]), .friend-editor [data-more]", (e, el) => {
    if (el.tagName === "TEXTAREA") { el.style.height = "auto"; el.style.height = el.scrollHeight + 2 + "px"; }
    saveFriendField(el, true);
  });
  on(document, "change", ".friend-editor [data-pf], .friend-editor [data-more]", (e, el) => saveFriendField(el, false));
  on(document, "submit", ".friend-editor .fhist-add", (e, form) => {
    e.preventDefault();
    const fid = form.closest("[data-fid]").dataset.fid, note = form.note.value.trim();
    if (!fid || !note) { form.note.focus(); return; }
    form.note.value = "";
    store.saveMeet({ date: form.date.value || store.today(), friends: [fid], note });
    refreshFriendEditor(true);
  });

  // ---- 一条记录 ----
  const saveMeetField = (el, quiet) => {
    if (editing?.kind !== "meet") return;
    if (!editing.id) { editing.draft[el.dataset.mf] = el.value; return; }
    if (el.dataset.mf === "date" && !el.value) return;
    store.saveMeet({ id: editing.id, [el.dataset.mf]: el.value }, "", { quiet });
  };
  on(document, "input", ".meet-editor [data-mf]:not([type=date])", (e, el) => saveMeetField(el, true));
  on(document, "change", ".meet-editor [data-mf]", (e, el) => saveMeetField(el, false));

  // ---- 整片粘进来：边粘边说读成了什么（几个人、几条带日期的、列是怎么对的）；点 Import 才存 ----
  const readImport = (form) => F.parseImport(form.rows.value, store.friendFields(), Number(form.year.value) || Number(store.today().slice(0, 4)));
  // 没有表头、也还没有字段，名字后面却有资料：这些格子没地方放
  const stuck = (x, text) => !x.headed && !x.fields.length && text.split(/\r?\n/).some((l) => l.split("\t").slice(1).some((c) => c.trim() && !F.parseDated(c, 2000)));
  on(document, "input", ".import-editor [name=rows], .import-editor [name=year]", (e, el) => {
    const x = readImport(el.form), notes = x.rows.reduce((a, r) => a + r.meets.length, 0);
    el.form.querySelector("[data-import-count]").textContent = !x.rows.length ? ""
      : stuck(x, el.form.rows.value) ? "Add a heading row (Name, then a name for each column) so the columns have somewhere to go."
        : x.rows.length + (x.rows.length === 1 ? " person" : " people") + (notes ? " · " + notes + (notes === 1 ? " dated note" : " dated notes") : "") +
          (x.headed ? " · matched by headings" : "") + (x.added.length ? " · new " + (x.added.length === 1 ? "field" : "fields") + ": " + x.added.join(", ") : "");
  });
  on(document, "submit", ".import-editor", (e, form) => {
    e.preventDefault();
    const x = readImport(form);
    if (!x.rows.length || stuck(x, form.rows.value)) { form.rows.focus(); return; }
    closeModal();
    store.importFriends(x.rows, x.added);
  });

  // ---- 字段清单 ----
  on(document, "submit", ".fields-editor", (e, form) => {
    e.preventDefault();
    store.setSetting("friend-fields", F.parseFields(form.fields.value));
    closeModal();
  });
}
