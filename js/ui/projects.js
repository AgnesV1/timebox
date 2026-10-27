// 项目页。右边一栏是 North star 那段字和 Goals | Ideas（js/ui/goals.js；Ideas = 灵感池，见 js/ui/ideas.js），贴着顶；下面说的都是左边的计划。
// 左边按「项目」分区（项目 = 大类 = 计划的 group），够宽时再分两栏（左 Build、Work，右别的），
// 清单里的大类一直都在（空的也在）；区头 Rename 可以改名、换颜色、并进别的大类。
// 计划只有一种（2026-10-25 起，取代 Total / Regular × Auto / Pool）：名字；固定星期几自己出现，或者拖到哪天（about N a week 只是参考数）；Notes；Pool。
// Pool 是一项项具体的 todo（算的在 js/lists.js、存的在 js/store/lists.js）：做几次、大概多久、每周、步骤、备注、分区、Later。
// 某天 = 这个计划一行（整块计时），拖进来的项是它下面的便条。
// 固定星期几、Pool 里又没东西的（循环小事）不单独给卡：区头下面一行小字，点开是它的编辑框。
// 每张卡头上有 Archive：归档的折进区头右边的「3 archived」，点开在这个区里展开，卡上是 Restore。
// 每个大类看什么不一样（groups.js 的 trackOf，Settings 里能改）：
//   看进度的（Build）：区头一根条 = 各计划 Pool 里做了几次 / 一共几次；
//   看钟点 / Relax / 联系的（Fitness / Leisure / Friends）：区头一句话（最近 7 天多少、多久没联系），不达标是红的，加最近 14 天的方块；
//   不看的（Work / Chores）：只列计划。
// 卡片（她 2026-10-25 挑的样子）：怎么出现 · 起止和第几天 · 花了多少；这周每项做了几次（有每周量的）；Pool 还剩几次 · 几项 Later。
// 编辑框：项目、名字、怎么出现、颜色、Notes、Pool（按分区列，点一项展开改），右上角 Copy as text / Paste text（粘贴整份，先看认出了什么）。

import * as store from "../store.js";
import * as E from "../engine.js";
import * as R from "../routines.js";
import * as S from "../stats.js";
import * as GR from "../groups.js";
import * as G from "../goals.js";
import * as L from "../lists.js";
import * as PT from "../plantext.js";
import { esc, on, icon } from "../dom.js";
import { diffDays, fmtShort, fmtHours, startOfMonth, WEEKDAYS } from "../dates.js";
import { groupsOf, chainHTML, toast } from "./common.js";
import { openModal, closeModal, modalSheet, fillingDate } from "./modal.js";
import { goalsHTML } from "./goals.js";

let editing = "";
let draft = null;      // 新建时还没存的：{ group, name, place, color, rule, notes, start, deadline }
const openArchived = new Set();   // 哪些大类的归档展开着（大类的名字）
let renaming = null;   // 正在改名的项目（group 名字）
let serveMore = false; // 编辑框的 Serves 里，之后几年和 North star 的目标也列出来
let openItem = "";     // 编辑框 Pool 里展开着的那一项
let notesOpen = false; // Notes 展开着
let paste = null;      // 粘贴整份：{ text, later: { 分区名: 她点过的 Later } }
let gone = [];         // 粘回来以后新文字里没有的旧项 [{ id, title, used }]

const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0);
const weekStart = () => store.prefs().weekStartsOn;
const timesText = (n) => (n === 0 ? "Any" : n === 1 ? "Once" : "×" + n);
// 卡片上「这周」那一行用的短名字：有代号（L3）用代号，没有就截一截
const shortOf = (title) => /^([A-Z]{1,3}\d{1,2})(?!\w)/.exec(title)?.[1] || (title.length > 16 ? title.slice(0, 15) + "…" : title);

// 卡头最右边那个淡的小字：在用的是 Archive，归档里的是 Restore
const archBtn = (p) => '<button type="button" class="p-arch" data-act="archive-plan">' + (E.isActive(p) ? "Archive" : "Restore") + "</button>";

// 「Oct 26 – Dec 4 · day 4 of 40」：还没开始写哪天开始，过了写 ended
function datesText(p, today) {
  if (!p.start || !p.deadline || p.deadline < p.start) return "";
  const n = diffDays(p.start, today) + 1, m = diffDays(p.start, p.deadline) + 1;
  return fmtShort(p.start) + " – " + fmtShort(p.deadline) + " · " + (n < 1 ? "starts " + fmtShort(p.start) : n > m ? "ended" : "day " + n + " of " + m);
}

// 固定星期几、每周几次的计划这一周的方块（和区头 14 天方块同一种）
const weekSquares = (w) => '<div class="pweek" title="This week">' + Array.from({ length: w.target }, (_, k) => '<i class="' + (k < w.done ? "d" : k < w.placed ? "s" : "") + '"></i>').join("") +
  '<span class="num">' + w.done + "/" + w.target + " this week</span></div>";

function cardHTML(c, p, track) {
  const r = R.ruleOf(p), auto = E.isAuto(p);
  const st = L.itemsOf(c, p.id).slice().sort(byOrder).map((i) => L.stateOf(c, i));
  const ts = E.tasksOfProject(c, p.id);
  const when = auto ? "↻ " + R.describe(r, weekStart()) + (r.end ? " until " + fmtShort(r.end) : "") : Number(r.perWeek) > 0 ? "About " + Number(r.perWeek) + " a week" : "Drag it when you like";
  let lines;
  if (st.length) {
    const spent = ts.reduce((a, t) => a + E.spentMin(t), 0), tot = L.poolTotals(c, p);
    const week = st.filter((x) => !x.cfg.later && x.cfg.perWeek > 0).map((x) => esc(shortOf(x.item.title)) + " <b>" + x.week.done + "/" + x.cfg.perWeek + "</b>");
    lines = [
      [when, datesText(p, c.today), spent ? "<b>" + fmtHours(spent) + "</b> so far" : ""].filter(Boolean).join(" · "),
      week.length ? "This week · " + week.join(" · ") : "",
      "Pool " + (tot.times ? "<b>" + tot.times + "</b> left" : tot.items ? "<b>" + tot.items + "</b> to pick from" : "all done") + (tot.later ? " · " + tot.later + " later" : "")
    ];
  } else {
    const from = startOfMonth(c.today);
    const month = ts.filter((t) => t.date >= from && t.date <= c.today && (E.spentMin(t) > 0 || t.status === "done"));
    const days = new Set(month.map((t) => t.date)).size, hours = month.reduce((a, t) => a + E.spentMin(t), 0);
    lines = [[when, datesText(p, c.today), days ? "<b>" + days + "</b> time" + (days > 1 ? "s" : "") + " this month" : "", hours ? "<b>" + fmtHours(hours) + "</b>" : ""].filter(Boolean).join(" · ")];   // Pool 空着就不提（她说没加就空着）
  }
  const w = !st.length && track !== "" ? E.regularWeek(c, p) : null;
  return '<article class="pcard" data-project="' + p.id + '" style="--pc:' + esc(p.color) + '">' +
    '<header><button type="button" class="pname" data-act="edit-project"><i></i>' + esc(p.name || "Untitled") + "</button>" + archBtn(p) + "</header>" +
    lines.filter(Boolean).map((l) => '<p class="ls-l">' + l + "</p>").join("") + (w && w.target ? weekSquares(w) : "") + "</article>";
}

// 大类看的是什么（没存过的名字、哪都没归的计划照旧看进度）
const trackFor = (name) => (name ? GR.trackOf(store.groupByName(name) || { name }) : "progress");
// 最近一次和谁联系过（任何人）
const lastContactDate = () => Object.values(store.lastContact()).sort().pop() || "";
const healthOf = (c, g, last) => S.groupHealth(c, g, { weekly: store.setting("weekly", {}), lastContact: last });
// 有几个大类不达标（侧栏 Projects 上的角标）
export function projectAlerts(c) {
  const last = lastContactDate();
  return store.groups().filter((g) => { const h = healthOf(c, g, last); return h && h.level !== "ok"; }).length;
}

// 不看进度的大类头上那一句：最近 7 天做够没有 / Relax 在不在范围里 / 多久没联系了。不达标是红的，后面淡字写着标准
function groupHealthHTML(c, name, last) {
  const g = store.groupByName(name), h = g ? healthOf(c, g, last) : null;
  if (!h) return "";
  const ok = h.level === "ok";
  let text, aim;
  if (h.kind === "contact") {
    text = h.days === null ? "No catch-up yet" : !ok ? "No catch-up in " + h.days + " days" : "Last catch-up " + (h.days === 0 ? "today" : h.days === 1 ? "yesterday" : h.days + " days ago");
    aim = "at least one every 2 weeks";
  } else if (h.kind === "min") {
    text = fmtHours(h.min) + " in the last 7 days" + (ok ? "" : " · under " + fmtHours(h.limit));
    aim = "at least " + fmtHours(h.limit) + " a week";
  } else {
    text = fmtHours(h.min) + " to relax in the last 7 days" + (h.level === "low" ? " · under " + fmtHours(h.lo) : h.level === "high" ? " · over " + fmtHours(h.hi) : "");
    aim = h.lo && h.hi ? fmtHours(h.lo) + "–" + fmtHours(h.hi) + " a week" : h.lo ? "at least " + fmtHours(h.lo) + " a week" : h.hi ? "at most " + fmtHours(h.hi) + " a week" : "";
  }
  return '<p class="ghealth"><span class="health h-' + (ok ? "safe" : "danger") + '">' + (ok ? "✓ " : "! ") + esc(text) + "</span>" + (aim ? "<span>" + esc(aim) + "</span>" : "") + "</p>";
}

// 最近 14 天一天一格（stats.js 的 groupDays），和「这周几次」同一种方框：实心 = 那天做了，描边 = 有安排没做，灰底 = 没有。
// 前 7 格和后 7 格之间留一道缝（css），右边那 7 格就是上面那句话说的「最近 7 天」。Friends 记下的 catch-up 那天也算做了
const DAY_WORD = { done: "done", open: "planned" };
function groupDaysHTML(c, name, track) {
  const g = store.groupByName(name);
  if (!g || !track || track === "progress") return "";
  const days = S.groupDays(c, g, 14, track === "contact" ? store.meets().map((m) => m.date) : []);
  return '<div class="pweek g-days" style="--pc:' + esc(g.color || "var(--c-None)") + '">' +
    days.map((d) => '<i class="' + (d.state === "done" ? "d" : d.state === "open" ? "s" : "") + '" title="' + fmtShort(d.date) + (d.state ? " · " + DAY_WORD[d.state] : "") + '"></i>').join("") +
    "<span>last 14 days</span></div>";
}

// 循环小事那一行：名字 + 怎么重复，点开是计划的编辑框（停掉、改星期几都在那儿）
function repsHTML(reps) {
  if (!reps.length) return "";
  return '<p class="g-reps">' + reps.map((p) => '<button type="button" class="g-rep" data-project="' + p.id + '" data-act="edit-project">↻ ' + esc(p.name || "Untitled") +
    " <small>" + esc(R.describe(R.ruleOf(p), weekStart())) + "</small></button>").join("") + "</p>";
}

// 改名的那一排：名字、颜色、并进别的大类、（空的）拿掉
function renameHTML(name, empty) {
  const g = store.groupByName(name);
  return '<input class="rename" data-rename="' + esc(name) + '" data-keep="rename-group" value="' + esc(name) + '" aria-label="Project name">' +
    (g ? '<span class="swatches small" data-gcolor>' + store.PROJECT_COLORS.map((col) => '<label><input type="radio" name="gcolor" value="' + col + '"' + (g.color === col ? " checked" : "") + '><i style="background:' + col + '"></i></label>').join("") + "</span>" : "") +
    '<select data-gmove aria-label="Move everything into another project"><option value="">Move into…</option>' + store.groups().filter((x) => x.name !== name).map((x) => '<option value="' + esc(x.name) + '" data-color="' + esc(x.color) + '">' + esc(x.name) + "</option>").join("") + "</select>" +
    (g && empty ? '<button type="button" class="link" data-act="remove-group">Remove</button>' : "") +
    '<button type="button" class="btn" data-act="rename-done">Done</button>';
}

// 一个大类（一组计划）的头：几个计划；看进度的再加一根条 = 这些计划 Pool 里做了几次 / 一共几次（Later、Any 的不算）；别的见 groupHealthHTML。
// subs = 在用的、有卡的那些；more = { reps 循环小事几条, gone 归档了几个, shown 归档展开着没有 }
function groupHead(c, name, subs, empty, track, last, more = {}) {
  const progress = track === "progress";
  let n = 0, done = 0;
  if (progress) {
    for (const p of subs) for (const i of L.itemsOf(c, p.id)) {
      const s = L.stateOf(c, i);
      if (s.cfg.later || !(s.cfg.n > 0)) continue;
      n += s.cfg.n;
      done += Math.min(s.count.done, s.cfg.n);
    }
  }
  const pct = n ? Math.round((done / n) * 100) : 0;
  const editingName = renaming === name && name;
  const color = store.groupByName(name)?.color;
  const title = editingName ? renameHTML(name, empty) : "<h3>" + (color ? '<i class="gdot" style="background:' + esc(color) + '"></i>' : "") + esc(name || "No project") + "</h3>";
  const meta = [subs.length ? subs.length + " plan" + (subs.length > 1 ? "s" : "") : more.reps ? "" : "No plans yet", n ? pct + "% of the pool done" : ""].filter(Boolean).join(" · ");
  return '<header class="pg-top' + (editingName ? " editing" : "") + '">' + title + (editingName ? "" : '<span class="pg-meta">' + esc(meta) + "</span>" +
    '<span class="pg-actions">' + (more.gone ? '<button type="button" class="btn ghosty" data-act="toggle-archived" aria-expanded="' + Boolean(more.shown) + '">' + more.gone + " archived</button>" : "") +
    (name ? '<button type="button" class="btn ghosty" data-act="rename-group">Rename</button>' : "") +
    '<button type="button" class="btn" data-act="new-sub">' + icon("plus") + " Plan</button></span>") + "</header>" +
    (progress ? (n ? '<div class="gbar"><i style="width:' + pct + '%"></i></div>' : "") : groupHealthHTML(c, name, last) + groupDaysHTML(c, name, track));
}

// 循环小事 = 固定星期几、Pool 里又没东西的
const isRep = (c, p) => E.isRepeat(p) && !L.itemsOf(c, p.id).length;

// 页头：标题和「+ New plan」。下面两栏：左边是各个项目（.pj-plans），右边一栏是 North star、Goals | Ideas（js/ui/goals.js），滚的时候贴着顶
export function projectsHTML(c) {
  const groups = groupsOf(c.projects, { all: true });
  const last = lastContactDate();
  return '<div class="projects"><header class="page-head"><div><h2>Projects</h2></div>' +
    '<div class="tools"><button type="button" class="btn cta" data-act="new-project">' + icon("plus") + " New plan</button></div></header>" +
    '<div class="pj-wrap"><div class="pj-plans">' +
    (c.projects.length ? "" : '<p class="hint pintro">A project is an area of your life. Tasks can sit right on it, or under a plan inside it: a plan is one row on a day, timed as a whole, with a pool of things you drag in when you like.</p>') +
    columns(groups.map((g) => {
      const track = trackFor(g.name);
      const live = g.subs.filter(E.isActive), old = g.subs.filter((p) => !E.isActive(p));
      const cards = live.filter((p) => !isRep(c, p)), reps = live.filter((p) => isRep(c, p));
      const shown = openArchived.has(g.name) && old.length > 0;
      return { name: g.name, html: '<section class="pgroup" data-group="' + esc(g.name) + '">' + groupHead(c, g.name, cards, !g.subs.length, track, last, { reps: reps.length, gone: old.length, shown }) +
        repsHTML(reps) +
        (cards.length ? '<div class="pgrid">' + cards.map((p) => cardHTML(c, p, track)).join("") + "</div>" : "") +
        (shown ? '<div class="pgrid closed">' + old.map((p) => cardHTML(c, p, track)).join("") + "</div>" : "") + "</section>" };
    })) + "</div>" + goalsHTML(c) + "</div></div>";
}

// 项目那一块再分两栏（之前定的）：左边宽的是 Build、Work（GR.ORDER 的前两个），右边窄的是别的（一句话 + 14 天方块的那种）。
// 这一块不够宽（css 里的 container query，按 .pj-plans 自己的宽度）就按顺序一栏排下来；左边一个都没有就只有一栏
function columns(list) {
  const main = new Set(GR.ORDER.slice(0, 2));
  const left = list.filter((x) => main.has(x.name)), right = list.filter((x) => !main.has(x.name));
  if (!left.length || !right.length) return list.map((x) => x.html).join("");
  return '<div class="pj-cols"><div class="pj-main">' + left.map((x) => x.html).join("") + '</div><div class="pj-side">' + right.map((x) => x.html).join("") + "</div></div>";
}

// ---------- 编辑框 ----------

const weekOrder = () => (weekStart() === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]);

function seg(name, value, options) {
  return '<span class="seg">' + options.map(([v, l]) => '<button type="button" data-act="' + name + '" data-v="' + v + '"' + (value === v ? ' class="on"' : "") + ">" + l + "</button>").join("") + "</span>";
}

// 固定星期几：一周七天各几分钟、开始 / 结束（= 以前的 Regular Auto，那天自己出现）
function daysFields(p) {
  const r = R.ruleOf(p);
  return '<div class="field"><span>Minutes on each day — empty = not that day</span><div class="weekly">' + weekOrder().map((d) =>
    "<label><b>" + WEEKDAYS[d] + '</b><input class="num" type="number" min="0" step="5" data-rday="' + d + '" value="' + (Number(r.days[d]) > 0 ? Number(r.days[d]) : "") + '"></label>').join("") + "</div></div>" +
    '<div class="field-row"><label class="field"><span>Starts</span><input type="date" data-rf="start" value="' + esc(r.start || "") + '"></label>' +
    '<label class="field"><span>Ends (empty = keeps going)</span><input type="date" data-rf="end" value="' + esc(r.end || "") + '"></label></div>';
}

// 拖到哪天的：about N a week（只是参考数，卡片和 Pool 里显示这周几次）、起止（卡片上写第几天）
function dragFields(p) {
  const r = R.ruleOf(p);
  return '<div class="field-row three"><label class="field"><span>About … a week</span><input class="num" type="number" min="0" max="21" data-rf="perWeek" value="' + (Number(r.perWeek) > 0 ? Number(r.perWeek) : "") + '" placeholder="—"></label>' +
    '<label class="field"><span>From (optional)</span><input type="date" data-pf="start" value="' + esc(p.start || "") + '"></label>' +
    '<label class="field"><span>To (optional)</span><input type="date" data-pf="deadline" value="' + esc(p.deadline || "") + '"></label></div>';
}

// Notes：平时收成一行（第一句 · 多少字），点开是大框；阶段、规则、标准流程都放这儿，做那一项时在今天页点开能看
function notesHTML(p) {
  const text = String((p.id ? p.rule?.notes : p.notes) || "");
  if (!notesOpen) {
    const first = text.split("\n").map((s) => s.replace(/^[#>*\-+|\s\d.]+/, "").trim()).find(Boolean) || "";
    return '<button type="button" class="ls-notes" data-act="notes-open">▸ Notes' + (text ? " · " + esc(first.slice(0, 80)) + " · " + text.length.toLocaleString("en-US") + " characters" : " — phases, rules, how you do things") + "</button>";
  }
  return '<label class="field"><span>Notes — phases, rules, how you do things</span><textarea data-pnotes data-keep="pnotes-' + esc(p.id || "new") + '" rows="' + (text ? 10 : 4) + '">' + esc(text) + "</textarea></label>";
}

// Pool 一行的第四格：做了几次 / 每周 / 几步
function extraText(x) {
  return [x.cfg.n > 1 && x.count.done ? x.count.done + "/" + x.cfg.n : "", x.cfg.perWeek ? "about " + x.cfg.perWeek + "/wk" : "", x.cfg.steps.length ? x.cfg.steps.length + " steps" : ""].filter(Boolean).join(" · ");
}

function itemRowHTML(x) {
  return '<div class="ls-it' + (x.cfg.later ? " later" : "") + '" data-item="' + esc(x.item.id) + '" data-act="item-open" role="button" tabindex="0">' +
    '<span class="ls-nm">' + esc(x.item.title) + (x.cfg.note ? '<span class="ls-nt">' + esc(x.cfg.note) + "</span>" : "") + "</span>" +
    '<span class="ls-n">' + L.sizeOf(x.item.est) + '</span><span class="ls-n">' + timesText(x.cfg.n) + '</span><span class="ls-n">' + esc(extraText(x)) + "</span></div>";
}

// 点开的那一项：同一排换成输入框（名字、大概分钟、几次、每周），下面是步骤和备注
function itemOpenHTML(x) {
  const id = esc(x.item.id), steps = x.cfg.steps.map((s) => s.t + (Number(s.min) > 0 ? " · " + PT.fmtDur(s.min) : "")).join("\n");
  const used = x.count.done ? x.count.done + " done" + (x.count.open ? " · " + x.count.open + " on a day" : "") : x.count.open ? x.count.open + " on a day" : "Not started";
  return '<div class="ls-it open" data-item="' + id + '"><input data-lf="title" value="' + esc(x.item.title) + '" aria-label="Name">' +
    '<input class="num" type="number" min="0" step="5" data-lf="est" value="' + (Number(x.item.est) || "") + '" placeholder="min" aria-label="About how many minutes">' +
    '<input data-lf="n" value="' + (x.cfg.n === 1 ? "" : x.cfg.n === 0 ? "any" : x.cfg.n) + '" placeholder="Once" aria-label="How many times: a number, or any">' +
    '<input class="num" type="number" min="0" max="21" data-lf="perWeek" value="' + (x.cfg.perWeek || "") + '" placeholder="— /wk" aria-label="About how many a week"></div>' +
    '<div class="ls-ex" data-item="' + id + '"><label class="field"><span>Steps — one per line</span><textarea data-lf="steps" rows="' + Math.max(3, x.cfg.steps.length) + '" placeholder="Listening set · 35min">' + esc(steps) + "</textarea></label>" +
    '<label class="field"><span>Note</span><textarea data-lf="note" rows="3">' + esc(x.cfg.note) + "</textarea></label>" +
    '<div class="ls-exf"><label class="field"><span>Section</span><input data-lf="module" value="' + esc(x.item.module || "") + '" list="ls-secs"></label>' +
    '<span class="hint">' + used + '</span><button type="button" class="chip' + (x.cfg.later ? " on" : "") + '" data-act="item-later" aria-pressed="' + x.cfg.later + '">' + (x.cfg.later ? "Later ✓" : "Later") + "</button>" +
    '<button type="button" class="btn ghosty" data-act="item-close">Close</button>' +
    '<button type="button" class="btn danger" data-act="item-del">' + icon("trash") + " Delete</button></div></div>";
}

// 粘回来以后新文字里没有的旧项：留着、放 Later、或者删掉（做过的不能删）
function goneHTML() {
  if (!gone.length) return "";
  return '<div class="ls-gone"><p><b>Not in the pasted text any more.</b> Keep them, put them away for later, or delete the ones never used.</p>' +
    gone.map((g) => '<div class="r"><span>' + esc(g.title) + (g.used ? " <small>used</small>" : "") + '</span><span><button type="button" class="chip" data-act="gone-keep" data-id="' + esc(g.id) + '">Keep</button> ' +
      '<button type="button" class="chip" data-act="gone-later" data-id="' + esc(g.id) + '">Later</button>' + (g.used ? "" : ' <button type="button" class="chip" data-act="gone-del" data-id="' + esc(g.id) + '">Delete</button>') + "</span></div>").join("") + "</div>";
}

// Pool：按分区列（分区头有 Later），一行 名字 · 大概多久 · 几次 · 做了几次 / 每周 / 几步，点一行展开改
function poolEditHTML(c, p) {
  const st = L.itemsOf(c, p.id).slice().sort(byOrder).map((i) => L.stateOf(c, i));
  let h = goneHTML();
  if (!st.length) return h + '<div class="ls-ph">Pool <small>empty</small></div><p class="hint">With nothing in the pool, the plan is just one row on the day you drag it to. Add things below, or Paste text.</p>';
  const live = st.filter((x) => !x.cfg.later), later = st.length - live.length;
  const times = live.reduce((a, x) => a + (x.cfg.n > 0 ? x.cfg.n : 0), 0);
  const min = live.reduce((a, x) => a + (Number(x.item.est) || 0) * (x.cfg.n > 0 ? x.cfg.n : 1), 0);
  h += '<div class="ls-ph">Pool <small>' + [live.length + " item" + (live.length === 1 ? "" : "s"), times ? times + " times" : "", min ? "≈" + fmtHours(min) : "", later ? later + " later" : ""].filter(Boolean).join(" · ") + "</small></div>";
  const secs = [];
  for (const x of st) {
    const k = x.item.module || "";
    let s = secs.find((y) => y.name === k);
    if (!s) secs.push((s = { name: k, list: [] }));
    s.list.push(x);
  }
  // 只有一个没名字的分区：不写分区头（Later 在展开的那一项里点）
  const heads = secs.length > 1 || secs[0].name;
  for (const s of secs) {
    const off = s.list.every((x) => x.cfg.later);
    if (heads) h += '<div class="ls-sec"><span>' + esc(s.name || "No section") + '</span><button type="button" class="chip' + (off ? " on" : "") + '" data-act="sec-later" data-sec="' + esc(s.name) + '" aria-pressed="' + off + '">' + (off ? "Later ✓" : "Later") + "</button></div>";
    h += s.list.map((x) => (openItem === x.item.id ? itemOpenHTML(x) : itemRowHTML(x))).join("");
  }
  return h;
}

// 一行一条加进 Pool（和粘贴同一套写法），缩进的是上一条的步骤
function addLinesHTML(c, p) {
  const secs = [...new Set(L.itemsOf(c, p.id).map((i) => i.module || "").filter(Boolean))];
  return '<form class="ls-add" autocomplete="off"><textarea name="lines" rows="2" data-keep="ls-add-' + esc(p.id) + '" placeholder="One per line — L5 shadowing · 20min · ×18&#10;  steps go indented underneath"></textarea>' +
    '<div class="ls-addr"><input name="section" list="ls-secs" data-keep="ls-sec-' + esc(p.id) + '" placeholder="Section (optional)" aria-label="Section"><button type="submit" class="btn cta">' + icon("plus") + " Add to the pool</button></div>" +
    '<datalist id="ls-secs">' + secs.map((s) => '<option value="' + esc(s) + '">').join("") + "</datalist></form>";
}

// ---------- 粘贴整份 ----------

const pvRow = (a, b) => '<div class="r"><span>' + a + "</span><span>" + b + "</span></div>";
// 分区要不要 Later：她点过的按她的，没点过的按认出来的（写着储备 / reserve 的先算 Later）
const laterMap = (parsed) => Object.fromEntries(parsed.sections.map((s) => [s.name, s.name in paste.later ? paste.later[s.name] : Boolean(s.later)]));

function pastePreviewHTML(c, p) {
  const cancel = '<button type="button" class="btn ghosty" data-act="paste-cancel">Cancel</button>';
  if (!String(paste.text || "").trim()) return '<p class="hint">Nothing pasted yet.</p><div class="sheet-foot">' + cancel + "<span></span></div>";
  const parsed = PT.parse(paste.text), later = laterMap(parsed);
  parsed.sections.forEach((s) => { s.later = later[s.name]; });
  if (!parsed.sections.length) return '<p class="hint">No items found yet — each item is a line starting with <b>- [ ]</b>.</p><div class="sheet-foot">' + cancel + "<span></span></div>";
  const sum = PT.summary(parsed);
  const heads = (parsed.notes.match(/^##\s+.+$/gm) || []).map((h) => h.replace(/^##\s+/, "").split(/[：:（(]/)[0].trim());
  let h = "<h4>We found</h4>";
  if (parsed.name || parsed.start) h += pvRow(parsed.start ? "Plan · dates" : "Plan", esc([parsed.name, parsed.start && parsed.end ? fmtShort(parsed.start) + " – " + fmtShort(parsed.end) : ""].filter(Boolean).join(" · ")));
  for (const s of sum.sections) {
    h += '<div class="r"><span>' + esc(s.name || "Pool") + " · " + s.count + "</span><span>" + [s.times ? s.times + " times" : "", s.steps ? s.steps + " steps" : "", s.min ? fmtHours(s.min) : ""].filter(Boolean).join(" · ") +
      ' <button type="button" class="chip' + (s.later ? " on" : "") + '" data-act="paste-later" data-sec="' + esc(s.name) + '" aria-pressed="' + s.later + '">' + (s.later ? "Later ✓" : "Later") + "</button></span></div>";
  }
  if (parsed.notes) h += pvRow("Kept as notes", esc(heads.length ? heads.join(" · ") : parsed.notes.split("\n").length + " lines"));
  if (p.id) {
    const m = PT.match(parsed.sections.flatMap((s) => s.items), L.itemsOf(c, p.id).map((i) => ({ id: i.id, title: i.title })));
    h += pvRow("Against this plan", m.pairs.length + " matched · " + m.added.length + " new · " + m.gone.length + " not in the text");
  }
  h += '<div class="r tot"><span>≈' + fmtHours(sum.min) + (sum.later ? " + " + fmtHours(sum.later) + " later" : "") + "</span><span></span></div>";
  return h + '<div class="sheet-foot">' + cancel + '<button type="button" class="btn cta" data-act="paste-go">' + (p.id ? "Update plan" : "Create plan") + "</button></div>";
}

function pasteHTML(c, p) {
  return '<div class="ls-paste"><label class="field"><span>Paste the whole plan — ## sections, - [ ] items · 30min · ×11, steps indented underneath</span>' +
    '<textarea data-paste data-keep="ls-paste" placeholder="# My plan&#10;&#10;## Pool&#10;- [ ] L3 listening set · 2h · ×11&#10;- [ ] Mock test · ×5&#10;  - [ ] Listening · 35min">' + esc(paste.text || "") + "</textarea></label>" +
    '<div class="ls-pv" data-paste-pv>' + pastePreviewHTML(c, p) + "</div></div>";
}

// ---------- 编辑框本身 ----------

// 为哪些目标服务（目标板那边的连线也能拖着连，见 js/ui/links.js）：近期的目标（这个月、这个季度、下个季度、今年）做成小签，点一下连上 / 断开；
// 「More goals」再列出之后几年和 North star 的（已经连着的一直在）。下面一行是现在的链条——计划自己一个都没连的，用它所在项目连着的
function servesHTML(p) {
  const goals = store.goals();
  if (!goals.length) return "";
  const ref = G.planRef(p.id), cols = G.board(goals, store.today()).cols;
  const linked = (g) => Array.isArray(g.by) && g.by.includes(ref);
  const list = cols.flatMap((col) => col.items.filter((x) => (!x.done && (!col.far || serveMore)) || linked(x.goal)).map((x) => x.goal));
  const more = cols.some((col) => col.far && col.items.some((x) => !x.done && !linked(x.goal)));
  const own = goals.some(linked), heir = !own && p.group ? G.servedBy(goals, G.groupRef(p.group)) : [];
  return '<div class="field serves"><span>Serves</span><div class="chips schips">' +
    list.map((g) => '<button type="button" class="chip' + (linked(g) ? " on" : "") + '" data-act="serve" data-goal="' + esc(g.id) + '" aria-pressed="' + linked(g) + '" title="' + esc(g.text) + '">' + (g.span === "north" ? "✦ " : "") + esc(g.text) + "</button>").join("") +
    (more || serveMore ? '<button type="button" class="chip ghost" data-act="serve-more">' + (serveMore ? "Fewer" : "More goals") + "</button>" : "") + "</div>" +
    (heir.length ? '<p class="hint">None picked, so it serves what <b>' + esc(p.group) + "</b> serves.</p>" : "") +
    chainHTML({ planId: p.id, group: p.group, head: { name: p.name || "Untitled", color: p.color }, max: 3 }) + "</div>";
}

const deepHTML = (p, isNew) => '<label class="check deepdef"><input type="checkbox" data-pdeep' + (p.rule?.deep ? " checked" : "") + "> <span>◆ Deep work by default <small>" +
  (isNew ? "Tasks from this plan start out marked Deep." : "Marks every task of this plan, earlier ones too. Single tasks can still be changed.") + "</small></span></label>";

function editorHTML(p) {
  const c = store.ctx(), isNew = !p.id, auto = E.isAuto(p);
  const groups = store.groups().map((g) => g.name);
  let h = '<div class="project-editor" data-pid="' + (p.id || "") + '"><div class="ls-hd"><h2 class="sheet-title">' + (isNew ? "New plan" : "Edit plan") + "</h2>" +
    (isNew ? "" : '<button type="button" class="btn" data-act="plan-copy">Copy as text</button>') +
    '<button type="button" class="btn' + (paste ? " on" : "") + '" data-act="paste-open" aria-pressed="' + Boolean(paste) + '">Paste text</button></div>';
  if (paste) return h + pasteHTML(c, p) + "</div>";
  h += '<div class="field-row"><label class="field"><span>Project</span><input data-pf="group" list="groups" value="' + esc(p.group || "") + '" placeholder="Build, Fitness…"><datalist id="groups">' + groups.map((g) => '<option value="' + esc(g) + '">').join("") + "</datalist></label>" +
    '<label class="field"><span>Plan</span><input data-pf="name" value="' + esc(p.name || "") + '" placeholder="IELTS, Swimming…"></label></div>' +
    '<div class="field"><span>Shows up</span>' + seg("pplace", auto ? "auto" : "pool", [["pool", "When I drag it"], ["auto", "On set days"]]) + "</div>" +
    (auto ? daysFields(p) : dragFields(p)) +
    '<div class="field"><span>Color</span><div class="swatches">' + store.PROJECT_COLORS.map((col) => '<label><input type="radio" name="pcolor" data-pf="color" value="' + col + '"' + (p.color === col ? " checked" : "") + '><i style="background:' + col + '"></i></label>').join("") + "</div></div>" +
    notesHTML(p);
  if (isNew) return h + deepHTML(p, true) + '<div class="sheet-foot"><span></span><button type="button" class="btn cta" data-act="create-project">Create</button></div></div>';
  h += poolEditHTML(c, p) + addLinesHTML(c, p) + servesHTML(p) +
    '<div class="field"><span>Status</span><div class="seg">' + [["active", "Active"], ["done", "Done"], ["dropped", "Dropped"]].map(([v, l]) => '<button type="button" data-act="pstatus" data-v="' + v + '"' + ((p.status || "active") === v ? ' class="on"' : "") + ">" + l + "</button>").join("") + "</div></div>" +
    deepHTML(p, false) +
    '<div class="sheet-foot"><button type="button" class="btn danger" data-act="del-project">' + icon("trash") + ' Delete plan</button><button type="button" class="btn primary" data-modal-close>Done</button></div>';
  return h + "</div>";
}

// 新建时可以带上它属于哪个项目；focus 指定先让光标落在哪个框
export function openProjectEditor(id, { group = "", focus = "" } = {}) {
  editing = id || "";
  openItem = "";
  notesOpen = false;
  paste = null;
  gone = [];
  draft = id ? null : { group, name: "", place: "pool", color: store.groupByName(group)?.color || store.PROJECT_COLORS[store.all("projects").length % store.PROJECT_COLORS.length], rule: { start: store.today() }, notes: "", start: "", deadline: "" };
  const p = id ? store.get("projects", id) : draft;
  const sheet = openModal(editorHTML(p), { wide: true, close: () => { editing = ""; draft = null; paste = null; gone = []; openItem = ""; } });
  if (!id) sheet.querySelector('[data-pf="' + (focus || (group ? "name" : "group")) + '"]')?.focus();
}

const readDays = (box) => {
  const days = [0, 0, 0, 0, 0, 0, 0];
  box.querySelectorAll("[data-rday]").forEach((el) => { days[Number(el.dataset.rday)] = Math.max(0, Math.round(Number(el.value) || 0)); });
  return days;
};

// 新建框里已经填了的值收进 draft（换显示方式、开粘贴要重画时不丢）
function readDraft(box) {
  if (!draft || !box) return;
  box.querySelectorAll("[data-pf]").forEach((el) => {
    if (el.type === "radio") { if (el.checked) draft.color = el.value; }
    else draft[el.dataset.pf] = el.value;
  });
  draft.rule = { ...(draft.rule || {}) };
  box.querySelectorAll("[data-rf]").forEach((el) => { draft.rule[el.dataset.rf] = el.value; });
  if (box.querySelector("[data-rday]")) draft.rule.days = readDays(box);
  draft.rule.deep = Boolean(box.querySelector("[data-pdeep]")?.checked);
  const n = box.querySelector("[data-pnotes]");
  if (n) draft.notes = n.value;
}

// 重画编辑框：正在打字的不打断（force = 刚点了按钮，照样重画）；带 data-keep 的框里打了没存的字照抄回去
function redraw(force = false) {
  const sheet = modalSheet(), box = sheet?.querySelector(".project-editor");
  if (!box) return;
  const p = editing ? store.get("projects", editing) : draft;
  if (!p) return closeModal();
  const a = document.activeElement;
  if (!force && (fillingDate() || (sheet.contains(a) && a.matches("input:not([type]),input[type=text],input[type=number],textarea")))) return;
  const keep = {};
  box.querySelectorAll("[data-keep]").forEach((el) => { keep[el.dataset.keep] = el.value; });
  const scroll = sheet.scrollTop;
  box.outerHTML = editorHTML(p);
  sheet.querySelectorAll(".project-editor [data-keep]").forEach((el) => { if (el.dataset.keep in keep && el.dataset.keep !== "ls-paste") el.value = keep[el.dataset.keep]; });
  sheet.scrollTop = scroll;
}

// 数据变了（这台设备或者同步过来的）：开着的编辑框跟着重画
export function refreshProjectEditor(force = false) {
  if (editing) redraw(force);
}

// 新建：固定星期几的至少要有一天有分钟数
function createPlan(box) {
  readDraft(box);
  const name = String(draft.name || "").trim();
  if (!name) { box.querySelector('[data-pf="name"]').focus(); return; }
  const auto = draft.place === "auto", r = draft.rule || {};
  const start = r.start || store.today(), end = R.clampEnd(start, r.end || "");
  const base = { deep: Boolean(r.deep), notes: String(draft.notes || "") };
  const rule = auto ? { days: r.days || [0, 0, 0, 0, 0, 0, 0], start, end, ...base } : { perWeek: Math.max(0, Math.round(Number(r.perWeek) || 0)), min: 0, ...base };
  if (auto && !rule.days.some((v) => v > 0)) { box.querySelector("[data-rday]")?.focus(); return; }
  editing = store.saveProject({ name, group: String(draft.group || "").trim(), color: draft.color, kind: "regular", place: auto ? "auto" : "pool", rule,
    start: auto ? "" : draft.start || "", deadline: auto ? "" : draft.deadline || "" });
  draft = null;
  redraw(true);
}

// 粘贴：新建就建一个（项目 = 框里填的，文字里没写名字就用框里的名字）；已有的就按名字 / 代号更新，新文字里没有的旧项报出来
function pasteGo(box) {
  const later = laterMap(PT.parse(paste.text));
  const laterOf = (name) => Boolean(later[name]);
  if (!editing) {
    readDraft(box);
    const res = store.pastePlan(paste.text, { group: String(draft?.group || "").trim(), name: String(draft?.name || "").trim(), laterOf });
    if (!res) return;
    editing = res.planId;
    draft = null;
  } else {
    const res = store.pastePlan(paste.text, { planId: editing, laterOf });
    if (!res) return;
    gone = res.gone;
  }
  paste = null;
  redraw(true);
}

function copyPlan(pid) {
  const text = store.planText(pid);
  const fallback = () => { paste = { text, later: {} }; redraw(true); toast("Couldn't copy — the text is in the box below"); };
  if (!navigator.clipboard?.writeText) return fallback();
  navigator.clipboard.writeText(text).then(() => toast("Copied the plan as text — edit it anywhere, then Paste text to update"), fallback);
}

// 「几次」框：空 / once = 1，any = 做几次都行（0），数字或 ×11 = 那么多次
const timesIn = (v) => {
  const s = String(v || "").trim().toLowerCase();
  if (!s || s === "once") return 1;
  if (/^(any|∞|as often as i like|随时|不限)$/.test(s)) return 0;
  const n = Number(s.replace(/^[×x]\s*/, ""));
  return n > 0 ? Math.round(n) : 1;
};
const stepsIn = (v) => String(v || "").split("\n").map((l) => l.trim().replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, "")).filter(Boolean)
  .map((l) => { const x = PT.parseLine(l); return { t: x.title, min: x.est || 0 }; });

export function initProjects(rerender) {
  on(document, "click", ".projects [data-act], .project-editor [data-act]", (e, el) => {
    const act = el.dataset.act;
    const box = el.closest(".project-editor");
    const pid = el.closest("[data-project]")?.dataset.project || el.closest("[data-pid]")?.dataset.pid;
    const group = el.closest("[data-group]")?.dataset.group ?? "";
    const itemId = el.closest("[data-item]")?.dataset.item || "";
    if (act === "new-project") openProjectEditor("", { focus: "group" });
    else if (act === "new-sub") openProjectEditor("", { group });
    else if (act === "rename-group") {
      renaming = group;
      rerender();
      requestAnimationFrame(() => { const i = document.querySelector("[data-rename]"); i?.focus(); i?.select(); });
    }
    else if (act === "rename-done") { renaming = null; rerender(); }
    else if (act === "remove-group") { renaming = null; store.removeGroup(group); }
    else if (act === "edit-project") openProjectEditor(pid);
    else if (act === "pplace") {
      if (!pid) { readDraft(box); draft.place = el.dataset.v; redraw(true); }
      else store.saveProject({ id: pid, place: el.dataset.v });
    }
    else if (act === "toggle-archived") { if (!openArchived.delete(group)) openArchived.add(group); rerender(); }
    else if (act === "archive-plan") { const p = store.get("projects", pid); if (p) store.archiveProject(pid, E.isActive(p)); }
    else if (act === "create-project") { if (!editing) createPlan(box); }   // editing 有值 = 已经建过了，别再建一个
    else if (act === "pstatus") store.saveProject({ id: pid, status: el.dataset.v });
    else if (act === "serve") store.linkGoal(el.dataset.goal, G.planRef(pid), el.getAttribute("aria-pressed") !== "true");
    else if (act === "serve-more") { serveMore = !serveMore; redraw(true); }
    else if (act === "del-project") {
      if (!confirm("Delete this plan and its pool? Tasks you've done stay on the calendar.")) return;
      closeModal();
      store.deleteProject(pid);
    }
    else if (act === "notes-open") { readDraft(box); notesOpen = true; redraw(true); modalSheet()?.querySelector("[data-pnotes]")?.focus(); }
    else if (act === "item-open") { openItem = itemId; redraw(true); modalSheet()?.querySelector('.ls-it.open [data-lf="title"]')?.focus(); }
    else if (act === "item-close") { openItem = ""; redraw(true); }
    else if (act === "item-del") { openItem = ""; store.deleteItem(itemId); }
    else if (act === "sec-later") store.setSectionLater(pid, el.dataset.sec, el.getAttribute("aria-pressed") !== "true");
    else if (act === "item-later") store.setItemCfg(itemId, { later: el.getAttribute("aria-pressed") !== "true" }, el.getAttribute("aria-pressed") !== "true" ? "Put away for later" : "Back in the pool");
    else if (act === "paste-open") { readDraft(box); paste = paste ? null : { text: "", later: {} }; redraw(true); modalSheet()?.querySelector("[data-paste]")?.focus(); }
    else if (act === "paste-cancel") { paste = null; redraw(true); }
    else if (act === "paste-later") {
      paste.later[el.dataset.sec] = el.getAttribute("aria-pressed") !== "true";
      const pv = box.querySelector("[data-paste-pv]");
      if (pv) pv.innerHTML = pastePreviewHTML(store.ctx(), editing ? store.get("projects", editing) : draft);
    }
    else if (act === "paste-go") pasteGo(box);
    else if (act === "plan-copy") copyPlan(pid);
    else if (act === "gone-keep" || act === "gone-later" || act === "gone-del") {
      const id = el.dataset.id;
      gone = gone.filter((g) => g.id !== id);
      if (act === "gone-later") store.setItemCfg(id, { later: true }, "Put away for later");
      else if (act === "gone-del") store.deleteItem(id);
      else redraw(true);
    }
  });
  // Pool 里一行用键盘也能展开
  on(document, "keydown", ".project-editor .ls-it[data-act]", (e, el) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    el.click();
  });

  // 名字框：回车 / 点到别处就存。点的是同一排里的颜色、Move into，就先存名字、这一排不收
  const saveRename = (input, stay = false) => {
    if (renaming === null || renaming !== input.dataset.rename) return;
    const from = renaming, to = input.value.trim();
    renaming = stay ? to || from : null;
    if (to && to !== from) store.renameGroup(from, to);
    else if (!stay) rerender();
  };
  on(document, "keydown", "[data-rename]", (e, input) => {
    if (e.key === "Enter") saveRename(input);
    if (e.key === "Escape") { renaming = null; rerender(); }
  });
  on(document, "focusout", "[data-rename]", (e, input) => saveRename(input, Boolean(e.relatedTarget?.closest?.(".pg-top.editing"))));
  on(document, "change", ".pg-top [data-gcolor] input", (e, el) => { if (renaming) store.saveGroup(renaming, { color: el.value }); });
  on(document, "change", ".pg-top select[data-gmove]", (e, el) => {
    const from = renaming;
    if (!from || !el.value) return;
    renaming = null;
    store.renameGroup(from, el.value);
  });

  // 已有计划：字段改了就存
  on(document, "change", ".project-editor [data-pf]", (e, el) => {
    const pid = el.closest("[data-pid]").dataset.pid;
    if (!pid) return;
    const f = el.dataset.pf, v = el.value;
    if (f === "name" && !v.trim()) return;
    store.saveProject({ id: pid, [f]: v });
    refreshProjectEditor();
  });

  // 规则：星期几的分钟数、开始 / 结束、about N a week（空 = 不定）
  on(document, "change", ".project-editor [data-rf], .project-editor [data-rday]", (e, el) => {
    const pid = el.closest("[data-pid]").dataset.pid;
    const p = pid && store.get("projects", pid);
    if (!p) return;
    const rule = { ...(p.rule || {}) };
    if (el.dataset.rday !== undefined) rule.days = readDays(el.closest(".project-editor"));
    else {
      const f = el.dataset.rf;
      rule[f] = f === "perWeek" ? Math.max(0, Math.round(Number(el.value) || 0)) : el.value;
      rule.end = R.clampEnd(rule.start || store.today(), rule.end || "");
    }
    store.saveProject({ id: pid, rule });
    refreshProjectEditor();
  });

  // 默认深度：已有的计划一改，它的任务跟着一起改（新建框里的等 Create）
  on(document, "change", ".project-editor [data-pdeep]", (e, el) => {
    const pid = el.closest("[data-pid]").dataset.pid;
    if (pid) store.setPlanDeep(pid, el.checked);
  });

  // Notes：打一个字存一下（不重画）
  on(document, "input", ".project-editor [data-pnotes]", (e, el) => {
    const pid = el.closest("[data-pid]").dataset.pid;
    if (pid) store.setPlanNotes(pid, el.value);
    else if (draft) draft.notes = el.value;
  });

  // 粘贴框：边打边看认出了什么（只换下面那块，框里的光标不动）
  on(document, "input", ".project-editor [data-paste]", (e, el) => {
    if (!paste) return;
    paste.text = el.value;
    const pv = el.closest(".project-editor").querySelector("[data-paste-pv]");
    if (pv) pv.innerHTML = pastePreviewHTML(store.ctx(), editing ? store.get("projects", editing) : draft);
  });

  // Pool 里展开的那一项：改了就存
  on(document, "change", ".project-editor [data-lf]", (e, el) => {
    const id = el.closest("[data-item]")?.dataset.item;
    if (!id) return;
    const f = el.dataset.lf, v = el.value;
    if (f === "title") { if (v.trim()) store.updateItem(id, { title: v.trim() }); }
    else if (f === "est") store.updateItem(id, { est: Math.max(0, Math.round(Number(v) || 0)) });
    else if (f === "module") store.updateItem(id, { module: v.trim() });
    else if (f === "n") store.setItemCfg(id, { n: timesIn(v) });
    else if (f === "perWeek") store.setItemCfg(id, { perWeek: Math.max(0, Math.round(Number(v) || 0)) });
    else if (f === "steps") store.setItemCfg(id, { steps: stepsIn(v) });
    else if (f === "note") store.setItemCfg(id, { note: v.trim() });
  });

  on(document, "submit", ".project-editor .ls-add", (e, form) => {
    e.preventDefault();
    const pid = form.closest("[data-pid]").dataset.pid;
    if (!pid || !form.lines.value.trim()) return;
    store.addPoolLines(pid, form.section.value.trim(), form.lines.value);
    form.lines.value = "";
    redraw(true);
  });
}
