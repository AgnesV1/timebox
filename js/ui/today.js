// 「今天」页：安全线、当天的任务块、昨天的账单、过期没做的、任务列表、加任务、给这天的备注。
// 电脑上左边是清单，右边是安全线和账单；日历里点开某一天也用它。
// 手机上：看今天前后各 5 天的任务、给任务标结果、计时、加任务；右上角齿轮进去只有白天黑夜和连表格。计划都在电脑上做。

import * as store from "../store.js";
import * as sync from "../sync.js";
import * as E from "../engine.js";
import { esc, on, icon } from "../dom.js";
import { fmtDay, fmtShort, fmtMin, addDays, diffDays, weekday, startOfWeek, WEEKDAYS } from "../dates.js";
import * as S from "../stats.js";
import * as F from "../friends.js";
import * as I from "../ideas.js";
import * as GR from "../groups.js";
import * as reading from "../reading.js";
import * as Meal from "../meals.js";
import { parseLogLine } from "../times.js";
import * as R from "../routines.js";
import { heroHTML, stripHTML, billHTML, colorOf, badgeOf, projectOptions, pickable, pickTarget, segStyle, lineInfo, toast, STATUS, ballHTML } from "./common.js";
import { openTaskEditor } from "./editor.js";
import { pickedId, pick, timeable, elapsed } from "./timer.js";
import { animateNext } from "../motion.js";
import { cheer } from "../fx.js";
import { shopCount } from "./meals.js";
import { withHTML, taskMeetHTML, withText, takeWith } from "./friends.js";

const openDesc = new Set();
const logOpen = new Set();   // 已经有计时记录、又点了「+ time」要再补一段的任务
const seen = new Set();
let overdueOpen = false;
let viewDate = "";
let focus = "";   // 点开的那一行（四个状态按钮只在这一行）
const addTarget = {};   // 加任务框里选的是哪个项目 / 计划（日期 → 下拉的值）：能选「和谁」的大类要多画一块
const ideaDraft = {};   // 加任务框里从灵感池挑中的那条（日期 → 灵感 id）：任务建好后挂上去，池子里就划掉了
let addOpen = "";       // 哪一天的加任务框展开着（下面那排选项）。自己记着，不靠焦点猜——见 initToday 里的 setAddOpen
// 这个任务能不能选「和谁」：已经带着一条记录，或者它那个大类开了这一项
const meetable = (t) => Boolean(store.meetOfTask(t.id) || store.groupByName(store.groupOf(t))?.friends);

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

// 这一天展开的是哪一行：点过的那行；没点过的话，今天 = 浮条上选中的那个，别的日子都收着
function openOf(c, d, tasks) {
  if (focus && tasks.some((t) => t.id === focus)) return focus;
  return d === c.today ? pickedId(c) : "";
}

const STATUS_WORD = { done: "Done ✓", partial: "Partial", later: "Later", drop: "Drop" };

// 任务标了 Done，名字又在阅读的 Want 里（或者在某一页里还没写日期）：问一句看完没有（电脑）。
// 点记号 = 记进它那一页、月份用任务那天的；那一页有小类（Book、Game）就接着在同一行点一下小类。Not yet = 这条任务不再问
let finishing = null;   // 点了记号、还要挑小类的那条：{ taskId, mark }
const readTab = (want) => reading.logTypes().find((x) => x.toLowerCase() === String(want?.tab || "").toLowerCase()) || "";
const askFinished = (t) => (t.status === "done" && store.setting("reading")?.url && !reading.askedNotYet(t.id) ? reading.wantOf(t.title) : undefined);
function finishHTML(t, want) {
  const tab = readTab(want), later = '<button type="button" class="link" data-act="fin-later">Not yet</button>';
  // 没写是哪一类、或者那一类只在表格里手写的：去 Reading 页记
  if (!tab) return '<p class="rfin"><span>Finished it?</span><a class="link" href="#reading">Log it on Reading</a>' + later + "</p>";
  const kinds = reading.kindsOf(tab);
  if (finishing?.taskId === t.id && kinds.length) {
    return '<p class="rfin"><span>' + esc(tab) + " — which kind?</span>" + kinds.map((k) => '<button type="button" class="chip" data-act="fin-kind" data-v="' + esc(k) + '">' + esc(k) + "</button>").join("") +
      '<button type="button" class="link" data-act="fin-kind" data-v="">Skip</button></p>';
  }
  return '<p class="rfin"><span>Finished it?</span>' + reading.MARKS.map((m) => '<button type="button" class="vibe" data-act="fin-mark" data-v="' + m + '">' + m + "</button>").join("") +
    '<button type="button" class="chip" data-act="fin-mark" data-v="" title="Finished, no rating">✓</button>' + later + "</p>";
}

// 一行任务。只有展开的那行（openId）带四个状态按钮、计时记录、补时间的框和原因；
// 别的行只有一行字：分钟、名字、计划，右边是记了多久和状态。电脑上鼠标移上去，状态按钮浮在右边
function rowHTML(c, t, tasks, phone = false, openId = "") {
  const p = badgeOf(t);
  const open = t.id === openId;
  const fin = t.status === "done" || t.status === "partial";
  const why = t.status === "partial" || t.status === "later" || t.status === "drop";
  const desc = open && openDesc.has(t.id);
  const fresh = !seen.has(t.id);
  seen.add(t.id);
  const movedOn = t.status === "later" && c.tasks.some((x) => !x.status && x.date > t.date && x.title === t.title);
  const list = store.timeOf(t.id);
  const form = open && fin && t.date <= c.today && (!list.length || logOpen.has(t.id));
  const picked = timeable(t, c.today) && pickedId(c) === t.id;
  const run = store.timer();
  const running = run?.taskId === t.id;
  const want = open && !phone ? askFinished(t) : undefined;
  const chips = '<div class="chips' + (open ? "" : " hov") + '">' + STATUS.map(([s, label]) => '<button type="button" class="chip' + (t.status === s ? " on" : "") + '" data-act="status" data-s="' + s + '">' + label + "</button>").join("") +
    (open && t.status === "later" && !movedOn && !phone ? '<button type="button" class="chip ghost" data-act="tomorrow">→ Tomorrow</button>' : "") + "</div>";
  const total = store.timeTotal(t.id);
  const side = open ? "" : '<span class="rside">' +
    (running ? '<span class="tm live"><i></i><b class="num" data-since="' + run.start + '">' + elapsed(run.start) + "</b></span>" : total ? '<span class="num">' + fmtMin(total) + "</span>" : "") +
    (t.status ? '<b class="stw">' + STATUS_WORD[t.status] + "</b>" : "") + "</span>";
  return '<div class="row st-' + (t.status || "open") + (t.optional ? " opt" : "") + (fresh ? " enter" : "") + (picked ? " picked" : "") + (running ? " running" : "") + (open ? " open" : "") + '" data-id="' + t.id + '" style="--i:' + tasks.indexOf(t) + '">' +
    '<div class="est num" data-drag-row title="Drag to reorder"><b>' + t.est + '</b><i class="grip"></i></div>' +
    '<div class="bar" style="--bar:' + colorOf(t) + '"></div>' +
    '<div class="body"><div class="line">' +
    '<div class="task" data-act="desc">' + (t.optional ? '<span class="tag">Optional</span>' : "") + esc(t.title) +
    (E.isRoutine(t) ? ' <span class="rt" title="Routine">↻</span>' : "") +
    (t.deep ? ' <span class="dp" title="Deep work">◆ Deep</span>' : "") +
    (p && p.name.trim().toLowerCase() !== t.title.trim().toLowerCase() ? ' <span class="pj" style="--pc:' + esc(p.color) + '">' + esc(p.name) + "</span>" : "") +
    (!open && withText(t.id) ? ' <span class="wth">' + esc(withText(t.id)) + "</span>" : "") +
    (t.desc && !desc ? '<span class="more"> ⋯</span>' : "") + "</div>" + side +
    (phone ? "" : '<button class="icon-btn" type="button" data-act="edit" aria-label="Edit task">' + icon("more") + "</button>") +
    "</div>" + (open ? timesHTML(c, t, list, form) : "") +
    (desc ? '<textarea class="desc" data-act="desc-input" data-keep="desc-' + t.id + '" placeholder="Details">' + esc(t.desc || "") + "</textarea>" : "") +
    (open || !phone ? chips : "") +
    (open && meetable(t) ? taskMeetHTML(t.id) : "") +
    (form ? logFormHTML(c, t, list) : "") +
    (want ? finishHTML(t, want) : "") +
    (open && !phone && canDish(t) ? dishesHTML(t) : "") +
    (why && open ? '<input class="reason" data-act="reason" data-keep="reason-' + t.id + '" placeholder="Why?" value="' + esc(t.reason || "") + '">' : "") +
    (why && !open && t.reason ? '<p class="why">' + esc(t.reason) + "</p>" : "") +
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

// 三种提醒（电脑今天页右边）：上周成长 / Relax 的时间太少或太多；今明两天谁有生日、该问候谁；这台设备的存储快满了
function noticesHTML(c) {
  let h = "";
  const start = addDays(startOfWeek(c.today, store.prefs().weekStartsOn), -7), end = addDays(start, 6);
  if (store.local().weekSeen !== start && c.tasks.some((t) => t.date >= start && t.date <= end && E.spentMin(t) > 0)) {
    const w = S.weekCheck(c, start, end, store.setting("weekly", {}));
    if (w.warn.length) {
      h += '<div class="note"><p><b>Last week</b> — ' + w.warn.map((x) => "<b>" + fmtMin(x.min) + "</b> " + (x.what === "growth" ? "of growth" : "to relax") + ", " + (x.dir === "low" ? "under" : "over") + " your " + fmtMin(x.limit)).join("; ") + ".</p>" +
        '<button type="button" class="link" data-act="week-seen" data-week="' + start + '">Got it</button></div>';
    }
  }
  // 今天、明天的生日 / 问候 / 关键日子（还没做的）
  const soon = F.comingUp(store.friends(), store.friendSpecial(), c.today, { ahead: 1, back: 0 }, store.occasionDone).groups
    .flatMap((g) => g.items.filter((x) => !x.done).map((x) => (x.friend.name || "Someone") + " — " + g.label + (g.date === c.today ? "" : " tomorrow") + (x.gift ? " 🎁" : "")));
  if (soon.length) h += '<div class="note"><p><b>Friends</b> — ' + soon.map(esc).join("; ") + '.</p><a class="link" href="#friends">Open</a></div>';
  // 灵感池里快到日子、还没排的（7 天以内）
  const ideas = I.soon(store.ideas(), taskOf, c.today);
  if (ideas.length) h += '<div class="note"><p><b>Ideas</b> — ' + ideas.map((i) => esc(i.text + " " + I.whenText(i))).join("; ") + '.</p><button type="button" class="link" data-act="open-ideas">Open</button></div>';
  const use = store.storage();
  if (use.warn) {
    h += '<div class="note warn"><p><b>' + (use.full ? "This device is full." : "Storage on this device runs out in about " + Math.max(1, Math.round(use.daysLeft)) + " days.") + '</b> Archive older tasks to make room.</p><a class="link" href="#settings">Settings → Storage</a></div>';
  }
  return h;
}

// 做完的 Leisure / Friends 任务（能从灵感池里挑的那几个大类）底下：记这一顿吃了什么（电脑）。一家可以记好几道；
// 记下的进 Meals → Boxes 页的 To try，带着任务的名字和日子（只是抄过去的字，和灵感池、和这条任务以后怎么变都没关系）
const dishOpen = new Set();   // 点开了「+ What I had」的任务
const canDish = (t) => (t.status === "done" || t.status === "partial") && GR.ideasOf(store.groupByName(store.groupOf(t)));
function dishesHTML(t) {
  const list = Meal.dishesOf(store.meals(), t.id), id = esc(t.id);
  if (!list.length && !dishOpen.has(t.id)) return '<button type="button" class="link dish-more" data-act="dish-open">+ What I had</button>';
  return '<div class="dish-had"><form class="dish-quick" data-task="' + id + '" autocomplete="off"><span>What did you have?</span>' +
    '<input name="name" data-keep="dishq-name-' + id + '" placeholder="Dish" aria-label="Dish"><input name="note" data-keep="dishq-note-' + id + '" placeholder="Note" aria-label="Note">' +
    '<button class="btn" type="submit">Add</button></form>' +
    (list.length ? '<ul class="dish-got">' + list.map((d) => "<li><b>" + esc(d.name) + "</b>" + (d.note ? "<span>" + esc(d.note) + "</span>" : "") +
      '<button type="button" data-act="dish-x" data-did="' + esc(d.id) + '" aria-label="Remove ' + esc(d.name) + '">×</button></li>').join("") + '</ul><p class="msub">Saved under Meals → Boxes → To try.</p>' : "") + "</div>";
}

// 加任务框选的那个大类能不能从灵感池里挑（Settings → Projects 的 Ideas 一列；默认 Leisure 和 Friends）
const poolFor = (target) => { const g = store.groupByName(store.groupOf(pickTarget(target))); return GR.ideasOf(g) ? g : null; };
const taskOf = (id) => store.get("tasks", id);

// 标题框底下的候选（电脑）：池子里还没排的灵感，打了字就只留对得上的；再加一小段想看的（Reading 的 Want）——只看「多久没联系」的那种大类（Friends）不加。
// 点一条 = 名字填进标题框；灵感那条在任务建好后挂上去
function pickHTML(d, query) {
  const g = poolFor(addTarget[d] || "");
  if (!g) return "";
  const ideas = I.match(store.ideas(), taskOf, store.today(), query);
  const wants = GR.trackOf(g) === "contact" || !store.setting("reading")?.url ? [] : (reading.titleKey(query) ? reading.search(query, 20).filter((r) => r.want) : reading.wants()).slice(0, 4);
  const item = (act, id, text, small, on) => '<li><button type="button" data-act="' + act + '" data-id="' + esc(id) + '" data-t="' + esc(text) + '"' + (on ? ' class="on"' : "") + ">" +
    esc(text) + (small ? "<small>" + esc(small) + "</small>" : "") + "</button></li>";
  return (ideas.length ? "<p>Ideas</p><ul>" + ideas.map((i) => item("idea-pick", i.id, i.text, i.date && i.date < store.today() ? "was " + fmtShort(i.date) : I.whenText(i), ideaDraft[d] === i.id && I.sameText(i.text, query))).join("") + "</ul>" : "") +
    (wants.length ? "<p>Want</p><ul>" + wants.map((r) => item("want-pick", "", r.title, r.tab, false)).join("") + "</ul>" : "");
}

// 加任务；电脑上多两个下拉：怎么重复、重复多久（一键排好整段时间）。◆ Deep = 这是要专心做的（选了计划就跟计划的默认）。
// 名字后面带一段钟点（Reading 14:00-15:10）= 已经做完的，直接记成一条 Done。
// 手机上多一个 Idea 开关：打开后 Add = 记进灵感池（不建任务），回电脑再归类、挑日子
function addHTML(c, d, phone = false) {
  const projects = pickable(c.projects);
  const target = addTarget[d] || "";
  const people = store.groupByName(store.groupOf(pickTarget(target)))?.friends;
  return '<form class="add' + (addOpen === d ? " open" : "") + '" data-add="' + d + '" autocomplete="off">' +
    '<div class="add-main"><input name="title" data-keep="add-title-' + d + '" placeholder="' + (phone || d > c.today ? "Add a task" : "Add a task, or log one: Reading 14:00-15:10") + '" enterkeyhint="done">' +
    '<input name="est" class="min num" data-keep="add-est-' + d + '" type="number" inputmode="numeric" value="30" min="5" step="5" aria-label="Minutes">' +
    '<button class="btn cta" type="submit">Add</button></div>' +
    '<div class="add-more"><select name="project" data-keep="add-plan-' + d + '" aria-label="Project or plan">' + projectOptions(projects, target) + "</select>" +
    (people ? withHTML("add:" + d) : "") +
    '<label class="deep-tog" title="Deep work: focused, one thing at a time"><input type="checkbox" name="deep" data-keep="add-deep-' + d + '"><span>◆ Deep</span></label>' +
    (phone ? '<label class="deep-tog" title="Save it to Ideas instead of adding a task"><input type="checkbox" name="idea" data-keep="add-idea-' + d + '"><span>Idea</span></label>' : '<select name="repeat" aria-label="Repeat"><option value="">Doesn\'t repeat</option><option value="daily">↻ Every day</option>' +
      '<option value="weekdays">↻ Weekdays</option><option value="weekly">↻ Every ' + WEEKDAYS[weekday(d)] + "</option></select>" +
      '<select name="for" aria-label="For how long">' + R.LENGTHS.map(([v, l]) => '<option value="' + v + '"' + (v === R.DEFAULT_LENGTH ? " selected" : "") + ">for " + l + "</option>").join("") + "</select>") +
    "</div>" + (phone ? "" : '<div class="idea-pick" data-idea-pick="' + d + '">' + pickHTML(d, document.querySelector('[data-keep="add-title-' + d + '"]')?.value || "") + "</div>") + "</form>";
}

export function dayParts(c, d) {
  const tasks = store.tasksOn(d);
  const isToday = d === c.today;
  const openId = openOf(c, d, tasks);
  return {
    hero: heroHTML(c, d),
    strip: stripHTML(c, d, tasks),
    bill: isToday ? billHTML(E.yesterdayBill(c)) : "",
    notices: isToday ? noticesHTML(c) : "",
    overdue: isToday ? overdueHTML(c) : "",
    list: '<div class="list" data-list="' + d + '">' + (tasks.length ? tasks.map((t) => rowHTML(c, t, tasks, false, openId)).join("") : E.ghostsOn(c, d).length ? "" : '<div class="empty">No tasks for this day.</div>') + ghostsHTML(c, d) + "</div>",
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
  const openId = openOf(c, d, tasks);
  const days = Array.from({ length: PHONE_SPAN * 2 + 1 }, (_, i) => addDays(c.today, i - PHONE_SPAN));
  const strip = '<nav class="daystrip" aria-label="Days">' + days.map((x) =>
    '<button type="button" class="dpill' + (x === c.today ? " today" : "") + (x === d ? " on" : "") + (x < c.today ? " past" : "") + '" data-act="day-pick" data-date="' + x + '" aria-label="' + fmtDay(x) + '">' +
    "<span>" + WEEKDAYS[weekday(x)].slice(0, 2) + "</span><b>" + Number(x.slice(8)) + "</b>" + dayDot(store.tasksOn(x)) + "</button>").join("") + "</nav>";
  const day = E.daySummary(c, d);
  const { line, done } = lineInfo(c, d);
  const lineText = line > 0 ? (done >= line - 1 ? "Line " + fmtMin(line) + " ✓" : "Line " + fmtMin(line) + " · " + fmtMin(line - done) + " to go") : "";
  const meta = '<div class="stripmeta' + (day.cap > 0 && day.planned > day.cap ? " over" : "") + '"><span>' + Math.round(day.done) + " / " + day.planned + " min done</span><span>" + lineText + "</span></div>";
  const bar = '<div class="strip">' + tasks.map((t) => '<i style="flex-grow:' + Math.max(5, Number(t.est) || 0) + ";" + segStyle(t) + '"></i>').join("") + "</div>";
  const toBuy = shopCount(c);   // 下次采购还剩几样（顶栏的 🛒）
  return '<div class="dayview phone-day" data-date="' + d + '">' +
    '<header class="phead"><div class="l"><h1 data-act="day-today">' + fmtDay(d) + "</h1>" + ballHTML() + "</div>" +
    '<div class="r"><button type="button" class="psync" data-sync-status aria-label="Sync"></button><a class="pread pshop" href="#shop" aria-label="Next shop">' + icon("cart") + (toBuy ? "<span>" + toBuy + "</span>" : "") + '</a><a class="pread pico" href="#ideas" aria-label="Ideas">' + icon("idea") + '</a><a class="pread pico" href="#reading" aria-label="Reading">' + icon("reading") + "</a>" + '<a class="icon-btn pset" href="#settings" aria-label="Settings">' + icon("settings") + "</a></div></header>" + strip +
    (store.local().url ? bar + meta + '<div class="list" data-list="' + d + '">' +
      (tasks.length ? tasks.map((t) => rowHTML(c, t, tasks, true, openId)).join("") : E.ghostsOn(c, d).length ? "" : '<div class="empty">' + (d < c.today ? "Nothing was planned this day." : "Nothing planned yet.") + "</div>") + ghostsHTML(c, d) + "</div>" + addHTML(c, d, true)
      : connectHTML()) + "</div>";
}

export function todayHTML(c, phone) {
  const d = shownDate();
  const x = dayParts(c, d);
  const isToday = d === c.today;
  if (phone) return phoneHTML(c);
  return '<div class="dayview" data-date="' + d + '">' +
    '<header class="page-head"><div><h2>' + fmtDay(d) + " <small>" + (isToday ? "Today" : d < store.today() ? "Looking back" : "Looking ahead") + "</small></h2></div>" +
    '<div class="tools"><button type="button" class="nav" data-act="day-prev" aria-label="Previous day">' + icon("left") + '</button><button type="button" class="nav" data-act="day-today">Today</button><button type="button" class="nav" data-act="day-next" aria-label="Next day">' + icon("right") + "</button></div></header>" +
    '<div class="today-grid"><div class="today-main">' + x.strip + x.list + x.add + "</div>" +
    '<div class="today-side">' + x.hero + x.bill + x.notices + x.overdue + "</div></div></div>";
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
    // 换日子：往后翻列表往左滑，往前翻往右滑
    const go = (d) => { if (d !== shownDate()) animateNext(d > shownDate() ? "next" : "prev"); showDate(d); rerender(); };
    if (act !== "edit" && !act.startsWith("day-")) animateNext();
    if (act === "status") {
      logOpen.delete(id);
      focus = id;   // 标完接着要填原因 / 补时间：这一行展开
      if (store.get("tasks", id)?.status !== el.dataset.s) cheer(el, el.dataset.s);
      store.setStatus(id, el.dataset.s);
    } else if (act === "edit") openTaskEditor(id);
    else if (act === "time-del") store.deleteTime(el.dataset.tid);
    else if (act === "time-more") { logOpen.add(id); rerender(); }
    else if (act === "time-log") logFromRow(el.closest(".row"));
    else if (act === "tomorrow") store.toTomorrow(id);
    else if (act === "dish-open") { dishOpen.add(id); rerender(); requestAnimationFrame(() => setTimeout(() => document.querySelector('.dish-quick[data-task="' + CSS.escape(id) + '"] [name=name]')?.focus(), 0)); }
    else if (act === "dish-x") { const d = store.meals().dish[el.dataset.did]; if (d) store.deleteMeal("dish", d.id, "Removed " + (d.name || "it")); }
    else if (act === "fin-later") { finishing = null; reading.notYet(id); rerender(); }
    else if (act === "fin-mark" || act === "fin-kind") {
      const t = store.get("tasks", id), w = t && reading.wantOf(t.title), tab = readTab(w), v = el.dataset.v;
      if (!tab) return;
      if (act === "fin-mark" && reading.kindsOf(tab).length) { finishing = { taskId: id, mark: v }; rerender(); return; }
      reading.log({ title: w.title, type: tab, year: Number(t.date.slice(0, 4)), month: Number(t.date.slice(5, 7)), mark: act === "fin-kind" ? finishing?.mark || "" : v, kind: act === "fin-kind" ? v : "", note: "" });
      finishing = null;
      toast("Logged " + w.title + " in " + tab);
      rerender();
      sync.sync();
    }
    else if (act === "od-toggle") { overdueOpen = !overdueOpen; rerender(); }
    else if (act === "week-seen") store.setLocal({ weekSeen: el.dataset.week });
    else if (act === "open-ideas") { store.setLocal({ projMode: "ideas" }); location.hash = "projects"; }
    else if (act === "spread") store.spreadOverdue();
    else if (act === "all-today") {
      const c = store.ctx();
      store.moveMany(c.tasks.filter((t) => !t.status && t.date && t.date < c.today && !E.isAutoTask(t)).map((t) => t.id), c.today);
    } else if (act === "day-prev") go(addDays(shownDate(), -1));
    else if (act === "day-next") go(addDays(shownDate(), 1));
    else if (act === "day-today") go(store.today());
    else if (act === "day-pick") go(el.dataset.date);
  });

  // 点任务：还没展开的 → 展开它（今天能计时的同时选中，底部浮条换成它）；已经展开的再点名字 → 展开说明
  on(document, "click", ".dayview .row[data-id]", (e, row) => {
    if (e.target.closest("button, input, textarea, select, label, a, [data-drag-row]")) return;
    const id = row.dataset.id, c = store.ctx();
    if (!row.classList.contains("open")) {
      focus = id;
      if (timeable(store.get("tasks", id), c.today) && pickedId(c) !== id) pick(id);
      animateNext();
      rerender();
      return;
    }
    if (!e.target.closest("[data-act=desc]")) return;
    if (openDesc.has(id)) openDesc.delete(id); else openDesc.add(id);
    animateNext();
    rerender();
  });

  // 加任务框下面那排选项的收放：焦点进了表单就展开；点到 / 焦点走到表单和下拉（.menu，挂在 body 上）之外，或在表单里按 Esc，才收。
  // 以前是看「表单里有没有焦点」，整页重画一丢焦点就猜错（刚选完 Project 就收起来）；现在重画时照 addOpen 画，焦点也还得回去
  const setAddOpen = (d) => {
    if (addOpen === d) return;
    addOpen = d;
    document.querySelectorAll("form.add[data-add]").forEach((f) => f.classList.toggle("open", f.dataset.add === d));
  };
  const addTouched = (e) => {
    const form = e.target.closest?.("form.add[data-add]");
    if (form) setAddOpen(form.dataset.add);
    else if (addOpen && !e.target.closest?.(".menu")) setAddOpen("");
  };
  document.addEventListener("focusin", addTouched);
  document.addEventListener("pointerdown", addTouched, true);
  // 下拉开着的时候 Esc 先被它收走（js/ui/select.js，不往下传），到这里的都是表单自己的
  on(document, "keydown", "form.add[data-add]", (e) => { if (e.key === "Escape" && addOpen) { document.activeElement?.blur?.(); setAddOpen(""); } });

  // 加任务时选了计划：Deep 跟着这个计划的默认；选的大类能选「和谁」就多画那一块
  on(document, "change", ".dayview form[data-add] select[name=project]", (e, el) => {
    const box = el.form.querySelector("[name=deep]");
    if (box) box.checked = store.planDeep(el.value);
    addTarget[el.form.dataset.add] = el.value;
    rerender();
  });

  // 记这一顿吃了什么：回车 / Add = 加一道，接着还能加
  on(document, "submit", ".dish-quick", (e, form) => {
    e.preventDefault();
    const t = store.get("tasks", form.dataset.task);
    if (!t || !form.name.value.trim()) { form.name.focus(); return; }
    const rows = Meal.parseDishes(form.name.value, Object.values(store.meals().dish));
    if (!rows.length) { toast("Already on your To try list"); return; }
    if (rows.length === 1 && !rows[0].note) rows[0].note = form.note.value.trim();
    store.addDishes(rows, { kind: "once", from: t.title, date: t.date, taskId: t.id });
    form.name.value = ""; form.note.value = "";
    form.name.focus();
  });

  // 标题框底下的候选：边打边筛；点一条 = 填进标题框（按下去时不让输入框丢焦点，不然候选先收起来、点不着）
  on(document, "input", '.dayview form[data-add] input[name="title"]', (e, el) => {
    const box = el.form.querySelector("[data-idea-pick]");
    if (box) box.innerHTML = pickHTML(el.form.dataset.add, el.value);
  });
  on(document, "mousedown", ".idea-pick button", (e) => e.preventDefault());
  on(document, "click", ".idea-pick button", (e, el) => {
    const form = el.closest("form"), d = form.dataset.add, input = form.querySelector('input[name="title"]');
    input.value = el.dataset.t;
    ideaDraft[d] = el.dataset.act === "idea-pick" ? el.dataset.id : "";
    el.closest("[data-idea-pick]").innerHTML = pickHTML(d, input.value);
    input.focus();
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
    const fields = { date: form.dataset.add, title, est, ...pickTarget(f.get("project")), deep: f.get("deep") === "on" };
    animateNext();
    const clear = () => {
      const input = document.querySelector('[data-keep="add-title-' + form.dataset.add + '"]');
      if (input) { input.value = ""; input.focus(); }
      const deep = document.querySelector('[data-keep="add-deep-' + form.dataset.add + '"]');
      if (deep) deep.checked = false;
      const plan = document.querySelector('[data-keep="add-plan-' + form.dataset.add + '"]');
      if (plan) plan.value = "";
      addTarget[form.dataset.add] = "";
      ideaDraft[form.dataset.add] = "";
    };
    // 手机上开着 Idea：不建任务，记进灵感池
    if (f.get("idea") === "on") {
      const lines = I.parseLines(String(f.get("title")), I.left(store.ideas(), taskOf, store.today()));
      if (lines.length) store.addIdeas(lines);
      toast(lines.length ? "Saved to Ideas" : "Already in your ideas");
      form.querySelector("[name=idea]").checked = false;
      clear();
      return;
    }
    // 从灵感池挑的那条：标题没再改过，任务建好就挂上去
    const picked = store.ideaOf(ideaDraft[form.dataset.add] || "");
    const fromIdea = (id, name) => { if (id && picked && I.sameText(picked.text, name)) store.pickIdea(picked.id, id); };
    // 选好的「和谁」：任务建好后记到它带的那条记录里
    const people = takeWith("add:" + form.dataset.add);
    const withThem = (id) => { if (id && people.length) store.setTaskMeet(id, { friends: people }); };
    // 「Reading 14:00-15:10」：已经做完的，记成一条 Done（以后的日子不认）
    const log = fields.date <= store.today() ? parseLogLine(String(f.get("title") || "")) : null;
    if (log) {
      focus = store.addLogged({ date: fields.date, title: log.title, projectId: fields.projectId, group: fields.group, deep: fields.deep }, log.from, log.to);
      withThem(focus);
      fromIdea(focus, log.title);
      clear();
      return;
    }
    const how = String(f.get("repeat") || "");
    const id = how ? store.addRepeating(fields, R.daysFor(how, fields.date, est), R.endFor(fields.date, Number(f.get("for")))) : store.addTask(fields);
    if (how) form.querySelector("[name=repeat]").value = "";
    withThem(id);
    if (!how) fromIdea(id, title);
    focus = id;
    if (form.dataset.add === store.today()) { pick(id); rerender(); }   // 加完就选中，底部点 Start 就能开始
    clear();
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
