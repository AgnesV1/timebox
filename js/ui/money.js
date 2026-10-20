// 记账的界面。一份代码两个地方用：手机上是从顶上拉出来的纯黑面板（外壳和下拉手势在 island.js），电脑上是 Spending 页。
// 主页：Year / Month / Day → 能拖的柱状时间轴（停在中间那格就是选中的；超了橙、正常蓝、有收入底下一个青绿点）→ 类别小标签（点了筛下面的流水）→
// 流水（点一笔改、往左滑删）→ 推荐 → Add a new transaction。往上拉流水时柱子压成小点。
// 图表（figure）：梯形图（House 是底座、预算是浅天蓝底、实线是花的、虚线是照现在的速度）、五个小方块、两个 Breakdown（点开看那一类的每一笔），
// 自己一套 Month / Year 和前后翻。手机上图表是从底下升上来的一页；电脑上整页就是图表，主页收在右边的抽屉里（只看某一天、记一笔）：
// 收着时右边露一条把手（今天花了多少、「+」），点它 / 按 N / 触控板往左划打开，Esc / 往右划 / 点外面收起。
// 设定：Budget（从某月起每月多少）/ Categories（加、改名、藏、没用过的能删）/ Export（.md）/ Import a month / Currency。

import * as SP from "../spend.js";
import * as M from "../money.js";
import * as store from "../store.js";
import { esc, icon, onSwipe } from "../dom.js";

// 小东西（按钮、开关、小签）用的弹簧：只冲过头 0.5%；面板、抽屉、图表页这种大块不冲过头（ENTER / EXIT，见 css/money.css 开头）
const SPR = "linear(0, .029, .099, .192, .296, .399, .498, .588, .668, .737, .795, .844, .883, .915, .939, .959, .973, .984, .992, .997, 1.001, 1.003, 1.004, 1.005, 1.005, 1.005, 1.004, 1.004, 1)";
// 进场：快出来、慢慢停稳（不冲过头）；出场：干脆一点，越走越快
const ENTER = "cubic-bezier(.16, 1, .3, 1)", EXIT = "cubic-bezier(.4, 0, 1, 1)";
const quiet = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const today = () => store.today();
const todayP = () => M.parts(today());
const CW = { day: 30, month: 40, year: 76 };

// 加总按数据版本缓存（每存一次 spend.js 的 ver 就变）
let ixCache = null, ixVer = -1;
const IX = () => { if (ixVer !== SP.ver() || !ixCache) { ixCache = M.index(SP.entries(), SP.cats()); ixVer = SP.ver(); } return ixCache; };
const visible = (kind) => SP.cats().filter((c) => c.kind === kind && !c.hidden).map((c) => c.name);
const isIncomeCat = (name) => M.kindOf(SP.cats(), name) === "in";

// 金额：小数点后那两位小一号、淡一点（「$1,234」后面跟着小的「.56」），大数字好排
const cents = (s) => { const i = s.lastIndexOf("."); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<span class="mn-dec">' + esc(s.slice(i)) + "</span>"; };

// 滚着变的数字：每一位一列 0–9，从旧的那位滚到新的。small = 小数那几位小一号（16px 以上的大数字才这样，小字本来就小）
const DIG = [..."0123456789"].map((d) => "<span>" + d + "</span>").join("");
function roll(el, s, small = false) {
  if (!el) return;
  const was = el.dataset.v;
  el.dataset.v = s;
  if (was === undefined || quiet()) { el.innerHTML = '<span class="mn-plainv">' + (small ? cents(s) : esc(s)) + "</span>"; return; }
  if (was === s) return;
  const pad = s.length - was.length, cut = small ? s.lastIndexOf(".") : -1;
  el.innerHTML = [...s].map((ch, i) => {
    const dec = cut >= 0 && i >= cut ? " dec" : "";
    if (!/\d/.test(ch)) return '<span class="' + dec.trim() + '">' + esc(ch) + "</span>";
    const o = was[i - pad], f = /\d/.test(o || "") ? o : "0";
    return '<span class="dg' + dec + '"><span class="cl" data-d="' + ch + '" style="transform:translateY(calc(-' + f + ' * 1.1em));transition-delay:' + (s.length - i) * 16 + 'ms">' + DIG + "</span></span>";
  }).join("");
  void el.offsetWidth;
  el.querySelectorAll(".cl").forEach((c) => { c.style.transform = "translateY(calc(-" + c.dataset.d + " * 1.1em))"; });
}
// 手指的速度（最近 90ms）：甩一下也算
function tracker() {
  let p = [];
  return {
    add(v) { const t = performance.now(); p.push([v, t]); while (p.length > 2 && t - p[0][1] > 90) p.shift(); },
    vel() { if (p.length < 2) return 0; const a = p[0], b = p[p.length - 1]; return (b[0] - a[0]) / Math.max(8, b[1] - a[1]); }
  };
}
const pie = (p, cls = "") => '<svg class="mn-pie ' + cls + '" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="currentColor" fill-opacity=".2"/><circle cx="7" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="6" stroke-dasharray="' + (Math.max(0, Math.min(1, p)) * 18.85).toFixed(2) + ' 18.85" transform="rotate(-90 7 7)"/></svg>';
const btn = (act, ic, label, cls = "") => '<button type="button" class="mn-ic ' + cls + '" data-act="' + act + '" aria-label="' + label + '" title="' + label + '">' + icon(ic) + "</button>";
const back = '<button type="button" class="mn-ic" data-act="back" aria-label="Back">' + icon("left") + "</button>";
const chevR = '<svg class="ic mn-cr" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
const periodTitle = (p, mode) => (mode === "day" ? M.fmtDate(M.iso(p.y, p.m, p.d)) : mode === "month" ? M.MONTH[p.m - 1] + " " + p.y : String(p.y));

export function createView(kind) {
  const desk = kind === "desk";
  const root = document.createElement("div");
  root.className = "mn mn-" + kind;
  let W = desk ? 720 : 244, H = desk ? 260 : 172;   // 电脑上图表跟着那一栏的宽度量（renderChart），字不跟着缩放
  const blur = '<div class="mn-pblur" aria-hidden="true"><i></i><i></i><i></i></div>';   // 渐进模糊：三层 1 / 3 / 8px，越靠边越糊

  // 电脑上的抽屉只看某一天：没有 Year / Month / Day，标题旁边多一个日历挑哪天；记一笔的表单在最上面
  const home = '<section class="mn-pg mn-home" data-pg="home">' +
    '<div class="mn-hdr">' + btn("set", "settings", "Settings") + (desk ? '<span class="mn-status" data-status></span><span class="mn-hgrp">' + btn("find", "search", "Search") + btn("dclose", "close", "Close", "mn-sm") + "</span>" : btn("chart", "chart", "Charts") + btn("find", "search", "Search")) + "</div>" +
    (desk ? formHTML() : "") +
    '<div class="mn-thead"><div><h2 class="mn-h1" data-title></h2><div class="mn-num mn-13" style="margin-top:3px"><span class="mn-rn" data-to></span><span style="display:inline-block;width:12px"></span><span class="mn-rn" data-ti style="color:var(--mn-green)"></span></div></div>' +
    '<div class="mn-nav">' + (desk ? btn("dcal", "calendar", "Pick a day", "mn-sm") : "") + btn("reset", "reset", "Back to today", "mn-sm mn-rst") + btn("prev", "left", "Earlier", "mn-sm") + btn("next", "right", "Later", "mn-sm") + "</div></div>" +
    (desk ? "" : '<div class="mn-seg" data-seg="mode" style="margin-top:14px"><i></i><button type="button" data-v="year">Year</button><button type="button" data-v="month">Month</button><button type="button" data-v="day">Day</button></div>') +
    '<div class="mn-tl"><span class="mn-hl"></span><div class="mn-rw"><div class="mn-rail"></div></div></div>' +
    '<div class="mn-hs mn-chips"></div>' +
    '<div class="mn-lw"><div class="mn-list mn-vs"></div>' + blur.replace("mn-pblur", "mn-pblur top") + blur.replace("mn-pblur", "mn-pblur bot") + "</div>" +
    '<div class="mn-foot"><div class="mn-recw" hidden><span class="mn-meta" style="flex:none">Recommended</span><div class="mn-hs mn-recs"></div></div>' +
    '<button type="button" class="mn-big" data-act="add">Add a new transaction' + (desk ? '<span class="mn-kbd">N</span>' : "") + "</button>" +
    (desk ? "" : '<div class="mn-grab" data-grab aria-label="Close"><span class="mn-grabber"></span></div>') + "</div></section>";
  const pages = '<section class="mn-pg off" data-pg="set"><div class="mn-hdr">' + back + '<span style="font-size:15px;font-weight:500">Settings</span><span style="width:32px"></span></div><div class="mn-vs" data-setb style="flex:1;margin-top:14px"></div></section>' +
    '<section class="mn-pg off" data-pg="sub"><div class="mn-hdr">' + back + '<span data-subt style="font-size:15px;font-weight:500"></span><span style="width:32px"></span></div><div class="mn-vs" data-subb style="flex:1;margin-top:14px"></div></section>' +
    '<section class="mn-pg off" data-pg="find"><div class="mn-hdr" style="gap:6px">' + back + '<input class="mn-tx" data-q placeholder="Search notes, categories, amounts" autocomplete="off" style="flex:1;padding:6px 0;border-bottom:1px solid var(--mn-line)"></div><div class="mn-vs" data-fres style="flex:1;margin-top:8px"></div></section>';
  // 图表：手机上是升上来的那一页的内容；电脑上是整页的主角，顶上一栏是期间、花了 / 收入、Year / Month、前后翻、搜索、设定、记一笔
  const cseg = '<div class="mn-seg" data-seg="cmode"><i></i><button type="button" data-v="year">Year</button><button type="button" data-v="month">Month</button></div>';
  const cnav = '<div class="mn-nav">' + btn("creset", "reset", "Back to this month", "mn-sm mn-rst") + btn("cprev", "left", "Earlier", "mn-sm") + btn("cnext", "right", "Later", "mn-sm") + "</div>";
  const chartBody = '<div class="mn-cbody mn-vs"><svg class="mn-chart" data-chart viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Spending against the budget"></svg><div class="' + (desk ? "" : "mn-hs ") + 'mn-cards"></div><div class="mn-bks"><div data-xb></div><div data-ib></div></div></div>';
  const chartInner = desk
    ? '<header class="mn-fhead"><div class="mn-ftitle"><h2 class="mn-h1" data-ctitle></h2><div class="mn-ftot"><span><span class="mn-num mn-rn" data-cto></span><span class="mn-meta">spent</span></span><span><span class="mn-num mn-rn" data-cti style="color:var(--mn-green)"></span><span class="mn-meta">in</span></span></div></div>' +
      '<div class="mn-ftools">' + cseg + cnav + '<span class="mn-hgrp">' + btn("dfind", "search", "Search") + btn("dset", "settings", "Settings") + '</span><button type="button" class="mn-big mn-addb" data-act="add">' + icon("plus") + 'Add<span class="mn-kbd">N</span></button></div>' + blur + "</header>" + chartBody
    : '<div class="mn-thead"><h2 class="mn-h1" data-ctitle></h2>' + cnav + "</div>" + cseg.replace('class="mn-seg"', 'class="mn-seg" style="margin-top:14px"') + chartBody;
  const sheet = '<div class="mn-scrim" data-act="sclose"></div><section class="mn-sheet" aria-label="Transaction">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;height:30px"><span data-sht style="font-size:15px;font-weight:500"></span><div style="display:flex;align-items:center;gap:6px"><button type="button" class="mn-act warn" data-act="sdel" hidden>Delete</button>' + btn("sclose", "close", "Close", "mn-sm") + "</div></div>" +
    '<div class="mn-seg" data-seg="skind" style="margin-top:8px"><i></i><button type="button" data-v="out">Expense</button><button type="button" data-v="in">Income</button></div>' +
    '<div class="mn-cats" data-scats></div>' +
    '<div style="margin-top:8px"><div class="mn-fld"><span class="mn-meta mn-13">Date</span><button type="button" class="mn-plain" data-act="sdate" style="display:flex;align-items:center;gap:6px"><span class="mn-num mn-13" data-sdl></span>' + icon("calendar") + "</button></div>" +
    '<div class="mn-fld"><span class="mn-meta mn-13">Note</span><input class="mn-tx" data-snote placeholder="Add a note" autocomplete="off" style="flex:1;text-align:right"></div></div>' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:6px;height:42px"><span class="mn-num mn-meta" data-seq></span><div class="mn-num mn-amt" data-samt></div></div>' +
    '<div class="mn-pad" data-pad>' + ["1", "2", "3", "⌫", "4", "5", "6", "+", "7", "8", "9", "Add", ".", "0", "00"].map((k) => '<button type="button" class="mn-k' + (k === "Add" ? " add" : k === "⌫" || k === "+" ? " op" : "") + '" data-k="' + k + '">' + k + "</button>").join("") + "</div></section>";
  const cal = '<div class="mn-cal" data-cal><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' + btn("calp", "left", "Earlier month", "mn-sm") + '<span data-calt style="font-size:13px;font-weight:500"></span>' + btn("caln", "right", "Later month", "mn-sm") + '</div><div class="mn-cg wd mn-meta"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div><div class="mn-cg" data-calg></div></div>';
  const snackHTML = '<div class="mn-snack" role="status" aria-live="polite"><span data-snt></span><button type="button" class="mn-act" data-act="undo">Undo</button></div>';
  root.innerHTML = desk
    ? '<div class="mn-fig">' + chartInner + "</div>" +
      '<div class="mn-handle"><button type="button" class="mn-hmain" data-act="drawer" aria-label="Open the day\'s spending"><span class="mn-meta">Today</span><span class="mn-num" data-htot></span></button>' +
      '<button type="button" class="mn-hadd" data-act="add" aria-label="Add a transaction" title="Add a transaction (N)">' + icon("plus") + "</button></div>" +
      '<div class="mn-dscrim" data-act="dclose"></div><aside class="mn-drawer" aria-label="One day">' + home + pages + "</aside>" + cal + snackHTML
    // 手机：面板（mn-inner）只有屏幕约 88% 高，底边是一道水面弧线；底下露出来的那条是 mn-veil（压暗的今天页，点了收起，见 island.js）。
    // 记一笔的面板、日历盖满整屏（数字键盘贴着屏幕底）
    : '<div class="mn-veil"></div><div class="mn-inner">' + home + pages + '<div class="mn-cdim" data-act="cclose"></div><section class="mn-csheet" aria-label="Charts"><div class="mn-cgrab" data-cgrab><span class="mn-grabber"></span><button type="button" class="mn-plain mn-done" data-act="cclose">Done</button></div>' + chartInner + "</section>" + snackHTML + "</div>" + sheet + cal;

  const $ = (s) => root.querySelector(s);
  const homeEl = $('[data-pg="home"]'), rw = $(".mn-rw"), rail = $(".mn-rail"), hl = $(".mn-hl"), tl = $(".mn-tl"), list = $(".mn-list");
  const V = { mode: desk ? "day" : "month", cur: todayP(), filt: null, items: [], cw: 40, sel: 0, collapsed: false, stack: [], cmode: "month", cc: todayP(), bk: new Set(), fresh: null, chartOpen: false, drawer: false, sub: "", catKind: "out", budEdit: null, newBud: null, expM: null };

  // ---------- 分段开关 ----------
  function seg(name, val) {
    const s = root.querySelector('[data-seg="' + name + '"]');
    if (!s) return;
    const b = s.querySelector('[data-v="' + val + '"]'), pill = s.firstElementChild;
    s.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    if (b && b.offsetWidth) { pill.style.left = b.offsetLeft + "px"; pill.style.width = b.offsetWidth + "px"; }
  }

  // ---------- 时间轴 ----------
  // 时间轴是接着的：一开始画一段，滚到头附近再往前 / 往后接一段（日 = 三个月一接、月 = 一年、年 = 六年），最早接到 2000 年
  const step = (it, k, mode = V.mode) => (mode === "day" ? M.parts(M.addDaysISO(M.iso(it.y, it.m, it.d), k)) : mode === "month" ? { ...M.addMonths(it.y, it.m, k), d: 1 } : { y: it.y + k, m: 1, d: 1 });
  const CHUNK = { day: 92, month: 12, year: 6 };
  function itemsFor(mode) {
    const t = todayP(), first = SP.firstDay();
    let from = mode === "day" ? M.parts(M.addDaysISO(today(), -150)) : mode === "month" ? { y: t.y - 2, m: 1, d: 1 } : { y: t.y - 8, m: 1, d: 1 };
    for (const p of [first, V.cur]) if (p && M.ord(p.y, p.m, mode === "day" ? p.d : 1) < M.ord(from.y, from.m, from.d)) from = mode === "day" ? { y: p.y, m: p.m, d: p.d } : { y: p.y, m: 1, d: 1 };
    const to = mode === "day" ? M.parts(M.addDaysISO(today(), 60)) : mode === "month" ? { y: t.y + 1, m: 12, d: 1 } : { y: t.y + 3, m: 1, d: 1 };
    const o = [];
    for (let it = from; M.ord(it.y, it.m, it.d) <= M.ord(to.y, to.m, to.d); it = step(it, 1, mode)) o.push(it);
    return o;
  }
  const inBounds = (it) => it.y >= 2000 && M.ord(it.y, it.m, it.d) <= M.ord(todayP().y + 5, 12, 31);
  function cellHTML(it, i) {
    const b = barOf(it), first = V.mode === "day" && it.d === 1, bw = V.mode === "day" ? 6 : V.mode === "month" ? 12 : 22;
    const lab = V.mode === "day" ? (first ? M.MON[it.m - 1] : it.d) : V.mode === "month" ? (it.m === 1 ? "’" + String(it.y).slice(2) : M.MON[it.m - 1]) : it.y;
    return '<div class="mn-cell" data-i="' + i + '" style="width:' + V.cw + 'px"><span class="mn-lb mn-num' + (first || (V.mode === "month" && it.m === 1) ? " mo" : "") + '">' + lab + '</span><span class="mn-bw"><span class="mn-bar ' + b.cls + '" style="--w:' + bw + "px;--h:" + b.h + 'px"></span></span><span class="mn-dot' + (b.inc ? " on" : "") + '"></span></div>';
  }
  function reindex() { [...rail.children].forEach((c, i) => { c.dataset.i = i; }); }
  function extend(side) {
    const k = CHUNK[V.mode];
    if (side < 0) {
      const add = [];
      for (let it = step(V.items[0], -1), n = 0; n < k && inBounds(it); it = step(it, -1), n++) add.unshift(it);
      if (!add.length) return;
      rail.insertAdjacentHTML("afterbegin", add.map((it) => cellHTML(it, 0)).join(""));
      V.items = [...add, ...V.items];
      V.sel += add.length;
      reindex();
      rw.scrollLeft += add.length * V.cw;
      if (rd) rd.s += add.length * V.cw;
    } else {
      const add = [];
      for (let it = step(V.items[V.items.length - 1], 1), n = 0; n < k && inBounds(it); it = step(it, 1), n++) add.push(it);
      if (!add.length) return;
      rail.insertAdjacentHTML("beforeend", add.map((it, j) => cellHTML(it, V.items.length + j)).join(""));
      V.items = [...V.items, ...add];
    }
  }
  let cap = 1;
  function barOf(it) {
    const g = M.sumOf(IX(), it, V.mode), fut = M.isFuture(it, V.mode, today());
    return { h: fut || !g.out ? 4 : 6 + Math.min(1, g.out / cap) * 34, cls: fut || !g.out ? "" : M.isOver(IX(), SP.budgets(), it, V.mode, today()) ? "over" : "ok", inc: g.inc > 0 };
  }
  function measureCap() {
    const vals = V.items.map((it) => M.sumOf(IX(), it, V.mode).out).filter((v) => v > 0).sort((a, b) => a - b);
    cap = vals[Math.floor(vals.length * 0.9)] || 1;
  }
  const idxOf = (p) => Math.max(0, V.items.findIndex((it) => M.samePeriod(it, p, V.mode)));
  function buildRail(grow) {
    V.items = itemsFor(V.mode);
    V.cw = CW[V.mode];
    const pad = Math.max(0, ((rw.clientWidth || 272) - V.cw) / 2);
    rail.style.padding = "0 " + pad + "px";
    hl.style.width = V.cw + "px";
    measureCap();
    rail.innerHTML = V.items.map(cellHTML).join("");
    V.sel = idxOf(V.cur);
    rw.scrollLeft = V.sel * V.cw;
    paintSel();
    if (grow && !quiet()) rail.querySelectorAll(".mn-bar").forEach((b, i) => Math.abs(i - V.sel) < 16 && b.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 520, delay: Math.min(400, Math.abs(i - V.sel) * 18), easing: ENTER, fill: "backwards" }));
  }
  function repaintBars() {
    measureCap();
    rail.querySelectorAll(".mn-cell").forEach((c, i) => {
      const it = V.items[i];
      if (!it) return;
      const b = barOf(it), bar = c.querySelector(".mn-bar");
      bar.style.setProperty("--h", b.h + "px");
      bar.className = "mn-bar " + b.cls;
      c.querySelector(".mn-dot").classList.toggle("on", b.inc);
    });
  }
  function paintSel() { rail.querySelectorAll(".mn-lb").forEach((l, i) => l.classList.toggle("on", i === V.sel)); }
  let bodyT = 0;
  function pick(it) {
    const t = todayP();
    if (V.mode === "day") V.cur = { y: it.y, m: it.m, d: it.d };
    else if (V.mode === "month") V.cur = it.y === t.y && it.m === t.m ? t : { y: it.y, m: it.m, d: Math.min(V.cur.d, M.dim(it.y, it.m)) };
    else V.cur = it.y === t.y ? t : { y: it.y, m: V.cur.m, d: Math.min(V.cur.d, M.dim(it.y, V.cur.m)) };
    paintSel();
    renderTitle();
    clearTimeout(bodyT);
    bodyT = setTimeout(renderBody, 70);
  }
  let dragging = false, snapT = 0, rd = null, mo = 0;
  rw.addEventListener("scroll", () => {
    if (rw.scrollLeft < 8 * V.cw) extend(-1);
    else if (V.items.length - 1 - Math.round(rw.scrollLeft / V.cw) < 8) extend(1);
    const i = Math.max(0, Math.min(V.items.length - 1, Math.round(rw.scrollLeft / V.cw)));
    if (i !== V.sel) { V.sel = i; pick(V.items[i]); }
    clearTimeout(snapT);
    if (!dragging) snapT = setTimeout(() => { if (Math.abs(rw.scrollLeft - V.sel * V.cw) > 1) rw.scrollTo({ left: V.sel * V.cw, behavior: "smooth" }); }, 120);
  });
  rw.addEventListener("pointerdown", (e) => { cancelAnimationFrame(mo); dragging = true; rd = { x: e.clientX, s: rw.scrollLeft, m: 0, tr: tracker() }; rd.tr.add(e.clientX); rw.setPointerCapture(e.pointerId); });
  rw.addEventListener("pointermove", (e) => { if (!rd) return; rd.tr.add(e.clientX); const dx = e.clientX - rd.x; rd.m = Math.max(rd.m, Math.abs(dx)); rw.scrollLeft = rd.s - dx; });
  const railUp = (e) => {
    if (!rd) return;
    const moved = rd.m > 5, v = rd.tr.vel();
    rd = null;
    if (!moved) {
      dragging = false;
      const c = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-i]");
      if (c && rail.contains(c)) rw.scrollTo({ left: Number(c.dataset.i) * V.cw, behavior: "smooth" });
      return;
    }
    let vel = -v * 16;
    const step = () => { rw.scrollLeft += vel; vel *= 0.92; if (Math.abs(vel) > 0.5) mo = requestAnimationFrame(step); else { dragging = false; rw.scrollTo({ left: Math.round(rw.scrollLeft / V.cw) * V.cw, behavior: "smooth" }); } };
    mo = requestAnimationFrame(step);
  };
  rw.addEventListener("pointerup", railUp);
  rw.addEventListener("pointercancel", railUp);
  const goTo = (i) => rw.scrollTo({ left: Math.max(0, Math.min(V.items.length - 1, i)) * V.cw, behavior: quiet() ? "auto" : "smooth" });

  // ---------- 主页：标题、类别小标签、流水、推荐 ----------
  function renderTitle() {
    $("[data-title]").textContent = periodTitle(V.cur, V.mode);
    $('[data-act="reset"]').classList.toggle("on", !M.samePeriod(V.cur, todayP(), V.mode));
    const g = M.sumOf(IX(), V.cur, V.mode);
    roll($("[data-to]"), "−" + M.money(g.out));
    roll($("[data-ti]"), "+" + M.money(g.inc));
  }
  function inView(e) { return M.inPeriod(e, V.cur, V.mode); }
  function renderChips() {
    const out = new Map(), inc = new Map();
    let to = 0, ti = 0;
    for (const e of SP.entries()) {
      if (!inView(e)) continue;
      if (e.v < 0) { out.set(e.c, (out.get(e.c) || 0) - e.v); to -= e.v; } else { inc.set(e.c, (inc.get(e.c) || 0) + e.v); ti += e.v; }
    }
    if (V.filt && !out.has(V.filt) && !inc.has(V.filt)) V.filt = null;
    const chip = (c, p, isIn) => '<button type="button" class="mn-chip' + (isIn ? " mn-inc" : "") + (V.filt === c ? " on" : "") + '" data-chip="' + esc(c) + '"><span>' + esc(c) + '</span><span class="mn-num mn-pct">' + (p * 100).toFixed(1) + "%</span>" + pie(p) + "</button>";
    $(".mn-chips").innerHTML = [...out].sort((a, b) => b[1] - a[1]).map(([c, v]) => chip(c, v / (to || 1), false)).join("") + [...inc].sort((a, b) => b[1] - a[1]).map(([c, v]) => chip(c, v / (ti || 1), true)).join("");
  }
  const rowHTML = (e) => '<div class="mn-rw2"><div class="mn-del">Delete</div><div class="mn-row' + (e.id === V.fresh ? " mn-new" : "") + '" data-id="' + esc(e.id) + '"><div style="min-width:0"><div class="mn-r1">' + esc(e.c) + (e.n ? '<span class="mn-nt">' + esc(e.n) + "</span>" : "") + '</div><div class="mn-meta" style="margin-top:3px">' + M.fmtDate(e.d) + '</div></div><span class="mn-num mn-am' + (e.v > 0 ? " inc" : "") + '">' + M.signed(e.v) + "</span></div></div>";
  function renderList() {
    const rows = SP.entries().filter((e) => inView(e) && (!V.filt || e.c === V.filt)).sort(M.byNewest);
    list.innerHTML = rows.length ? rows.slice(0, 300).map(rowHTML).join("") + (rows.length > 300 ? '<div class="mn-empty">+' + (rows.length - 300) + " more — search finds them all</div>" : "") : '<div class="mn-empty">No transactions</div>';
    requestAnimationFrame(listEdges);
  }
  // 流水上沿 / 下沿的渐进模糊：滚下去了才有上面那条，下面还有没露出来的才有下面那条
  function listEdges() {
    const w = list.parentNode;
    w.classList.toggle("scrolled", list.scrollTop > 2);
    w.classList.toggle("more", list.scrollTop + list.clientHeight < list.scrollHeight - 2);
  }
  let recList = [];
  function renderRecs() {
    const t = todayP(), view = V.mode === "year" ? (V.cur.y === t.y ? { y: t.y, m: t.m } : null) : { y: V.cur.y, m: V.cur.m };
    recList = M.recommend(SP.entries(), SP.cats(), view, today());
    $(".mn-recw").hidden = !recList.length;
    $(".mn-recs").innerHTML = recList.map((x, i) => '<button type="button" class="mn-chip" data-rec="' + i + '">' + esc(x.c) + ' <span class="mn-num mn-pct">' + M.money(x.v) + "</span></button>").join("");
  }
  // 推荐 / 新的一笔记在哪天：日模式 = 选中的那天；这段时间里有今天 = 今天；不然 = 那个月 / 那年的头一天
  function entryDate() {
    const t = todayP();
    if (V.mode === "day") return M.iso(V.cur.y, V.cur.m, V.cur.d);
    if (V.mode === "month") return V.cur.y === t.y && V.cur.m === t.m ? today() : M.iso(V.cur.y, V.cur.m, 1);
    return V.cur.y === t.y ? today() : M.iso(V.cur.y, 1, 1);
  }
  function renderBody() { renderChips(); renderList(); renderRecs(); V.fresh = null; }
  function setCol(c) { if (c === V.collapsed) return; V.collapsed = c; tl.classList.toggle("col", c); }

  // 流水：点一下改，往左滑删；竖着拖 = 滚动（拖上去柱子压成点，在顶上往下拖展开）
  let lp = null;
  list.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button) return;
    lp = { x: e.clientX, y: e.clientY, ax: null, row: e.target.closest(".mn-row"), st: list.scrollTop, dx: 0, tr: tracker() };
    lp.tr.add(e.clientX);
  });
  list.addEventListener("pointermove", (e) => {
    if (!lp) return;
    const dx = e.clientX - lp.x, dy = e.clientY - lp.y;
    if (!lp.ax && Math.hypot(dx, dy) > 6) {
      lp.ax = Math.abs(dx) > Math.abs(dy) && lp.row ? "x" : "y";
      if (lp.ax === "x" || e.pointerType === "mouse") try { list.setPointerCapture(e.pointerId); } catch { /* 已经松手了 */ }
    }
    if (lp.ax === "x") { lp.tr.add(e.clientX); lp.dx = dx > 0 ? dx * 0.2 : dx; lp.row.parentNode.classList.add("swiping"); lp.row.style.transition = "none"; lp.row.style.transform = "translateX(" + lp.dx + "px)"; }
    else if (lp.ax === "y") { if (e.pointerType !== "touch") list.scrollTop = lp.st - dy; if (dy < -24) setCol(true); else if (dy > 24 && lp.st <= 0) setCol(false); }
  });
  const listUp = (e) => {
    if (!lp) return;
    const l = lp;
    lp = null;
    if (!l.ax) { if (l.row && e.type === "pointerup") edit(SP.get(l.row.dataset.id)); return; }
    if (l.ax !== "x") return;
    const v = l.tr.vel(), r = l.row;
    if (l.dx < -80 || (v < -0.5 && l.dx < -20)) {
      r.style.transition = "transform .22s ease-in";
      r.style.transform = "translateX(-110%)";
      setTimeout(() => { const w = r.parentNode; w.style.height = w.offsetHeight + "px"; void w.offsetHeight; w.style.height = "0px"; }, 200);
      setTimeout(() => removeEntry(r.dataset.id), 450);
    } else { r.style.transition = "transform .28s " + SPR; r.style.transform = ""; setTimeout(() => { if (!r.style.transform) r.parentNode?.classList.remove("swiping"); }, 600); }
  };
  list.addEventListener("pointerup", listUp);
  list.addEventListener("pointercancel", listUp);
  list.addEventListener("scroll", () => { listEdges(); if (list.scrollTop > 4) setCol(true); else if (list.scrollTop <= 0 && !lp) setCol(false); });
  list.addEventListener("wheel", (e) => { if (e.deltaY > 0) setCol(true); else if (list.scrollTop <= 0) setCol(false); }, { passive: true });

  // ---------- 记一笔 / 改 / 删 ----------
  function addEntry(x) {
    V.fresh = SP.newId();
    changed = true;
    const e = SP.add({ ...x, id: V.fresh });
    snack("Added " + e.c + " " + M.money(e.v), () => SP.remove(e.id));
    return e;
  }
  function removeEntry(id) {
    const e = SP.remove(id);
    if (!e) return;
    changed = true;
    snack("Deleted " + e.c + " " + M.money(e.v), () => { V.fresh = e.id; SP.restore(e); });
  }
  let changed = false;
  const tookChange = () => { const c = changed; changed = false; return c; };

  let snT = 0, undoFn = null;
  function snack(text, fn) {
    undoFn = fn || null;
    $("[data-snt]").textContent = text;
    $('[data-act="undo"]').hidden = !fn;
    $(".mn-snack").classList.add("on");
    clearTimeout(snT);
    snT = setTimeout(() => $(".mn-snack").classList.remove("on"), 3500);
  }

  // 手机：底下弹上来的面板 + 数字键盘
  const S = { edit: null, kind: "out", cat: "", d: today(), ex: "" };
  const ssum = () => S.ex.split("+").reduce((s, v) => s + (parseFloat(v) || 0), 0);
  function sheetCats() {
    const cats = visible(S.kind);
    if (S.edit && !cats.includes(S.cat) && M.kindOf(SP.cats(), S.cat) === S.kind) cats.push(S.cat);   // 藏起来的那类，改旧的那笔时还要能看到
    if (!cats.includes(S.cat)) S.cat = cats[S.kind === "out" ? Math.min(1, cats.length - 1) : 0] || "";
    return cats;
  }
  function renderSheet() {
    seg("skind", S.kind);
    $("[data-scats]").innerHTML = sheetCats().map((c) => '<button type="button" class="mn-chip' + (c === S.cat ? " on" : "") + '" data-scat="' + esc(c) + '">' + esc(c) + "</button>").join("");
    $("[data-sdl]").textContent = M.fmtDate(S.d);
    const used = M.notesOf(SP.entries(), S.cat);
    $("[data-snote]").placeholder = used[0] ? "e.g. " + used[0] : "Add a note";
    renderAmt(false);
  }
  function renderAmt(app) {
    const s = ssum();
    // 每个数的小数点和后面两位小一号（「12.50+8」里的「.50」）
    let dec = false;
    const typed = [...S.ex].map((c, i) => {
      if (c === "+") dec = false; else if (c === ".") dec = true;
      const ch = app && i === S.ex.length - 1 ? '<span class="in">' + c + "</span>" : c;
      return dec ? '<span class="mn-dec">' + ch + "</span>" : ch;
    }).join("");
    $("[data-samt]").innerHTML = '<span class="cur">' + (S.kind === "out" ? "−$" : "+$") + "</span>" + (S.ex ? typed : '<span class="zero">0</span>');
    const eq = $("[data-seq]");
    eq.style.color = "";
    eq.textContent = S.ex.includes("+") && s > 0 ? "= " + s.toFixed(2) : "";
  }
  function openSheet(e) {
    S.edit = e || null;
    if (e) Object.assign(S, { kind: e.v < 0 ? "out" : "in", cat: e.c, d: e.d, ex: (Math.abs(e.v) / 100).toFixed(2).replace(/\.00$/, "") });
    else Object.assign(S, { kind: "out", cat: "Food", d: entryDate(), ex: "" });
    $("[data-snote]").value = e ? e.n : "";
    $("[data-sht]").textContent = e ? "Edit transaction" : "New transaction";
    $('[data-act="sdel"]').hidden = !e;
    $('[data-k="Add"]').textContent = e ? "Save" : "Add";
    closeCal();
    $(".mn-scrim").classList.add("on");
    $(".mn-sheet").classList.add("on");
    requestAnimationFrame(() => renderSheet());
  }
  function closeSheet() { closeCal(); $(".mn-scrim").classList.remove("on"); $(".mn-sheet").classList.remove("on"); $("[data-snote]").blur(); }
  function saveSheet() {
    const s = ssum();
    if (!(s > 0)) {
      $("[data-samt]").animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 300 });
      const eq = $("[data-seq]");
      eq.textContent = "Type an amount first";
      eq.style.color = "#E8674A";
      return;
    }
    const v = Math.round(s * 100) * (S.kind === "out" ? -1 : 1), n = $("[data-snote]").value.trim(), e = S.edit;
    closeSheet();
    setTimeout(() => {
      if (e) { V.fresh = e.id; changed = true; SP.update(e.id, { d: S.d, v, c: S.cat, n }); snack("Saved", null); }
      else addEntry({ d: S.d, v, c: S.cat, n });
    }, 180);
  }
  function key(k) {
    let app = false;
    if (k === "Add") return saveSheet();
    if (k === "⌫") S.ex = S.ex.slice(0, -1);
    else if (k === "+") { if (S.ex && !S.ex.endsWith("+")) { S.ex += "+"; app = true; } }
    else {
      const last = S.ex.split("+").pop();
      if (k === "." && last.includes(".")) return;
      if (last.includes(".") && last.split(".")[1].length >= 2) return;
      if (last.replace(".", "").length >= 7) return;
      S.ex += k; app = true;
    }
    renderAmt(app);
  }

  // 电脑：流水顶上展开一行，直接打字（Tab 跳格、回车存、Esc 收起）
  function formHTML() {
    return '<form class="mn-form" data-form hidden autocomplete="off"><div class="mn-seg full" data-seg="fkind"><i></i><button type="button" data-v="out">Expense</button><button type="button" data-v="in">Income</button></div>' +
      '<div class="mn-cats full" data-fcats></div>' +
      '<span class="mn-meta mn-13">Date</span><button type="button" class="mn-plain" data-act="fdate" style="display:flex;align-items:center;gap:6px;justify-self:start"><span class="mn-num mn-13" data-fdl></span>' + icon("calendar") + "</button>" +
      '<span class="mn-meta mn-13">Amount</span><input class="mn-tx amt" data-famt inputmode="decimal" placeholder="0.00  (12.50+8 adds up)">' +
      '<span class="mn-meta mn-13">Note</span><input class="mn-tx" data-fnote placeholder="Add a note">' +
      '<div class="btns full"><span class="mn-meta" data-ferr style="margin-right:auto;color:#E8674A"></span><button type="button" class="mn-act warn" data-act="fdel" hidden>Delete</button><button type="button" class="mn-act" data-act="fcancel">Cancel<span class="mn-kbd">Esc</span></button><button type="submit" class="mn-big">Save<span class="mn-kbd">↵</span></button></div></form>';
  }
  function openForm(e) {
    const f = $("[data-form]");
    S.edit = e || null;
    if (e) Object.assign(S, { kind: e.v < 0 ? "out" : "in", cat: e.c, d: e.d });
    else Object.assign(S, { kind: "out", cat: "Food", d: entryDate() });
    f.hidden = false;
    $("[data-famt]").value = e ? (Math.abs(e.v) / 100).toFixed(2) : "";
    $("[data-fnote]").value = e ? e.n : "";
    $('[data-act="fdel"]').hidden = !e;
    $("[data-ferr]").textContent = "";
    renderForm();
    if (!quiet()) f.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: ENTER });
    $("[data-famt]").focus();
  }
  function renderForm() {
    seg("fkind", S.kind);
    $("[data-fcats]").innerHTML = sheetCats().map((c) => '<button type="button" class="mn-chip' + (c === S.cat ? " on" : "") + '" data-fcat="' + esc(c) + '">' + esc(c) + "</button>").join("");
    $("[data-fdl]").textContent = M.fmtDate(S.d);
    const used = M.notesOf(SP.entries(), S.cat);
    $("[data-fnote]").placeholder = used[0] ? "e.g. " + used[0] : "Add a note";
  }
  function closeForm() { const f = $("[data-form]"); if (f) f.hidden = true; closeCal(); S.edit = null; }
  function saveForm() {
    const raw = $("[data-famt]").value, s = raw.split("+").reduce((a, v) => a + (parseFloat(String(v).replace(/[^\d.]/g, "")) || 0), 0);
    if (!(s > 0)) { $("[data-ferr]").textContent = "Type an amount first"; $("[data-famt]").focus(); return; }
    const v = Math.round(s * 100) * (S.kind === "out" ? -1 : 1), n = $("[data-fnote]").value.trim(), e = S.edit;
    closeForm();
    if (e) { V.fresh = e.id; SP.update(e.id, { d: S.d, v, c: S.cat, n }); snack("Saved", null); }
    else addEntry({ d: S.d, v, c: S.cat, n });
  }
  const edit = (e) => { if (!e) return; if (desk) { openDrawer(false); openForm(e); } else openSheet(e); };
  const startNew = () => { if (desk) { openDrawer(true); openForm(null); } else openSheet(null); };

  // ---------- 电脑：右边的抽屉 ----------
  // 打开：从收着打开的时候回到今天（把手上写的就是今天）；收起：表单、日历、推进去的页都收掉
  function openDrawer(toToday) {
    if (!desk || V.drawer) return;
    V.drawer = true;
    if (toToday && !M.samePeriod(V.cur, todayP(), "day")) { V.cur = todayP(); buildRail(false); renderTitle(); renderBody(); }
    root.classList.add("drawer-on");
    $(".mn-drawer").removeAttribute("inert");
    if (!quiet()) [...homeEl.children].forEach((el, i) => el.animate([{ opacity: 0, transform: "translateX(18px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 60 + i * 20, easing: ENTER, fill: "backwards" }));
  }
  function closeDrawer() {
    if (!desk || !V.drawer) return;
    V.drawer = false;
    closeForm(); closeCal();
    while (V.stack.length) pop();
    root.classList.remove("drawer-on");
    $(".mn-drawer").setAttribute("inert", "");
    if (root.contains(document.activeElement)) $('[data-act="drawer"]')?.focus({ preventScroll: true });
  }
  // 把手上：今天花了多少。把手只有 64px 宽：放不下的（$1,000 以上）写成「$1.2k」，整数写在悬停的提示里
  function paintHandle() {
    const el = desk && $("[data-htot]");
    if (!el) return;
    const out = M.sumOf(IX(), todayP(), "day").out, full = "−" + M.money(out);
    el.innerHTML = full.length <= 8 ? "−" + cents(M.money(out)) : esc(kfmt(-out));
    el.parentNode.title = "Today " + full;
  }

  // 月历：从日期按钮那里弹出来，哪天都能选
  const C = { y: 2026, m: 1, onPick: null, sel: "" };
  function drawCal(dir) {
    $("[data-calt]").textContent = M.MONTH[C.m - 1] + " " + C.y;
    const first = new Date(C.y, C.m - 1, 1).getDay(), N = M.dim(C.y, C.m);
    let h = "";
    for (let i = 0; i < first; i++) h += "<span></span>";
    for (let d = 1; d <= N; d++) { const k = M.iso(C.y, C.m, d); h += '<button type="button" class="mn-cd' + (k === C.sel ? " sel" : "") + (k === today() ? " today" : "") + '" data-cd="' + k + '">' + d + "</button>"; }
    const g = $("[data-calg]");
    g.innerHTML = h;
    if (dir && !quiet()) g.animate([{ transform: "translateX(" + dir * 16 + "px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 280, easing: ENTER });
  }
  function openCal(anchor, sel, onPick) {
    const cal = $("[data-cal]");
    if (cal.classList.contains("on")) { closeCal(); return; }
    const p = M.parts(sel);
    Object.assign(C, { y: p.y, m: p.m, sel, onPick });
    drawCal(0);
    const a = anchor.getBoundingClientRect(), r = root.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.width - 268, a.right - r.left - 260)), top = a.bottom - r.top + 6;
    cal.style.left = left + "px";
    cal.style.top = Math.min(top, r.height - 300) + "px";
    cal.classList.add("on");
  }
  function closeCal() { $("[data-cal]")?.classList.remove("on"); }

  // ---------- 图表 ----------
  let CS = null, ct = 0, ci = 0, craf = 0;
  function renderChart(animate, entering) {
    const mode = V.cmode, p = V.cc, t = todayP();
    $("[data-ctitle]").textContent = periodTitle(p, mode);
    $('[data-act="creset"]').classList.toggle("on", mode === "month" ? !(p.y === t.y && p.m === t.m) : p.y !== t.y);
    if (desk) {
      // 电脑：图表按那一栏的实际宽度画（viewBox = 像素），字不跟着放大；高度跟着宽度走，有个上下限
      const svg0 = $("[data-chart]");
      W = Math.max(320, Math.round(svg0.clientWidth || W));
      H = Math.round(Math.max(220, Math.min(340, W * 0.32)));
      svg0.setAttribute("viewBox", "0 0 " + W + " " + H);
      const g = M.sumOf(IX(), p, mode);
      roll($("[data-cto]"), "−" + M.money(g.out), true);
      roll($("[data-cti]"), "+" + M.money(g.inc), true);
    }
    const ix = IX(), bud = SP.budgets();
    const c = mode === "month" ? M.monthChart(ix, bud, p.y, p.m, today()) : M.yearChart(ix, bud, p.y, today());
    const X0 = 4, X1 = W - 4, Y0 = H - 22, Y1 = 26;
    const X = (i) => X0 + (i - 1) / Math.max(1, c.n - 1) * (X1 - X0), Y = (v) => Y0 - v / c.top * (Y0 - Y1);
    const pts = Array.from({ length: c.n }, (_, i) => ({ x: X(i + 1), y: Y(c.val(i + 1)) }));
    const poly = (arr) => "M" + arr.map((v, i) => X(i + 1).toFixed(1) + " " + Y(v).toFixed(1)).join(" L") + " L" + X1 + " " + Y0 + " L" + X0 + " " + Y0 + "Z";
    let h;
    if (mode === "month") {
      h = (c.B ? '<path class="ar" d="M' + X0 + " " + Y(c.pace(1)) + " L" + X1 + " " + Y(c.B) + " L" + X1 + " " + Y0 + " L" + X0 + " " + Y0 + 'Z" fill="var(--mn-bud)"/>' : "") +
        (c.base ? '<path class="ar" d="M' + X0 + " " + Y(c.base) + " H" + X1 + " V" + Y0 + " H" + X0 + 'Z" fill="var(--mn-base)"/>' : "");
    } else {
      h = (c.budgetLine[c.n] ? '<path class="ar" d="' + poly(c.budgetLine.slice(1)) + '" fill="var(--mn-bud)"/>' : "") + '<path class="ar" d="' + poly(c.baseLine.slice(1)) + '" fill="var(--mn-base)"/>';
    }
    h += [c.top, c.top / 2].map((v) => '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#fff" stroke-opacity=".07"/><text class="mn-ax" x="6" y="' + (Y(v) + 12) + '">$' + Math.round(v / 100).toLocaleString("en-US") + "</text>").join("");
    if (c.last) h += '<path class="ln" pathLength="1" d="' + pts.slice(0, c.last).map((q, i) => (i ? "L" : "M") + q.x.toFixed(1) + " " + q.y.toFixed(1)).join(" ") + '" fill="none" stroke="#F2EEE6" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>';
    if (c.isCur && c.last && c.last < c.n) h += '<path class="fc" d="M' + pts[c.last - 1].x + " " + pts[c.last - 1].y + " L" + pts[c.n - 1].x + " " + pts[c.n - 1].y + '" fill="none" stroke="#F2EEE6" stroke-opacity=".5" stroke-width="1.4" stroke-dasharray="4 4"/>';
    const xl = mode === "month" ? [[1, M.MON[p.m - 1] + " 1"], [Math.ceil(c.n / 2), M.MON[p.m - 1] + " " + Math.ceil(c.n / 2)], [c.n, M.MON[p.m - 1] + " " + c.n]] : [[1, "Jan"], [M.dayOfYear(p.y, 7, 1), "Jul"], [c.n, "Dec"]];
    h += '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + Y0 + '" y2="' + Y0 + '" stroke="#fff" stroke-opacity=".14"/>' + xl.map(([i, txt], k) => '<text x="' + X(i) + '" y="' + (H - 5) + '" text-anchor="' + (k === 0 ? "start" : k === 2 ? "end" : "middle") + '">' + txt + "</text>").join("") +
      '<line data-csl y1="' + (Y1 - 14) + '" y2="' + Y0 + '" stroke="#fff" stroke-opacity=".35" style="pointer-events:none"/><circle data-csp r="4.5" fill="var(--mn-orange)" stroke="#000" stroke-width="1.5" style="pointer-events:none"/>' +
      // 读数在竖线右边：上面是哪天，下面是到那天一共多少（靠右边放不下就挪到左边）
      '<g data-lab style="pointer-events:none"><text data-lt class="mn-ax" y="' + (Y1 - 4) + '" style="font-size:11px;fill:#8C8CA0"></text><text data-lv class="mn-ax" y="' + (Y1 + 12) + '" style="font-size:13px;fill:#F2EEE6"></text></g>';
    const svg = $("[data-chart]");
    svg.innerHTML = h;
    const d0 = entering ? 0.3 : 0;
    if (animate && !quiet()) {
      svg.querySelectorAll(".ar").forEach((a) => a.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, delay: d0 * 1000, fill: "backwards" }));
      svg.querySelectorAll(".ln").forEach((q) => { q.style.strokeDasharray = 1; q.style.strokeDashoffset = 1; q.getBoundingClientRect(); q.style.transition = "stroke-dashoffset .9s " + ENTER + " " + (d0 + 0.1) + "s"; q.style.strokeDashoffset = 0; });
      svg.querySelectorAll(".fc").forEach((q) => q.animate([{ opacity: 0 }, { opacity: 0, offset: 0.65 }, { opacity: 1 }], { duration: 1000 + d0 * 1000 }));
      $("[data-lab]").animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: 900 + d0 * 1000 });
    }
    CS = { c, pts, mode, p, W, dateOf: (i) => (mode === "month" ? M.MON[p.m - 1] + " " + (i + 1) : (() => { const q = M.parts(c.dateOf(i + 1)); return M.MON[q.m - 1] + " " + q.d; })()) };
    ct = ci = Math.min(c.n - 1, c.home);
    cread(ci);
    cards(c, mode, p, d0);
    breakdown(mode, p);
    if (animate && !quiet()) {
      const base = entering ? 200 : 30;
      [...root.querySelectorAll(desk ? ".mn-fig .mn-st" : ".mn-csheet .mn-st")].forEach((el, i) => el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: base + Math.min(i, 14) * 30, easing: ENTER, fill: "backwards" }));
      root.querySelectorAll(".mn-card").forEach((el, i) => el.animate([{ opacity: 0, transform: "translateX(16px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: base + 100 + i * 30, easing: ENTER, fill: "backwards" }));
    }
  }
  function cplace(f) {
    if (!CS) return;
    const P = CS.pts, a = Math.floor(f), b = Math.min(P.length - 1, a + 1), t = f - a, x = P[a].x + (P[b].x - P[a].x) * t, y = P[a].y + (P[b].y - P[a].y) * t;
    const sl = $("[data-csl]"), sp = $("[data-csp]");
    if (!sl) return;
    sl.setAttribute("x1", x); sl.setAttribute("x2", x); sp.setAttribute("cx", x); sp.setAttribute("cy", y);
    const lt = $("[data-lt]"), lv = $("[data-lv]"), w = Math.max(lt.getComputedTextLength?.() || 60, lv.getComputedTextLength?.() || 60);
    const right = x + 8 + w <= CS.W - 2, lx = right ? x + 8 : x - 8;
    for (const el of [lt, lv]) { el.setAttribute("x", lx.toFixed(1)); el.setAttribute("text-anchor", right ? "start" : "end"); }
  }
  function cread(i) {
    if (!$("[data-lt]")) return;
    $("[data-lt]").textContent = CS.dateOf(i) + (i + 1 > CS.c.last ? " · trend" : "");
    $("[data-lv]").textContent = M.money(CS.c.val(i + 1));
    cplace(ci);
  }
  const ctick = () => { ci += (ct - ci) * 0.18; if (Math.abs(ct - ci) < 0.005) ci = ct; cplace(ci); craf = ci === ct ? 0 : requestAnimationFrame(ctick); };
  const caim = (i) => { if (i !== ct) { ct = i; cread(i); } if (!craf) craf = requestAnimationFrame(ctick); };
  const svgEl = $("[data-chart]");
  const cnear = (e) => { const r = svgEl.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * W, P = CS.pts; const k = Math.round((vx - P[0].x) / Math.max(1e-6, P[P.length - 1].x - P[0].x) * (P.length - 1)); return Math.max(0, Math.min(P.length - 1, k)); };
  svgEl.addEventListener("pointermove", (e) => CS && caim(cnear(e)));
  svgEl.addEventListener("pointerdown", (e) => CS && caim(cnear(e)));
  svgEl.addEventListener("pointerleave", () => CS && caim(Math.min(CS.c.n - 1, CS.c.home)));

  // 五个小方块：一样的四行（名字 / 数 / 一条线 / 小字），所以对得齐。Budget Used 的线 = 用了多少；
  // 别的四个的线 = 之前六个月（年模式 = 之前几年）这个数的范围，点 = 这次落在哪儿（这个月的话，之前的也只算到同一天）
  const kfmt = (c) => { const a = Math.abs(c) / 100, sgn = c < 0 ? "−" : ""; return sgn + "$" + (a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1) + "k" : Math.round(a)); };
  function cards(c, mode, p, d0) {
    const g = c.used, B = c.B, used = M.counted(g), u = B ? used / B : 0, cmp = M.compare(IX(), SP.budgets(), p, mode, today());
    const since = (mode === "year" ? "Earlier years" : "6 mo") + (cmp.cutText ? " " + cmp.cutText : "");
    const card = (label, value, col, key, worse) => {
      const r = cmp.range[key], v = cmp.cur[key];
      let bar, small;
      if (!r) { bar = '<div class="mn-track"></div>'; small = mode === "year" ? "No earlier years" : "No history yet"; }
      else {
        const span = r[1] - r[0], pos = span ? (v - r[0]) / span : 0.5, bad = worse === "high" ? v > r[1] : v < r[0];
        bar = '<div class="mn-track mn-range"><b style="left:' + (Math.max(0, Math.min(1, pos)) * 100).toFixed(1) + '%"' + (bad ? ' class="over"' : "") + "></b></div>";
        small = kfmt(r[0]) + "–" + kfmt(r[1]);
      }
      return '<div class="mn-card" title="' + esc(since) + '"><span class="mn-meta">' + label + '</span><span class="mn-num v"' + (col ? ' style="color:' + col + '"' : "") + ">" + cents(value) + "</span>" + bar + '<span class="mn-num mn-meta">' + small + "</span></div>";
    };
    const left = cmp.cur.left, bal = cmp.cur.balance;
    $(".mn-cards").innerHTML = '<div class="mn-card"><span class="mn-meta">Budget Used</span><span class="mn-num v">' + (B ? cents((u * 100).toFixed(1)) + "%" : "—") + '</span><div class="mn-track"><i data-w="' + Math.min(100, u * 100).toFixed(1) + '"' + (u > 1 ? ' class="over"' : "") + ' style="transition-delay:' + (d0 + 0.15) + 's"></i></div><span class="mn-num mn-meta">' + (B ? M.money(B) : "No budget yet") + "</span></div>" +
      card("Budget Left", B ? (left < 0 ? "−" : "+") + M.money(left) : "—", B && left < 0 ? "var(--mn-orange)" : "", "left", "low") +
      card("Expense", "−" + M.money(g.out), "", "expense", "high") +
      card("Income", "+" + M.money(g.inc), "var(--mn-green)", "income", "low") +
      card("Balance", (bal < 0 ? "−" : "+") + M.money(bal), bal < 0 ? "var(--mn-orange)" : "", "balance", "low");
    requestAnimationFrame(() => root.querySelectorAll(".mn-track > i").forEach((s) => { s.style.width = s.dataset.w + "%"; }));
  }
  function breakdown(mode, p) {
    const inP = (e) => M.inPeriod(e, p, mode), rows = SP.entries().filter(inP);
    const make = (title, isIn) => {
      const part = rows.filter((e) => (e.v > 0) === isIn), total = part.reduce((s, e) => s + Math.abs(e.v), 0) || 1, by = new Map();
      for (const e of part) { const x = by.get(e.c) || { v: 0, list: [] }; x.v += Math.abs(e.v); x.list.push(e); by.set(e.c, x); }
      const cats = [...by].sort((a, b) => b[1].v - a[1].v);
      return '<div class="mn-sect mn-st">' + title + '</div><div class="mn-meta mn-st" style="margin:3px 0 4px">' + part.length + " transactions in " + cats.length + " categor" + (cats.length === 1 ? "y" : "ies") + "</div>" +
        cats.map(([k, x]) => {
          const op = V.bk.has((isIn ? "in:" : "out:") + k), its = x.list.sort(M.byNewest), role = M.roleOf(SP.cats(), k);
          return '<div class="mn-bk mn-st' + (op ? " open" : "") + '" data-bk="' + (isIn ? "in:" : "out:") + esc(k) + '"><div class="mn-brow"><div><div style="font-size:15px">' + esc(k) + (role === "base" ? ' <span class="mn-meta">base</span>' : role === "outside" ? ' <span class="mn-meta">not in budget</span>' : "") + '</div><div class="mn-meta" style="margin-top:3px">' + x.list.length + " transaction" + (x.list.length === 1 ? "" : "s") + "</div></div>" +
            '<div class="r"><div><div class="mn-num" style="font-size:15px' + (isIn ? ";color:var(--mn-green)" : "") + '">' + (isIn ? "+" : "−") + cents(M.money(x.v)) + '</div><div class="mn-meta mn-num" style="margin-top:3px">' + (x.v / total * 100).toFixed(1) + "%</div></div>" + pie(x.v / total, isIn ? "inc" : "") + '<svg class="ic mn-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></div></div>' +
            '<div class="mn-bin" style="height:' + (op ? "auto" : "0px") + '">' + its.slice(0, 60).map((e) => '<div class="mn-irow" data-id="' + esc(e.id) + '"><span class="mn-num mn-meta">' + M.MON[M.parts(e.d).m - 1] + " " + M.parts(e.d).d + '</span><span class="n">' + esc(e.n || "—") + '</span><span class="mn-num">' + M.signed(e.v) + "</span></div>").join("") + (its.length > 60 ? '<div class="mn-meta" style="padding:6px 2px">+' + (its.length - 60) + " more</div>" : "") + "</div></div>";
        }).join("");
    };
    $("[data-xb]").innerHTML = make("Expense Breakdown", false);
    $("[data-ib]").innerHTML = make("Income Breakdown", true);
    if (!desk) $(".mn-csheet .mn-thead").classList.add("mn-st");
    $("[data-chart]").classList.add("mn-st");
  }
  function toggleBk(el) {
    const bin = el.querySelector(".mn-bin"), k = el.dataset.bk, open = !el.classList.contains("open");
    el.classList.toggle("open", open);
    if (open) {
      V.bk.add(k);
      bin.style.height = "0px"; void bin.offsetHeight; bin.style.height = bin.scrollHeight + "px";
      if (!quiet()) bin.querySelectorAll(".mn-irow").forEach((r, i) => r.animate([{ opacity: 0, transform: "translateY(-5px)" }, { opacity: 1, transform: "none" }], { duration: 280, delay: 40 + Math.min(i, 12) * 20, easing: ENTER, fill: "backwards" }));
      setTimeout(() => { if (el.classList.contains("open")) bin.style.height = "auto"; }, 450);
    } else { V.bk.delete(k); bin.style.height = bin.scrollHeight + "px"; void bin.offsetHeight; bin.style.height = "0px"; }
  }

  // 手机：图表从底下升上来，先停在半高（上面还看得到期间和时间轴，主页只稍微往后退一点）；拖顶上那条：往上到全高、往下收起；
  // 点上面变暗的地方、Done 也收起。半高时在图表里往下滚，自己升到全高（下面的方块、Breakdown 才看得到）
  const csheet = $(".mn-csheet"), cdim = $(".mn-cdim");
  let detent = "", halfY = 0;   // 停在哪：""（收着）/ "half" / "full"；halfY = 半高时往下挪了多少
  function setUnder(p, dur, ease = ENTER) {
    const t = dur ? "transform " + dur + " " + ease + ", border-radius " + dur : "none";
    homeEl.style.transition = t;
    cdim.style.transition = dur ? "opacity " + dur + " " + ease : "none";
    homeEl.style.transform = p ? "scale(" + (1 - 0.05 * p) + ") translateY(" + 6 * p + "px)" : "";
    homeEl.style.borderRadius = 18 * p + "px";
    cdim.style.opacity = (0.5 * p).toFixed(3);
  }
  const shut = () => csheet.offsetHeight + 24;
  function sheetTo(where, dur, ease) {
    detent = where;
    const y = where === "full" ? 0 : where === "half" ? halfY : shut();
    csheet.style.transition = dur ? "transform " + dur + " " + ease : "none";
    csheet.style.transform = "translateY(" + y + "px)";
    setUnder(where === "full" ? 1 : where === "half" ? 0.45 : 0, dur, ease);
    cdim.style.pointerEvents = where ? "auto" : "none";
  }
  function openChart() {
    if (V.chartOpen) return;
    V.chartOpen = true;
    V.cmode = V.mode === "year" ? "year" : "month";
    V.cc = { ...V.cur };
    V.bk = new Set();
    seg("cmode", V.cmode);
    $(".mn-csheet .mn-cbody").scrollTop = 0;
    halfY = Math.max(0, Math.round(csheet.parentNode.clientHeight * 0.45 - csheet.offsetTop));
    sheetTo("", 0);
    void csheet.offsetWidth;
    sheetTo("half", quiet() ? "" : ".42s", ENTER);
    requestAnimationFrame(() => seg("cmode", V.cmode));
    renderChart(true, true);
  }
  function closeChart() {
    if (!V.chartOpen) return;
    V.chartOpen = false;
    sheetTo("", quiet() ? "" : ".26s", EXIT);
  }
  if (!desk) {
    let cg = null;
    const grab = $("[data-cgrab]"), cbody = $(".mn-csheet .mn-cbody");
    grab.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; cg = { y: e.clientY, base: detent === "full" ? 0 : halfY, d: 0, tr: tracker() }; cg.tr.add(e.clientY); csheet.style.transition = "none"; grab.setPointerCapture(e.pointerId); });
    grab.addEventListener("pointermove", (e) => {
      if (!cg) return;
      cg.tr.add(e.clientY);
      let y = cg.base + e.clientY - cg.y;
      if (y < 0) y = -6 * Math.log(1 - y / 6);   // 全高再往上：有阻力
      cg.d = y;
      csheet.style.transform = "translateY(" + y + "px)";
      setUnder(Math.max(0, Math.min(1, 1 - Math.max(0, y) / shut() * 1.2)), null);
    });
    // 松手：甩一下按方向走一档（全高往下甩 = 半高，半高往下甩 = 收起），不然停到离得最近的那一档
    const up = () => {
      if (!cg) return;
      const y = cg.d, v = cg.tr.vel(), from = cg.base;
      cg = null;
      if (v > 0.5) { if (from === 0 && y < halfY + 60) sheetTo("half", ".42s", ENTER); else closeChart(); return; }
      if (v < -0.5) { sheetTo("full", ".42s", ENTER); return; }
      const end = shut(), near = [[0, "full"], [halfY, "half"], [end, ""]].sort((a, b) => Math.abs(a[0] - y) - Math.abs(b[0] - y))[0][1];
      if (near) sheetTo(near, ".42s", ENTER); else closeChart();
    };
    grab.addEventListener("pointerup", up);
    grab.addEventListener("pointercancel", up);
    cbody.addEventListener("scroll", () => { if (detent === "half" && cbody.scrollTop > 4) sheetTo("full", ".42s", ENTER); }, { passive: true });
  }
  function cshift(k) {
    let { y, m } = V.cc;
    if (V.cmode === "month") ({ y, m } = M.addMonths(y, m, k)); else y += k;
    if (y > todayP().y + 1 || y < 2000) return;
    V.cc = { y, m, d: 1 };
    V.bk = new Set();
    renderChart(true);
    if (!quiet()) $("[data-ctitle]").animate([{ transform: "translateX(" + k * 10 + "px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 280, easing: ENTER });
  }

  // ---------- 一页一页推进去 ----------
  function push(name) {
    const prev = V.stack.length ? $('[data-pg="' + V.stack[V.stack.length - 1] + '"]') : homeEl;
    prev.classList.add("under");
    $('[data-pg="' + name + '"]').classList.remove("off");
    V.stack.push(name);
  }
  function pop() {
    const name = V.stack.pop();
    if (!name) return false;
    $('[data-pg="' + name + '"]').classList.add("off");
    (V.stack.length ? $('[data-pg="' + V.stack[V.stack.length - 1] + '"]') : homeEl).classList.remove("under");
    $("[data-q]").blur();
    if (name === "sub" && V.stack[V.stack.length - 1] === "set") renderSet();
    return true;
  }

  // ---------- 设定 ----------
  function statusText() {
    const linked = Boolean(store.setting("spend")?.url), err = SP.error(), n = SP.pendingCount();
    if (!linked) return ["Saved on this device. Add a spending Sheet link in 苦昼短 Settings on the computer to keep it in your Google account.", false];
    if (err) return [err, true];
    return [n ? n + " change" + (n === 1 ? "" : "s") + " waiting to sync" : "In your spending Sheet · synced", false];
  }
  function renderSet() {
    const nE = visible("out").length, nI = visible("in").length, t = todayP(), b = M.budgetAt(SP.budgets(), t.y, t.m), [st, bad] = statusText();
    $("[data-setb]").innerHTML = '<div class="mn-grp"><button type="button" class="mn-li" data-sub="budget"><span class="grow">Budget</span><span class="mn-meta mn-num">' + (b ? M.money(b) + " / month" : "not set") + "</span>" + chevR + '</button><button type="button" class="mn-li" data-sub="cats"><span class="grow">Categories</span><span class="mn-meta">' + nE + " expense · " + nI + " income</span>" + chevR + "</button></div>" +
      '<div class="mn-grp"><button type="button" class="mn-li" data-sub="export"><span class="grow">Export</span><span class="mn-meta">.md</span>' + chevR + '</button><button type="button" class="mn-li" data-sub="import"><span class="grow">Import a month</span><span class="mn-meta">paste or .md</span>' + chevR + "</button></div>" +
      '<div class="mn-grp"><div class="mn-li dim"><span class="grow">Currency</span><span class="mn-meta">CAD · more later</span></div></div>' +
      '<p class="mn-note mn-status' + (bad ? " bad" : "") + '">' + esc(st) + "</p>";
  }
  const SUBT = { budget: "Budget", cats: "Categories", export: "Export", import: "Import a month" };
  function openSub(k) { V.sub = k; V.budEdit = null; V.newBud = null; if (k === "export") V.expM = { y: V.cur.y, m: V.mode === "year" ? (V.cur.y === todayP().y ? todayP().m : 12) : V.cur.m }; $("[data-subt]").textContent = SUBT[k]; renderSub(); push("sub"); }
  function renderSub() {
    const b = $("[data-subb]");
    if (V.sub === "budget") {
      const pts = SP.budgets().slice().reverse();
      b.innerHTML = '<p class="mn-note">Each month uses the latest budget set on or before it. House is the base of the trapezoid; Bonds don\'t count against it.</p>' +
        (pts.length ? '<div class="mn-grp">' + pts.map((x) => {
          const p = M.parts(x.from + "-01"), ed = V.budEdit === x.from;
          return '<div class="mn-li" data-bp="' + x.from + '"><span class="grow">From ' + M.MONTH[p.m - 1] + " " + p.y + "</span>" + (ed ? '<span class="mn-meta mn-num">$</span><input class="mn-tx mn-num" data-bpv value="' + (x.v / 100).toFixed(2) + '" inputmode="decimal" style="width:90px;text-align:right">' + '<button type="button" class="mn-act warn" data-bprm="' + x.from + '">Remove</button>' : '<span class="mn-num">' + M.money(x.v) + "</span>") + "</div>";
        }).join("") + "</div>" : "") +
        (V.newBud ? '<div class="mn-grp"><div class="mn-li">' + btn("nbp", "left", "Earlier month", "mn-sm") + '<span class="grow" style="text-align:center">From ' + M.MONTH[V.newBud.m - 1] + " " + V.newBud.y + "</span>" + btn("nbn", "right", "Later month", "mn-sm") + '</div><div class="mn-li"><span class="grow mn-meta mn-13">Amount a month</span><span class="mn-meta mn-num">$</span><input class="mn-tx mn-num" data-nbv placeholder="3580.00" inputmode="decimal" style="width:90px;text-align:right"><button type="button" class="mn-act" data-act="nbs">Save</button></div></div>'
          : '<div class="mn-grp"><button type="button" class="mn-li act" data-act="nbo">+ New budget from a month</button></div>');
      return;
    }
    if (V.sub === "cats") {
      const all = SP.cats(), mine = all.filter((c) => c.kind === V.catKind), cnt = new Map();
      for (const e of SP.entries()) cnt.set(e.c, (cnt.get(e.c) || 0) + 1);
      // 一行四格对齐：名字（能改，太长省略）| base / not in budget | 用了几笔 | Hide / Show / Del（固定宽、靠右）
      const row = (c) => '<div class="mn-li mn-cat"><input class="mn-tx" data-rn="' + esc(c.name) + '" value="' + esc(c.name) + '" aria-label="Rename ' + esc(c.name) + '">' +
        '<span class="mn-meta">' + (c.role === "base" ? "base" : c.role === "outside" ? "not in budget" : "") + '</span><span class="mn-meta mn-num" title="Records using it">' + (cnt.get(c.name) || 0) + "</span>" +
        (cnt.get(c.name) ? '<button type="button" class="mn-act" data-hide="' + esc(c.name) + '">' + (c.hidden ? "Show" : "Hide") + "</button>" : '<button type="button" class="mn-act warn" data-cdel="' + esc(c.name) + '" aria-label="Delete ' + esc(c.name) + '">Del</button>') + "</div>";
      const shown = mine.filter((c) => !c.hidden), hidden = mine.filter((c) => c.hidden);
      b.innerHTML = '<div class="mn-seg" data-seg="catk" style="margin-bottom:14px"><i></i><button type="button" data-v="out">Expense</button><button type="button" data-v="in">Income</button></div>' +
        '<div class="mn-grp">' + shown.map(row).join("") + '<div class="mn-li mn-cat add"><input class="mn-tx" data-newcat placeholder="+ Add a category"><button type="button" class="mn-act" data-act="addcat">Add</button></div></div>' +
        (hidden.length ? '<p class="mn-note" style="margin-bottom:8px">Hidden · kept for old records, not offered when adding</p><div class="mn-grp" style="opacity:.6">' + hidden.map(row).join("") + "</div>" : "") +
        '<p class="mn-note">The number is how many records use it. Used ones can be hidden; unused ones can be deleted.</p>';
      requestAnimationFrame(() => seg("catk", V.catKind));
      return;
    }
    if (V.sub === "export") {
      const e = V.expM;
      b.innerHTML = '<div class="mn-grp"><div class="mn-li">' + btn("exp", "left", "Earlier month", "mn-sm") + '<span class="grow" style="text-align:center">' + M.MONTH[e.m - 1] + " " + e.y + "</span>" + btn("exn", "right", "Later month", "mn-sm") + "</div>" +
        '<button type="button" class="mn-li act" data-act="exgo">Export this month as .md</button><button type="button" class="mn-li act" data-act="exall">Everything as one .md</button></div><pre class="mn-md" data-mdp hidden></pre>' +
        '<p class="mn-note" style="margin-top:12px">On the phone this opens the share sheet — save it to Files or send it. The tables can be imported back.</p>';
      return;
    }
    if (V.sub === "import") {
      b.innerHTML = '<p class="mn-note">Paste an exported .md, or one line per record: date, category, amount, note. Income categories count as income; a + in front of the amount does too.</p>' +
        '<textarea class="mn-tx" data-imp placeholder="2026-10-03, Food, 23.15, lunch&#10;2026-10-05, Salary, 2400&#10;Oct 6, 2026, Traffic, 3.30, presto"></textarea>' +
        '<button type="button" class="mn-big" data-act="impgo" style="margin-top:12px">Import</button><p class="mn-note" data-impr style="margin-top:10px"></p>';
    }
  }
  function shareFile(name, text) {
    const file = typeof File === "function" ? new File([text], name, { type: "text/markdown" }) : null;
    if (file && navigator.canShare?.({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- 搜索 ----------
  function renderFind() {
    const q = $("[data-q]").value.trim().toLowerCase(), fr = $("[data-fres]");
    if (!q) { fr.innerHTML = '<div class="mn-empty">Type a note, a category, or an amount</div>'; return; }
    const hit = SP.entries().filter((e) => (e.c + " " + e.n + " " + (Math.abs(e.v) / 100).toFixed(2) + " " + M.money(e.v)).toLowerCase().includes(q)).sort(M.byNewest), groups = new Map();
    for (const e of hit) { const k = e.d.slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    fr.innerHTML = hit.length ? [...groups].map(([k, a]) => { const p = M.parts(k + "-01"); return '<div class="mn-meta" style="padding:14px 0 2px">' + M.MONTH[p.m - 1] + " " + p.y + " · " + a.length + "</div>" + a.slice(0, 40).map(rowHTML).join(""); }).join("") : '<div class="mn-empty">Nothing matches</div>';
  }

  // ---------- 点哪儿做什么 ----------
  root.addEventListener("click", (e) => {
    const cal = $("[data-cal]");
    if (cal.classList.contains("on") && !e.target.closest("[data-cal]") && !e.target.closest('[data-act="sdate"],[data-act="fdate"]')) closeCal();
    const segBtn = e.target.closest("[data-seg] > button");
    if (segBtn) {
      const name = segBtn.parentNode.dataset.seg, v = segBtn.dataset.v;
      if (name === "mode" && v !== V.mode) {
        V.mode = v;
        seg("mode", v);
        buildRail(true);
        renderTitle(); renderBody();
      } else if (name === "cmode" && v !== V.cmode) { V.cmode = v; V.bk = new Set(); seg("cmode", v); renderChart(true); }
      else if (name === "skind" && v !== S.kind) { S.kind = v; renderSheet(); }
      else if (name === "fkind" && v !== S.kind) { S.kind = v; renderForm(); }
      else if (name === "catk" && v !== V.catKind) { V.catKind = v; renderSub(); }
      return;
    }
    const chip = e.target.closest("[data-chip]");
    if (chip) { V.filt = V.filt === chip.dataset.chip ? null : chip.dataset.chip; renderChips(); renderList(); return; }
    const rec = e.target.closest("[data-rec]");
    if (rec) { const x = recList[Number(rec.dataset.rec)]; if (x) addEntry({ d: entryDate(), v: x.v, c: x.c, n: x.n }); return; }
    const sc = e.target.closest("[data-scat]");
    if (sc) { S.cat = sc.dataset.scat; renderSheet(); return; }
    const fc = e.target.closest("[data-fcat]");
    if (fc) { S.cat = fc.dataset.fcat; renderForm(); $("[data-famt]").focus(); return; }
    const k = e.target.closest("[data-k]");
    if (k) { key(k.dataset.k); return; }
    const cd = e.target.closest("[data-cd]");
    if (cd) {
      C.sel = cd.dataset.cd; drawCal(0);
      const cb = C.onPick;
      setTimeout(closeCal, 160);
      cb?.(cd.dataset.cd);
      return;
    }
    const ir = e.target.closest(".mn-irow");
    if (ir) { edit(SP.get(ir.dataset.id)); return; }
    const br = e.target.closest(".mn-brow");
    if (br) { toggleBk(br.parentNode); return; }
    const fr = e.target.closest("[data-fres] .mn-row");
    if (fr) { edit(SP.get(fr.dataset.id)); return; }
    const sub = e.target.closest("[data-sub]");
    if (sub) { openSub(sub.dataset.sub); return; }
    const bp = e.target.closest("[data-bp]");
    if (bp && !e.target.closest("input,button")) { V.budEdit = bp.dataset.bp; renderSub(); setTimeout(() => $("[data-bpv]")?.focus(), 30); return; }
    const bprm = e.target.closest("[data-bprm]");
    if (bprm) { SP.setBudgets(SP.budgets().filter((x) => x.from !== bprm.dataset.bprm)); V.budEdit = null; renderSub(); return; }
    const hd = e.target.closest("[data-hide]");
    if (hd) { SP.setCats(SP.cats().map((c) => (c.name === hd.dataset.hide ? { ...c, hidden: !c.hidden } : c))); renderSub(); return; }
    const cdel = e.target.closest("[data-cdel]");
    if (cdel) {
      const before = SP.cats();
      SP.setCats(before.filter((c) => c.name !== cdel.dataset.cdel));
      renderSub();
      snack("Deleted " + cdel.dataset.cdel, () => { SP.setCats(before); renderSub(); });
      return;
    }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const act = a.dataset.act, t = todayP();
    if (act === "add") startNew();
    else if (act === "drawer") openDrawer(true);
    else if (act === "dclose") closeDrawer();
    else if (act === "dfind" || act === "dset") {
      openDrawer(false);
      while (V.stack.length) pop();
      if (act === "dset") { renderSet(); push("set"); }
      else { $("[data-q]").value = ""; renderFind(); push("find"); setTimeout(() => $("[data-q]").focus(), 320); }
    }
    else if (act === "dcal") openCal(a, M.iso(V.cur.y, V.cur.m, V.cur.d), (d) => { V.cur = M.parts(d); buildRail(false); renderTitle(); renderBody(); });
    else if (act === "reset") { if (!quiet()) a.querySelector(".ic")?.animate([{ transform: "rotate(0)" }, { transform: "rotate(-360deg)" }], { duration: 520, easing: SPR }); goTo(V.items.findIndex((it) => M.samePeriod(it, t, V.mode))); }
    else if (act === "prev") goTo(V.sel - 1);
    else if (act === "next") goTo(V.sel + 1);
    else if (act === "set") { renderSet(); push("set"); }
    else if (act === "find") { $("[data-q]").value = ""; renderFind(); push("find"); setTimeout(() => $("[data-q]").focus(), 320); }
    else if (act === "back") pop();
    else if (act === "chart") openChart();
    else if (act === "cclose") closeChart();
    else if (act === "creset") { if (!quiet()) a.querySelector(".ic")?.animate([{ transform: "rotate(0)" }, { transform: "rotate(-360deg)" }], { duration: 520, easing: SPR }); V.cc = t; V.bk = new Set(); renderChart(true); }
    else if (act === "cprev") cshift(-1);
    else if (act === "cnext") cshift(1);
    else if (act === "sclose") closeSheet();
    else if (act === "sdel") { const x = S.edit; closeSheet(); setTimeout(() => x && removeEntry(x.id), 200); }
    else if (act === "sdate") openCal(a, S.d, (d) => { S.d = d; $("[data-sdl]").textContent = M.fmtDate(d); });
    else if (act === "fdate") openCal(a, S.d, (d) => { S.d = d; $("[data-fdl]").textContent = M.fmtDate(d); });
    else if (act === "fcancel") closeForm();
    else if (act === "fdel") { const x = S.edit; closeForm(); if (x) removeEntry(x.id); }
    else if (act === "calp" || act === "caln") { ({ y: C.y, m: C.m } = M.addMonths(C.y, C.m, act === "calp" ? -1 : 1)); drawCal(act === "calp" ? -1 : 1); }
    else if (act === "undo") { const fn = undoFn; undoFn = null; $(".mn-snack").classList.remove("on"); fn?.(); }
    else if (act === "nbo") { V.newBud = M.addMonths(t.y, t.m, 1); renderSub(); setTimeout(() => $("[data-nbv]")?.focus(), 30); }
    else if (act === "nbp" || act === "nbn") { V.newBud = M.addMonths(V.newBud.y, V.newBud.m, act === "nbp" ? -1 : 1); renderSub(); }
    else if (act === "nbs") {
      const v = M.toCents($("[data-nbv]").value);
      if (!(v > 0)) { $("[data-nbv]").focus(); return; }
      const from = M.ym(V.newBud.y, V.newBud.m);
      SP.setBudgets([...SP.budgets().filter((x) => x.from !== from), { from, v }]);
      V.newBud = null; renderSub(); snack("Budget saved", null);
    }
    else if (act === "addcat") addCat();
    else if (act === "exp" || act === "exn") { V.expM = M.addMonths(V.expM.y, V.expM.m, act === "exp" ? -1 : 1); renderSub(); }
    else if (act === "exgo" || act === "exall") {
      const which = act === "exgo" ? V.expM : null, md = M.toMarkdown(SP.entries(), SP.cats(), SP.budgets(), which, today());
      const pre = $("[data-mdp]");
      pre.hidden = false;
      pre.textContent = md.split("\n").slice(0, 18).join("\n") + (md.split("\n").length > 18 ? "\n…" : "");
      shareFile(which ? "spending-" + M.ym(which.y, which.m) + ".md" : "spending-all-" + today() + ".md", md);
    }
    else if (act === "impgo") {
      const r = M.fromText($("[data-imp]").value, SP.cats());
      if (r.added.length) SP.setCats([...SP.cats(), ...r.added]);
      const made = r.rows.length ? SP.addMany(r.rows) : [];
      $("[data-impr]").textContent = made.length + " imported" + (r.bad ? " · " + r.bad + " line" + (r.bad === 1 ? "" : "s") + " skipped" : "") + (r.added.length ? " · new categories: " + r.added.map((c) => c.name).join(", ") : "");
      if (made.length) { $("[data-imp]").value = ""; snack("Imported " + made.length + " records", () => SP.removeMany(made.map((x) => x.id))); }
    }
  });
  function addCat() {
    const inp = $("[data-newcat]"), n = inp?.value.trim();
    if (!n) return;
    if (SP.cats().some((c) => c.name.toLowerCase() === n.toLowerCase())) { snack(n + " is already there", null); return; }
    SP.setCats([...SP.cats(), { name: n, kind: V.catKind, hidden: false, role: "" }]);
    renderSub();
    snack("Added " + n, null);
  }
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("[data-bpv]")) {
      const v = M.toCents(t.value);
      if (v > 0) { SP.setBudgets(SP.budgets().map((x) => (x.from === V.budEdit ? { ...x, v } : x))); V.budEdit = null; renderSub(); snack("Budget saved", null); }
    } else if (t.matches("[data-rn]")) {
      const from = t.dataset.rn, to = t.value.trim();
      if (!to || SP.cats().some((c) => c.name.toLowerCase() === to.toLowerCase() && c.name !== from)) { t.value = from; return; }
      if (to !== from) { SP.renameCat(from, to); if (V.filt === from) V.filt = to; renderSub(); }
    }
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[data-newcat]")) { e.preventDefault(); addCat(); }
    if (e.key === "Enter" && e.target.matches("[data-nbv]")) { e.preventDefault(); root.querySelector('[data-act="nbs"]')?.click(); }
    if (e.key === "Enter" && e.target.matches("[data-bpv]")) { e.preventDefault(); e.target.blur(); }
    if (e.key === "Escape" && desk && !$("[data-form]").hidden) { e.preventDefault(); closeForm(); }
    else if (e.key === "Escape" && desk && $("[data-cal]").classList.contains("on")) { e.preventDefault(); closeCal(); }
    else if (e.key === "Escape" && desk && V.stack.length) { e.preventDefault(); pop(); }
    else if (e.key === "Escape" && desk && V.drawer) { e.preventDefault(); closeDrawer(); }
  });
  root.addEventListener("input", (e) => { if (e.target.matches("[data-q]")) renderFind(); if (e.target.matches("[data-famt]")) $("[data-ferr]").textContent = ""; });
  root.addEventListener("submit", (e) => { e.preventDefault(); saveForm(); });

  // 窗口宽度变了：时间轴两边的留白、选中那格居中、各个分段开关的滑块都按新的宽度重算
  let lastW = 0;
  const relayout = () => {
    if (!shown || !root.isConnected) return;
    const w = root.clientWidth;
    if (w === lastW) return;
    lastW = w;
    if (desk) root.classList.toggle("narrow", w < 900);
    rail.style.padding = "0 " + Math.max(0, ((rw.clientWidth || 272) - V.cw) / 2) + "px";
    rw.scrollLeft = V.sel * V.cw;
    seg("mode", V.mode);
    seg("cmode", V.cmode);
    listEdges();
    if (V.sub === "cats") seg("catk", V.catKind);
    if (CS) renderChart(false);
  };
  if (typeof ResizeObserver === "function") new ResizeObserver(relayout).observe(root);
  if (desk) {
    onSwipe(root, ".mn-fig, .mn-drawer, .mn-handle, .mn-dscrim", (dir) => (dir === "left" ? openDrawer(true) : closeDrawer()), ".mn-rw, .mn-hs, .mn-cards, input, textarea");
    // 图表往下滚了：顶栏下沿那条渐进模糊才出来（没滚的时候没有东西要糊）
    const fb = $(".mn-fig .mn-cbody");
    fb.addEventListener("scroll", () => $(".mn-fig").classList.toggle("scrolled", fb.scrollTop > 2), { passive: true });
  }

  // ---------- 对外 ----------
  let shown = false;
  function refresh() {
    if (!shown) return;
    repaintBars();
    renderTitle();
    renderBody();
    if (desk || V.chartOpen) renderChart(false);
    paintHandle();
    if (V.stack.includes("set")) renderSet();
    if (V.stack[V.stack.length - 1] === "sub" && V.sub !== "import") renderSub();
    if (V.stack.includes("find")) renderFind();
    if (desk) { const [st, bad] = statusText(); const el = $("[data-status]"); el.textContent = bad ? st : SP.pendingCount() ? "Syncing…" : ""; el.classList.toggle("bad", bad); }
  }
  // 打开：手机上面板长开以后（柱子从选中那格往两边一根根长出来），电脑上切到 Spending 页
  // 电脑上每次进 Spending 页：只有图表，抽屉收着
  function show() {
    shown = true;
    if (desk) { V.drawer = true; closeDrawer(); }
    requestAnimationFrame(() => {
      lastW = root.clientWidth;
      if (desk) root.classList.toggle("narrow", lastW < 900);
      seg("mode", V.mode);
      seg("cmode", V.cmode);
      buildRail(!desk);
      if (desk) renderChart(true);
    });
    renderTitle();
    renderBody();
    paintHandle();
    if (desk) { const [st, bad] = statusText(); const el = $("[data-status]"); el.textContent = bad ? st : ""; el.classList.toggle("bad", bad); }
  }
  function hide() {
    shown = false;
    closeSheet(); closeChart(); closeCal(); closeDrawer();
    while (V.stack.length) pop();
  }
  // 手机：收起前回到主页最上面；下次打开从今天看起（隔了一会儿才再打开的话）
  function reset() {
    V.cur = todayP();
    V.filt = null;
    setCol(false);
    list.scrollTop = 0;
  }
  return { el: root, show, hide, refresh, reset, tookChange, startNew, closeForm, formOpen: () => desk && !$("[data-form]").hidden, sheetOpen: () => $(".mn-sheet")?.classList.contains("on") };
}
