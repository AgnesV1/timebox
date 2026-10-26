// 几个页面都用得到的小块：颜色、安全线卡片、进度条、拖延账单、健康标签、提示条

import * as E from "../engine.js";
import * as G from "../goals.js";
import * as store from "../store.js";
import * as L from "../lists.js";
import { esc } from "../dom.js";
import { fmtMin, fmtHours, hoursOf } from "../dates.js";
import { zebraFor } from "../patterns.js";

export const STATUS = [["done", "Done"], ["delay", "Delay"], ["drop", "Drop"]];

// 侧栏左上 / 手机顶栏的那颗日月：白天是太阳、夜里是月亮（颜色在 css 的 .ball），点一下换白天 / 夜里（js/main.js）。
// 上面一层镜面球的细格：纬线不动，八条经线各自走到下一条的位置（--a → --b 是这一格起止的 sin 值），首尾相接，看着就是球绕着竖轴在转
const RAD = Math.PI / 180;
const BALL = '<svg viewBox="0 0 100 100" aria-hidden="true"><g class="ball-grid">' +
  [-67.5, -45, -22.5, 0, 22.5, 45, 67.5].map((f) => { const y = 50 + 50 * Math.sin(f * RAD), w = 50 * Math.cos(f * RAD); return '<path d="M' + (50 - w).toFixed(1) + " " + y.toFixed(1) + "H" + (50 + w).toFixed(1) + '"/>'; }).join("") +
  Array.from({ length: 8 }, (_, k) => -90 + k * 22.5).map((t) => '<path class="ball-lon" style="--a:' + Math.sin(t * RAD).toFixed(3) + ";--b:" + Math.sin((t + 22.5) * RAD).toFixed(3) + '" d="M50 0A50 50 0 0 1 50 100"/>').join("") +
  '</g><circle class="ball-shine" cx="33" cy="30" r="9"/></svg>';
export const ballHTML = () => '<button type="button" class="ball" data-act="theme-flip" aria-label="Switch between day and night" title="Day / night">' + BALL + "</button>";

export const projectOf = (t) => (t.projectId ? store.get("projects", t.projectId) : null);

// 两层：上一层「项目」= 大类（计划的 group），下面是计划（projects 表里的行）。
// 分好组：[{ name, subs }]，先按大类清单的顺序，再是清单里没有的名字，没有大类的那些放最后（name 为空）。
// all = 清单里的大类哪怕下面没有计划也列出来（Projects 页用）
export function groupsOf(projects, { all = false } = {}) {
  const map = new Map();
  for (const g of store.groups()) map.set(g.name, []);
  for (const p of projects) {
    const g = String(p.group || "").trim();
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(p);
  }
  const listed = new Set(store.groups().map((g) => g.name));
  const out = [...map.entries()].filter(([g, subs]) => g && (subs.length || (all && listed.has(g)))).map(([name, subs]) => ({ name, subs }));
  if (map.get("")?.length) out.push({ name: "", subs: map.get("") });
  return out;
}

// 下拉框：每个大类一组，组里第一项是大类自己（直接挂在大类上，值 g:<名字>），下面是它的计划（值 = 计划 id）。
// direct = false 时只列计划（任务池里加条目要落在某个计划上）
export function projectOptions(projects, selected = "", none = "No project", direct = true) {
  const opt = (p) => '<option value="' + p.id + '"' + (p.id === selected ? " selected" : "") + ' data-color="' + esc(p.color || "") + '">' + esc(p.name) + "</option>";
  const self = (g) => { const v = "g:" + g.name, x = store.groupByName(g.name); return x && direct ? '<option value="' + esc(v) + '"' + (v === selected ? " selected" : "") + ' data-self data-color="' + esc(x.color || "") + '">' + esc(g.name) + "</option>" : ""; };
  return (none === null ? "" : '<option value="">' + none + "</option>") + groupsOf(projects, { all: direct }).map((g) =>
    g.name ? '<optgroup label="' + esc(g.name) + '">' + self(g) + g.subs.map(opt).join("") + "</optgroup>" : g.subs.map(opt).join("")).join("");
}

// 下拉选中的值 → 任务挂在哪：计划，或者直接挂在大类上
export const pickTarget = (v) => (String(v || "").startsWith("g:") ? { projectId: "", group: String(v).slice(2) } : { projectId: String(v || ""), group: "" });
// 任务现在挂在哪（下拉的值）
export const targetOf = (t) => t.projectId || (t.group ? "g:" + t.group : "");

// 「Main - French · Module #4」
export const fullName = (p) => (p.group ? p.group + " · " : "") + p.name;

// 任务的颜色：计划的颜色；直接挂在大类上的用大类的；都没有是灰
export function colorOf(t) {
  return projectOf(t)?.color || store.groupByName(t.group)?.color || "var(--c-None)";
}

// 加任务 / 改任务 / 补时间的下拉里能选的计划：在用的，不含循环小事（那是一条重复，不是能往下挂任务的计划）。keep = 任务现在挂着的那个，留着
// 加任务的下拉里列哪些计划：在用的，循环小事（固定星期几、Pool 里没东西）除外
export const pickable = (projects, keep = "") => projects.filter((p) => (E.isActive(p) && (!E.isRepeat(p) || L.itemsOf(store.ctx(), p.id).length)) || (keep && p.id === keep));

// 任务旁边那个小标签：计划的名字；直接挂在大类上的、还有循环小事的那一次（它直接算在大类上），是大类的名字
export function badgeOf(t) {
  const p = projectOf(t);
  if (p && E.isRepeat(p)) return p.group ? { name: p.group, color: store.groupByName(p.group)?.color || p.color || "" } : null;
  return p ? { name: p.name || "", color: p.color || "" } : t.group ? { name: t.group, color: store.groupByName(t.group)?.color || "" } : null;
}

// 「For B2 exam → Mock exam → Pass B2 → … → ✦ North star 里那条」：这件事是为了什么（过了期、收进往期的目标不在链上，接到往上第一条还在的）。
// 第一个是它的计划（没有计划、或者是循环小事的，是项目），带那个颜色；后面是它服务的目标，一层层往上（计划自己没连目标的，用它所在项目连着的，见 js/goals.js）。
// 连着几个目标就几行，最多 max 行，多的写「+N more」。fold：一条链超过这么多个目标时，只留前面几个和最后一个，中间折成「⋯」（手机上省地方，点了展开）
export function chainHTML({ planId = "", group = "", head = null, max = 2, fold = 0 } = {}) {
  const goals = store.goals(), vis = goals.length ? G.visibleSet(goals, store.today()) : null;   // 收进往期的目标越过去（js/goals.js）
  const chains = goals.length && head?.name ? G.chainsFor(goals, G.goalsFor(goals, { planId, group }, vis), vis) : [];
  if (!chains.length) return "";
  const step = (g) => '<i aria-hidden="true">→</i><span' + (g.span === "north" ? ' class="ch-star"' : "") + ' title="' + esc(g.text) + '">' + esc(g.text) + "</span>";
  const line = (ch) => '<p class="chain"><span class="ch-for">For</span><b style="--pc:' + esc(head.color || "var(--c-None)") + '">' + esc(head.name) + "</b>" +
    (fold && ch.length > fold ? ch.slice(0, fold - 1).map(step).join("") + '<i aria-hidden="true">→</i><button type="button" class="ch-fold" data-act="chain-all" title="' + esc(ch.slice(fold - 1, -1).map((g) => g.text).join(" → ")) + '" aria-label="Show the whole chain">⋯</button>' + step(ch[ch.length - 1])
      : ch.map(step).join("")) + "</p>";
  const rest = chains.slice(max);
  return '<div class="chains">' + chains.slice(0, max).map(line).join("") +
    (rest.length ? '<p class="chain ch-more" title="' + esc(rest.map((ch) => ch.map((g) => g.text).join(" → ")).join("\n")) + '">+' + rest.length + " more</p>" : "") + "</div>";
}
export const taskChainHTML = (t, max = 2, fold = 0) => chainHTML({ planId: t.projectId || "", group: store.groupOf(t), head: badgeOf(t), max, fold });

export function zebraOf(t) {
  const c = projectOf(t)?.color || store.groupByName(t.group)?.color;
  return c ? zebraFor(c) : "var(--zebra-None)";
}

// 今天那条轴上的一段，只看记下的时间：
//   还没标的：长度 = 预计（记下的超过预计就按记下的），实心 = 记下的那截，剩下的斑马纹 = 还没做
//   标过的（Done / Delay / Drop）：不再占这一天的计划，只剩记下的那截实心；一点没记的不画
export function segHTML(t) {
  const est = Number(t.est) || 0, got = E.spentMin(t), open = E.isOpen(t);
  const len = open ? Math.max(est, got) : got;
  if (!(len > 0) && !open) return "";
  const c = colorOf(t), fill = len > 0 ? Math.min(100, (got / len) * 100) : 0;
  const bg = open ? "linear-gradient(90deg," + c + " " + fill.toFixed(1) + "%,transparent 0)," + zebraOf(t) + " 0 0/22px 22px,var(--track)" : c;
  return '<i title="' + esc(t.title) + " · " + (got ? fmtMin(got) + " of " : "") + est + ' min" style="flex-grow:' + Math.max(5, len) + ";background:" + bg + '"></i>';
}

// 今天页顶上的大数字：做了多少 / 今天排了多少（各项「大概多久」加起来）· 盒子 = 那天的可用时间。
// 以前这里是「今天的线」（按截止日倒推的份额），她 2026-10-25 换掉了
export function heroHTML(c, d) {
  const day = E.daySummary(c, d);
  const scale = Math.max(day.cap, day.planned, day.done, 60);
  const over = day.cap > 0 && day.planned > day.cap;
  const pct = (v) => Math.min(100, (v / scale) * 100).toFixed(1) + "%";
  return '<section class="hero free">' +
    '<div class="hero-k">' + (d === c.today ? "Today" : "This day") + "</div>" +
    '<div class="nums"><span class="big" data-roll="hero-' + d + '">' + hoursOf(day.done) + '</span><span class="of">/ ' + fmtHours(day.planned) + " picked</span>" +
    '<span class="state quiet">' + (day.rest ? "Rest day" : day.cap ? "box " + fmtHours(day.cap) + (over ? " · over" : "") : "") + "</span></div>" +
    '<div class="meter"><div class="fill" style="width:' + pct(day.done) + '"></div>' + (day.cap && day.cap < scale ? '<i class="tick" style="left:' + pct(day.cap) + '"></i>' : "") + "</div></section>";
}

export function stripHTML(c, d, tasks) {
  const day = E.daySummary(c, d);
  const over = day.cap > 0 && day.planned > day.cap;
  return '<div class="strip">' + tasks.map(segHTML).join("") + "</div>" +
    '<div class="stripmeta' + (over ? " over" : "") + '"><span>' + hoursOf(day.planned) + " / " + (day.cap ? fmtHours(day.cap) : "—") + " planned" + (over ? " · over" : "") + "</span><span>" + fmtHours(day.done) + " done</span></div>";
}


// ---------- emoji 记号（Restock 的标记、Ideas 的类别） ----------
// tags = [[key, emoji, 名字]]。名字只在 title / aria-label 里，界面上只露 emoji。

// 挑一个：一排 emoji 小块，选着的那个亮；再点一下选着的 = 不要了（由调用的地方决定）
export function emojiPickHTML(act, tags, cur) {
  return '<span class="em-pick">' + tags.map(([k, e, name]) => '<button type="button" class="chip' + (cur === k ? " on" : "") + '" data-act="' + act + '" data-v="' + k + '" aria-pressed="' + (cur === k) + '" title="' + esc(name) + '" aria-label="' + esc(name) + '">' + e + "</button>").join("") + "</span>";
}

// 页面顶上的筛选：All + 有东西的那几个记号（带个数）；cur = 正在看的那个，空 = 全部。一样东西都没有就不画
export function tagFilterHTML(act, tags, counts, cur) {
  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  if (!total) return "";
  const b = (k, label, n, title) => '<button type="button" class="tagf-b' + (cur === k ? " on" : "") + '" data-act="' + act + '" data-v="' + k + '" aria-pressed="' + (cur === k) + '"' + (title ? ' title="' + esc(title) + '"' : "") + ">" + label + ' <small class="num">' + n + "</small></button>";
  return '<div class="tagf" role="group" aria-label="Filter">' + b("", "All", total) + tags.filter(([k]) => counts[k] || cur === k).map(([k, e, name]) => b(k, e, counts[k] || 0, name)).join("") + "</div>";
}

// ---------- 提示条（带撤销） ----------

let toastTimer = 0;
// label：按钮上的字（默认 Undo；新版提示用 Reload）
export function toast(msg, undoFn, label = "Undo") {
  const box = document.getElementById("toast");
  if (!box) return;
  box.innerHTML = "<span>" + esc(msg) + "</span>" + (undoFn ? '<button type="button">' + esc(label) + "</button>" : "");
  box.hidden = false;
  box.classList.remove("show", "out");
  void box.offsetWidth;
  box.classList.add("show");
  const btn = box.querySelector("button");
  if (btn) btn.onclick = () => { undoFn(); hide(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, 6000);
  // 走的时候往下沉着淡掉（css 的 #toast.out，0.2 秒）；系统要求减少动态就直接收
  function hide() {
    box.classList.remove("show");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { box.hidden = true; return; }
    box.classList.add("out");
    setTimeout(() => { if (box.classList.contains("out")) { box.classList.remove("out"); box.hidden = true; } }, 200);
  }
}
