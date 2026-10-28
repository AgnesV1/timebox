// 苦昼短：入口。管页面切换（#today / #calendar / #projects / #stats / #meals / #shop / #reading / #friends / #spending / #settings）、主题、同步时机、整页重画。
// 手机（≤760px）只有「今天」、下次采购的单子、阅读和设置；电脑有侧栏、日历和任务池、项目、统计、备餐。两边底部都有计时浮条。

import * as store from "./store.js";
import * as sync from "./sync.js";
import * as reading from "./reading.js";
import * as spend from "./spend.js";
import * as Meal from "./meals.js";
import { esc, on, icon, initDateTyping } from "./dom.js";
import { paintPatterns } from "./patterns.js";
import { initFx, setFx, confetti, refreshFxColors, tintSky } from "./fx.js";
import { toast, ballHTML } from "./ui/common.js";
import * as L from "./lists.js";
import { initModal, closeModal } from "./ui/modal.js";
import { initSelect } from "./ui/select.js";
import { todayHTML, initToday, shownDate, showDate, marquees } from "./ui/today.js";
import { calendarHTML, poolHTML, initCalendar, handleDrop } from "./ui/calendar.js";
import { projectsHTML, initProjects, refreshProjectEditor, projectAlerts } from "./ui/projects.js";
import { initGoals, goalDrop, goalsAfterRender } from "./ui/goals.js";
import { initLinks, afterRender as linksAfterRender } from "./ui/links.js";
import { initIdeas, ideasPhoneHTML } from "./ui/ideas.js";
import { settingsHTML, initSettings } from "./ui/settings.js";
import { initEditor, refreshEditor } from "./ui/editor.js";
import { initDnd } from "./ui/dnd.js";
import { statsHTML, initStats } from "./ui/stats.js";
import { dockHTML, initTimer, tick } from "./ui/timer.js";
import { choreDockHTML, initChores } from "./ui/chores.js";
import { initScores } from "./ui/scores.js";
import { initQuads } from "./ui/quads.js";
import { readingHTML, initReading } from "./ui/reading.js";
import { mealsHTML, shopHTML, initMeals, refreshMealEditor, mealDrop } from "./ui/meals.js";
import { friendsHTML, initFriends, refreshFriendEditor, friendsDue } from "./ui/friends.js";
import { renderSun, initSun } from "./ui/sun.js";
import { createSpending } from "./ui/spending.js";
import { initIsland, refreshIsland, closeIsland } from "./ui/island.js";
import { fxChanged, paintLefts } from "./ui/money.js";
import { animateNext, animateSoft, takeTransition, nameParts, dusk, measurePills, placePills, glidePills, rollNumbers, titleIn, initEdgeGlow } from "./motion.js";
import { lookAt, nextTurn } from "./day.js";

const phoneMQ = matchMedia("(max-width: 760px)");
const VIEWS = ["today", "calendar", "projects", "stats", "meals", "shop", "reading", "ideas", "friends", "spending", "settings"];
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

// 白天还是夜里跟着钟点走（js/day.js 的 lookAt：6 点到 18 点是白天；点过日月的管到下一个六点）。
// 白天夜里真的互换的那一下带一段过场（底边的霞光 = js/motion.js 的 dusk；日月换班的样子在 css 里）：先记着要换成什么，等下一次重画在过渡里一起换（draw 开头）。
// 刚打开、设置里关了动效、页面在后台：直接换
let themePaint = null, booted = false;
function applyTheme() {
  const dark = lookAt(store.local()) === "dark";
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
  // 四段，各管各的事：排时间的那四页 / 备餐 / 阅读 / 人。不写标题、不铺底色，只靠段和段之间的空隙分开；
  // 每段的图标是那个大类的油画色（排时间 = Build、备餐 = Chores、阅读 = Leisure、人 = Friends），大类改了颜色这里跟着变
  const tint = (name, fallback) => store.groups().find((g) => g.name === name)?.color || fallback;
  const blocks = [["todo", "Build", "#3E8E6E", [["today", "Today", todayOpen || ""], ["calendar", "Calendar", ""], ["projects", "Projects", projectAlerts(c) || ""], ["stats", "Stats", ""]]],
    ["meals", "Chores", "#9A5A36", [["meals", "Meals", deals || ""]]], ["read", "Leisure", "#E07A2B", [["reading", "Reading", ""]]], ["friends", "Friends", "#8B62AE", [["friends", "Friends", friendsDue(c.today) || ""]]],
    ["money", "", "#3F62B5", [["spending", "Spending", ""]]]];   // 记账：不是大类，用油画的那个蓝
  // 当前页那一项底下垫一块青柠（.snav-pill）：换页时它从旧的那项滑到新的那项（换页过渡里有名字，css 里 snav-pill）
  const link = ([v, t, n]) => '<a href="#' + v + '" class="' + (view === v ? "on" : "") + '" title="' + t + '">' + (view === v ? '<i class="snav-pill" aria-hidden="true"></i>' : "") + icon(v) + "<span>" + t + "</span>" + (n ? "<b>" + n + "</b>" : "") + "</a>";
  const st = sync.getStatus();
  // 收起来只剩一列图标（记在这台设备上）：名字放进 title，角标缩成一个点
  const min = Boolean(store.local().sideMin);
  return '<div class="brand">' + ballHTML() + "<h1>苦昼短</h1>" +
    '<button type="button" class="icon-btn side-tog" data-act="side-toggle" aria-expanded="' + !min + '" aria-label="' + (min ? "Show" : "Hide") + ' the sidebar labels" title="' + (min ? "Expand" : "Collapse") + '">' + icon(min ? "right" : "left") + "</button></div>" +
    '<nav class="snav">' + blocks.map(([b, g, fallback, links]) => '<div class="sblock" data-b="' + b + '" style="--tint:' + esc(tint(g, fallback)) + '">' + links.map(link).join("") + "</div>").join("") + "</nav>" +
    '<div class="sbot"><nav class="snav">' + link(["settings", "Settings", ""]) + "</nav>" +
    '<footer class="sfoot"><button type="button" class="sync-pill' + (st.bad ? " bad" : "") + '" data-act="sync" title="Sync now">' + icon("sync") + '<i class="sync-ld" aria-hidden="true">' + "<i></i>".repeat(9) + "</i>" + '<span data-sync-status>' + esc(st.text) + "</span></button></footer></div>";
}

// ---------- 记账（电脑上的 Spending 页，js/ui/spending.js；手机上是从顶上拉出来的面板，见 js/ui/island.js） ----------
// 那一页自己管自己（看到哪一期、填到一半的那一行都留着），整页重画时不重新生成：已经挂在 #main 上就不动它
let desk = null;
function showDesk() {
  if (!desk) desk = createSpending();
  if (desk.el.parentNode !== main || main.children.length !== 1) {
    main.replaceChildren(desk.el); desk.show();
    // 和手机拉开记账一样：马上要一次新的；一天没整份对过，就是整份（表格里手改的、别处改的都回来）
    if (store.setting("spend")?.url) { spend.wantFull(); sync.soon(); }
  }
}

// ---------- 整页重画（正在打字的输入框，值、光标都留住） ----------

// 重画前后留住正在填的东西（带 data-keep 的输入框）：页面、任务池、底部浮条（改钟点的框），还有弹层。
// 留住的是格子里现在的样子：别处改了它的值（比如点一档填上数），要先把格子改好再存，不然重画完又变回去
// 记的时候带上它在哪一块里（main / pool / dock / modal），同一个名字在两块里各算各的
const KEEP_IN = ["main", "pool", "dock", "modal"];
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
  const before = measurePills();
  const vt = document.startViewTransition(() => {
    draw();
    if (!rows) nameParts(main, false);
    if (kind === "theme") dusk(html.dataset.theme === "dark");
    glidePills(before, kind);
    if (kind === "page" || kind === "next" || kind === "prev") titleIn();
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
  if (!phone) spend.view(view === "spending");   // 电脑看着 Spending 时每次同步都带上记账（js/spend.js 的 due；手机上是拉下来那页自己说）
  if (view === "spending") showDesk();
  else main.innerHTML = view === "calendar" ? calendarHTML(c) : view === "projects" ? projectsHTML(c) : view === "stats" ? statsHTML(c) : view === "meals" ? mealsHTML(c) : view === "shop" ? shopHTML(c, phone) : view === "settings" ? settingsHTML(phone) : view === "reading" ? readingHTML(phone) : view === "ideas" ? ideasPhoneHTML(c) : view === "friends" ? friendsHTML(c) : todayHTML(c, phone);
  placePills();
  marquees(main);   // 手机今天页展开那一行放不下的「For …」链：自己滚
  if (document.startViewTransition) nameParts(main, true);
  rollNumbers();
  // 打开阅读页：同步时顺便拉一次阅读表格的列表（查重用）
  reading.want(view === "reading");
  if (view === "reading" && lastView !== "reading" && sync.configured()) sync.sync();
  lastView = view;
  const showPool = !phone && view === "calendar" && store.local().pool;
  pool.hidden = !showPool;
  pool.innerHTML = showPool ? poolHTML(c) : "";
  const hadDock = document.body.classList.contains("has-dock");
  dock.innerHTML = dockHTML(c, view === "today" && shownDate() === c.today && (!phone || Boolean(store.local().url)), (t) => (store.isChore(t) ? choreDockHTML() : null));
  document.body.classList.toggle("has-dock", Boolean(dock.innerHTML));
  document.body.classList.toggle("timing", Boolean(store.timer()));   // 地平线（白天的网点、夜里的霓虹网格地面）只在有任务正在计时的时候出现
  if (!hadDock) dock.firstElementChild?.classList.add("enter");   // 只在浮条刚出现时滑上来，重画时不闪
  // 计时中边上那道光：重画一次浮条就是新的元素，按钟表接着原来的位置跑，不从头来（css 的 .dock.run::after，一圈 3.2 秒）
  dock.firstElementChild?.style.setProperty("--trail-at", (-(performance.now() / 1000) % 3.2).toFixed(2) + "s");
  // 圆盘落着的时候坐在浮条上面
  document.body.style.setProperty("--dock-h", dock.firstElementChild ? dock.firstElementChild.offsetHeight + 22 + "px" : "0px");
  renderSun(c, view === "today" && (!phone || store.local().url) ? shownDate() : "");
  underSun();
  tick();
  paintSync();
  refreshEditor();
  refreshProjectEditor();
  goalsAfterRender();   // 右栏滚回原来的地方（要在连线重画之前，线才量得对）
  linksAfterRender();
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
    // 正在同步：图标换成转着的小图（白天网点、夜里雷达），字上扫一道光；刚变成出错：整颗抖一下
    const pill = el.closest(".sync-pill");
    if (pill) { pill.classList.toggle("busy", text === "Syncing…"); if (bad && !wasBad) pill.classList.add("shk"); }
  });
  wasBad = bad;
}
let wasBad = false;

// 今天排的都做完了（至少三件；可选的、Chores、没标的计划那一块的头不算）：一天只庆祝一次
function celebrate(c, view) {
  if (view !== "today" || shownDate() !== c.today) return;
  const list = store.tasksOn(c.today).filter((t) => !t.optional && !store.isChore(t) && (t.status || !L.isContainer(c, t)));
  if (list.length < 3 || list.some((t) => t.status !== "done")) return;
  if (localStorage.getItem("kuzhouduan-celebrated") === c.today) return;
  localStorage.setItem("kuzhouduan-celebrated", c.today);
  confetti();
  toast("All done ✓ Nice.");
}

// ---------- 同步时机 ----------

// 第一次用上大类：现有的计划按名字归进六个大类（等从表格拉到最新的再归，见下面的 subscribe；没连表格就直接归）
function adoptGroups() {
  const done = store.adoptGroups();
  if (done) toast("Projects sorted into " + done.names.join(", "), done.undo);
}

// 同步完：今天该自己出现的排进来
async function syncThenLog() {
  await sync.sync();
  store.ensureToday();
  store.ensureNorthStar(store.today());   // 原来最远那一年的目标搬进 North star（只一次；等拉完表格再看，免得漏掉别的设备上的）
}

let lastToday = store.today();
function tickDay() {
  const t = store.today();
  if (lookAt(store.local()) !== document.documentElement.dataset.theme) applyTheme();   // 页面开着过了六点（或点日月的那一段到头了）：换班
  if (t !== lastToday) {
    lastToday = t;
    store.settleLists();
    store.ensureToday();
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
initLinks();
initIdeas(render);
initSettings();
initEditor();
initDnd((payload, target) => (target.startsWith("gcol:") ? goalDrop(payload, target) : target.startsWith("m") ? mealDrop(payload, target) : handleDrop(payload, target)));
initStats(render);
initTimer(render);
initChores(render);
initScores(render);
initQuads(render);
initReading(render);
initMeals(render);
initFriends(render);
initSun();

store.subscribe((meta) => {
  if (meta.pulled) { adoptGroups(); store.adoptMarks(); store.adoptColors(); store.settleIdeas(); store.adoptQuads(); store.adoptLists(); store.settleLists(); }
  if (meta.local) setFx(store.local().fx !== false);
  if (!meta.quiet) render();
  else paintSync();
  if (meta.dirty) sync.queue();
  // 记账的汇率在 Settings 里（spend-fx）：改了（这台设备或同步过来的）记账那两块跟着换算
  if (fxChanged()) { if (desk && desk.el.isConnected) desk.refresh(); refreshIsland(); }
});
store.onUndo((label, before) => toast(label, () => store.undo(before)));
reading.subscribe(() => { if (route() === "reading") render(); });
// 记账：本机改了就同步；两边的界面各自刷新
spend.subscribe((meta) => {
  if (meta.dirty) sync.soon(); else if (meta.again) sync.queue();
  if (meta.quiet) return;   // 拉回来什么都没变
  if (desk && desk.el.isConnected) desk.refresh();
  refreshIsland();
  paintLefts();   // 今天页 Spend 左边的「… left」
});
initIsland({ isPhone: () => phoneMQ.matches, onToday: () => route() === "today" && document.getElementById("modal").hidden });
// 电脑上 Spending 页：按 N 记一笔，按 / 跳到搜索（正在打字的时候不算）
addEventListener("keydown", (e) => {
  if ((e.key !== "n" && e.key !== "/") || e.metaKey || e.ctrlKey || e.altKey || phoneMQ.matches || route() !== "spending" || !desk) return;
  if (e.target.closest?.("input, textarea, select, [contenteditable]") || !document.getElementById("modal").hidden) return;
  e.preventDefault();
  if (e.key === "n") desk.startNew(); else desk.focusSearch();
});
sync.onStatus(paintSync);

addEventListener("hashchange", () => { closeModal(); animateNext("page"); render(); scrollTo(0, 0); });
// 弹层里的日期框填完、离开了：填的时候没重画的编辑框（js/ui/modal.js 的 fillingDate）这时补画一次
on(document, "focusout", "#modal input[type=date]", () => setTimeout(render, 0));
phoneMQ.addEventListener("change", () => { closeIsland(); render(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") sync.beacon();
  else { tickDay(); syncThenLog(); }
});
addEventListener("online", () => syncThenLog());
// 页面看得见的时候每 30 秒拉一次（她 10-25 要的：手机上改了，电脑这边没事就拉一下）；拉回来没变化不重画（store / spend 的 quiet）。
// 点回这个窗口（focus）时离上次同步超过 10 秒也马上拉一次
setInterval(() => { if (document.visibilityState === "visible") syncThenLog(); }, 30000);
addEventListener("focus", () => { if (Date.now() - sync.lastAt > 10000) syncThenLog(); });
setInterval(() => { tickDay(); tintSky(); }, 60000);   // 天色跟着钟点慢慢变（js/day.js 的 skyAt）

// 侧栏的 Today 永远是今天：日历里点过某一天、或在今天页往前翻过，从这里回来都从今天看起（已经在今天页上也照样翻回今天）
on(document, "click", '#side a[href="#today"]', () => { showDate(store.today()); render(); });
on(document, "click", "[data-act=sync]", () => syncThenLog());
on(document, "click", ".psync", (e, el) => { if (el.title) toast(el.title); syncThenLog(); });
// 圆盘落着的时候盖在列表上：下面还有内容（没滚到底）就再淡一点
const underSun = () => document.getElementById("sun")?.classList.toggle("over", document.documentElement.scrollHeight - innerHeight - scrollY > 8);
addEventListener("scroll", underSun, { passive: true });
// 那颗日月：点一下，白天换夜里、夜里换白天，管到下一个早 6 点 / 晚 6 点，之后又跟着钟点
on(document, "click", "[data-act=theme-flip]", () => {
  store.setLocal({ themeHold: { v: document.documentElement.dataset.theme === "dark" ? "light" : "dark", until: nextTurn() } });
  applyTheme();
});
// 点分段开关：这次重画算用户点的（选中的那块滑过去）；那个开关自己已经要了别的过渡的，不改它
on(document, "click", "#main .seg > button", () => animateSoft());
initEdgeGlow();
on(document, "click", "[data-act=side-toggle]", () => store.setLocal({ sideMin: !store.local().sideMin }));

// 装到主屏后没网也能打开（只在 https 上，也就是 GitHub Pages）。网页本身用存着的那份秒开（sw.js）；
// 新版装好、接管了（controllerchange）：打开以后还没碰过屏幕 / 键盘就直接刷新成新版，碰过了只弹一句、点 Reload 再刷（不打断正在做的）
let touched = false;
addEventListener("pointerdown", () => { touched = true; }, { capture: true, once: true });
addEventListener("keydown", () => { touched = true; }, { capture: true, once: true });
if ("serviceWorker" in navigator && location.protocol === "https:") {
  const had = Boolean(navigator.serviceWorker.controller);   // 第一次装上不算「新版」
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!had) return;
    if (!touched) { sync.beacon(); location.reload(); return; }
    toast("New version ready", () => { sync.beacon(); location.reload(); }, "Reload");
  });
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

// 电脑：标签页开着的话，每天 06:00、18:00 自己刷新一次（拿新版、整份重新同步；她说这两个钟点一般不在用）。
// 到点时正在用（输入框里、弹层开着、在拖、两分钟内动过键盘鼠标）就等，每分钟再看，空下来再刷；一个时段只刷一次。
// 手机做不到：iPhone 不让网页关着 / 在后台时跑代码，只能在打开时换新版（上面那段）
let lastInput = Date.now();
for (const ev of ["pointerdown", "keydown", "wheel"]) addEventListener(ev, () => { lastInput = Date.now(); }, { capture: true, passive: true });
function reloadSlot(now = new Date()) {
  const h = now.getHours();
  if (h < 6) return "";
  const day = now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate();
  return day + (h >= 18 ? " 18" : " 06");
}
function autoReload() {
  if (phoneMQ.matches) return;
  const slot = reloadSlot(), seen = localStorage.getItem("kuzhouduan-reloaded") || "";
  if (!seen) { localStorage.setItem("kuzhouduan-reloaded", slot); return; }   // 头一回：记下现在这个时段，从下一个时段开始
  if (!slot || slot === seen) return;
  const a = document.activeElement, busy = a?.matches?.("input, textarea, select, [contenteditable]") || !document.getElementById("modal")?.hidden ||
    document.body.classList.contains("dragging") || Date.now() - lastInput < 120000;
  if (busy) return;
  localStorage.setItem("kuzhouduan-reloaded", slot);
  sync.beacon();
  location.reload();
}
setInterval(autoReload, 60000);

render();
// 今天该自己出现的、过了那天回 Pool 的，要等表格里的数据拉下来再看；连不上就 6 秒后用本机的
if (sync.configured()) await Promise.race([syncThenLog(), new Promise((r) => setTimeout(r, 6000))]);
else { adoptGroups(); store.adoptMarks(); store.adoptColors(); store.settleIdeas(); store.adoptQuads(); store.adoptLists(); store.settleLists(); }
store.ensureToday();
