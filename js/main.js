// 苦昼短：入口。管页面切换（#today / #calendar / #projects / #stats / #meals / #shop / #reading / #friends / #settings）、主题、同步时机、整页重画。
// 手机（≤760px）只有「今天」、下次采购的单子、阅读和设置；电脑有侧栏、日历和任务池、项目、统计、备餐。两边底部都有计时浮条。

import * as store from "./store.js";
import * as sync from "./sync.js";
import * as reading from "./reading.js";
import * as Meal from "./meals.js";
import { esc, on, icon, initDateTyping } from "./dom.js";
import { paintPatterns } from "./patterns.js";
import { initFx, setFx, confetti, refreshFxColors } from "./fx.js";
import { toast, lineInfo, ballHTML } from "./ui/common.js";
import { initModal, closeModal } from "./ui/modal.js";
import { initSelect } from "./ui/select.js";
import { todayHTML, initToday, shownDate } from "./ui/today.js";
import { calendarHTML, poolHTML, initCalendar, handleDrop, refreshDayModal } from "./ui/calendar.js";
import { projectsHTML, initProjects, refreshProjectEditor, projectAlerts } from "./ui/projects.js";
import { initGoals } from "./ui/goals.js";
import { initIdeas, ideasPhoneHTML } from "./ui/ideas.js";
import { settingsHTML, initSettings } from "./ui/settings.js";
import { initEditor, refreshEditor } from "./ui/editor.js";
import { initDnd } from "./ui/dnd.js";
import { statsHTML, initStats } from "./ui/stats.js";
import { dockHTML, initTimer, tick } from "./ui/timer.js";
import { readingHTML, initReading } from "./ui/reading.js";
import { mealsHTML, shopHTML, initMeals, refreshMealEditor, mealDrop } from "./ui/meals.js";
import { friendsHTML, initFriends, refreshFriendEditor, friendsDue } from "./ui/friends.js";
import { renderSun, initSun } from "./ui/sun.js";
import { animateNext, takeTransition, nameParts, dusk } from "./motion.js";

const phoneMQ = matchMedia("(max-width: 760px)");
const darkMQ = matchMedia("(prefers-color-scheme: dark)");
const VIEWS = ["today", "calendar", "projects", "stats", "meals", "shop", "reading", "ideas", "friends", "settings"];
const side = document.getElementById("side");
const main = document.getElementById("main");
const pool = document.getElementById("pool");
const dock = document.getElementById("dock");

function route() {
  let v = location.hash.replace("#", "").split("/")[0] || "today";
  if (!VIEWS.includes(v)) v = "today";
  if (phoneMQ.matches && v !== "settings" && v !== "reading" && v !== "shop" && v !== "ideas") v = "today";
  if (v === "ideas" && !phoneMQ.matches) v = "projects";   // #ideas 是手机上查灵感的那一页；电脑上灵感在 Projects 页里
  return v;
}

// 白天夜里真的互换的那一下带一段过场（底边的霞光 = js/motion.js 的 dusk；日月换班的样子在 css 里）：先记着要换成什么，等下一次重画在过渡里一起换（draw 开头）。
// 刚打开、设置里关了动效、页面在后台：直接换
let themePaint = null, booted = false;
function applyTheme() {
  const t = store.local().theme;
  const dark = t === "dark" || (t === "auto" && darkMQ.matches);
  const html = document.documentElement;
  const paint = () => {
    html.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0C0C13" : "#FFFFFF");
    paintPatterns();
    refreshFxColors();
  };
  const turning = (html.dataset.theme === "dark") !== dark;
  if (booted && turning && store.local().fx !== false && document.visibilityState === "visible") {
    themePaint = paint;
    animateNext("theme");
    render();
  } else { themePaint = null; paint(); }
}

// ---------- 侧栏（电脑） ----------

function sidebarHTML(c, view) {
  const todayOpen = c.tasks.filter((t) => t.date === c.today && !t.status).length;
  const deals = Meal.toCheck(store.meals(), c.today).length;   // 这一轮还没看的打折
  // 四段，各管各的事：排时间的那四页 / 备餐 / 阅读 / 人。每段一层自己的淡底色（css 里 .sblock），不写标题
  const blocks = [["todo", [["today", "Today", todayOpen || ""], ["calendar", "Calendar", ""], ["projects", "Projects", projectAlerts(c) || ""], ["stats", "Stats", ""]]],
    ["meals", [["meals", "Meals", deals || ""]]], ["read", [["reading", "Reading", ""]]], ["friends", [["friends", "Friends", friendsDue(c.today) || ""]]]];
  const link = ([v, t, n]) => '<a href="#' + v + '" class="' + (view === v ? "on" : "") + '" title="' + t + '">' + icon(v) + "<span>" + t + "</span>" + (n ? "<b>" + n + "</b>" : "") + "</a>";
  const st = sync.getStatus();
  // 收起来只剩一列图标（记在这台设备上）：名字放进 title，角标缩成一个点
  const min = Boolean(store.local().sideMin);
  return '<div class="brand">' + ballHTML() + "<h1>苦昼短</h1>" +
    '<button type="button" class="icon-btn side-tog" data-act="side-toggle" aria-expanded="' + !min + '" aria-label="' + (min ? "Show" : "Hide") + ' the sidebar labels" title="' + (min ? "Expand" : "Collapse") + '">' + icon(min ? "right" : "left") + "</button></div>" +
    '<nav class="snav">' + blocks.map(([b, links]) => '<div class="sblock" data-b="' + b + '">' + links.map(link).join("") + "</div>").join("") + "</nav>" +
    '<div class="sbot"><nav class="snav">' + link(["settings", "Settings", ""]) + "</nav>" +
    '<footer class="sfoot"><button type="button" class="sync-pill' + (st.bad ? " bad" : "") + '" data-act="sync" title="Sync now">' + icon("sync") + '<span data-sync-status>' + esc(st.text) + "</span></button></footer></div>";
}

// ---------- 整页重画（正在打字的输入框，值、光标都留住） ----------

// 重画前后留住正在填的东西（带 data-keep 的输入框）：页面、任务池，还有弹层——日历里点开某一天的那块也是整块重画的。
// 记的时候带上它在哪一块里（main / pool / modal），同一个名字在两块里各算各的
const KEEP_IN = ["main", "pool", "modal"];
const keepRoot = (el) => el?.closest?.(KEEP_IN.map((id) => "#" + id).join(","))?.id || "";
function captureKeep() {
  const keep = {};
  for (const id of KEEP_IN) {
    document.querySelectorAll("#" + id + " [data-keep]").forEach((el) => {
      keep[id + "|" + el.dataset.keep] = { value: el.value, checked: el.checked, start: el.selectionStart, end: el.selectionEnd };
    });
  }
  const a = document.activeElement;
  return { keep, active: a?.dataset?.keep && keepRoot(a) ? keepRoot(a) + "|" + a.dataset.keep : "" };
}

function restoreKeep({ keep, active }) {
  for (const [k, v] of Object.entries(keep)) {
    const cut = k.indexOf("|");
    const el = document.querySelector("#" + k.slice(0, cut) + ' [data-keep="' + k.slice(cut + 1) + '"]');
    if (!el) continue;
    if (el.type === "checkbox") { el.checked = Boolean(v.checked); continue; }
    if (el.value !== v.value) el.value = v.value;
    if (k === active) {
      el.focus({ preventScroll: true });
      try { el.setSelectionRange(v.start, v.end); } catch { /* number / date 输入框不支持 */ }
    }
  }
}

let raf = 0;
let lastView = "";
function render() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

// 用户刚点过的那次重画包一层过渡（js/motion.js）：平常每一行各自挪；换页、翻天时整块淡入 / 左右滑，行不单独动
function frame() {
  const kind = takeTransition();
  if (!kind) { draw(); return; }
  const html = document.documentElement, rows = kind === "on";
  html.dataset.vt = kind;
  if (!rows) nameParts(main, false);
  const vt = document.startViewTransition(() => {
    draw();
    if (!rows) nameParts(main, false);
    if (kind === "theme") dusk(html.dataset.theme === "dark");
  });
  vt.ready.catch(() => {});   // 页面在后台时过渡会被取消，不算错
  vt.finished.finally(() => {
    if (html.dataset.vt === kind) delete html.dataset.vt;
    if (!rows) nameParts(main, true);
  }).catch(() => {});
}

function draw() {
  if (themePaint) { themePaint(); themePaint = null; }
  const c = store.ctx();
  const phone = phoneMQ.matches;
  const view = route();
  document.body.dataset.view = view;
  document.body.classList.toggle("phone", phone);
  document.body.classList.toggle("side-min", !phone && Boolean(store.local().sideMin));
  const kept = captureKeep();
  side.innerHTML = phone ? "" : sidebarHTML(c, view);
  main.innerHTML = view === "calendar" ? calendarHTML(c) : view === "projects" ? projectsHTML(c) : view === "stats" ? statsHTML(c) : view === "meals" ? mealsHTML(c) : view === "shop" ? shopHTML(c, phone) : view === "settings" ? settingsHTML(phone) : view === "reading" ? readingHTML(phone) : view === "ideas" ? ideasPhoneHTML(c) : view === "friends" ? friendsHTML(c) : todayHTML(c, phone);
  if (document.startViewTransition) nameParts(main, true);
  // 打开阅读页：同步时顺便拉一次阅读表格的列表（查重用）
  reading.want(view === "reading");
  if (view === "reading" && lastView !== "reading" && sync.configured()) sync.sync();
  lastView = view;
  const showPool = !phone && view === "calendar" && store.local().pool;
  pool.hidden = !showPool;
  pool.innerHTML = showPool ? poolHTML(c) : "";
  const hadDock = document.body.classList.contains("has-dock");
  dock.innerHTML = dockHTML(c, view === "today" && shownDate() === c.today && (!phone || Boolean(store.local().url)));
  document.body.classList.toggle("has-dock", Boolean(dock.innerHTML));
  if (!hadDock) dock.firstElementChild?.classList.add("enter");   // 只在浮条刚出现时滑上来，重画时不闪
  // 圆盘落着的时候坐在浮条上面
  document.body.style.setProperty("--dock-h", dock.firstElementChild ? dock.firstElementChild.offsetHeight + 22 + "px" : "0px");
  renderSun(c, view === "today" && (!phone || store.local().url) ? shownDate() : "");
  underSun();
  tick();
  paintSync();
  refreshEditor();
  refreshDayModal();
  refreshProjectEditor();
  refreshMealEditor();
  refreshFriendEditor();
  restoreKeep(kept);   // 弹层也画完了再放回去
  celebrate(c, view);
}

function paintSync() {
  const st = sync.getStatus();
  const pending = store.pendingCount();
  // 这台设备的存储满了 / 快满了：也算在同步状态里（手机上那个小圆点变红，点一下说该怎么办）
  const use = store.storage();
  const room = use.full ? "This device is full — archive older tasks in Settings on your computer" : use.warn ? "Storage almost full — archive older tasks in Settings on your computer" : "";
  const text = use.full ? room : st.text === "Syncing…" || st.bad || !pending ? st.text : sync.configured() ? "Unsynced changes" : st.text;
  const bad = st.bad || use.full;
  document.querySelectorAll("[data-sync-status]").forEach((el) => {
    // 手机顶栏放不下一句话（会压住日期）：只画一个点，点一下再说是什么
    if (el.classList.contains("psync")) { el.title = room || text; el.setAttribute("aria-label", room || text || "Sync"); el.classList.toggle("wait", !st.bad && !room && !/^Synced/.test(text)); el.classList.toggle("bad", bad || Boolean(room)); return; }
    else el.textContent = text;
    el.closest(".sync-pill")?.setAttribute("title", text ? text + " — click to sync" : "Sync now");   // 侧栏收起时只剩图标，状态看这里
    el.closest(".sync-pill, .sync-status")?.classList.toggle("bad", bad);
  });
}

// 守住今天的线：一天只庆祝一次
function celebrate(c, view) {
  if (view !== "today" || shownDate() !== c.today) return;
  const { line, done } = lineInfo(c, c.today);
  if (line < 1 || done < line - 1) return;
  if (localStorage.getItem("kuzhouduan-celebrated") === c.today) return;
  localStorage.setItem("kuzhouduan-celebrated", c.today);
  confetti();
  toast("Line held ✓ Nice.");
}

// ---------- 同步时机 ----------

// 第一次用上大类：现有的计划按名字归进六个大类（等从表格拉到最新的再归，见下面的 subscribe；没连表格就直接归）
function adoptGroups() {
  const done = store.adoptGroups();
  if (done) toast("Projects sorted into " + done.names.join(", "), done.undo);
}

// 同步完：拍今天的安全线快照
async function syncThenLog() {
  await sync.sync();
  store.ensureTodayLog();
}

let lastToday = store.today();
function tickDay() {
  const t = store.today();
  if (t !== lastToday) {
    lastToday = t;
    store.ensureTodayLog();
    render();
  } else if (route() === "today" && (!phoneMQ.matches || store.local().url)) renderSun(store.ctx(), shownDate());   // 小太阳每分钟走一点；在计时的那段也长一点
}

// ---------- 启动 ----------

applyTheme();
booted = true;
initDateTyping();
initFx();
setFx(store.local().fx !== false);
initModal();
initSelect();
initToday(render);
initCalendar(render);
initProjects(render);
initGoals(render);
initIdeas(render);
initSettings(applyTheme);
initEditor();
initDnd((payload, target) => (target.startsWith("m") ? mealDrop(payload, target) : handleDrop(payload, target)));
initStats(render);
initTimer(render);
initReading(render);
initMeals(render);
initFriends(render);
initSun();

store.subscribe((meta) => {
  if (meta.pulled) { adoptGroups(); store.adoptMarks(); store.adoptColors(); store.settleIdeas(); }
  if (meta.local) setFx(store.local().fx !== false);
  if (!meta.quiet) render();
  else paintSync();
  if (meta.dirty) sync.queue();
});
store.onUndo((label, before) => toast(label, () => store.undo(before)));
reading.subscribe(() => { if (route() === "reading") render(); });
sync.onStatus(paintSync);

addEventListener("hashchange", () => { closeModal(); animateNext("page"); render(); scrollTo(0, 0); });
// 弹层里的日期框填完、离开了：填的时候没重画的编辑框（js/ui/modal.js 的 fillingDate）这时补画一次
on(document, "focusout", "#modal input[type=date]", () => setTimeout(render, 0));
phoneMQ.addEventListener("change", render);
darkMQ.addEventListener("change", () => { if (store.local().theme === "auto") { applyTheme(); render(); } });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") sync.beacon();
  else { tickDay(); syncThenLog(); }
});
addEventListener("online", () => syncThenLog());
setInterval(() => { if (document.visibilityState === "visible") syncThenLog(); }, 120000);
setInterval(tickDay, 60000);

on(document, "click", "[data-act=sync]", () => syncThenLog());
on(document, "click", ".psync", (e, el) => { if (el.title) toast(el.title); syncThenLog(); });
// 圆盘落着的时候盖在列表上：下面还有内容（没滚到底）就再淡一点
const underSun = () => document.getElementById("sun")?.classList.toggle("over", document.documentElement.scrollHeight - innerHeight - scrollY > 8);
addEventListener("scroll", underSun, { passive: true });
// 那颗日月：点一下，白天换夜里、夜里换白天（之后就不跟系统了；想再跟着系统，去 Settings → Look 选 Auto）
on(document, "click", "[data-act=theme-flip]", () => {
  store.setLocal({ theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark" });
  applyTheme();
});
on(document, "click", "[data-act=side-toggle]", () => store.setLocal({ sideMin: !store.local().sideMin }));

// 装到主屏后没网也能打开（只在 https 上，也就是 GitHub Pages）
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./sw.js").catch(() => {});

render();
// 早上的线要等表格里的数据拉下来再拍；连不上就 6 秒后用本机的
if (sync.configured()) await Promise.race([syncThenLog(), new Promise((r) => setTimeout(r, 6000))]);
else { adoptGroups(); store.adoptMarks(); store.adoptColors(); store.settleIdeas(); }
store.ensureTodayLog();
