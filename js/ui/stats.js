// 统计页（电脑）。最上面：看哪段时间（Week / Month / Season / Year / 自己选两头；每次打开都从 Month 开始）、只看哪几个项目 / 计划（可以勾好几个）、只看深度。
// 下面两个页签：
//   Time —— 时间去哪了：每天的柱子、一天 24 小时的饼图（带 On the side）、几点在干活（停在星期几上看那天平均多久）、Build 花了多久和其中多少是深度、时间表（项目 × 日子，点开看它下面的计划）。
//   柱子默认只看 Build、热力图默认看全部（右上角都能切）；大类永远按 Build、Work、Friends、Leisure、Fitness、Chores 排（js/groups.js 的 ORDER）
// 颜色的规矩：青柠 = 总量（每天的柱子）；项目自己的颜色 = 按项目拆开的图（饼图、时间表、星期几、几点在干活）。
//   Plan —— 计划执行得怎样：做完多少、守住几天线、估时准不准、各项目、没做完的原因、项目健康
// 图都是 HTML / SVG 画的，鼠标移上去有读数，数字都另有一份表格 / 图例可以看。
// 「On the side」在饼图那一块里按月填一个总数：边健身边通勤边看的剧 / 小说（js/stats.js 的 sideHaze），只在饼图里压一段流光。

import * as store from "../store.js";
import * as S from "../stats.js";
import * as E from "../engine.js";
import { esc, on, icon } from "../dom.js";
import { fmtHours, fmtShort, fmtDay, WEEKDAYS, MONTHS, MONTHS_LONG, weekday, addDays, diffDays, quarterOf } from "../dates.js";
import { groupsOf } from "./common.js";
import { hourLabel } from "../day.js";
import { neon } from "../groups.js";

let kind = "month";   // 档位：每次打开都从 Month 开始，换了以后这次用着的时候一直是它
let tab = "";         // time / plan
let anchor = "";
let custom = null;    // 自己选的两头 { from, to }
const picks = new Set();   // 只看哪几个：g:<大类> / p:<计划 id> / none（哪都没挂的）；一个都不勾 = 全部，按大类分
let pickOpen = false;      // 勾选的那块开着：重画时别收起来
let deepOnly = false;
let adjust = false;   // 饼图底下「Adjust」开着
const view = { trend: "build", heat: "all" };   // 柱子默认只看 Build、热力图默认 All（她定的）；这次打开记着
let sideMonth = "";   // On the side 那一格选着的月份
const tips = {};   // 图表 id → 每根柱子的读数

const PREV = { week: "last week", month: "last month", season: "last season", year: "last year", custom: "the stretch before" };
const pct = (v) => Math.round(v * 100) + "%";
const share = (v, total) => (total > 0 ? (v / total < 0.005 ? "<1%" : pct(v / total)) : "—");
const groupName = (p) => String(p.group || "").trim() || p.name || "";

function remember() {
  if (!tab) tab = store.local().statsTab === "plan" ? "plan" : "time";
}

function rangeOf(c) {
  if (kind !== "custom") return S.periodRange(kind, anchor, store.prefs().weekStartsOn);
  if (!custom) custom = { from: addDays(c.today, -6), to: c.today };
  return { ...custom };
}

// 只看勾了的那几个 / 只看深度：把任务（和计划）先筛好，后面的计算照旧。
// 分行：一个都没勾 = 按大类；只勾了一个大类 = 按它里面的计划拆开；别的情况 = 勾了的每个一行
function scope(c) {
  const names = new Set([...c.groups.map((g) => g.name), ...c.projects.map(groupName)]);
  for (const k of [...picks]) if (k !== "none" && !(k.startsWith("p:") ? c.projects.some((p) => p.id === k.slice(2)) : names.has(k.slice(2)))) picks.delete(k);   // 勾的那个已经没了
  if (!picks.size && !deepOnly) return { c, by: "group", on: false };
  const keyOf = (t) => {
    const p = t.projectId ? E.projectById(c, t.projectId) : null, g = S.rowOf(c, t, "group").name;
    return p && picks.has("p:" + p.id) ? "p" : g && picks.has("g:" + g) ? "g" : !p && !g && picks.has("none") ? "n" : "";
  };
  const only = picks.size === 1 ? [...picks][0] : "";
  const by = !picks.size ? "group" : only.startsWith("g:") ? "plan"
    : (t) => { const k = keyOf(t); return k === "p" ? S.rowOf(c, t, "plan") : k === "g" ? S.rowOf(c, t, "group") : { name: "", color: "" }; };
  return {
    c: { ...c, tasks: c.tasks.filter((t) => (!picks.size || keyOf(t)) && (!deepOnly || t.deep)), projects: picks.size ? c.projects.filter((p) => picks.has("p:" + p.id) || picks.has("g:" + groupName(p))) : c.projects },
    by, on: true
  };
}

function niceMax(v) {
  const steps = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720, 900, 1200, 1500, 1800, 2400, 3000, 3600, 4800, 6000, 7200, 9000, 12000, 18000];
  return steps.find((s) => s >= v) || Math.ceil(v / 6000) * 6000;
}

function rangeLabel(r) {
  const y = r.from.slice(0, 4);
  const other = (d) => (d.slice(0, 4) !== String(new Date().getFullYear()) ? ", " + d.slice(0, 4) : "");
  if (kind === "month") return MONTHS_LONG[Number(r.from.slice(5, 7)) - 1] + " " + y;
  if (kind === "season") return "Q" + quarterOf(r.from) + " " + y;
  if (kind === "year") return y;
  return fmtShort(r.from) + " – " + fmtShort(r.to) + other(r.to);
}

// 和上一段比：▲ / ▼ 加文字，涨了是好事就用「好」的颜色
function delta(cur, prev, fmt, goodUp = true) {
  if (cur === null || prev === null || prev === undefined) return "";
  const d = cur - prev;
  if (Math.abs(d) < 1e-6) return '<span class="delta">Same as ' + PREV[kind] + "</span>";
  const up = d > 0;
  return '<span class="delta ' + (up === goodUp ? "good" : "bad") + '">' + (up ? "▲ " : "▼ ") + fmt(Math.abs(d)) + " vs " + PREV[kind] + "</span>";
}

function tile(label, value, sub, dlt = "") {
  return '<div class="tile"><p class="tl">' + label + '</p><p class="tv">' + value + "</p>" + (sub ? '<p class="ts">' + sub + "</p>" : "") + dlt + "</div>";
}

// Time 页签顶上一条细条（她挑的，替掉原来两块大卡片）：左边 Build 花了多久、其中多少深度、比上一段；右边全部一共、深度、平均一天。
// b、bp = 只看 Build 的这一段和上一段；没有 Build 就只有全部那一半（带比上一段）
function timeStrip(s, p, b, bp, name) {
  const n = (v, cls = "") => '<b class="num' + (cls ? " " + cls : "") + '">' + fmtHours(v) + "</b>";
  const all = "All " + n(s.spent) + ' <span class="ss-m">· ◆ ' + fmtHours(s.deep) + (s.days ? " · ~" + fmtHours(s.avgSpent) + " a day" : "") + "</span>";
  if (!b) return '<div class="st-strip"><span>' + all + "</span>" + delta(s.spent, p.spent, fmtHours) + "</div>";
  return '<div class="st-strip"><span>' + esc(name) + " " + n(b.spent, "ss-b") + "</span><span>◆ deep " + n(b.deep) + "</span>" + delta(b.spent, bp.spent, fmtHours) +
    '<span class="ss-all">' + all + "</span></div>";
}

// 柱子 / 热力图右上角：Build | All
const viewSeg = (which, name) => '<span class="seg">' + [["build", esc(name)], ["all", "All"]].map(([v, l]) => '<button type="button" data-act="st-view" data-w="' + which + '" data-v="' + v + '"' + (view[which] === v ? ' class="on"' : "") + ">" + l + "</button>").join("") + "</span>";

// Plan 页签：做完多少、估时准不准
function planKpis(s, p) {
  const acc = s.accuracy;
  const accText = acc === null ? "Fill in Actual min on done tasks to see this"
    : Math.abs(acc - 1) < 0.05 ? "Your estimates are about right"
    : acc > 1 ? "Tasks take " + pct(acc - 1) + " longer than planned" : "Tasks take " + pct(1 - acc) + " less than planned";
  return '<div class="kpis">' +
    tile("Tasks done", String(s.done), s.counted ? pct(s.rate) + " of " + s.counted + " planned" : "No tasks yet", delta(s.done, p.done, String)) +
    tile("Estimates", acc === null ? "—" : acc.toFixed(2) + "×", accText + (s.timed ? " · " + s.timed + " timed" : "")) +
    "</div>";
}

// ---------- 每天的柱子：Time 页签看记了多久（深度在底下），Plan 页签看做了多少 vs 计划多少 ----------

// 横轴标签：一周以内 = 星期几；按周合起来的 = 每月第一周标月份（按这一周的周四算，跨年那周不会多标一个月）；其他 = 1 号和 5 的倍数。
// 离上一个标签不到 3 根柱子的就不标，免得挤在一起
function axisLabels(rows, byWeek) {
  let lastShown = -9;
  return rows.map((r, i) => {
    if (rows.length <= 7 && !byWeek) return WEEKDAYS[weekday(r.date)];
    let text = "";
    if (byWeek) {
      const m = addDays(r.date, 3).slice(5, 7);
      if (i === 0 || addDays(rows[i - 1].date, 3).slice(5, 7) !== m) text = MONTHS[Number(m) - 1];
    } else {
      const d = Number(r.date.slice(8));
      if (i === 0 || d === 1) text = fmtShort(r.date);
      else if (d % 5 === 0) text = String(d);
    }
    if (!text || i - lastShown < 3) return "";
    lastShown = i;
    return text;
  });
}

// 三个多月以上一天一根太挤，按周合起来
const trendRows = (s) => { const byWeek = s.daily.length > 92; return { byWeek, rows: byWeek ? S.weekly(s.daily, store.prefs().weekStartsOn) : s.daily }; };
// 柱子多（Season 一天一根、Year 一周一根）的时候很细，白天那圈黑边太抢眼：标上 data-dense，css 里换成细的深绿边
const dense = (rows) => (rows.length > 40 ? " data-dense" : "");

// Time 页签的柱子：每天记了多久；深度到哪，哪里就有一道潮水线——同一个青柠深一点、水面在晃、往下很快淡掉（像浪花打在岸上那一小段），
// 柱子还是一根，不另起颜色。两层浪错开着走，每根柱子的起点按位置错开。设了深度目标就画一条虚线
function timeTrendHTML(s, seg = "") {
  const { byWeek, rows } = trendRows(s);
  const max = niceMax(Math.max(60, ...rows.map((r) => Math.max(r.spent, r.goal || 0))));
  const h = (v) => Math.min(100, (v / max) * 100).toFixed(2) + "%";
  const top = Math.max(...rows.map((r) => r.spent));
  const labels = axisLabels(rows, byWeek);
  tips.ttrend = rows.map((r) => ({
    title: byWeek ? "Week of " + fmtShort(r.date) : fmtDay(r.date),
    rows: [["Logged", fmtHours(r.spent), "dn"], ["Deep", fmtHours(r.deep), "tide"], ...(r.goal ? [["Deep goal", fmtHours(r.goal), "dgoal"]] : [])]
  }));
  const insight = s.days
    ? "You logged <b>" + fmtHours(s.avgSpent) + "</b> a day on average" + (s.deep ? ", <b>" + fmtHours(s.deep / s.days) + "</b> of it deep." : ".")
    : "This period hasn't started yet.";
  return '<figure class="card chart"><figcaption><div><h3>Time per ' + (byWeek ? "week" : "day") + "</h3><p>" + insight + "</p></div>" +
    '<div class="legend">' + seg + '<span><i class="k tide"></i>Deep</span><span><i class="k dn"></i>Logged</span>' + (s.goal ? '<span><i class="k dgoal"></i>Deep goal</span>' : "") + "</div></figcaption>" +
    '<div class="plot">' + [1, 0.5, 0].map((f) => '<i class="grid" style="bottom:' + f * 100 + '%"><span class="num">' + (f ? fmtHours(max * f) : "0") + "</span></i>").join("") +
    '<div class="cols" data-chart="ttrend"' + dense(rows) + ">" + rows.map((r, i) =>
      '<div class="col' + (r.future ? " future" : "") + '" data-i="' + i + '" tabindex="0" aria-label="' + esc(tips.ttrend[i].title + ": " + fmtHours(r.spent) + " logged, " + fmtHours(r.deep) + " deep") + '">' +
      (r.spent ? '<i class="dn solo" style="height:' + h(r.spent) + '"></i>' : "") +
      (r.deep ? '<i class="tide" style="height:' + h(r.deep) + '"><span class="wv" style="animation-delay:-' + ((i * 0.7) % 5).toFixed(1) + "s,-" + ((i * 1.3) % 7).toFixed(1) + 's"></span><span class="wv b" style="animation-delay:-' + ((i * 1.1) % 8).toFixed(1) + "s,-" + ((i * 0.9) % 7).toFixed(1) + 's"></span></i>' : "") +
      (r.goal && !r.future ? '<i class="dgoal" style="bottom:' + h(r.goal) + '"></i>' : "") +
      (top > 0 && r.spent === top ? '<b class="cap-label num" style="bottom:' + h(r.spent) + '">' + fmtHours(r.spent) + "</b>" : "") + "</div>").join("") + "</div></div>" +
    '<div class="xaxis">' + labels.map((t) => "<span>" + t + "</span>").join("") + "</div>" +
    '<details class="tview"><summary>Show as table</summary><table><thead><tr><th>' + (byWeek ? "Week of" : "Day") + "</th><th>Logged</th><th>Deep</th></tr></thead><tbody>" +
    rows.filter((r) => !r.future).map((r) => "<tr><td>" + fmtShort(r.date) + '</td><td class="num">' + fmtHours(r.spent) + '</td><td class="num">' + fmtHours(r.deep) + "</td></tr>").join("") +
    "</tbody></table></details></figure>";
}

// Plan 页签的柱子：每天做了多少（柱）、计划多少（底色）
function trendHTML(s) {
  const { byWeek, rows } = trendRows(s);
  const max = niceMax(Math.max(60, ...rows.map((r) => Math.max(r.spent, r.planned))));
  const h = (v) => Math.min(100, (v / max) * 100).toFixed(2) + "%";
  const unit = byWeek ? "week" : "day";
  const labels = axisLabels(rows, byWeek);
  tips.trend = rows.map((r) => ({
    title: byWeek ? "Week of " + fmtShort(r.date) : fmtDay(r.date),
    rows: [["Done", fmtHours(r.spent), "dn"], ["Planned", fmtHours(r.planned), "pl"]]
  }));
  const insight = s.days
    ? "On average you planned <b>" + fmtHours(s.avgPlanned) + "</b> and spent <b>" + fmtHours(s.avgSpent) + "</b> a day" + (s.avgCap ? ", with " + fmtHours(s.avgCap) + " available." : ".")
    : "This period hasn't started yet.";
  return '<figure class="card chart"><figcaption><div><h3>Planned and done, per ' + unit + "</h3><p>" + insight + "</p></div>" +
    '<div class="legend"><span><i class="k dn"></i>Done</span><span><i class="k pl"></i>Planned</span></div></figcaption>' +
    '<div class="plot">' + [1, 0.5, 0].map((f) => '<i class="grid" style="bottom:' + f * 100 + '%"><span class="num">' + (f ? fmtHours(max * f) : "0") + "</span></i>").join("") +
    '<div class="cols" data-chart="trend"' + dense(rows) + ">" + rows.map((r, i) =>
      '<div class="col' + (r.future ? " future" : "") + '" data-i="' + i + '" tabindex="0" aria-label="' + esc(tips.trend[i].title + ": " + fmtHours(r.spent) + " done of " + fmtHours(r.planned) + " planned") + '">' +
      '<i class="pl" style="height:' + h(r.planned) + '"></i>' + (r.future ? "" : '<i class="dn" style="height:' + h(r.spent) + '"></i>') + "</div>").join("") + "</div></div>" +
    '<div class="xaxis">' + labels.map((t) => "<span>" + t + "</span>").join("") + "</div>" +
    '<details class="tview"><summary>Show as table</summary><table><thead><tr><th>' + (byWeek ? "Week of" : "Day") + "</th><th>Done</th><th>Planned</th></tr></thead><tbody>" +
    rows.filter((r) => !r.future).map((r) => "<tr><td>" + fmtShort(r.date) + '</td><td class="num">' + fmtHours(r.spent) + '</td><td class="num">' + fmtHours(r.planned) + "</td></tr>").join("") +
    "</tbody></table></details></figure>";
}

// ---------- 各项目 ----------

function projectHTML(s) {
  if (!s.byProject.length) return '<section class="card"><h3>By project</h3><p class="empty">No tasks in this period.</p></section>';
  const max = Math.max(1, ...s.byProject.map((x) => x.spent));
  return '<section class="card"><h3>By project</h3><p class="lede">Time spent, how much got done, and how close the estimates were.</p><div class="crows">' +
    s.byProject.map((x) => {
      const c = esc(x.color || "var(--c-None)");
      return '<div class="crow"><span class="cname"><i style="background:' + c + '"></i>' + esc(x.name || "No project") + "</span>" +
        '<span class="ctrack"><i class="cbar" style="width:' + ((x.spent / max) * 100).toFixed(1) + "%;background:" + c + '"></i></span>' +
        '<span class="cval num">' + fmtHours(x.spent) + "</span>" +
        '<span class="cdone num">' + x.done + "/" + x.counted + (x.counted ? " · " + pct(x.done / x.counted) : "") + "</span>" +
        '<span class="cacc num">' + (x.accuracy === null ? "—" : x.accuracy.toFixed(2) + "×") + "</span></div>";
    }).join("") +
    '<div class="crow head"><span></span><span></span><span>Spent</span><span>Done</span><span>Est.</span></div></div></section>';
}

// 每段的颜色是项目自己的
const paint = (x) => esc(x.color || "var(--c-None)");

// ---------- 没做完的原因 ----------

function reasonsHTML(s) {
  const total = s.status.delay + s.status.drop;
  const head = '<div class="statuses"><span><b class="num">' + s.status.delay + '</b> ◐ Delay</span><span><b class="num">' + s.status.drop + "</b> × Drop</span></div>";
  if (!total) return '<section class="card"><h3>Why things slipped</h3>' + head + '<p class="empty">Nothing slipped in this period.</p></section>';
  const list = s.reasons.slice(0, 8);
  const max = Math.max(1, ...list.map((g) => g.count));
  return '<section class="card"><h3>Why things slipped</h3>' + head +
    (list.length ? '<ol class="reasons">' + list.map((g) =>
      '<li><span class="rtext">' + esc(g.text) + '</span><span class="rtrack"><i style="width:' + ((g.count / max) * 100).toFixed(1) + '%"></i></span><b class="num">' + g.count + "</b></li>").join("") + "</ol>"
      : "") +
    (s.withoutReason ? '<p class="lede">' + s.withoutReason + " without a reason written down.</p>" : "") + "</section>";
}

// ---------- 热力图：几点在干活 ----------
// 横着 24 个小时（从 6:00 起，和今天页的圆盘一样），竖着星期几。只算写了起止钟点的计时段。
// 底下「Week by week」展开后，每一周一张（最近的在上），通勤日的固定时段画灰；展开时才画，一年也不卡。
// 颜色 = 这个钟点主要在干什么（S.hourTint）：一个项目占了七成以上就是它的颜色，不然前两名左右渐变、往多的那边偏；深浅 = 多少分钟。

let heatGrid = [];   // 这一页的每天 × 小时，展开每周时要用
let heatColors = {};   // 这一页每一行（项目 / 计划）的颜色
let weeksOpen = false;   // 「Week by week」开着：同步重画时别收起来
const heatColor = (name) => esc(heatColors[name] || "var(--c-None)");
function shade(min, tint) {
  if (!(min > 0.5)) return "";
  return "--h:" + Math.min(100, Math.round(18 + (min / 60) * 82)) + "%" +
    (tint ? ";--c1:" + heatColor(tint.top) + (tint.next === null ? "" : ";--c2:" + heatColor(tint.next) + ";--p:" + Math.round(tint.share * 100) + "%") : "");
}

function heatRows(chart, rows) {
  tips[chart] = [];
  const head = '<div class="hrow hhead"><span></span>' + Array.from({ length: 24 }, (_, h) => "<i>" + (h % 3 === 0 ? hourLabel(h).slice(0, 2) : "") + "</i>").join("") + "</div>";
  // 星期几那一格（只在平均的那张上）：停上去 = 这个星期几平均一天多久、按项目拆开（以前的 Weekly rhythm）
  const day = (r) => (r.wdI === undefined ? "<span>" + esc(r.label) + "</span>" : '<span class="hday" data-chart="wday" data-i="' + r.wdI + '" tabindex="0">' + esc(r.label) + "</span>");
  return '<div class="heat" data-chart="' + chart + '">' + head + rows.map((r) =>
    '<div class="hrow">' + day(r) + r.hours.map((min, h) => {
      const tint = S.hourTint(r.parts?.[h]);
      const i = tips[chart].push({ title: r.label + " · " + hourLabel(h) + "–" + hourLabel(h + 1), rows: [[r.what, fmtHours(Math.round(min)), "ln"],
        ...(tint ? tint.list.slice(0, 4).map(([n, m]) => [n || "No project", fmtHours(Math.round(m)), "sw", heatColors[n] || "var(--c-None)"]) : []),
        ...(r.fixed?.[h] ? [["commute", fmtHours(r.fixed[h]), "pl"]] : [])] }) - 1;
      return '<i class="hc' + (r.fixed?.[h] && min < 0.5 ? " fx" : "") + (tint && tint.next !== null ? " mix" : "") + '" data-i="' + i + '" tabindex="-1" style="' + shade(min, tint) + '"></i>';
    }).join("") + "</div>").join("") + "</div>";
}

function heatHTML(c, s, by, seg = "") {
  const ws = store.prefs().weekStartsOn;
  heatGrid = S.hourGrid(c, s.from, s.to, by);
  heatColors = Object.fromEntries(s.byProject.map((x) => [x.name, x.color]));
  const order = ws === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const byWd = S.heatByWeekday(heatGrid);
  const timed = heatGrid.reduce((a, x) => a + x.hours.reduce((b, v) => b + v, 0), 0);
  tips.wday = order.map((wd) => { const r = s.byWeekday[wd]; return { title: WEEKDAYS[wd] + " · " + r.days + " day" + (r.days === 1 ? "" : "s"),
    rows: [["a day on average", fmtHours(r.avg), "ln"], ...r.parts.map((x) => [x.name || "No project", fmtHours(x.avg), "sw", paint(x)])] }; });
  return '<section class="card heatcard"><header class="heat-head"><h3>When you worked</h3>' + seg + '</header><p class="lede">Average minutes timed in each hour, from 6:00. The colour is what that hour mostly went to — a blend when it was shared. Only time with a start and end counts. Point at a weekday for its daily average.</p>' +
    (timed ? heatRows("heat", order.map((wd, k) => ({ label: WEEKDAYS[wd], hours: byWd[wd].hours, parts: byWd[wd].parts, what: "average", wdI: k }))) : '<p class="empty">No timed sessions in this period.</p>') +
    (timed ? '<details class="heat-weeks"' + (weeksOpen ? " open" : "") + '><summary>Week by week</summary><div data-heat-weeks>' + (weeksOpen ? weeksHTML() : "") + "</div></details>" : "") + "</section>";
}

// 展开时才把每一周画出来
function weeksHTML() {
  return S.heatWeeks(heatGrid, store.prefs().weekStartsOn).map((w, k) =>
    '<div class="hweek"><p>' + fmtShort(w.from) + " – " + fmtShort(addDays(w.from, 6)) + "</p>" +
    heatRows("heatw" + k, w.days.map((x, j) => ({ label: WEEKDAYS[(weekday(w.from) + j) % 7], hours: x ? x.hours : Array(24).fill(0), parts: x?.parts, fixed: x?.fixed, what: x ? fmtShort(x.date) : "" }))) + "</div>").join("");
}

// ---------- 项目 ----------

function projectsHTML(c, s) {
  const rows = S.projectRows(c, s.from, s.last);
  if (!rows.length) return "";
  const times = (r) => (r.n ? r.done + " / " + r.n : r.done ? String(r.done) : "—");
  return '<section class="card wide"><h3>Plans</h3><p class="lede">Done = times ticked off in each plan\'s pool (out of how many it holds); spent = the time logged on it, all of it and in this period.</p>' +
    '<div class="table-wrap"><table class="ptable"><thead><tr><th>Plan</th><th>Done</th><th>Spent</th><th>This period</th></tr></thead><tbody>' +
    groupsOf(rows.map((r) => r.p)).map((g) => {
      const rs = g.subs.map((p) => rows.find((r) => r.p === p));
      const sum = (k) => rs.reduce((a, r) => a + r[k], 0);
      const head = g.name && rs.length > 1
        ? '<tr class="grow"><td>' + esc(g.name) + '</td><td class="num"></td><td class="num">' + fmtHours(sum("spent")) + '</td><td class="num">' + fmtHours(sum("spentHere")) + "</td></tr>"
        : "";
      return head + rs.map((r) => '<tr' + (head ? ' class="nested"' : "") + '><td><span class="pdot" style="background:' + esc(r.p.color) + '"></span>' + (g.name && !head ? '<small class="gname">' + esc(g.name) + " · </small>" : "") + esc(r.p.name) +
        '</td><td class="num">' + times(r) + '</td><td class="num">' + fmtHours(r.spent) + '</td><td class="num">' + fmtHours(r.spentHere) + "</td></tr>").join("");
    }).join("") +
    "</tbody></table></div></section>";
}

// ---------- 时间去向：一天 24 小时的饼图 ----------
// 粗的那圈：睡觉 / 吃饭洗澡 / 家务（灰，按默认值算）→ 各项目 → 没挂计划 → 没记的；外面细的一圈 = 每个项目里深度的那段。
// 项目的颜色和圆盘是一套（js/ui/sun.js）：项目颜色的霓虹版（js/groups.js 的 neon），自己另选的颜色没有霓虹版就调亮（.boost）；
// 白天底下垫一版错开的藏青，夜里发光（样子在 css 里的 .slice.ink）。
// 右边的图例就是表格：名字、时长、占比。项目超过 6 个，后面的合成一片。
// 没在筛选的时候，各项目那几片（和图例那一行）点得动：点了 = 整页只看这个项目、按它下面的计划拆开（就是上面「只看哪几个」只勾了它）；
// 筛选着的时候饼图下面一行「Showing only Build · Clear」回到全部（她 10-23 要的，以后别的项目一样）

const LIFE_COLOR = { sleep: "var(--k-sleep)", care: "var(--k-care)", chores: "var(--k-chores)" };
const HATCH = "repeating-linear-gradient(45deg, var(--muted) 0 1.5px, var(--k-blank) 1.5px 5px)";

function pieParts(pie) {
  const proj = pie.parts.filter((x) => x.kind === "project");
  if (proj.length <= 6) return pie.parts;
  const keep = new Set(proj.slice(0, 5).map((x) => x.key));
  const tail = proj.filter((x) => !keep.has(x.key));
  const sum = (k) => tail.reduce((a, x) => a + (x[k] || 0), 0);
  const more = { key: "more", name: tail.length + " more", min: sum("min"), deep: sum("deep"), kind: "more" };
  const out = [];
  for (const x of pie.parts) {
    if (x.kind !== "project" || keep.has(x.key)) out.push(x);
    else if (!out.includes(more)) out.push(more);
  }
  return out;
}

// On the side 里叠在别的事上的那些（sideHaze）：一段流光，从 Untracked 正中往回（往下）漫进前面那几片——多半是边健身、边通勤边看的。
// 不占时间、不改任何一片；一道亮光从 Untracked 中间往下扫。关了动效 / 系统要求减少动态时不扫，只留那一段
function hazeHTML(haze, total, mid) {
  const len = Math.min(99.5, (haze.min / total) * 100);
  if (len < 0.3) return "";
  const at = mid - len, glint = Math.min(8, Math.max(0.6, len * 0.3));   // 亮光比那一段短，才扫得动
  const still = document.getElementById("sky")?.classList.contains("still");
  const arc = (cls, l, off, style = "") => '<circle class="' + cls + '" r="42" pathLength="100" stroke-dasharray="' + l.toFixed(3) + " " + (100 - l).toFixed(3) + '" stroke-dashoffset="' + (-off).toFixed(3) + '"' + style + "/>";
  return '<g class="haze" aria-hidden="true">' + arc("haze-band", len, at) +
    (still ? "" : arc("haze-glint", glint, mid - glint, ' style="--from:' + (-(mid - glint)).toFixed(3) + ";--to:" + (-at).toFixed(3) + ";--dur:" + Math.max(2.2, Math.min(4.5, 1.8 + len / 8)).toFixed(1) + 's"')) + "</g>";
}

// 睡觉、吃饭（hidden）算在 24 小时里、不画也不列：剩下的各片铺满一圈（角度按 shown 放大），百分比照旧是占整天的多少
function pieHTML(c, s, rest, haze = null, filtered = false) {
  const pie = S.clockPie(c, s, { rest, filtered });
  const parts = pieParts(pie).filter((x) => !x.hidden), life = S.lifeOf(c);
  const shown = parts.reduce((a, x) => a + x.min, 0);
  const ink = (x) => (x.kind === "project" || x.kind === "none") && Boolean(x.color);   // 用项目颜色的那几片
  const lit = (x) => (neon(x.color) ? esc(neon(x.color)) : "oklch(from " + esc(x.color) + " calc(l + .12) calc(c * 1.9) h)");
  const color = (x) => (x.kind === "life" ? LIFE_COLOR[x.key] : x.kind === "blank" ? "var(--k-blank)" : x.kind === "rest" ? "url(#st-hatch)" : x.kind === "more" ? "var(--k-None)" : esc(neon(x.color) || x.color || "var(--c-None)"));
  const swatch = (x) => (x.kind === "rest" ? HATCH : ink(x) ? lit(x) : color(x));
  const pickable = (x) => !picks.size && x.kind === "project" && Boolean(x.name);
  tips.pie = parts.map((x) => ({ title: x.name, rows: [["of the whole period", fmtHours(x.min) + " · " + share(x.min, pie.total), "sw", swatch(x)], ...(x.unlogged ? [["usual housework", fmtHours(x.unlogged), "pl"]] : []), ...(x.deep > 0 ? [["deep", fmtHours(x.deep), "tide"]] : []),
    ...(pickable(x) ? [["to see only " + x.name, "Click", "pl"]] : [])] }));
  // 每片之间留一条缝（周长的 0.5% ≈ 2px）；pathLength = 100，所以长度直接写百分比
  let at = 0, under = "", mid = 100;   // mid = Untracked 正中（流光从这里往下扫）；没有 Untracked 就从 12 点
  const arcs = parts.map((x, i) => {
    const len = (x.min / shown) * 100, start = at;
    at += len;
    if (x.kind === "blank") mid = start + len / 2;
    const dash = (v) => { const d = Math.max(0.2, v - (parts.length > 1 ? 0.5 : 0)); return d.toFixed(3) + " " + (100 - d).toFixed(3); };
    const where = ' r="42" pathLength="100" stroke-dasharray="' + dash(len) + '" stroke-dashoffset="' + (-start).toFixed(3) + '"';
    if (ink(x)) under += '<circle class="slice-sh"' + where + "/>";
    return '<circle class="slice' + (ink(x) ? " ink" + (neon(x.color) ? "" : " boost") : "") + (pickable(x) ? " pick" : "") + '" data-i="' + i + '"' + (pickable(x) ? ' data-act="pie-pick" data-g="' + esc(x.name) + '"' : "") + where + ' stroke="' + color(x) + '"' + (ink(x) ? ' style="--c:' + color(x) + '"' : "") + "/>" +
      (x.deep > 0 ? '<circle class="dring" r="53" pathLength="100" stroke-dasharray="' + dash((x.deep / shown) * 100) + '" stroke-dashoffset="' + (-start).toFixed(3) + '"/>' : "");
  }).join("");
  const hz = haze && haze.min >= 1 && shown > 0 ? haze : null;
  const hzTitle = "Shows, novels… taken in alongside other things, so it overlaps";
  // 能点的那几行是按钮（键盘也能点）
  const legend = parts.map((x) => {
    const inner = '<i style="background:' + swatch(x) + '"></i><span>' + esc(x.name) + '</span><b class="num">' + fmtHours(x.min) + '</b><em class="num">' + share(x.min, pie.total) + "</em>";
    const title = esc(x.name + (x.unlogged ? " · includes " + fmtHours(x.unlogged) + " usual housework" : "") + (x.deep > 0 ? " · " + fmtHours(x.deep) + " deep" : "") + (pickable(x) ? " · click to see only " + x.name : ""));
    return pickable(x) ? '<li><button type="button" class="pie-li" data-act="pie-pick" data-g="' + esc(x.name) + '" title="' + title + '">' + inner + "</button></li>" : '<li title="' + title + '">' + inner + "</li>";
  }).join("") +
    (hz ? '<li class="haze-li" title="' + esc(hzTitle) + '"><i class="haze-sw"></i><span>On the side</span><b class="num">~' + fmtHours(hz.min) + "</b><em>overlaps</em></li>" : "");
  const field = (k, label, unit, v) => "<label><span>" + label + '</span><input class="num" type="number" min="0" max="24" step="0.5" data-life="' + k + '" data-keep="life-' + k + '" value="' + (v ? Math.round(v / 6) / 10 : "") + '" placeholder="' + (k === "deepGoal" ? "none" : "0") + '"><em>' + unit + "</em></label>";
  // 上个月的 On the side 还没填（填 0 也算填了）：Adjust 旁边一个红点（她 10-23 要的）
  const sideDue = !store.sideFilled(S.sideMonths(c.today).slice(-2)[0]);
  return '<section class="card piecard"><header class="pie-head"><div><h3>Where the time went</h3><p class="lede">Each 24-hour day. Sleep and meals count but aren\'t drawn.' +
    ' <button type="button" class="link" data-act="life-adjust" aria-expanded="' + adjust + '">' + (adjust ? "Done" : "Adjust") + "</button>" +
    (sideDue ? '<i class="dsc-dot st-due" title="Last month\'s On the side isn\'t filled in" aria-label="Last month\'s On the side isn\'t filled in"></i>' : "") + "</p></div></header>" +
    // Adjust 一个月才开一次：几个默认值 + On the side 都收在这里面，平常不占地方
    (adjust ? '<div class="life-form">' + field("sleep", "Sleep", "h a day", life.sleep) + field("care", "Meals, dishes, shower", "h a day", life.care) +
      field("chores", "Chores you don't log", "h a weekend · in Chores", life.chores) + field("deepGoal", "Deep goal", "h a work day", life.deepGoal) + sideRowHTML(c) + "</div>" : "") +
    (pie.total > 0
      ? '<div class="pie-wrap"><div class="pie" data-chart="pie"><svg viewBox="-60 -60 120 120" role="img" aria-label="' + esc(parts.map((x) => x.name + " " + share(x.min, pie.total) + " of the day").join(", ")) + '">' +
        '<defs><pattern id="st-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--k-blank)"/><rect width="1.5" height="5" fill="var(--muted)"/></pattern></defs>' +
        '<g transform="translate(.9 .9) rotate(-90)">' + under + '</g><g transform="rotate(-90)">' + arcs + (hz ? hazeHTML(hz, shown, mid) : "") + "</g></svg>" +
        '<div class="pie-c"><b class="num">' + fmtHours(pie.tracked) + "</b><span>logged</span>" + (pie.deep > 0 ? '<span class="num" title="Deep work">◆ ' + fmtHours(pie.deep) + "</span>" : "") + "</div></div>" +
        '<ul class="pie-legend">' + legend + "</ul></div>"
      : '<p class="empty">' + (s.days ? "Nothing logged in this period." : "This period hasn't started yet.") + "</p>") +
    (picks.size ? '<p class="pie-only"><span>Showing only <b>' + esc(pickedNames(c).join(", ")) + '</b></span><button type="button" class="btn" data-act="pick-clear">Clear</button></p>' : "") +
    "</section>";
}

// On the side（在 Adjust 里）：一个月填一个总数（小时）。平常能填前两个月，这个月最后三天里这个月也能填；先选着上个月
function sideRowHTML(c) {
  const months = S.sideMonths(c.today), last = months[months.length - 2];
  if (!months.includes(sideMonth)) sideMonth = last;
  const h = store.sideFilled(sideMonth) ? Math.round(store.sideOf(sideMonth) / 6) / 10 : "";
  return '<div class="ots-row" title="Shows, novels… taken in while doing something else. Drawn as a haze over Untracked">' +
    '<span>On the side in <select data-ots-m aria-label="Month">' + months.map((m) => '<option value="' + m + '"' + (m === sideMonth ? " selected" : "") + ">" + MONTHS[Number(m.slice(5, 7)) - 1] + "</option>").join("") + "</select></span>" +
    '<input class="num" type="number" min="0" step="0.5" value="' + h + '" placeholder="0" data-ots-h data-keep="ots-h-' + sideMonth + '" aria-label="Hours that month"><em>h that month</em></div>';
}

// ---------- 时间表：项目 × 日子 ----------

function colLabel(col) {
  if (col.kind === "day") return "<span>" + WEEKDAYS[weekday(col.from)] + "</span><b>" + Number(col.from.slice(8)) + "</b>";
  if (col.kind === "week") return "<span>Week of</span><b>" + fmtShort(col.from) + "</b>";
  return "<span>" + col.from.slice(0, 4) + "</span><b>" + MONTHS[Number(col.from.slice(5, 7)) - 1] + "</b>";
}

const sheetOpen = new Set();   // 点开了哪几个项目（默认都收着）

function sheetHTML(c, s, by) {
  const sh = S.sheet(c, s.from, s.to, { weekStartsOn: store.prefs().weekStartsOn, by });
  if (!sh.rows.length) return '<section class="card"><h3>Timesheet</h3><p class="empty">Nothing logged in this period.</p></section>';
  const cell = (v, i) => '<td class="num' + (sh.cols[i].future ? " future" : "") + '">' + (v ? fmtHours(v) : "") + "</td>";
  const line = (r, lead, cls) => "<tr" + (cls ? ' class="' + cls + '"' : "") + "><th>" + lead + "</th>" + r.cells.map(cell).join("") + '<td class="num sum">' + fmtHours(r.total) + "</td></tr>";
  const dot = (r) => '<span class="pdot" style="background:' + paint(r) + '"></span>';
  // 能点开的：下面不止一个计划，或者只有一个、但名字和它自己不一样
  const subsOf = (r) => (r.subs.length > 1 || (r.subs.length === 1 && r.subs[0].name && r.subs[0].name !== r.name) ? r.subs : []);
  const any = sh.rows.some((r) => subsOf(r).length);
  return '<section class="card"><h3>Timesheet</h3><p class="lede">Hours logged on each ' + (by === "plan" ? "plan" : "project") + (any ? ". Open a project to see its plans" : "") + ".</p>" +
    '<div class="table-wrap"><table class="tsheet"><thead><tr><th>' + (by === "plan" ? "Plan" : "Project") + "</th>" + sh.cols.map((x) => "<th" + (x.future ? ' class="future"' : "") + ">" + colLabel(x) + "</th>").join("") + "<th>Total</th></tr></thead><tbody>" +
    sh.rows.map((r) => {
      const subs = subsOf(r), open = subs.length > 0 && sheetOpen.has(r.name), name = dot(r) + esc(r.name || "No plan");
      return line(r, subs.length
        ? '<button type="button" class="tw" data-act="sheet-row" data-name="' + esc(r.name) + '" aria-expanded="' + open + '">' + icon("right") + name + "</button>"
        : (any ? '<span class="tw-gap"></span>' : "") + name) +
        (open ? subs.map((x) => line(x, dot(x) + esc(x.name || "General"), "sub")).join("") : "");
    }).join("") +
    "</tbody><tfoot>" +
    (sh.deepSum ? "<tr><th>" + (any ? '<span class="tw-gap"></span>' : "") + "◆ Deep</th>" + sh.deep.map(cell).join("") + '<td class="num sum">' + fmtHours(sh.deepSum) + "</td></tr>" : "") +
    '<tr class="total"><th>' + (any ? '<span class="tw-gap"></span>' : "") + "Total</th>" + sh.total.map(cell).join("") + '<td class="num sum">' + fmtHours(sh.sum) + "</td></tr></tfoot></table></div></section>";
}

// ---------- 整页 ----------

const pickedNames = (c) => [...picks].map((k) => (k === "none" ? "No project" : k.startsWith("g:") ? k.slice(2) : c.projects.find((p) => p.id === k.slice(2))?.name || ""));

function headHTML(c, r) {
  // 只看哪几个：大类一个勾，下面缩进是它的计划，最后是哪都没挂的
  const box = (v, label, color, cls) => '<label class="mi ' + cls + '"><input type="checkbox" data-pick="' + esc(v) + '"' + (picks.has(v) ? " checked" : "") + ">" +
    (color ? '<i style="--dot:' + esc(color) + '"></i>' : "") + "<span>" + esc(label) + "</span></label>";
  const chosen = pickedNames(c);
  const filter = '<details class="st-pick"' + (pickOpen ? " open" : "") + '><summary class="' + (picks.size ? "on" : "") + '">' + esc(chosen.length ? chosen.slice(0, 2).join(", ") + (chosen.length > 2 ? " +" + (chosen.length - 2) : "") : "All projects") + "</summary>" +
    '<div class="menu st-pick-panel"><div class="ml">' + groupsOf(c.projects, { all: true }).map((g) =>
      (g.name ? box("g:" + g.name, g.name, c.groups.find((x) => x.name === g.name)?.color || g.subs[0]?.color, "top") : "") + g.subs.map((p) => box("p:" + p.id, p.name, p.color, g.name ? "in" : "")).join("")).join("") +
    box("none", "No project", "", "top") + "</div>" +
    '<footer><span class="msub">' + (picks.size ? picks.size + " picked" : "Nothing picked = everything, by project") + '</span><button type="button" class="link" data-act="pick-clear"' + (picks.size ? "" : " disabled") + ">Clear</button></footer></div></details>";
  return '<header class="page-head"><div><h2>' + rangeLabel(r) + "</h2></div>" +
    '<div class="tools"><span class="seg">' + Object.entries(S.PERIODS).map(([k, t]) => '<button type="button" data-act="period" data-k="' + k + '"' + (k === kind ? ' class="on"' : "") + ">" + t + "</button>").join("") + "</span>" +
    (kind === "custom" ? '<span class="st-range"><input type="date" data-st="from" value="' + r.from + '" max="' + r.to + '" aria-label="From">–<input type="date" data-st="to" value="' + r.to + '" min="' + r.from + '" aria-label="To"></span>' : "") +
    '<button type="button" class="nav" data-act="st-prev" aria-label="Earlier">' + icon("left") + '</button><button type="button" class="nav" data-act="st-today">Now</button>' +
    '<button type="button" class="nav" data-act="st-next" aria-label="Later"' + (r.to >= c.today ? " disabled" : "") + ">" + icon("right") + "</button></div></header>" +
    '<div class="st-bar"><span class="seg"><button type="button" data-act="st-tab" data-v="time"' + (tab === "time" ? ' class="on"' : "") + '>Time</button><button type="button" data-act="st-tab" data-v="plan"' + (tab === "plan" ? ' class="on"' : "") + ">Plan</button></span>" +
    filter + '<button type="button" class="dk-deep' + (deepOnly ? " on" : "") + '" data-act="deep-only" aria-pressed="' + deepOnly + '">◆<span>Deep only</span></button></div>';
}

export function statsHTML(c) {
  remember();
  if (!anchor) anchor = c.today;
  const ws = store.prefs().weekStartsOn;
  const r = rangeOf(c);
  const p = S.previousRange(kind, r, ws);
  const sc = scope(c);
  const s = S.summarize(sc.c, r.from, r.to, { by: sc.by });
  const prev = S.summarize(sc.c, p.from, p.to, { by: sc.by });
  let body;
  if (tab === "plan") {
    body = planKpis(s, prev) + trendHTML(s) +
      '<div class="stat-grid">' + projectHTML(s) + reasonsHTML(s) + "</div>" + projectsHTML(sc.c, s);
  } else {
    // 筛选之外记下来的时间：饼图里合成「Everything else」一片
    const rest = sc.on ? Math.max(0, S.summarize(c, r.from, r.to).spent - s.spent) : 0;
    // 流光：只在什么都没勾、没开 Deep only 时画
    const haze = !deepOnly && !picks.size ? S.sideHaze(c, r.from, r.to) : null;
    // 只看 Build：在当前筛选之上再筛；勾了别的、里面没有 Build 时就没有这个切换
    const bName = S.buildGroup(c), bc = bName ? S.onlyGroup(sc.c, bName) : null;
    const bOn = Boolean(bc) && (!picks.size || bc.tasks.length > 0);
    const b = bOn ? S.summarize(bc, r.from, r.to, { by: "plan" }) : null, bp = bOn ? S.summarize(bc, p.from, p.to, { by: "plan" }) : null;
    const tv = bOn && view.trend === "build", hv = bOn && view.heat === "build";
    body = timeStrip(s, prev, b, bp, bName) + '<div class="st-two">' + timeTrendHTML(tv ? b : s, bOn ? viewSeg("trend", bName) : "") + pieHTML(sc.c, s, rest, haze, sc.on) + "</div>" +
      heatHTML(hv ? bc : sc.c, hv ? b : s, hv ? "plan" : sc.by, bOn ? viewSeg("heat", bName) : "") +
      sheetHTML(sc.c, s, sc.by);
  }
  return '<div class="stats">' + headHTML(c, r) + body + "</div>";
}

// ---------- 交互：切时间段、读数提示 ----------

function showTip(col) {
  const chart = col.closest("[data-chart]")?.dataset.chart;
  const data = tips[chart]?.[Number(col.dataset.i)];
  const tip = document.getElementById("ctip");
  if (!data || !tip) return;
  tip.textContent = "";
  const title = document.createElement("p");
  title.className = "tt";
  title.textContent = data.title;
  tip.appendChild(title);
  for (const [name, value, cls, color] of data.rows) {
    const row = document.createElement("p");
    const k = document.createElement("i");
    k.className = "k " + cls;
    if (color) k.style.background = color;
    const v = document.createElement("b");
    v.textContent = value;
    row.append(k, v, " " + name);
    tip.appendChild(row);
  }
  tip.hidden = false;
  const b = col.getBoundingClientRect(), t = tip.getBoundingClientRect();
  let x = b.left + b.width / 2 - t.width / 2;
  x = Math.max(8, Math.min(innerWidth - t.width - 8, x));
  tip.style.transform = "translate(" + x + "px," + Math.max(8, b.top - t.height - 8) + "px)";
  col.classList.add("hot");
}

function hideTip(col) {
  col?.classList.remove("hot");
  const tip = document.getElementById("ctip");
  if (tip) tip.hidden = true;
}

export function initStats(rerender) {
  const tip = document.createElement("div");
  tip.id = "ctip";
  tip.className = "ctip";
  tip.hidden = true;
  document.body.appendChild(tip);
  // 自己选的两头整段往前 / 往后挪
  const shiftCustom = (n) => {
    const len = diffDays(custom.from, custom.to) + 1;
    custom = { from: addDays(custom.from, n * len), to: addDays(custom.to, n * len) };
  };
  on(document, "click", ".stats [data-act]", (e, el) => {
    const act = el.dataset.act, T = store.today();
    if (act === "period") {
      // 换成 Custom：先接着现在看的这段
      if (el.dataset.k === "custom" && kind !== "custom") { const r = S.periodRange(kind, anchor || T, store.prefs().weekStartsOn); custom = { from: r.from, to: r.to > T ? T : r.to }; }
      kind = el.dataset.k;
    } else if (act === "st-tab") { tab = el.dataset.v; store.setLocal({ statsTab: tab }); }
    else if (act === "st-prev" || act === "st-next") {
      const n = act === "st-prev" ? -1 : 1;
      if (kind === "custom") shiftCustom(n);
      else anchor = S.shiftAnchor(kind, anchor || T, n);
    } else if (act === "st-today") {
      anchor = T;
      if (kind === "custom") { const len = diffDays(custom.from, custom.to); custom = { from: addDays(T, -len), to: T }; }
    } else if (act === "life-adjust") adjust = !adjust;
    else if (act === "deep-only") deepOnly = !deepOnly;
    else if (act === "pick-clear") picks.clear();
    else if (act === "pie-pick") { picks.clear(); picks.add("g:" + el.dataset.g); hideTip(); }
    else if (act === "sheet-row") { const n = el.dataset.name; if (!sheetOpen.delete(n)) sheetOpen.add(n); }
    else if (act === "st-view") view[el.dataset.w] = el.dataset.v === "all" ? "all" : "build";
    if (anchor > T) anchor = T;
    rerender();
  });
  on(document, "change", ".stats [data-st]", (e, el) => {
    const f = el.dataset.st;
    if (el.value) {
      custom = { ...custom, [f]: el.value };
      if (custom.from > custom.to) custom = { from: el.value, to: el.value };
    }
    rerender();
  });
  // 只看哪几个：勾一下就重算；那一块开着就一直开着，点到外面才收
  on(document, "change", ".stats [data-pick]", (e, el) => {
    if (el.checked) picks.add(el.dataset.pick); else picks.delete(el.dataset.pick);
    rerender();
  });
  document.addEventListener("toggle", (e) => { if (e.target.matches?.(".st-pick")) pickOpen = e.target.open; }, true);
  document.addEventListener("click", (e) => {
    if (!pickOpen || e.target.closest?.(".st-pick")) return;
    pickOpen = false;
    document.querySelector(".st-pick")?.removeAttribute("open");
  });
  // 饼图底下的默认值：填的是小时，存成分钟（空着的深度目标 = 不设）
  on(document, "change", ".stats [data-life]", (e, el) => {
    const life = { ...S.LIFE, ...(store.setting("life", {}) || {}) };
    life[el.dataset.life] = Math.max(0, Math.min(24, Number(el.value) || 0)) * 60;
    store.setSetting("life", life);
  });

  // On the side：换月份 = 框里换成那个月的数；改小时 = 存（空 / 0 = 拿掉那个月）
  on(document, "change", ".stats [data-ots-m]", (e, el) => { sideMonth = el.value; rerender(); });
  // 空着 = 没填（拿掉那个月）；0 = 填了、那个月没有
  on(document, "change", ".stats [data-ots-h]", (e, el) => { store.setSide(sideMonth, el.value.trim() === "" ? null : Math.max(0, Number(el.value) || 0) * 60); rerender(); });
  on(document, "pointerover", ".stats .col, .stats .hc, .stats .slice, .stats .hday", (e, col) => showTip(col));
  on(document, "pointerout", ".stats .col, .stats .hc, .stats .slice, .stats .hday", (e, col) => hideTip(col));
  on(document, "focusin", ".stats .col, .stats .hday", (e, col) => showTip(col));
  on(document, "focusout", ".stats .col, .stats .hday", (e, col) => hideTip(col));
  document.addEventListener("toggle", (e) => {
    if (!e.target.matches?.(".heat-weeks")) return;
    weeksOpen = e.target.open;
    const box = e.target.querySelector("[data-heat-weeks]");
    if (weeksOpen && !box.innerHTML) box.innerHTML = weeksHTML();
  }, true);
}
