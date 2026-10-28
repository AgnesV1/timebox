// 记账的界面（手机）：从今天页顶上拉下来的那块面板（外壳和下拉手势在 island.js）。电脑上的 Spending 页是网页的排法，在 js/ui/spending.js，
// 它也用这里导出的几样：金额的小数缩小（cents）、滚着变的数字（roll）、短金额（kfmt）、图表（chartView）。
// 主页：‹ 期间 ›（标题在两个箭头正中，下面一行支出 / 收入）→ Year / Month / Day → 能拖的柱状时间轴（停在中间那格就是选中的；超了橙、正常蓝、有收入底下一个青绿点）→ 类别小标签（点了筛下面的流水）→
// 流水（点一笔改、往左滑删）→ 推荐 → Add a new transaction。往上拉流水时柱子压成小点。
// 图表：梯形图（House 是底座、预算是浅天蓝底、实线是花的、虚线是照现在的速度）、五个小方块、两个 Breakdown（点开看那一类的每一笔），
// 自己一套 Month / Year 和前后翻；从底下升上来的一页，先停在半高。
// 设定：Budget（从某月起每月多少）/ Categories（加、改名、藏、没用过的能删）/ Export（.md）/ Import a month / Currency（总数换成哪种看、汇率）。
// 币种：每一笔是记的那种钱（流水里照原样写，旁边小字是换算过的）；总数、图表、类别占比、预算都换成「看的那种」（这台设备自己定，默认加币）。

import * as SP from "../spend.js";
import * as M from "../money.js";
import * as store from "../store.js";
import { esc, icon } from "../dom.js";

// 小东西（按钮、开关、小签）用的弹簧：只冲过头 0.5%；面板、抽屉、图表页这种大块不冲过头（ENTER / EXIT，见 css/money.css 开头）
const SPR = "linear(0, .029, .099, .192, .296, .399, .498, .588, .668, .737, .795, .844, .883, .915, .939, .959, .973, .984, .992, .997, 1.001, 1.003, 1.004, 1.005, 1.005, 1.005, 1.004, 1.004, 1)";
// 进场：快出来、慢慢停稳（不冲过头）；出场：干脆一点，越走越快
const ENTER = "cubic-bezier(.16, 1, .3, 1)", EXIT = "cubic-bezier(.4, 0, 1, 1)";
const quiet = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const today = () => store.today();
const todayP = () => M.parts(today());
const CW = { day: 30, month: 40, year: 76 };

// ---------- 币种 ----------
// 汇率在 Settings 的 spend-fx（跟着表格同步）：{ rates: { cny: { v: 4.75, at: "2026-10-20", ecb: true } } }，没填的用 money.js 的 ROUGH。
// 看哪种、记一笔用哪种只管这台设备（spend.js 的 show / inCur）
export const fx = () => store.setting("spend-fx") || {};
const fxKey = () => JSON.stringify(fx().rates || {});
export const RATES = () => M.ratesOf(fx());
M.setShow(SP.show());
export function setShowCur(k) { M.setShow(k); SP.setShow(k); }
// 一种钱的汇率：自己填的（at = 那天）；欧洲央行的（ecb）
export function setRate(k, v) {
  const cur = fx();
  store.setSetting("spend-fx", { ...cur, rates: { ...(cur.rates || {}), [k]: { v: Number(v), at: store.today() } } });
}
// 拉欧洲央行当天的汇率（Frankfurter，免费、不用钥匙、只发「要哪几种」）。only = 只补还没填过的（选了一种新的钱时）
export async function fetchRates(keys = M.CURS.map((c) => c.k), only = false) {
  const want = keys.filter((k) => k !== "cad" && (!only || !M.rateSet(fx(), k)));
  if (!want.length) return "";
  const res = await fetch("https://api.frankfurter.dev/v1/latest?base=CAD&symbols=" + want.map((k) => k.toUpperCase()).join(","));
  if (!res.ok) throw new Error("rates " + res.status);
  const j = await res.json(), cur = fx(), rates = { ...(cur.rates || {}) };
  for (const k of want) { const v = Number(j.rates?.[k.toUpperCase()]); if (v > 0 && !(only && M.rateSet(cur, k))) rates[k] = { v, at: j.date, ecb: true }; }
  store.setSetting("spend-fx", { ...cur, rates });
  return j.date;
}
// 汇率从别的设备同步过来了：main.js 每次重画时问一下，变了就刷新记账的两块
let fxSeen = null;
export function fxChanged() { const k = fxKey(); if (fxSeen === null) { fxSeen = k; return false; } if (k === fxSeen) return false; fxSeen = k; return true; }
// 一种钱怎么写：「RMB ¥」；汇率的来历：「ECB · Oct 20」/「you · Oct 21」/「rough」
export const curLabel = (k) => M.curInfo(k).code;
export function rateNote(k) {
  const r = fx().rates?.[k];
  if (k === "cad") return "";
  if (!M.rateSet(fx(), k)) return "rough";
  const at = r?.at ? M.MON[M.parts(r.at).m - 1] + " " + M.parts(r.at).d : "";
  return (r?.ecb ? "ECB" : "you") + (at ? " · " + at : "");
}
// 换成看的那种钱的整份（总数、图表、类别占比都拿它算）和它的加总：按数据版本 + 看哪种 + 汇率缓存
let shCache = null, shKey = "", ixCache = null, ixKey = "";
export function shownEntries() {
  const k = SP.ver() + "|" + SP.show() + "|" + fxKey();
  if (k !== shKey || !shCache) { M.setShow(SP.show()); shCache = M.inCur(SP.entries(), SP.show(), RATES()); shKey = k; }
  return shCache;
}
export const IX = () => { const list = shownEntries(); if (ixKey !== shKey || !ixCache) { ixCache = M.index(list, SP.cats()); ixKey = shKey; } return ixCache; };
// 预算是按加币定的：换成看的那种
export const budgetsShown = () => M.budgetsIn(SP.budgets(), SP.show(), RATES());
// 当月整个预算还剩多少（她 10-24 要的）：预算 − 这个月算进预算的花销（House 两边都有，Bonds 不算；提前记的、日期还没到的也算），整数块钱。
// 手机今天页 Spend 左边用它（记账面板标题下面那一截 2026-10-27 删了）；没定预算 = null。正好 0 是灰的，超了（负的）才标橙
export function monthLeft() {
  const now = todayP(), B = M.budgetAt(budgetsShown(), now.y, now.m);
  if (!B) return null;
  const left = B - M.counted(M.sumOf(IX(), { y: now.y, m: now.m }, "month"));
  return { text: (left < 0 ? "−" : "") + M.curInfo(M.showing()).sym + Math.round(Math.abs(left) / 100).toLocaleString("en-US"), over: left < 0 };
}
// 记一笔、同步回来以后：页面上所有「… left」（今天页 Spend 左边那个）换成新的数，不用整页重画
export function paintLefts() {
  const x = monthLeft();
  for (const el of document.querySelectorAll("[data-mleft]")) {
    el.hidden = !x;
    if (!x) continue;
    el.firstChild.textContent = x.text;
    el.classList.toggle("over", x.over);
  }
}
// 一笔的金额：照记的那种钱写；和看的那种不一样时，后面小字是换算过的
export const amtOf = (e) => M.signed(e.v, M.curOf(e));
export const convOf = (e) => (M.curOf(e) === SP.show() ? "" : "≈ " + M.signed(M.convert(e.v, M.curOf(e), SP.show(), RATES())));
const visible = (kind) => SP.cats().filter((c) => c.kind === kind && !c.hidden).map((c) => c.name);
const isIncomeCat = (name) => M.kindOf(SP.cats(), name) === "in";

// 金额：小数点后那两位小一号、淡一点（「$1,234」后面跟着小的「.56」），大数字好排
export const cents = (s) => { const i = s.lastIndexOf("."); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<span class="mn-dec">' + esc(s.slice(i)) + "</span>"; };

// 滚着变的数字：每一位一列 0–9，从旧的那位滚到新的。small = 小数那几位小一号（16px 以上的大数字才这样，小字本来就小）
const DIG = [..."0123456789"].map((d) => "<span>" + d + "</span>").join("");
export function roll(el, s, small = false) {
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
// 放不下的大金额写短：「$1.2k」「−$12k」
export const kfmt = (c) => { const a = Math.abs(c) / 100, sgn = c < 0 ? "−" : "", sym = M.curInfo(M.showing()).sym; return sgn + sym + (a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1) + "k" : Math.round(a)); };
const pie = (p, cls = "") => '<svg class="mn-pie ' + cls + '" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="currentColor" fill-opacity=".2"/><circle cx="7" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="6" stroke-dasharray="' + (Math.max(0, Math.min(1, p)) * 18.85).toFixed(2) + ' 18.85" transform="rotate(-90 7 7)"/></svg>';
const btn = (act, ic, label, cls = "") => '<button type="button" class="mn-ic ' + cls + '" data-act="' + act + '" aria-label="' + label + '" title="' + label + '">' + icon(ic) + "</button>";
// 回到现在：标题后面一颗钴蓝小点，不在当前那一期才出来（和电脑上标题后的小圆点一样）；挂在标题右边外面，标题照样居中
const nowDot = (act, label) => '<button type="button" class="mn-now" data-act="' + act + '" aria-label="' + label + '" title="' + label + '"><i></i></button>';
const back = '<button type="button" class="mn-ic" data-act="back" aria-label="Back">' + icon("left") + "</button>";
const chevR = '<svg class="ic mn-cr" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
export const periodTitle = (p, mode) => (mode === "day" ? M.fmtDate(M.iso(p.y, p.m, p.d)) : mode === "month" ? M.MONTH[p.m - 1] + " " + p.y : String(p.y));

// 图表：梯形图（House 是底座、预算是浅天蓝底、实线是花的、虚线是照现在的速度）+ 鼠标 / 手指移上去的读数（竖线、圆点，上面哪天、下面到那天一共多少）。
// 圆点平时是钴蓝，到那天一共花的超了预算才是橙的（c.over；她 10-22 说没超预算就别标橙色）。
// 手机的图表页和电脑的 Spending 页共用。draw 按给的宽高画（viewBox = 像素，字不跟着缩放），返回这一期的数（monthChart / yearChart）。
// house: false = 只看 House（底座类别）以外的花销和预算。点一下（按下抬起没挪、不到半秒；拖着是看读数）交给 onTap：
//   完整的时候点在 House 那块上面 = "rest"（切到只看 House 以外），点在 House 那块里 = "house"（不切）；只看的时候点哪儿都是 "any"（回到完整的）
export function chartView(svg, { onTap = null } = {}) {
  let CS = null, ct = 0, ci = 0, craf = 0, tap = null;
  function draw({ mode, p, w, h, animate = false, delay = 0, house = true }) {
    const W = w, H = h;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    const ix = IX(), bud = budgetsShown();
    const c = mode === "month" ? M.monthChart(ix, bud, p.y, p.m, today(), { house }) : M.yearChart(ix, bud, p.y, today(), { house });
    const X0 = 4, X1 = W - 4, Y0 = H - 22, Y1 = 26;
    const X = (i) => X0 + (i - 1) / Math.max(1, c.n - 1) * (X1 - X0), Y = (v) => Y0 - v / c.top * (Y0 - Y1);
    const pts = Array.from({ length: c.n }, (_, i) => ({ x: X(i + 1), y: Y(c.val(i + 1)) }));
    const poly = (arr) => "M" + arr.map((v, i) => X(i + 1).toFixed(1) + " " + Y(v).toFixed(1)).join(" L") + " L" + X1 + " " + Y0 + " L" + X0 + " " + Y0 + "Z";
    let h0;
    if (mode === "month") {
      h0 = (c.B ? '<path class="ar" d="M' + X0 + " " + Y(c.pace(1)) + " L" + X1 + " " + Y(c.B) + " L" + X1 + " " + Y0 + " L" + X0 + " " + Y0 + 'Z" fill="var(--mn-bud)"/>' : "") +
        (c.base ? '<path class="ar" d="M' + X0 + " " + Y(c.base) + " H" + X1 + " V" + Y0 + " H" + X0 + 'Z" fill="var(--mn-base)"/>' : "");
    } else {
      h0 = (c.budgetLine[c.n] ? '<path class="ar" d="' + poly(c.budgetLine.slice(1)) + '" fill="var(--mn-bud)"/>' : "") + (c.baseLine[c.n] ? '<path class="ar" d="' + poly(c.baseLine.slice(1)) + '" fill="var(--mn-base)"/>' : "");
    }
    h0 += [c.top, c.top / 2].map((v) => '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#fff" stroke-opacity=".07"/><text class="mn-ax" x="6" y="' + (Y(v) + 12) + '">' + esc(M.curInfo(M.showing()).sym) + Math.round(v / 100).toLocaleString("en-US") + "</text>").join("");
    if (c.last) h0 += '<path class="ln" pathLength="1" d="' + pts.slice(0, c.last).map((q, i) => (i ? "L" : "M") + q.x.toFixed(1) + " " + q.y.toFixed(1)).join(" ") + '" fill="none" stroke="#F2EEE6" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>';
    if (c.isCur && c.last && c.last < c.n) h0 += '<path class="fc" d="M' + pts[c.last - 1].x + " " + pts[c.last - 1].y + " L" + pts[c.n - 1].x + " " + pts[c.n - 1].y + '" fill="none" stroke="#F2EEE6" stroke-opacity=".5" stroke-width="1.4" stroke-dasharray="4 4"/>';
    const xl = mode === "month" ? [[1, M.MON[p.m - 1] + " 1"], [Math.ceil(c.n / 2), M.MON[p.m - 1] + " " + Math.ceil(c.n / 2)], [c.n, M.MON[p.m - 1] + " " + c.n]] : [[1, "Jan"], [M.dayOfYear(p.y, 7, 1), "Jul"], [c.n, "Dec"]];
    h0 += '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + Y0 + '" y2="' + Y0 + '" stroke="#fff" stroke-opacity=".14"/>' + xl.map(([i, txt], k) => '<text x="' + X(i) + '" y="' + (H - 5) + '" text-anchor="' + (k === 0 ? "start" : k === 2 ? "end" : "middle") + '">' + txt + "</text>").join("") +
      '<line data-csl y1="' + (Y1 - 14) + '" y2="' + Y0 + '" stroke="#fff" stroke-opacity=".35" style="pointer-events:none"/><circle data-csp r="4.5" fill="var(--mn-blue)" stroke="#000" stroke-width="1.5" style="pointer-events:none"/>' +
      // 读数在竖线右边：上面是哪天，下面是到那天一共多少（靠右边放不下就挪到左边）
      '<g data-lab style="pointer-events:none"><text data-lt class="mn-ax" y="' + (Y1 - 4) + '" style="font-size:11px;fill:#8C8CA0"></text><text data-lv class="mn-ax" y="' + (Y1 + 12) + '" style="font-size:13px;fill:#F2EEE6"></text></g>';
    svg.innerHTML = h0;
    if (animate && !quiet()) {
      svg.querySelectorAll(".ar").forEach((a) => a.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, delay: delay * 1000, fill: "backwards" }));
      svg.querySelectorAll(".ln").forEach((q) => { q.style.strokeDasharray = 1; q.style.strokeDashoffset = 1; q.getBoundingClientRect(); q.style.transition = "stroke-dashoffset .9s " + ENTER + " " + (delay + 0.1) + "s"; q.style.strokeDashoffset = 0; });
      svg.querySelectorAll(".fc").forEach((q) => q.animate([{ opacity: 0 }, { opacity: 0, offset: 0.65 }, { opacity: 1 }], { duration: 1000 + delay * 1000 }));
      svg.querySelector("[data-lab]").animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: 900 + delay * 1000 });
    }
    // House 那块的上沿（这一天）：点在它上面算点到「House 以外那一块」
    const baseY = (i) => Y(mode === "month" ? c.base : c.baseLine[i + 1] || 0), hasBase = mode === "month" ? c.base > 0 : c.baseLine[c.n] > 0;
    CS = { c, pts, mode, p, W, H, house, hasBase, baseY, dateOf: (i) => (mode === "month" ? M.MON[p.m - 1] + " " + (i + 1) : (() => { const q = M.parts(c.dateOf(i + 1)); return M.MON[q.m - 1] + " " + q.d; })()) };
    svg.classList.remove("mn-tap");
    ct = ci = Math.min(c.n - 1, c.home);
    cread(ci);
    svg.classList.add("mn-st");
    return c;
  }
  function cplace(f) {
    if (!CS) return;
    const P = CS.pts, a = Math.floor(f), b = Math.min(P.length - 1, a + 1), t = f - a, x = P[a].x + (P[b].x - P[a].x) * t, y = P[a].y + (P[b].y - P[a].y) * t;
    const sl = svg.querySelector("[data-csl]"), sp = svg.querySelector("[data-csp]");
    if (!sl) return;
    sl.setAttribute("x1", x); sl.setAttribute("x2", x); sp.setAttribute("cx", x); sp.setAttribute("cy", y);
    const lt = svg.querySelector("[data-lt]"), lv = svg.querySelector("[data-lv]"), w = Math.max(lt.getComputedTextLength?.() || 60, lv.getComputedTextLength?.() || 60);
    const right = x + 8 + w <= CS.W - 2, lx = right ? x + 8 : x - 8;
    for (const el of [lt, lv]) { el.setAttribute("x", lx.toFixed(1)); el.setAttribute("text-anchor", right ? "start" : "end"); }
  }
  function cread(i) {
    const lt = svg.querySelector("[data-lt]");
    if (!lt) return;
    lt.textContent = CS.dateOf(i) + (i + 1 > CS.c.last ? " · trend" : "");
    svg.querySelector("[data-lv]").textContent = M.money(CS.c.val(i + 1));
    svg.querySelector("[data-csp]").setAttribute("fill", CS.c.over(i + 1) ? "var(--mn-orange)" : "var(--mn-blue)");
    cplace(ci);
  }
  const ctick = () => { ci += (ct - ci) * 0.18; if (Math.abs(ct - ci) < 0.005) ci = ct; cplace(ci); craf = ci === ct ? 0 : requestAnimationFrame(ctick); };
  const caim = (i) => { if (i !== ct) { ct = i; cread(i); } if (!craf) craf = requestAnimationFrame(ctick); };
  const cnear = (e) => { const r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * CS.W, P = CS.pts; const k = Math.round((vx - P[0].x) / Math.max(1e-6, P[P.length - 1].x - P[0].x) * (P.length - 1)); return Math.max(0, Math.min(P.length - 1, k)); };
  // 点在哪：完整的时候分 House 上面 / House 里；只看 House 以外的时候哪儿都一样。没有 House 的这一期不切
  const regionAt = (e) => {
    if (!CS.house) return "any";
    const r = svg.getBoundingClientRect(), py = (e.clientY - r.top) / r.height * CS.H;
    return CS.hasBase && py < CS.baseY(cnear(e)) ? "rest" : "house";
  };
  svg.addEventListener("pointermove", (e) => {
    if (!CS) return;
    caim(cnear(e));
    if (onTap && e.pointerType === "mouse") svg.classList.toggle("mn-tap", regionAt(e) !== "house");   // 电脑上：点得动的地方手指形光标
  });
  svg.addEventListener("pointerdown", (e) => { tap = { x: e.clientX, y: e.clientY, t: performance.now() }; if (CS) caim(cnear(e)); });
  svg.addEventListener("pointerup", (e) => {
    const t = tap;
    tap = null;
    if (!t || !CS || !onTap || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 6 || performance.now() - t.t > 450) return;
    const where = regionAt(e);
    if (where !== "house") onTap(where);
  });
  svg.addEventListener("pointerleave", () => { svg.classList.remove("mn-tap"); if (CS) caim(Math.min(CS.c.n - 1, CS.c.home)); });
  return { draw };
}

export function createView() {
  const root = document.createElement("div");
  root.className = "mn mn-phone";
  const W = 244, H = 172;
  const blur = '<div class="mn-pblur" aria-hidden="true"><i></i><i></i><i></i></div>';   // 渐进模糊：三层 1 / 3 / 8px，越靠边越糊

  const home = '<section class="mn-pg mn-home" data-pg="home">' +
    '<div class="mn-hdr">' + btn("set", "settings", "Settings") + btn("chart", "chart", "Charts") + btn("find", "search", "Search") + "</div>" +
    // ‹ 期间 ›：标题在两个箭头正中间，下面一行是这一期的支出 / 收入
    '<div class="mn-thead">' + btn("prev", "left", "Earlier", "mn-sm") + '<div class="mn-tmid"><span class="mn-tw"><h2 class="mn-h1" data-title></h2>' + nowDot("reset", "Back to today") + "</span>" +
    // （以前支出前面还有一截灰的「当月预算还剩」，不管翻到哪一期都是当月的——她 2026-10-27 说不要，删了）
    '<div class="mn-num mn-13 mn-tsub"><span class="mn-rn" data-to></span><span style="display:inline-block;width:12px"></span><span class="mn-rn" data-ti style="color:var(--mn-green)"></span>' +
    '<button type="button" class="mn-curb" data-act="showcur" aria-label="Show totals in another currency" title="Show totals in"><span data-showc></span>' + icon("down") + "</button></div></div>" +
    btn("next", "right", "Later", "mn-sm") + "</div>" +
    '<div class="mn-seg" data-seg="mode" style="margin-top:14px"><i></i><button type="button" data-v="year">Year</button><button type="button" data-v="month">Month</button><button type="button" data-v="day">Day</button></div>' +
    '<div class="mn-tl"><span class="mn-hl"></span><div class="mn-rw"><div class="mn-rail"></div></div></div>' +
    '<div class="mn-hs mn-chips"></div>' +
    '<div class="mn-lw"><div class="mn-list mn-vs"></div>' + blur.replace("mn-pblur", "mn-pblur top") + blur.replace("mn-pblur", "mn-pblur bot") + "</div>" +
    // 底栏：左边推荐的几笔，右下角一个圆的「+」记一笔（她 10-22 要回来的；今天页的 Spend 也留着）
    '<div class="mn-foot"><div class="mn-frow"><div class="mn-recw" hidden><span class="mn-meta" style="flex:none">Recommended</span><div class="mn-hs mn-recs"></div></div>' +
    '<button type="button" class="mn-fab" data-act="add" aria-label="Add a transaction" title="Add a transaction">' + icon("plus") + "</button></div>" +
    '<div class="mn-grab" data-grab aria-label="Close"><span class="mn-grabber"></span></div></div></section>';
  const pages = '<section class="mn-pg off" data-pg="set"><div class="mn-hdr">' + back + '<span style="font-size:15px;font-weight:500">Settings</span><span style="width:32px"></span></div><div class="mn-vs" data-setb style="flex:1;margin-top:14px"></div></section>' +
    '<section class="mn-pg off" data-pg="sub"><div class="mn-hdr">' + back + '<span data-subt style="font-size:15px;font-weight:500"></span><span style="width:32px"></span></div><div class="mn-vs" data-subb style="flex:1;margin-top:14px"></div></section>' +
    '<section class="mn-pg off" data-pg="find"><div class="mn-hdr" style="gap:6px">' + back + '<input class="mn-tx" data-q placeholder="Search notes, categories, amounts" autocomplete="off" style="flex:1;padding:6px 0;border-bottom:1px solid var(--mn-line)"></div><div class="mn-vs" data-fres style="flex:1;margin-top:8px"></div></section>';
  // 图表：从底下升上来的那一页
  const cseg = '<div class="mn-seg" data-seg="cmode"><i></i><button type="button" data-v="year">Year</button><button type="button" data-v="month">Month</button></div>';
  const chartBody = '<div class="mn-cbody mn-vs"><svg class="mn-chart" data-chart viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Spending against the budget. Tap the part above House to see it on its own."></svg>' +
    '<p class="mn-cnote mn-meta" data-cnote hidden></p><div class="mn-hs mn-cards"></div><div class="mn-bks"><div data-xb></div><div data-ib></div></div></div>';
  const chartInner = '<div class="mn-thead">' + btn("cprev", "left", "Earlier", "mn-sm") + '<div class="mn-tmid"><span class="mn-tw"><h2 class="mn-h1" data-ctitle></h2>' + nowDot("creset", "Back to this month") + "</span></div>" + btn("cnext", "right", "Later", "mn-sm") + "</div>" + cseg.replace('class="mn-seg"', 'class="mn-seg" style="margin-top:14px"') + chartBody;
  const sheet = '<div class="mn-scrim" data-act="sclose"></div><section class="mn-sheet" aria-label="Transaction">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;height:30px"><span data-sht style="font-size:15px;font-weight:500"></span><div style="display:flex;align-items:center;gap:6px"><button type="button" class="mn-act warn" data-act="sdel" hidden>Delete</button>' + btn("sclose", "close", "Close", "mn-sm") + "</div></div>" +
    '<div class="mn-seg" data-seg="skind" style="margin-top:8px"><i></i><button type="button" data-v="out">Expense</button><button type="button" data-v="in">Income</button></div>' +
    '<div class="mn-cats" data-scats></div>' +
    '<div style="margin-top:8px"><div class="mn-fld"><span class="mn-meta mn-13">Date</span><button type="button" class="mn-plain" data-act="sdate" style="display:flex;align-items:center;gap:6px"><span class="mn-num mn-13" data-sdl></span>' + icon("calendar") + "</button></div>" +
    '<div class="mn-fld"><span class="mn-meta mn-13">Note</span><input class="mn-tx" data-snote placeholder="Add a note" autocomplete="off" style="flex:1;text-align:right"></div></div>' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:6px;height:42px"><div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px"><button type="button" class="mn-curb" data-act="scur" aria-label="Currency of this record" title="Currency"><span data-scur></span>' + icon("down") + '</button><span class="mn-num mn-meta" data-seq></span></div><div class="mn-num mn-amt" data-samt></div></div>' +
    '<div class="mn-pad" data-pad>' + ["1", "2", "3", "⌫", "4", "5", "6", "+", "7", "8", "9", "Add", ".", "0", "00"].map((k) => '<button type="button" class="mn-k' + (k === "Add" ? " add" : k === "⌫" || k === "+" ? " op" : "") + '" data-k="' + k + '">' + k + "</button>").join("") + "</div></section>";
  const cal = '<div class="mn-cal" data-cal><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' + btn("calp", "left", "Earlier month", "mn-sm") + '<span data-calt style="font-size:13px;font-weight:500"></span>' + btn("caln", "right", "Later month", "mn-sm") + '</div><div class="mn-cg wd mn-meta"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div><div class="mn-cg" data-calg></div></div>';
  const snackHTML = '<div class="mn-snack" role="status" aria-live="polite"><span data-snt></span><button type="button" class="mn-act" data-act="undo">Undo</button></div>';
  const curMenu = '<div class="mn-cal mn-curm" data-curm role="listbox" aria-label="Currency"></div>';
  // 一块幕布（mn-curtain）：面板（mn-inner）屏幕约 94% 高，下沿是一道浅弧的下摆（mn-hem）；底下露出来的那一小条是 mn-veil（压暗的今天页，点了收起，见 island.js）。
  // 记一笔的面板、日历盖满整屏（数字键盘贴着屏幕底）
  root.innerHTML = '<div class="mn-veil"></div><div class="mn-curtain"><div class="mn-inner">' + home + pages + '<div class="mn-cdim" data-act="cclose"></div><section class="mn-csheet" aria-label="Charts"><div class="mn-cgrab" data-cgrab><span class="mn-grabber"></span><button type="button" class="mn-plain mn-done" data-act="cclose">Done</button></div>' + chartInner + "</section>" + snackHTML + '</div><div class="mn-hem" aria-hidden="true"><i></i></div></div>' + sheet + cal + curMenu;

  const $ = (s) => root.querySelector(s);
  const homeEl = $('[data-pg="home"]'), rw = $(".mn-rw"), rail = $(".mn-rail"), hl = $(".mn-hl"), tl = $(".mn-tl"), list = $(".mn-list");
  const V = { mode: "month", cur: todayP(), filt: null, items: [], cw: 40, sel: 0, collapsed: false, stack: [], cmode: "month", cc: todayP(), bk: new Set(), fresh: null, chartOpen: false, sub: "", catKind: "out", budEdit: null, newBud: null, expM: null, nohouse: false };

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
    // 提前记的（日期还没到的那几期）也照常画（她 10-22 说的）；没花钱的是一道短横线。橙色 = 超了预算（M.isOver：日 = 那个月到这天为止超了）
    const g = M.sumOf(IX(), it, V.mode);
    return { h: !g.out ? 4 : 6 + Math.min(1, g.out / cap) * 34, cls: !g.out ? "" : M.isOver(IX(), budgetsShown(), it, V.mode, today()) ? "over" : "ok", inc: g.inc > 0 };
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
  // 换了一期（点箭头、拖时间轴）：标题顺着方向滑一下；换 Year / Month / Day 不滑
  let shownAt = null;
  function renderTitle() {
    const h = $("[data-title]"), at = { mode: V.mode, k: (V.cur.y || 0) * 1e4 + (V.cur.m || 0) * 100 + (V.cur.d || 0) };
    h.textContent = periodTitle(V.cur, V.mode);
    if (shownAt && shownAt.mode === at.mode && shownAt.k !== at.k && !quiet()) h.animate([{ transform: "translateX(" + (at.k > shownAt.k ? 10 : -10) + "px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 280, easing: ENTER });
    shownAt = at;
    $("[data-showc]").textContent = curLabel(SP.show());
    $('[data-act="reset"]').classList.toggle("on", !M.samePeriod(V.cur, todayP(), V.mode));
    const g = M.sumOf(IX(), V.cur, V.mode);
    roll($("[data-to]"), "−" + M.money(g.out));
    roll($("[data-ti]"), "+" + M.money(g.inc));
    fitSub();
  }
  // 标题下面那一行（支出 · 收入 · 币种）放不下：整行字缩小一点（最小 10px），不切掉数字
  function fitSub() {
    const sub = $(".mn-tsub"), room = sub.parentElement.clientWidth;
    sub.style.fontSize = "";
    if (!room) return;
    const need = [...sub.children].reduce((w, el) => w + (el.hidden ? 0 : el.getBoundingClientRect().width), 0) + 4;
    if (need > room) sub.style.fontSize = Math.max(10, 13 * room / need).toFixed(1) + "px";
  }
  function inView(e) { return M.inPeriod(e, V.cur, V.mode); }
  function renderChips() {
    const out = new Map(), inc = new Map();
    let to = 0, ti = 0;
    for (const e of shownEntries()) {
      if (!inView(e)) continue;
      if (e.v < 0) { out.set(e.c, (out.get(e.c) || 0) - e.v); to -= e.v; } else { inc.set(e.c, (inc.get(e.c) || 0) + e.v); ti += e.v; }
    }
    if (V.filt && !out.has(V.filt) && !inc.has(V.filt)) V.filt = null;
    const chip = (c, p, isIn) => '<button type="button" class="mn-chip' + (isIn ? " mn-inc" : "") + (V.filt === c ? " on" : "") + '" data-chip="' + esc(c) + '"><span>' + esc(c) + '</span><span class="mn-num mn-pct">' + (p * 100).toFixed(1) + "%</span>" + pie(p) + "</button>";
    $(".mn-chips").innerHTML = [...out].sort((a, b) => b[1] - a[1]).map(([c, v]) => chip(c, v / (to || 1), false)).join("") + [...inc].sort((a, b) => b[1] - a[1]).map(([c, v]) => chip(c, v / (ti || 1), true)).join("");
  }
  const rowHTML = (e) => '<div class="mn-rw2"><div class="mn-del">Delete</div><div class="mn-row' + (e.id === V.fresh ? " mn-new" : "") + '" data-id="' + esc(e.id) + '"><div style="min-width:0"><div class="mn-r1">' + esc(e.c) + (e.n ? '<span class="mn-nt">' + esc(e.n) + "</span>" : "") + '</div><div class="mn-meta" style="margin-top:3px">' + M.fmtDate(e.d) + (e.d > today() ? ' <span class="mn-up" title="Already counted">upcoming</span>' : "") + '</div></div><span class="mn-num mn-am' + (e.v > 0 ? " inc" : "") + '">' + amtOf(e) + (convOf(e) ? "<small>" + convOf(e) + "</small>" : "") + "</span></div></div>";
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
    $(".mn-recs").innerHTML = recList.map((x, i) => '<button type="button" class="mn-chip" data-rec="' + i + '">' + esc(x.c) + ' <span class="mn-num mn-pct">' + M.money(x.v, x.cur) + "</span></button>").join("");
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
  // 流水滚得多快（每毫秒几像素，往下滚是正的）：发给 island.js，帷幕的下摆跟着摆一下
  let scTop = 0, scAt = 0;
  list.addEventListener("scroll", () => {
    const t = performance.now(), v = (list.scrollTop - scTop) / Math.max(8, t - scAt);
    scTop = list.scrollTop; scAt = t;
    root.dispatchEvent(new CustomEvent("mn-scroll", { detail: v }));
  }, { passive: true });
  list.addEventListener("wheel", (e) => { if (e.deltaY > 0) setCol(true); else if (list.scrollTop <= 0) setCol(false); }, { passive: true });

  // ---------- 记一笔 / 改 / 删 ----------
  function addEntry(x) {
    V.fresh = SP.newId();
    changed = true;
    const e = SP.add({ ...x, id: V.fresh });
    snack("Added " + e.c + " " + M.money(e.v, M.curOf(e)), () => SP.remove(e.id));
    root.dispatchEvent(new CustomEvent("mn-added", { detail: e }));   // 今天页点出来的那张：提示条在今天页上（面板里的看不见）
    return e;
  }
  function removeEntry(id) {
    const e = SP.remove(id);
    if (!e) return;
    changed = true;
    snack("Deleted " + e.c + " " + M.money(e.v, M.curOf(e)), () => { V.fresh = e.id; SP.restore(e); });
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
  const S = { edit: null, kind: "out", cat: "", d: today(), ex: "", cur: "cad" };
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
    $("[data-samt]").innerHTML = '<span class="cur">' + (S.kind === "out" ? "−" : "+") + esc(M.curInfo(S.cur).sym) + "</span>" + (S.ex ? typed : '<span class="zero">0</span>');
    $("[data-scur]").textContent = curLabel(S.cur);
    const eq = $("[data-seq]");
    eq.style.color = "";
    eq.textContent = S.ex.includes("+") && s > 0 ? "= " + s.toFixed(2) : "";
  }
  function openSheet(e) {
    S.edit = e || null;
    if (e) Object.assign(S, { kind: e.v < 0 ? "out" : "in", cat: e.c, d: e.d, ex: (Math.abs(e.v) / 100).toFixed(2).replace(/\.00$/, ""), cur: M.curOf(e) });
    else Object.assign(S, { kind: "out", cat: "Food", d: entryDate(), ex: "", cur: SP.inCur() });
    $("[data-snote]").value = e ? e.n : "";
    $("[data-sht]").textContent = e ? "Edit transaction" : "New transaction";
    $('[data-act="sdel"]').hidden = !e;
    $('[data-k="Add"]').textContent = e ? "Save" : "Add";
    closeCal();
    $(".mn-scrim").classList.add("on");
    $(".mn-sheet").classList.add("on");
    requestAnimationFrame(() => renderSheet());
  }
  // 收起来以后告诉外面一声（今天页点 Spend 出来的那张，island.js 靠它把整块藏回去）
  function closeSheet() { closeCal(); closeCurMenu(); $(".mn-scrim").classList.remove("on"); $(".mn-sheet").classList.remove("on"); $("[data-snote]").blur(); root.dispatchEvent(new CustomEvent("mn-sheet", { detail: { open: false } })); }
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
      if (e) { V.fresh = e.id; changed = true; SP.update(e.id, { d: S.d, v, c: S.cat, n, cur: S.cur }); snack("Saved", null); }
      else addEntry({ d: S.d, v, c: S.cat, n, cur: S.cur });
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

  const edit = (e) => { if (e) openSheet(e); };
  const startNew = () => openSheet(null);

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

  // 币种的小菜单：从按钮那里弹出来（和月历一样的玻璃）；每种钱后面是 1 加币合多少、哪来的汇率
  let curPick = null;
  function openCurMenu(anchor, sel, onPick) {
    const m = $("[data-curm]");
    if (m.classList.contains("on")) { closeCurMenu(); return; }
    closeCal();
    curPick = onPick;
    const R = RATES();
    m.innerHTML = M.CURS.map((c) => '<button type="button" class="mn-curi' + (c.k === sel ? " sel" : "") + '" role="option" aria-selected="' + (c.k === sel) + '" data-curk="' + c.k + '"><b>' + esc(c.code) + '</b><span class="mn-num">' + esc(c.sym) + "</span>" +
      '<span class="mn-meta mn-num">' + (c.k === "cad" ? "" : "1 CAD = " + R[c.k] + (rateNote(c.k) === "rough" ? " · rough" : "")) + "</span>" + (c.k === sel ? '<i aria-hidden="true">✓</i>' : "") + "</button>").join("");
    const a = anchor.getBoundingClientRect(), r = root.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.width - 268, a.left - r.left)) + "px";
    m.style.top = Math.max(8, Math.min(a.bottom - r.top + 6, r.height - m.offsetHeight - 8)) + "px";
    m.classList.add("on");
  }
  function closeCurMenu() { $("[data-curm]")?.classList.remove("on"); curPick = null; }
  // 选了一种还没填过汇率的钱：在后台拉一下欧洲央行当天的（没网就先用粗略的那个）
  const wantRate = (k) => { if (!M.rateSet(fx(), k)) fetchRates([k], true).catch(() => {}); };

  // ---------- 图表 ----------
  // 图表：点 House 上面那块 = 只看 House 以外；只看的时候点哪儿都回来（每次打开图表页都是完整的，见 openChart）
  const chart = chartView($("[data-chart]"), { onTap: (where) => { V.nohouse = where === "rest"; renderChart(false); } });
  function renderChart(animate, entering) {
    const mode = V.cmode, p = V.cc, t = todayP();
    $("[data-ctitle]").textContent = periodTitle(p, mode);
    $('[data-act="creset"]').classList.toggle("on", mode === "month" ? !(p.y === t.y && p.m === t.m) : p.y !== t.y);
    const d0 = entering ? 0.3 : 0;
    const c = chart.draw({ mode, p, w: W, h: H, animate, delay: d0, house: !V.nohouse });
    const note = $("[data-cnote]"), baseName = SP.cats().filter((x) => x.role === "base").map((x) => x.name).join(", ") || "House";
    note.hidden = !V.nohouse;
    note.textContent = V.nohouse ? "Without " + baseName + " · tap the chart to show everything" : "";
    cards(c, mode, p, d0);
    breakdown(mode, p);
    if (animate && !quiet()) {
      const base = entering ? 200 : 30;
      [...root.querySelectorAll(".mn-csheet .mn-st")].forEach((el, i) => el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: base + Math.min(i, 14) * 30, easing: ENTER, fill: "backwards" }));
      root.querySelectorAll(".mn-card").forEach((el, i) => el.animate([{ opacity: 0, transform: "translateX(16px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: base + 100 + i * 30, easing: ENTER, fill: "backwards" }));
    }
  }

  // 四个小方块：一样的四行（名字 / 数 / 一条线 / 小字），所以对得齐。线 = 之前六个月（年模式 = 之前几年）这个数的范围，
  // 点 = 这次落在哪儿（这个月的话，之前的也只算到同一天）。方块只建一次，换期只挪点（弹着滑过去）、换数。
  // 橙色只标超了预算的（她 10-22 说的）：Budget Left 是负的时候那个数和 Budget Left、Expense 的点；结余是负的、比平时花得多都不标
  const CARDS = [["left", "Budget Left", "leftPct"], ["expense", "Expense", "expense"], ["income", "Income", "income"], ["balance", "Balance", "balance"]];
  function cards(c, mode, p) {
    const box = $(".mn-cards");
    if (!box.querySelector("[data-card]")) box.innerHTML = CARDS.map(([k, label]) => '<div class="mn-card' + (k === "left" ? " mn-card-hl" : "") + '" data-card="' + k + '"><span class="mn-meta">' + label + '</span><span class="mn-num v"></span><div class="mn-track mn-range"><b hidden></b></div><span class="mn-num mn-meta"></span></div>').join("");
    const g = c.used, B = c.B, cmp = M.compare(IX(), budgetsShown(), p, mode, today()), pct = cmp.cur.leftPct, bal = cmp.cur.balance;
    const since = (mode === "year" ? "Earlier years" : "6 mo") + (cmp.cutText ? " " + cmp.cutText : "");
    const pctText = (x) => Math.round(x * 100) + "%";
    // Budget Left：剩下的钱 · 剩下几成（她 10-22 要的；方块宽度跟着字走，长了自己变宽）；超了两个都是负的、橙色。下面一行小字 = 一共能花多少（预算 − House）
    const blown = pct !== null && pct < 0, left = cmp.cur.left;
    const leftHTML = pct === null ? "—" : cents((left < 0 ? "−" : "") + M.money(Math.abs(left))) + '<span class="mn-kp">' + (pct < 0 ? "−" : "") + pctText(Math.abs(pct)) + "</span>";
    const show = { left: [leftHTML, blown ? "var(--mn-orange)" : "", pctText, pct === null ? (B ? "All base" : "No budget yet") : "of " + kfmt(cmp.cur.room)],
      expense: [cents("−" + M.money(g.out)), "", kfmt, ""], income: [cents("+" + M.money(g.inc)), "var(--mn-green)", kfmt, ""], balance: [cents((bal < 0 ? "−" : "+") + M.money(bal)), "", kfmt, ""] };
    for (const [k, , key] of CARDS) {
      const el = box.querySelector('[data-card="' + k + '"]'), [value, col, fmt, note] = show[k], v = el.querySelector(".v"), dot = el.querySelector(".mn-range > b"), small = el.querySelector(".mn-meta:last-child");
      v.innerHTML = value;
      v.style.color = col;
      el.title = since;
      const r = cmp.range[key], x = cmp.cur[key];
      if (!r || x === null || x === undefined) { dot.hidden = true; small.textContent = note || (mode === "year" ? "No earlier years" : "No history yet"); continue; }
      const span = r[1] - r[0], pos = span ? (x - r[0]) / span : 0.5;
      dot.hidden = false;
      dot.classList.toggle("over", blown && (k === "left" || k === "expense"));
      dot.style.left = (Math.max(0, Math.min(1, pos)) * 100).toFixed(1) + "%";
      small.textContent = note || fmt(r[0]) + "–" + fmt(r[1]);
    }
  }
  function breakdown(mode, p) {
    const inP = (e) => M.inPeriod(e, p, mode), rows = shownEntries().filter(inP);
    const make = (title, isIn) => {
      const part = rows.filter((e) => (e.v > 0) === isIn), total = part.reduce((s, e) => s + Math.abs(e.v), 0) || 1, by = new Map();
      for (const e of part) { const x = by.get(e.c) || { v: 0, list: [] }; x.v += Math.abs(e.v); x.list.push(e); by.set(e.c, x); }
      const cats = [...by].sort((a, b) => b[1].v - a[1].v);
      return '<div class="mn-sect mn-st">' + title + '</div><div class="mn-meta mn-st" style="margin:3px 0 4px">' + part.length + " transactions in " + cats.length + " categor" + (cats.length === 1 ? "y" : "ies") + "</div>" +
        cats.map(([k, x]) => {
          const op = V.bk.has((isIn ? "in:" : "out:") + k), its = x.list.sort(M.byNewest), role = M.roleOf(SP.cats(), k);
          return '<div class="mn-bk mn-st' + (op ? " open" : "") + '" data-bk="' + (isIn ? "in:" : "out:") + esc(k) + '"><div class="mn-brow"><div><div style="font-size:15px">' + esc(k) + (role === "base" ? ' <span class="mn-meta">base</span>' : role === "outside" ? ' <span class="mn-meta">not in budget</span>' : "") + '</div><div class="mn-meta" style="margin-top:3px">' + x.list.length + " transaction" + (x.list.length === 1 ? "" : "s") + "</div></div>" +
            '<div class="r"><div><div class="mn-num" style="font-size:15px' + (isIn ? ";color:var(--mn-green)" : "") + '">' + (isIn ? "+" : "−") + cents(M.money(x.v)) + '</div><div class="mn-meta mn-num" style="margin-top:3px">' + (x.v / total * 100).toFixed(1) + "%</div></div>" + pie(x.v / total, isIn ? "inc" : "") + '<svg class="ic mn-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></div></div>' +
            '<div class="mn-bin" style="height:' + (op ? "auto" : "0px") + '">' + its.slice(0, 60).map((e) => '<div class="mn-irow" data-id="' + esc(e.id) + '"><span class="mn-num mn-meta">' + M.MON[M.parts(e.d).m - 1] + " " + M.parts(e.d).d + '</span><span class="n">' + esc(e.n || "—") + '</span><span class="mn-num">' + (e.cur0 ? M.signed(e.v0, e.cur0) : M.signed(e.v)) + "</span></div>").join("") + (its.length > 60 ? '<div class="mn-meta" style="padding:6px 2px">+' + (its.length - 60) + " more</div>" : "") + "</div></div>";
        }).join("");
    };
    $("[data-xb]").innerHTML = make("Expense Breakdown", false);
    $("[data-ib]").innerHTML = make("Income Breakdown", true);
    $(".mn-csheet .mn-thead").classList.add("mn-st");
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
    V.nohouse = false;   // 每次打开都是完整的（包括 House）
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
  {
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
    const nE = visible("out").length, nI = visible("in").length, t = todayP(), b = M.budgetAt(budgetsShown(), t.y, t.m), [st, bad] = statusText();
    $("[data-setb]").innerHTML = '<div class="mn-grp"><button type="button" class="mn-li" data-sub="budget"><span class="grow">Budget</span><span class="mn-meta mn-num">' + (b ? M.money(b) + " / month" : "not set") + "</span>" + chevR + '</button><button type="button" class="mn-li" data-sub="cats"><span class="grow">Categories</span><span class="mn-meta">' + nE + " expense · " + nI + " income</span>" + chevR + "</button></div>" +
      '<div class="mn-grp"><button type="button" class="mn-li" data-sub="export"><span class="grow">Export</span><span class="mn-meta">.md</span>' + chevR + '</button><button type="button" class="mn-li" data-sub="import"><span class="grow">Import a month</span><span class="mn-meta">paste or .md</span>' + chevR + "</button></div>" +
      '<div class="mn-grp"><button type="button" class="mn-li" data-sub="currency"><span class="grow">Currency</span><span class="mn-meta">totals in ' + esc(curLabel(SP.show())) + " · adding in " + esc(curLabel(SP.inCur())) + "</span>" + chevR + "</button></div>" +
      '<p class="mn-note mn-status' + (bad ? " bad" : "") + '">' + esc(st) + "</p>";
  }
  const SUBT = { budget: "Budget", cats: "Categories", export: "Export", import: "Import a month", currency: "Currency" };
  function openSub(k) { V.sub = k; V.budEdit = null; V.newBud = null; if (k === "export") V.expM = { y: V.cur.y, m: V.mode === "year" ? (V.cur.y === todayP().y ? todayP().m : 12) : V.cur.m }; $("[data-subt]").textContent = SUBT[k]; renderSub(); push("sub"); }
  function renderSub() {
    const b = $("[data-subb]");
    if (V.sub === "budget") {
      const pts = SP.budgets().slice().reverse();
      b.innerHTML = '<p class="mn-note">Each month uses the latest budget set on or before it. House is the base of the trapezoid; Bonds don\'t count against it.</p>' +
        (pts.length ? '<div class="mn-grp">' + pts.map((x) => {
          const p = M.parts(x.from + "-01"), ed = V.budEdit === x.from;
          return '<div class="mn-li" data-bp="' + x.from + '"><span class="grow">From ' + M.MONTH[p.m - 1] + " " + p.y + "</span>" + (ed ? '<span class="mn-meta mn-num">' + esc(M.curInfo(x.cur).sym) + '</span><input class="mn-tx mn-num" data-bpv value="' + (x.v / 100).toFixed(2) + '" inputmode="decimal" style="width:90px;text-align:right">' + '<button type="button" class="mn-act warn" data-bprm="' + x.from + '">Remove</button>' : '<span class="mn-num">' + M.money(x.v, M.isCur(x.cur) ? x.cur : "cad") + "</span>") + "</div>";
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
    if (V.sub === "currency") {
      const show = SP.show(), R = RATES();
      b.innerHTML = '<p class="mn-note">Each record keeps the currency it was paid in. Totals, charts and the budget are shown in one currency (on this phone); budgets are set in CAD.</p>' +
        '<div class="mn-sect" style="margin:6px 0 6px">Show totals in</div><div class="mn-grp">' + M.CURS.map((c) => '<button type="button" class="mn-li" data-showk="' + c.k + '"><span class="grow">' + esc(c.code) + ' <span class="mn-meta">' + esc(c.sym) + "</span></span>" + (c.k === show ? '<span style="color:var(--mn-blue)">✓</span>' : "") + "</button>").join("") + "</div>" +
        '<div class="mn-sect" style="margin:18px 0 6px">Rates · 1 CAD =</div><div class="mn-grp">' + M.CURS.filter((c) => c.k !== "cad").map((c) => '<div class="mn-li"><span class="grow">' + esc(c.code) + ' <span class="mn-meta">' + esc(rateNote(c.k)) + "</span></span>" +
          '<input class="mn-tx mn-num" data-rate="' + c.k + '" value="' + R[c.k] + '" inputmode="decimal" aria-label="' + esc(c.code) + ' for one Canadian dollar" style="width:96px;text-align:right"></div>').join("") +
        '<button type="button" class="mn-li act" data-act="ecb">Use today\'s rates (European Central Bank)</button></div>' +
        '<p class="mn-note" data-ecbr style="margin-top:10px">“rough” = not set yet. Today\'s rates come from the ECB via frankfurter.dev, only when you tap.</p>';
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
    // 没打字：先列最近记 / 改过的 10 笔（记错了好找），点一笔就能改
    if (!q) {
      const recent = SP.entries().slice().sort((a, b) => (b.u || 0) - (a.u || 0)).slice(0, 10);
      fr.innerHTML = (recent.length ? '<div class="mn-meta" style="padding:14px 0 2px">Recently added</div>' + recent.map(rowHTML).join("") : "") + '<div class="mn-empty">Type a note, a category, or an amount</div>';
      return;
    }
    const hit = SP.entries().filter((e) => (e.c + " " + e.n + " " + (Math.abs(e.v) / 100).toFixed(2) + " " + M.money(e.v, M.curOf(e)) + " " + curLabel(M.curOf(e))).toLowerCase().includes(q)).sort(M.byNewest), groups = new Map();
    for (const e of hit) { const k = e.d.slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    fr.innerHTML = hit.length ? [...groups].map(([k, a]) => { const p = M.parts(k + "-01"); return '<div class="mn-meta" style="padding:14px 0 2px">' + M.MONTH[p.m - 1] + " " + p.y + " · " + a.length + "</div>" + a.slice(0, 40).map(rowHTML).join(""); }).join("") : '<div class="mn-empty">Nothing matches</div>';
  }

  // ---------- 点哪儿做什么 ----------
  root.addEventListener("click", (e) => {
    const cal = $("[data-cal]");
    if (cal.classList.contains("on") && !e.target.closest("[data-cal]") && !e.target.closest('[data-act="sdate"],[data-act="fdate"]')) closeCal();
    if ($("[data-curm]").classList.contains("on") && !e.target.closest("[data-curm]") && !e.target.closest('[data-act="scur"],[data-act="showcur"]')) closeCurMenu();
    const ck = e.target.closest("[data-curk]");
    if (ck) { const fn = curPick; closeCurMenu(); fn?.(ck.dataset.curk); return; }
    const sk = e.target.closest("[data-showk]");
    if (sk) { setShowCur(sk.dataset.showk); renderSub(); return; }
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
      else if (name === "catk" && v !== V.catKind) { V.catKind = v; renderSub(); }
      return;
    }
    const chip = e.target.closest("[data-chip]");
    if (chip) { V.filt = V.filt === chip.dataset.chip ? null : chip.dataset.chip; renderChips(); renderList(); return; }
    const rec = e.target.closest("[data-rec]");
    if (rec) { const x = recList[Number(rec.dataset.rec)]; if (x) addEntry({ d: entryDate(), v: x.v, c: x.c, n: x.n, cur: x.cur }); return; }
    const sc = e.target.closest("[data-scat]");
    if (sc) { S.cat = sc.dataset.scat; renderSheet(); return; }
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
    // 记一笔用哪种钱：新记的换了就一直用它（改旧的那笔只改那一笔）
    else if (act === "scur") openCurMenu(a, S.cur, (k) => { S.cur = k; if (!S.edit) SP.setInCur(k); wantRate(k); renderAmt(false); });
    else if (act === "showcur") openCurMenu(a, SP.show(), (k) => { setShowCur(k); wantRate(k); });
    else if (act === "ecb") {
      const note = $("[data-ecbr]");
      if (note) note.textContent = "Getting today's rates…";
      fetchRates().then((d) => { renderSub(); snack("Rates from the ECB · " + M.fmtDate(d), null); }).catch(() => { if (note) note.textContent = "Couldn't reach the ECB. Check the connection, or type the rates in."; });
    }
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
      const which = act === "exgo" ? V.expM : null, md = M.toMarkdown(SP.entries(), SP.cats(), SP.budgets(), which, today(), SP.show(), RATES());
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
    } else if (t.matches("[data-rate]")) {
      const v = parseFloat(String(t.value).replace(/[^\d.]/g, ""));
      if (v > 0) { setRate(t.dataset.rate, v); renderSub(); snack("1 CAD = " + v + " " + curLabel(t.dataset.rate), null); } else t.value = RATES()[t.dataset.rate];
    }
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[data-newcat]")) { e.preventDefault(); addCat(); }
    if (e.key === "Enter" && e.target.matches("[data-nbv]")) { e.preventDefault(); root.querySelector('[data-act="nbs"]')?.click(); }
    if (e.key === "Enter" && e.target.matches("[data-bpv], [data-rate]")) { e.preventDefault(); e.target.blur(); }
  });
  root.addEventListener("input", (e) => { if (e.target.matches("[data-q]")) renderFind(); });

  // 窗口宽度变了：时间轴两边的留白、选中那格居中、各个分段开关的滑块都按新的宽度重算
  let lastW = 0;
  const relayout = () => {
    if (!shown || !root.isConnected) return;
    const w = root.clientWidth;
    if (w === lastW) return;
    lastW = w;
    rail.style.padding = "0 " + Math.max(0, ((rw.clientWidth || 272) - V.cw) / 2) + "px";
    rw.scrollLeft = V.sel * V.cw;
    seg("mode", V.mode);
    seg("cmode", V.cmode);
    listEdges();
    if (V.sub === "cats") seg("catk", V.catKind);
    if (V.chartOpen) renderChart(false);
  };
  if (typeof ResizeObserver === "function") new ResizeObserver(relayout).observe(root);

  // ---------- 对外 ----------
  let shown = false;
  function refresh() {
    if (!shown) return;
    repaintBars();
    renderTitle();
    renderBody();
    if (V.chartOpen) renderChart(false);
    if (V.stack.includes("set")) renderSet();
    if (V.stack[V.stack.length - 1] === "sub" && V.sub !== "import") renderSub();
    if (V.stack.includes("find")) renderFind();
  }
  // 打开：面板长开以后，柱子从选中那格往两边一根根长出来
  function show() {
    shown = true;
    requestAnimationFrame(() => {
      lastW = root.clientWidth;
      seg("mode", V.mode);
      seg("cmode", V.cmode);
      buildRail(true);
    });
    renderTitle();
    renderBody();
  }
  function hide() {
    shown = false;
    closeSheet(); closeChart(); closeCal(); closeCurMenu();
    while (V.stack.length) pop();
  }
  // 手机：收起前回到主页最上面；下次打开从今天看起（隔了一会儿才再打开的话）
  function reset() {
    V.cur = todayP();
    V.filt = null;
    setCol(false);
    list.scrollTop = 0;
  }
  return { el: root, show, hide, refresh, reset, tookChange, startNew, sheetOpen: () => $(".mn-sheet")?.classList.contains("on") };
}
