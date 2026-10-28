// 日历（电脑）：周视图 / 月视图，右边是 Pool。
// 把 Pool 里的一项拖到某天 = 那天这个计划下面多一条；计划名本身拖过去 = 那天这个计划空的一行（Swimming 这种）。
// 一个计划那天是一张便利贴：Pool 关着只写计划名，鼠标停上去展开成一行一项；Pool 开着（排计划的时候）直接一行一项、右边写分钟，日期后面写那天排了几小时
//   （她 2026-10-27 挑的甲；每一项能单独拖到别的天）；
// 整张拖到别的天 = 那天还没勾的几项一起挪，拖回 Pool = 回去；点它 = 到今天页的那一天。别的任务照旧一张一张，拖到别的天就挪过去，拖回 Pool 就撤回。
// 固定星期几的计划在以后的日子里画成淡色预览：可以拖走 / 点开（这时才变成真任务）。
// 格子里的日程永远全部显示（不折叠）；月视图只画这个月占到的那几周，便利贴排得紧一点，尽量一屏看完。格子有最小宽度，放不下就左右滑。格子顶上的小开关标「通勤日」。
// 上班那一层（js/offdays.js）：发薪日日期后面一个小 $；请假、公众假日日期旁边一个很小的 💤（工作日鼠标移上来能点）；
// 点顶上那条进度条 = 超级休息日，整条变金色。都只是标记，不改可用时间、不影响排计划。
// 点日期 = 到今天页的那一天；从打分开始日起、过完了还没打满分的日子，日期旁边一个红点（js/scores.js）。

import * as store from "../store.js";
import * as E from "../engine.js";
import * as L from "../lists.js";
import { esc, on, icon } from "../dom.js";
import { addDays, addMonths, diffDays, startOfWeek, startOfMonth, daysInMonth, range, fmtShort, fmtHours, WEEKDAYS, MONTHS_LONG, weekday } from "../dates.js";
import * as SC from "../scores.js";
import { isPayday } from "../offdays.js";
import { colorOf, badgeOf, projectOptions, groupsOf, toast } from "./common.js";
import { ideasPoolHTML } from "./ideas.js";
import { showDate } from "./today.js";
import { openTaskEditor } from "./editor.js";

// 顶上那条超过这么多分钟（还没超过 box）就闪（她 2026-10-27 要的警示线；暂定，之后可能取消）
const LONG_DAY = 7 * 60;

let anchor = "";
let adding = "";      // 正在哪一天的格子里加任务
let capEdit = "";     // 正在改哪一天的 box（可用时间）

const mode = () => store.local().calMode || "week";
const weekStart = () => store.prefs().weekStartsOn;

function chipHTML(t) {
  const p = badgeOf(t);
  return '<div class="ev st-' + (t.status || "open") + (t.optional ? " opt" : "") + '" data-drag="task:' + t.id + '" data-act="edit-task" data-id="' + t.id + '" style="--c:' + colorOf(t) + '" title="' + esc(t.title + (p ? " · " + p.name : "")) + '">' +
    '<span class="t">' + (E.isRoutine(t) ? '<i class="rt">↻</i>' : "") + esc(t.title) + "</span>" + (Number(t.est) > 0 ? '<span class="m num">' + Number(t.est) + "</span>" : "") + "</div>";
}

function ghostHTML(g) {
  return '<div class="ev ghost" data-drag="ghost:' + esc(g.key) + '" data-act="open-ghost" data-key="' + esc(g.key) + '" style="--c:' + esc(g.plan.color) + '" title="' + esc(g.title + " · repeats") + '">' +
    '<span class="t"><i class="rt">↻</i>' + esc(g.title) + "</span>" + (Number(g.est) > 0 ? '<span class="m num">' + Number(g.est) + "</span>" : "") + "</div>";
}

// 一个计划那天的那一张（她 2026-10-27 改的）：Pool 关着只写名字（那一行的名字，没有那一行才写计划名），停上去展开成一行一项；
// Pool 开着（排计划的时候）直接一行一项。一项 = 名字（做了的划掉），右边大概几分钟；还没勾的每一项能单独拖走。
// 状态跟着那一行，和别的便利贴一样（Done 灰掉划掉、Delay 划掉、Drop 灰掉）——她 2026-10-27 报的：今天页标了 Done，日历上没跟着；
// 那一行没标、下面的项都勾了，也算做完
function blockHTML(b, d, pool) {
  const plan = b.plan, lines = b.lines.slice().sort((x, y) => (Number(x.order) || 0) - (Number(y.order) || 0));
  const li = (t) => '<span class="li' + (t.status === "done" || t.status === "delay" ? " dn" : t.status === "drop" ? " dp" : "") + '"' + (t.status ? "" : ' data-drag="task:' + t.id + '"') + "><span>" + esc(t.title) + "</span>" +
    (Number(t.est) > 0 ? '<i class="lm num">' + Number(t.est) + "</i>" : "") + "</span>";
  const spent = b.row ? E.spentMin(b.row) : 0;
  const st = b.row?.status || (lines.length && lines.every((t) => t.status === "done") ? "done" : "open");
  const name = b.row?.title || plan.name, list = lines.map(li).join("");
  return '<div class="ev blk' + (pool ? " blk-ls" : "") + " st-" + st + (b.row?.optional ? " opt" : "") + '" data-drag="blk:' + esc(plan.id) + "|" + d + '" data-act="open-day" data-date="' + d + '" style="--c:' + esc(plan.color || "var(--c-None)") + '" title="' +
    esc(name + (name !== plan.name ? " · " + plan.name : "") + (lines.length ? " · " + lines.length + " thing" + (lines.length > 1 ? "s" : "") : "") + (spent ? " · " + fmtHours(spent) + " logged" : "")) + '">' +
    '<span class="t"><span class="bt">' + esc(name) + "</span>" + (pool ? list : "") + "</span>" +
    (!pool && lines.length ? '<div class="full"><span class="bt">' + esc(name) + "</span>" + list + "</div>" : "") + "</div>";
}

// 排计划的样子（Pool 开着，而且是今天和以后——以前的日子不跟着 Pool 变，她 2026-10-27 说的）：计划那张一行一项、别的任务也写分钟，
// 日期后面是那天排了几小时（计划那一块算下面几项，js/lists.js 的 dayMin；以后的日子加上固定星期几的预览，Gym 这种也算进 box）。
// 顶上那条（她 2026-10-28 定的）：以前的日子 = 实际记下的总时间，今天和以后 = 排了的（就是日期后面那个数，含固定星期几的预览）——都算所有大类。
// 分母是那天的 box（右上角的数，她是 10h）。超过 box = 整条静止的红（强制，不闪）；没超 box、超过 7 小时（LONG_DAY）= 闪。
// 金条那天都不红（Leisure 占得多的那天她自己改成金条）。大类的 Counts as progress 和这里无关（那是给季度表的）
function cellHTML(c, d, { month = false, outside = false, scores = null, still = false, pool = false } = {}) {
  const tasks = store.tasksOn(d);
  const unscored = scores && SC.unscored(scores, store.scoreOf(d), d, c.today);
  const ghosts = E.ghostsOn(c, d);
  const sum = E.daySummary(c, d);
  const blocks = L.dayBlocks(c, tasks);
  const planned = L.dayMin(blocks) + ghosts.reduce((a, g) => a + (Number(g.est) || 0), 0);
  const capOver = c.capacity.overrides[d] !== undefined;
  const commute = store.isCommuteDay(d), off = store.offDay(d), gold = store.isSuperRest(d), wd = weekday(d), ahead = pool && d >= c.today;
  const past = d < c.today, val = past ? sum.done : planned;
  const over = !gold && sum.cap > 0 && val > sum.cap;
  const cls = ["cell", d === c.today ? "today" : "", d < c.today ? "past" : "", sum.rest ? "rest" : "", outside ? "outside" : "", over ? "over" : "", ahead ? "cal-plan" : "", gold ? "superrest" : ""].filter(Boolean).join(" ");
  const all = [...blocks.map((b) => (b.task ? chipHTML(b.task) : blockHTML(b, d, ahead))), ...ghosts.map(ghostHTML)];
  const loadPct = over ? 100 : sum.cap ? Math.min(100, (val / sum.cap) * 100) : 0;
  const long = !gold && !over && val > LONG_DAY;   // 金条那天不变红
  let h = '<div class="' + cls + '" data-drop="day:' + d + '">' +
    '<div class="cell-head"><span class="dn-w"><button type="button" class="dn" data-act="open-day" data-date="' + d + '"' + (unscored ? ' title="Not scored yet"' : "") + "><span>" + (month ? "" : WEEKDAYS[wd]) + "</span><b>" + Number(d.slice(8)) + "</b>" + (isPayday(d) ? '<span class="payday" title="Payday">$</span>' : "") + (unscored ? '<i class="dsc-dot" aria-label="Not scored yet"></i>' : "") + "</button>" +
    (ahead && planned > 0 ? '<span class="cal-hrs num" title="Planned this day">' + fmtHours(planned) + "</span>" : "") +
    (wd === 0 || wd === 6 ? "" : '<button type="button" class="offday-t' + (off.off ? " on" : "") + '" data-act="off-day" data-date="' + d + '" aria-pressed="' + off.off + '" title="' + esc(off.off ? (off.holiday || "Day off") + " — click to clear" : "Mark as a day off") + '">💤</button>') + "</span>" +
    '<button type="button" class="cm-t' + (commute ? " on" : "") + '" data-act="commute" data-date="' + d + '" aria-pressed="' + commute + '" title="' + (commute ? "Commute day — click to clear" : "Mark as a commute day") + '">' + icon("commute") + "</button>" +
    (month ? "" : capEdit === d
      ? '<input class="cap-input num" type="number" min="0" step="15" data-cap-input="' + d + '" data-keep="cap-' + d + '" value="' + sum.cap + '" title="Minutes in the box this day · 0 = rest day · empty = weekly default">'
      : '<button type="button" class="cap num' + (capOver ? " set" : "") + '" data-act="cap" data-date="' + d + '" title="The box this day (available time) — click to change">' + (sum.rest ? "rest" : fmtHours(sum.cap)) + "</button>") + "</div>" +
    '<button type="button" class="load-t" data-act="super-rest" data-date="' + d + '" aria-pressed="' + gold + '" title="' + (long ? (past ? "Over 7 hours logged · " : "Over 7 hours planned · ") : over ? (past ? "Logged past the day's box · " : "Planned past the day's box · ") : "") + (gold ? "Super rest day — click to clear" : "Mark as a super rest day") + '">' +
    '<span class="load' + (gold && !still ? " shine" : "") + (long ? " over7" + (still ? "" : " blink") : "") + '"><i style="width:' + (long ? Math.max(loadPct, 8) : loadPct) + '%"></i></span></button>' +
    all.join("");
  if (!month) {
    h += adding === d
      ? '<form class="cell-form" data-cell-add="' + d + '"><input name="title" data-keep="cell-add-' + d + '" placeholder="Task 30" autocomplete="off"></form>'
      : '<button type="button" class="cell-add" data-act="cell-add" data-date="' + d + '" aria-label="Add a task">' + icon("plus") + "</button>";
  }
  return h + "</div>";
}

export function calendarHTML(c) {
  if (!anchor) anchor = c.today;
  const week = mode() === "week", scores = store.scoreSetup(), pool = Boolean(store.local().pool);
  const still = Boolean(document.getElementById("sky")?.classList.contains("still"));   // 设置里关了动效：金条不反光
  let title, body;
  if (week) {
    const s = startOfWeek(anchor, weekStart());
    const e = addDays(s, 6);
    title = fmtShort(s) + " – " + (s.slice(5, 7) === e.slice(5, 7) ? Number(e.slice(8)) : fmtShort(e));
    body = '<div class="cal-scroll"><div class="week">' + range(s, e).map((d) => cellHTML(c, d, { scores, still, pool })).join("") + "</div></div>";
  } else {
    const m0 = startOfMonth(anchor);
    const s = startOfWeek(m0, weekStart());
    // 只画这个月占到的那几周（多半是 5 周），不再固定画 6 周
    const weeks = Math.ceil((diffDays(s, addDays(m0, daysInMonth(m0) - 1)) + 1) / 7);
    title = MONTHS_LONG[Number(m0.slice(5, 7)) - 1] + " " + m0.slice(0, 4);
    const heads = range(s, addDays(s, 6)).map((d) => "<span>" + WEEKDAYS[weekday(d)] + "</span>").join("");
    body = '<div class="cal-scroll"><div class="month-head">' + heads + '</div><div class="month">' +
      range(s, addDays(s, weeks * 7 - 1)).map((d) => cellHTML(c, d, { month: true, outside: d.slice(0, 7) !== m0.slice(0, 7), scores, still, pool })).join("") + "</div></div>";
  }
  return '<div class="calendar">' +
    '<header class="page-head"><div><h2>' + title + "</h2></div>" +
    '<div class="tools"><button type="button" class="nav" data-act="cal-today">Today</button>' +
    '<button type="button" class="nav" data-act="cal-prev" aria-label="Previous">' + icon("left") + '</button><button type="button" class="nav" data-act="cal-next" aria-label="Next">' + icon("right") + "</button>" +
    '<span class="seg"><button type="button" data-act="cal-mode" data-mode="week"' + (week ? ' class="on"' : "") + '>Week</button><button type="button" data-act="cal-mode" data-mode="month"' + (!week ? ' class="on"' : "") + ">Month</button></span>" +
    '<button type="button" class="nav' + (store.local().pool ? " on" : "") + '" data-act="pool-toggle">' + icon("pool") + " Pool</button></div></header>" +
    body + "</div>";
}

// ---------- Pool ----------
// 每个在用的计划一组：计划名本身能拖（= 那天这个计划空的一行；Pool 里没东西的计划就靠它），下面按分区列还能拖的项：
// 大概多久 · 还剩几次 · 这周排了几次 / 每周大概几次；勾了一半回了 Pool 的那次写着剩几步，拖它就接着做。
// 点一下或 Tab 过来按回车 = 挑哪天（js/ui/dnd.js 的菜单）。最上面一格加东西进某个计划的 Pool（一行一条，和粘贴同一套写法）
export function poolHTML(c) {
  const groups = L.pool(c);
  const left = groups.reduce((a, g) => a + g.items.reduce((b, x) => b + (Number.isFinite(x.count.left) ? x.count.left : 0), 0), 0);
  let h = '<div class="pool-inner" data-drop="pool"><header class="pool-head"><div><h3>Pool</h3><p>' +
    (groups.length ? groups.length + " plan" + (groups.length > 1 ? "s" : "") + (left ? " · " + left + " to place" : "") : "Plans and their pools land here") + "</p></div>" +
    '<button type="button" class="icon-btn" data-act="pool-toggle" aria-label="Hide pool">' + icon("close") + "</button></header>";
  if (!groups.length) return h + '<p class="empty">Make a plan first.</p><a class="btn" href="#projects">Projects</a>' + ideasPoolHTML(c) + "</div>";
  h += '<form class="pool-add" autocomplete="off"><select name="project" aria-label="Plan">' + projectOptions(groups.map((g) => g.plan), "", null, false) + "</select>" +
    '<div class="row2"><input name="title" data-keep="pool-add" placeholder="L5 shadowing · 20min · ×18" aria-label="Add to the pool"><button class="btn cta" type="submit" aria-label="Add to the pool">' + icon("plus") + "</button></div></form>";
  let lastGroup = null;
  groupsOf(groups.map((g) => g.plan)).forEach((pg) => pg.subs.forEach((p) => {
    const { items } = groups.find((g) => g.plan === p);
    if (pg.name !== lastGroup) { lastGroup = pg.name; if (pg.name) h += '<div class="pg-group">' + esc(pg.name) + "</div>"; }
    const min = items.reduce((a, x) => a + (Number(x.item.est) || 0) * (Number.isFinite(x.count.left) ? x.count.left : 0), 0);
    h += '<section class="pg"><div class="pg-head pg-plan" data-drag="plan:' + esc(p.id) + '" role="button" tabindex="0" aria-haspopup="listbox" title="Drag onto a day: ' + esc(p.name) + ' that day" style="--pc:' + esc(p.color) + '"><i></i><span>' + esc(p.name) + "</span><em>" + (items.length ? (min ? fmtHours(min) : items.length + " left") : "any day") + "</em></div>";
    let mod = null;
    for (const x of items) {
      if ((x.item.module || "") !== mod) { mod = x.item.module || ""; if (mod) h += '<div class="pg-mod">' + esc(mod) + "</div>"; }
      const carry = x.count.carry[0];
      const label = carry ? x.item.title + " · " + carry.steps.length + " step" + (carry.steps.length > 1 ? "s" : "") + " left" : x.item.title;
      const meta = [L.sizeOf(x.item.est), x.cfg.n > 1 ? x.count.left + " left" : x.cfg.n === 0 ? "any" : "", x.cfg.perWeek ? "wk " + x.week.placed + "/" + x.cfg.perWeek : ""].filter(Boolean).join(" · ");
      h += '<div class="pi" data-drag="item:' + esc(x.item.id) + '" role="button" tabindex="0" aria-haspopup="listbox" style="--c:' + esc(p.color) + '" title="' + esc(x.cfg.note || "") + '"><i class="g"></i><span>' + esc(label) + '</span><b class="num">' + esc(meta) + "</b></div>";
    }
    h += "</section>";
  }));
  return h + ideasPoolHTML(c) + '<p class="pool-hint">Drag an item onto a day, or click it to pick the day; it joins that plan\'s row there. Drag a plan\'s name for just its row. Drag something back here to put it back.</p></div>';
}

// ---------- 交互 ----------

export function initCalendar(rerender) {
  on(document, "click", ".calendar [data-act], .pool-inner [data-act], .page-tools [data-act]", (e, el) => {
    const act = el.dataset.act;
    const step = (n) => { anchor = mode() === "week" ? addDays(anchor || store.today(), 7 * n) : addMonths(anchor || store.today(), n); rerender(); };
    if (act === "cal-prev") step(-1);
    else if (act === "cal-next") step(1);
    else if (act === "cal-today") { anchor = store.today(); rerender(); }
    else if (act === "cal-mode") store.setLocal({ calMode: el.dataset.mode });
    else if (act === "pool-toggle") store.setLocal({ pool: !store.local().pool });
    else if (act === "edit-task") openTaskEditor(el.dataset.id);
    else if (act === "open-ghost") { const id = store.materialize(el.dataset.key); if (id) openTaskEditor(id); }
    else if (act === "commute") store.toggleCommute(el.dataset.date);
    else if (act === "off-day") store.toggleOffDay(el.dataset.date);
    else if (act === "super-rest") store.toggleSuperRest(el.dataset.date);
    else if (act === "open-day") { showDate(el.dataset.date); location.hash = "today"; }   // 浏览器后退回到日历
    else if (act === "cell-add") {
      adding = el.dataset.date;
      rerender();
      document.querySelector('[data-keep="cell-add-' + adding + '"]')?.focus();
    } else if (act === "cap") {
      capEdit = el.dataset.date;
      rerender();
      const input = document.querySelector('[data-cap-input="' + capEdit + '"]');
      input?.focus();
      input?.select();
    }
  });

  // 改某天的 box：回车或离开就存；清空 = 用每周默认；Esc 放弃
  const saveCap = (input) => {
    if (capEdit !== input.dataset.capInput) return;
    capEdit = "";
    const v = input.value.trim();
    store.setDayCapacity(input.dataset.capInput, v === "" ? null : Math.max(0, Number(v) || 0));
  };
  on(document, "keydown", "[data-cap-input]", (e, input) => {
    if (e.key === "Enter") saveCap(input);
    if (e.key === "Escape") { capEdit = ""; rerender(); }
  });
  on(document, "focusout", "[data-cap-input]", (e, input) => saveCap(input));

  on(document, "submit", ".cell-form", (e, form) => {
    e.preventDefault();
    let title = String(new FormData(form).get("title") || "").trim();
    const date = form.dataset.cellAdd;
    if (title) {
      let est = 30;
      const m = title.match(/^(.*\S)\s+(\d{1,3})\s*(m|min|mins)?$/i);
      if (m && Number(m[2]) >= 5) { title = m[1]; est = Number(m[2]); }
      store.addTask({ date, title, est });
    }
    adding = "";
    rerender();
  });
  on(document, "focusout", ".cell-form input", (e, input) => {
    if (!input.value.trim()) setTimeout(() => { if (adding) { adding = ""; rerender(); } }, 120);
  });
  on(document, "keydown", ".cell-form input", (e) => { if (e.key === "Escape") { adding = ""; rerender(); } });

  on(document, "submit", ".pool-add", (e, form) => {
    e.preventDefault();
    const f = new FormData(form);
    const title = String(f.get("title") || "").trim();
    if (!title || !f.get("project")) return;
    store.addPoolLines(String(f.get("project")), "", title);
    form.querySelector("[name=title]").value = "";
  });
}

export function handleDrop(payload, target) {
  const i = payload.indexOf(":");
  const kind = payload.slice(0, i), id = payload.slice(i + 1);   // 重复任务的 id 里也有冒号
  const [planId, from] = kind === "blk" ? id.split("|") : [];
  if (target === "pool") {
    if (kind === "blk") store.blockToPool(planId, from);
    else if (kind === "task" && !store.unschedule(id)) toast("Only things from a plan's pool can go back");
    return;
  }
  const date = target.slice(4);
  if (kind === "task") { const t = store.get("tasks", id); if (t && L.isLine(t)) store.moveLine(id, date); else store.moveTask(id, date); }
  else if (kind === "blk") store.moveBlock(planId, from, date);
  else if (kind === "item") { if (!store.placeItem(id, date)) toast("Nothing of that left in the pool"); }
  else if (kind === "plan" || kind === "regular") store.ensureRow(id, date);
  else if (kind === "ghost") { const tid = store.materialize(id); if (tid) store.moveTask(tid, date); }
}
