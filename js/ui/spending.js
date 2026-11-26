// 电脑上的 Spending 页（手机上是从今天页顶上拉下来的面板：js/ui/money.js、js/ui/island.js）。网页的排法，一整块板：
//   底色是透明 50% 的黑加磨砂（白天背后的天太亮，再压暗一点，字才看得清）；板里不再套框，几块之间只用细线和留白分开。
//   页头：期间（October 2026）和同步状态 | Month / Year、‹ Now ›、搜索（按 / 跳进去）、齿轮、+ Add（按 N）
//   一排数：Spent、Income、Balance、Budget used、Budget left，一样宽的五格、竖线隔开；底下一条细线是之前六个月（年 = 之前几年）的范围、这次落在哪儿
//   左边：图表（梯形图，鼠标移上去看每天的读数）→ 流水表（月 = 按天分组；年、搜索 = 按月分组，多一列日期；金额靠右、等宽；
//     鼠标移到一行出 Edit / ×，点一行就在原地改）
//   + Add（按 N）：页头下面展开一行直接打字（不用滚到流水那里）：Tab 跳格、回车存（存完这一行就收起来，要接着记再按 N）、Esc 或点到外面（还没打字的话）收起；
//     底下一排推荐，点了直接记上。类别那个下拉分两组 Expense / Income：选了收入那组的就是收入（左边 − 跟着变 +）；点 − / + 也能换过去
//   右边（贴着顶）：By category，Expense / Income；每类一行：名字、金额、占比，底下一条按金额长的细线；点一类 = 流水只看这一类，再点取消
//   齿轮：苦昼短自己的弹窗（Budget | Categories | Currency | Export | Import），功能和手机上的一样
//   币种：每一笔是记的那种钱（金额那一格照原样写，换算过的小字在下面）；页头的 CAD ▾ = 总数换成哪种看（这台电脑自己的）；记一笔那一行金额后面能换币种，换了就一直用它
// All years（她 2026-11-26 要的）：Month / Year 旁边第三个，整块换成跨年份的那张图——每年年底的余额、每年的收入和支出，按 CPI 和固定汇率折成基准年的钱，
//   只写「基准年的几倍」；底色是住在哪；停在某一年看真实的数（当时的币种原样）。怎么算见 js/years.js；年底的余额、CPI、汇率、住在哪在齿轮的 Years 里填。
// 颜色是记账那一套（奶白字、钴蓝、超了橙、收入青绿），控件的形状、大小照苦昼短的（药丸形的分段开关和按钮、32px 的图标按钮）。
// 改了、删了都能在提示条上撤销（苦昼短的 toast）。这一页自己管自己：main.js 只在第一次进来时挂上，之后数据变了调 refresh。

import * as SP from "../spend.js";
import * as M from "../money.js";
import * as store from "../store.js";
import * as Y from "../years.js";
import { esc, icon } from "../dom.js";
import { toast } from "./common.js";
import { openModal, modalSheet } from "./modal.js";
import { slideFrom } from "../motion.js";
import { IX, cents, roll, kfmt, paceNote, paceTip, periodTitle, chartView, shownEntries, budgetsShown, amtOf, convOf, setShowCur, setRate, fetchRates, RATES, rateNote, curLabel, findText, fx, pillNow, springOf } from "./money.js";

const quiet = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const today = () => store.today();
const todayP = () => M.parts(today());
const visible = (kind) => SP.cats().filter((c) => c.kind === kind && !c.hidden).map((c) => c.name);
const CAP = 300;   // 流水先列这么多，多的点 Show all
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const seg = (name, opts) => '<div class="sp-seg" data-seg="' + name + '"><i></i>' + opts.map(([v, l]) => '<button type="button" data-v="' + v + '">' + l + "</button>").join("") + "</div>";
const sumOfAmount = (raw) => String(raw || "").split("+").reduce((a, v) => a + (parseFloat(String(v).replace(/[^\d.]/g, "")) || 0), 0);

export function createSpending() {
  const root = document.createElement("div");
  root.className = "mn spend";
  root.innerHTML =
    // 翻页的箭头夹着标题（一眼看到现在翻到哪）；不在当前这一期时，标题后面多一颗青柠小圆点 = 回到现在
    '<header class="sp-head"><div class="sp-title"><div class="sp-tnav"><button type="button" class="sp-nb" data-act="prev" aria-label="Earlier" title="Earlier">‹</button><h2 data-title></h2>' +
    '<button type="button" class="sp-nb" data-act="next" aria-label="Later" title="Later">›</button><button type="button" class="sp-nb sp-now" data-act="now" aria-label="Back to now" title="Back to now" hidden><i></i></button></div><p class="sp-status" data-status></p></div>' +
    '<div class="sp-tools">' + seg("mode", [["month", "Month"], ["year", "Year"], ["life", "All years"]]) +
    '<label class="sp-find">' + icon("search") + '<input type="search" data-q placeholder="Search" aria-label="Search notes, categories, amounts" autocomplete="off"><kbd>/</kbd></label>' +
    '<select class="sp-curs" data-show aria-label="Show totals in" title="Show totals in">' + M.CURS.map((c) => '<option value="' + c.k + '">' + c.code + "</option>").join("") + "</select>" +
    '<button type="button" class="sp-ic" data-act="set" aria-label="Spending settings" title="Settings">' + icon("settings") + "</button>" +
    '<button type="button" class="sp-add" data-act="add" title="Add a transaction (N)">' + icon("plus") + "Add<kbd>N</kbd></button></div></header>" +
    '<div class="sp-addw" data-add></div>' +
    '<section class="sp-kpis" data-kpis aria-label="This period at a glance">' + [["left", "Budget left"], ["out", "Spent"]].map(([k, l]) =>
      // 线和点只建一次：换期时点从原处弹簧滑到新位置（重画就没有过渡了）
      '<div class="sp-kpi" data-k="' + k + '"><span class="sp-kl">' + l + '</span><span class="sp-kvw"><span class="sp-kv mn-num mn-rn"></span><span class="sp-kp mn-num mn-rn"></span></span><div class="sp-kb"><div class="mn-track mn-range"><b hidden></b></div></div><span class="sp-ks mn-num"></span></div>').join("") +
      // Income、Balance 合成最后一格（她 11-01 晚说的）：两行「名字 数」，只有整期的数，没有横杠
      '<div class="sp-kpi sp-kio"><span class="sp-kl">Income</span><span class="sp-kv mn-num mn-rn" data-k="inc" style="color:var(--mn-green)"></span><span class="sp-kl">Balance</span><span class="sp-kv mn-num mn-rn" data-k="bal"></span></div></section>' +
    '<section class="sp-life" data-life aria-label="All years"></section>' +
    '<div class="sp-body"><div class="sp-main">' +
    '<figure class="sp-chart"><figcaption><div><h3 data-ctitle></h3><p class="sp-lede" data-pace></p></div><div class="sp-legend" data-legend aria-hidden="true"></div></figcaption>' +
    '<svg class="mn-chart" data-chart role="img" aria-label="Spending against the budget"></svg></figure>' +
    '<section class="sp-tx" aria-label="Transactions"><header class="sp-txh"><h3>Transactions <small data-count></small></h3><span class="sp-pills" data-pills></span></header><div data-table></div></section>' +
    '</div><aside class="sp-side" aria-label="By category"><header class="sp-sideh"><h3>By category</h3>' + seg("side", [["out", "Expense"], ["in", "Income"]]) + "</header>" +
    '<div class="sp-cats" data-cats></div><p class="sp-foot" data-catfoot></p></aside></div>';

  const $ = (s) => root.querySelector(s);
  // mode：Month / Year；cur：看的是哪一期；filt：右边点了的那一类；side：右边看支出还是收入；q：搜索；edit：正在改的那一笔（"new" = 新记一笔）
  const V = { mode: "month", cur: todayP(), filt: null, side: "out", q: "", edit: null, all: false, nohouse: false };   // nohouse：图只看 House 以外
  const F = { kind: "out", cat: "", d: today(), v: "", n: "", cur: "cad" };   // 正在填的那一行（页面重画时先读回来，填到一半不丢）
  // 图表：点 House 上面那块 = 只看 House 以外（花销和预算都不含 House）；只看的时候点哪儿都回来。每次进这一页都是完整的（show）
  const chart = chartView($("[data-chart]"), { onTap: (where) => { V.nohouse = where === "rest"; renderChart(false); } });
  let shown = false, fresh = null;

  // ---------- 分段开关：选中的那块滑过去 ----------
  function segTo(name, val) {
    const s = root.querySelector('[data-seg="' + name + '"]');
    if (!s) return;
    const b = s.querySelector('[data-v="' + val + '"]'), pill = s.firstElementChild;
    s.querySelectorAll("button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", String(x === b)); });
    if (b && b.offsetWidth) { const [x0, w0] = pillNow(s, pill); pill.style.left = b.offsetLeft + "px"; pill.style.width = b.offsetWidth + "px"; if (!quiet()) slideFrom(pill, x0, w0, { duration: 280, easing: springOf(pill) }); }
  }

  // ---------- 页头 ----------
  function statusText() {
    const linked = Boolean(store.setting("spend")?.url), err = SP.error(), n = SP.pendingCount();
    if (!linked) return ["Saved on this device — paste a spending Sheet link in Settings to keep it in your Google account", false];
    if (err) return [err, true];
    return [n ? n + " change" + (n === 1 ? "" : "s") + " waiting to sync" : "Synced with your spending Sheet", false];
  }
  function renderHead() {
    const life = V.mode === "life";
    root.classList.toggle("life", life);
    $("[data-title]").textContent = life ? "All years" : periodTitle(V.cur, V.mode);
    $("[data-show]").value = SP.show();
    segTo("mode", V.mode);
    $('[data-act="now"]').hidden = life || M.samePeriod(V.cur, todayP(), V.mode);
    const [st, bad] = statusText(), el = $("[data-status]");
    el.textContent = st;
    el.classList.toggle("bad", bad);
  }

  // ---------- 一排数 ----------
  function renderKpis(c) {
    const p = V.cur, mode = V.mode, cmp = M.compare(IX(), budgetsShown(), p, mode, today()), box = $("[data-kpis]");
    const g = c.used, B = c.B, bal = cmp.cur.balance, pct = cmp.cur.leftPct;
    const pctText = (x) => Math.round(x * 100) + "%";
    // Budget left、Spent：大数字 = 整期（提前记的也算）；横杠 = 到今天为止花得快还是慢（之前六个月（年 = 往年）到同一天，最低到最高、
    // 正中间那条线 = 平时，点 = 这一期到今天为止，提前记的不算）；小字 = 快 / 慢（过完的一期 = 平时整期大约多少），停在横杠上看具体的数（她 11-01 晚定的）。
    // Budget left 第一格（手机也是）。橙色只标超了预算的（她 10-22 说的）：Budget left 是负的时候那个数和两个点；比平时花得快不标
    const blown = pct !== null && pct < 0;
    // extra = 跟在数后面的那一截（Budget left 的「· 69%」），一样滚着变；note = 小字前面那截（「of $2.1k」）
    const cell = (k, value, { color = "", money = true, key, fmt = kfmt, note = "", extra = "" }) => {
      const el = box.querySelector('[data-k="' + k + '"]'), v = el.querySelector(".sp-kv"), kp = el.querySelector(".sp-kp"), bar = el.querySelector(".sp-kb"), dot = bar.querySelector("b"), small = el.querySelector(".sp-ks");
      roll(v, value, money);
      if (extra) roll(kp, extra);
      else { kp.textContent = ""; delete kp.dataset.v; }
      v.style.color = kp.style.color = color;
      const at = M.gauge(cmp, key);
      bar.title = at ? paceTip(cmp, key, mode) : "";
      small.classList.toggle("mn-pace", Boolean(at && cmp.cutText && at.pace));   // 不是平时的速度：字深一点
      if (!at) { dot.hidden = true; small.textContent = note || (mode === "year" ? "No earlier years yet" : "No history yet"); return; }
      dot.hidden = false;
      dot.classList.toggle("over", blown);
      dot.style.setProperty("--x", at.pos.toFixed(3));
      small.textContent = paceNote(cmp, key, at, fmt, note);
    };
    cell("out", "−" + M.money(g.out), { key: "expense" });
    // 预算还剩多少钱 · 几成（她 10-22 要的）：不算 House（底座）和 Bonds；提前记的未来那几笔也算在里面。小字前面 = 一共能花多少（预算 − House）
    const left = cmp.cur.left;
    cell("left", pct === null ? "—" : (left < 0 ? "−" : "") + M.money(Math.abs(left)), { money: pct !== null, color: blown ? "var(--mn-orange)" : "", key: "leftPct", fmt: pctText,
      extra: pct === null ? "" : (pct < 0 ? "−" : "") + pctText(Math.abs(pct)), note: pct === null ? (B ? "Budget is all base" : "No budget yet") : "of " + kfmt(cmp.cur.room) });
    // Income、Balance：整期的数（月中的工资提前记了也算），没有横杠
    roll(box.querySelector('[data-k="inc"]'), "+" + M.money(g.inc), true);
    roll(box.querySelector('[data-k="bal"]'), (bal < 0 ? "−" : "+") + M.money(bal), true);
  }

  // ---------- 图表 ----------
  function renderChart(animate) {
    const svg = $("[data-chart]"), W = Math.max(320, Math.round(svg.clientWidth || 640)), H = Math.round(Math.max(200, Math.min(300, W * 0.34)));
    const c = chart.draw({ mode: V.mode, p: V.cur, w: W, h: H, animate, house: !V.nohouse });
    const name = V.mode === "month" ? M.MONTH[V.cur.m - 1] : String(V.cur.y), end = V.mode === "month" ? M.MON[V.cur.m - 1] + " " + c.n : "Dec 31";
    const baseNames = SP.cats().filter((x) => x.role === "base").map((x) => x.name).join(", ") || "House";
    $("[data-ctitle]").textContent = "Spending in " + name + (V.nohouse ? " · without " + baseNames : "");
    const sofar = c.last ? c.val(c.last) : 0, budget = c.B ? " of a <b>" + esc(M.money(c.B)) + "</b> budget" : "";
    $("[data-pace]").innerHTML = !c.last ? "Nothing spent yet" + (c.B ? " · budget <b>" + esc(M.money(c.B)) + "</b>" : "")
      : c.isCur && c.last < c.n ? "<b>" + esc(M.money(sofar)) + "</b> so far; at this pace <b>" + esc(M.money(c.val(c.n))) + "</b> by " + end + budget
        : "<b>" + esc(M.money(sofar)) + "</b> in all" + budget;
    const base = SP.cats().filter((x) => x.role === "base").map((x) => x.name).join(", ") || "Base";
    $("[data-legend]").innerHTML = '<span><i class="ln"></i>Spent</span>' + (c.isCur ? '<span><i class="tr"></i>Trend</span>' : "") + (c.B ? '<span><i class="bd"></i>Budget</span>' : "") + (V.nohouse ? '<span class="sp-back">Click the chart to show everything</span>' : '<span><i class="hs"></i>' + esc(base) + "</span>");
    return c;
  }


  // ---------- All years：跨年份的那张图（js/years.js 算；她 2026-11-26 定的样子） ----------
  //   上面一块：每年年底的余额（实线和点，填了才有）和账本推出来的余额（淡虚线），纵轴是「基准年的几倍」，基准那条 ×1 虚线；点上面小字是比上一年涨跌了几成。
  //   下面一块：每年的收入（青绿）和支出（钴蓝）两根柱子，各自和基准年比；基准年以前的支出柱淡一点（那时候房租没记全）。
  //   最底下两行：年份，和那一年按多少 CPI 折的（灰色小字）。底色一段段是住在哪，左上角写地名。
  //   停在某一年（鼠标、或者 Tab 到图上用 ← →）：那一列亮一点，旁边浮出那一年的真实数字——当时的币种原样，再附上折成几倍、乘了多少 CPI。
  const yearsCfg = () => store.setting("spend-years") || {};
  function saveYears(patch, msg) {
    store.setSetting("spend-years", { ...yearsCfg(), ...patch });
    if (V.mode === "life") renderLife();
    if (msg) toast(msg);
  }
  const LIFE = { i: -1, data: null };
  const pctText = (c) => (c >= 0 ? "+" : "−") + Math.round(Math.abs(c) * 100) + "%";
  function renderLife() {
    const box = $("[data-life]");
    if (!box) return;
    const R = Y.build(SP.entries(), yearsCfg(), today()), cfg = R.cfg, ys = R.years;
    LIFE.data = R;
    if (!ys.length) { box.innerHTML = '<p class="sp-empty">Nothing recorded yet — the years show up as you add transactions, or year-end totals in <button type="button" class="sp-link" data-act="set-years">Settings → Years</button>.</p>'; return; }
    const W = Math.max(560, Math.round(box.clientWidth || 900)), padL = 44, padR = 12;
    // 上面那块随宽度高一点（200–300），下面柱子那块固定
    const T0 = 30, T1 = T0 + Math.round(Math.min(300, Math.max(200, W * 0.24))), B0 = T1 + 28, B1 = B0 + 90, L0 = B1 + 20, L1 = L0 + 16, H = L1 + 10;
    const n = ys.length, lo = ys[0].y, colW = (W - padL - padR) / n, cx = (i) => padL + colW * (i + 0.5);
    const xAt = (y, m) => padL + colW * (y - lo + (m - 1) / 12), f1 = (v) => Math.round(v * 10) / 10;
    let g = "";
    // 住在哪：一段一块底色（隔一块深一点），交界一条虚线，左上角地名
    const homes = cfg.homes;
    homes.forEach((h, k) => {
      const [hy, hm] = h.from.split("-").map(Number), next = homes[k + 1];
      const a = Math.max(padL, k === 0 ? padL : xAt(hy, hm)), b = Math.min(W - padR, next ? xAt(...next.from.split("-").map(Number)) : W - padR);
      if (b - a < 1) return;
      g += '<rect class="sp-lband' + (k % 2 ? " alt" : "") + '" x="' + f1(a) + '" y="' + (T0 - 22) + '" width="' + f1(b - a) + '" height="' + (B1 - T0 + 22) + '"/>';
      if (k > 0 && a > padL + 1) g += '<line class="sp-lsep" x1="' + f1(a) + '" x2="' + f1(a) + '" y1="' + (T0 - 22) + '" y2="' + B1 + '"/>';
      if (b - a > 46) g += '<text class="sp-lplace" x="' + f1(a + 7) + '" y="' + (T0 - 8) + '">' + esc(h.place) + "</text>";
    });
    // 上面：余额
    const vals = ys.flatMap((r) => [r.x.total, r.x.ledger]).filter((v) => v !== null && Number.isFinite(v));
    const tk = Y.ticks(Math.max(1.2, ...vals), Math.min(0, ...vals)), t0 = tk[0], tN = tk[tk.length - 1];
    const yv = (v) => T1 - (v - t0) / (tN - t0 || 1) * (T1 - T0);
    for (const v of tk) g += '<line class="sp-lgrid' + (v === 1 ? " one" : "") + '" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(yv(v)) + '" y2="' + f1(yv(v)) + '"/><text class="mn-ax sp-lax" x="' + (padL - 8) + '" y="' + f1(yv(v) + 4) + '">' + Y.times(v) + "</text>";
    // ×1（基准年）那条虚线一定要有：刻度隔得大（×0、×2、×4）时单独补上
    if (!tk.includes(1)) g += '<line class="sp-lgrid one" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(yv(1)) + '" y2="' + f1(yv(1)) + '"/><text class="mn-ax sp-lax" x="' + (padL - 8) + '" y="' + f1(yv(1) + 4) + '">×1</text>';
    const path = (key) => { let d = "", on = false; ys.forEach((r, i) => { const v = r.x[key]; if (v === null || !Number.isFinite(v)) { if (key === "ledger") on = false; return; } d += (on ? "L" : "M") + f1(cx(i)) + " " + f1(yv(v)); on = true; }); return d; };
    const ld = path("ledger"), td = path("total");
    if (ld) g += '<path class="sp-lledger" d="' + ld + '"/>';
    if (td) g += '<path class="sp-lline" d="' + td + '"/>';
    ys.forEach((r, i) => {
      if (r.x.total === null) return;
      const y = yv(r.x.total);
      g += '<circle class="sp-ldot" cx="' + f1(cx(i)) + '" cy="' + f1(y) + '" r="4.5"/>';
      if (r.change !== null) g += '<text class="sp-lchg ' + (r.change >= 0 ? "up" : "down") + '" x="' + f1(cx(i)) + '" y="' + f1(y - 11) + '">' + pctText(r.change) + "</text>";
    });
    // 下面：收入、支出两根柱子，各自和基准年比
    const bars = ys.flatMap((r) => [r.x.inc, r.x.out]).filter((v) => v !== null && Number.isFinite(v));
    const bmax = Math.max(1.2, ...bars), bh = (v) => Math.max(1, v / bmax * (B1 - B0)), bw = Math.max(4, Math.min(16, colW * 0.26));
    g += '<line class="sp-lgrid one" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(B1 - bh(1)) + '" y2="' + f1(B1 - bh(1)) + '"/><text class="mn-ax sp-lax" x="' + (padL - 8) + '" y="' + f1(B1 - bh(1) + 4) + '">×1</text>';
    g += '<line class="sp-lbase" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + B1 + '" y2="' + B1 + '"/>';
    ys.forEach((r, i) => {
      if (r.x.inc !== null) g += '<rect class="sp-linc" x="' + f1(cx(i) - bw - 1.5) + '" y="' + f1(B1 - bh(r.x.inc)) + '" width="' + f1(bw) + '" height="' + f1(bh(r.x.inc)) + '" rx="2"/>';
      if (r.x.out !== null) g += '<rect class="sp-lout' + (r.early ? " early" : "") + '" x="' + f1(cx(i) + 1.5) + '" y="' + f1(B1 - bh(r.x.out)) + '" width="' + f1(bw) + '" height="' + f1(bh(r.x.out)) + '" rx="2"/>';
      g += '<text class="mn-ax sp-lyr' + (r.y === cfg.base ? " base" : "") + '" x="' + f1(cx(i)) + '" y="' + L0 + '">' + (colW < 34 ? "’" + String(r.y).slice(2) : r.y) + "</text>";
      g += '<text class="mn-ax sp-lcpi" x="' + f1(cx(i)) + '" y="' + L1 + '">' + (r.y === cfg.base ? "base" : Y.rateIn(cfg, r.y) + "%") + "</text>";
    });
    g += '<rect class="sp-lcol" data-lcol x="0" y="' + (T0 - 22) + '" width="' + f1(colW) + '" height="' + (L1 - T0 + 30) + '" rx="6" visibility="hidden"/>';
    ys.forEach((r, i) => { g += '<rect class="sp-lhit" data-i="' + i + '" x="' + f1(padL + colW * i) + '" y="0" width="' + f1(colW) + '" height="' + H + '"/>'; });
    // 底下的说明（灰色小字）：基准年以前的支出为什么淡、×1 是哪一年、哪几年的余额没认出来
    const notes = [];
    if (ys.some((r) => r.early && r.x.out !== null)) notes.push("Before " + cfg.base + " rent wasn't in the ledger, so those spending bars are faded.");
    if (!ys.some((r) => r.x.total !== null)) notes.push('No year-end totals yet: the dashed line is only what the ledger adds up to. <button type="button" class="sp-link" data-act="set-years">Add them in Settings → Years</button>');
    else if (R.base.totalFrom && R.base.totalFrom !== cfg.base) notes.push("No year-end total for " + cfg.base + " — ×1 on the balance line is " + R.base.totalFrom + "’s.");
    const bad = ys.filter((r) => r.bad.length);
    if (bad.length) notes.push("Couldn't read part of " + bad.map((r) => r.y + " (“" + esc(r.bad.join(", ")) + "”)").join(", ") + ".");
    box.innerHTML = '<figure class="sp-chart sp-lfig"><figcaption><div><h3>Year by year</h3><p class="sp-lede">In ' + cfg.base + " money (CPI " + cfg.cpi + "% a year unless set), at fixed rates, as a multiple of " + cfg.base +
      ". Rest on a year for the real amounts.</p></div>" +
      '<div class="sp-legend" aria-hidden="true"><span><i class="ln"></i>Year-end total</span><span><i class="lg"></i>From the ledger</span><span><i class="ic"></i>Income</span><span><i class="ou"></i>Spent</span>' +
      '<button type="button" class="sp-link" data-act="set-years">Edit years</button></div></figcaption>' +
      '<div class="sp-lwrap"><svg class="mn-chart sp-lchart" data-lchart viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" tabindex="0" role="img" aria-label="Year-end total, income and spending from ' + lo + " to " + ys[n - 1].y + ", as multiples of " + cfg.base + '. Use the left and right arrow keys to read each year.">' + g + "</svg>" +
      '<div class="sp-ltip" data-ltip role="status" aria-live="polite" hidden></div></div>' +
      (notes.length ? '<p class="sp-lnote">' + notes.join(" ") + "</p>" : "") + "</figure>";
    if (LIFE.i >= n) LIFE.i = -1;
    if (LIFE.i >= 0) lifeAt(LIFE.i);
  }
  // 停在第 i 年：那一列亮一点，旁边浮出真实的数
  function lifeAt(i) {
    const R = LIFE.data, svg = $("[data-lchart]"), tip = $("[data-ltip]");
    if (!R || !svg || !tip) return;
    const r = R.years[i];
    if (!r) { tip.hidden = true; svg.querySelector("[data-lcol]")?.setAttribute("visibility", "hidden"); LIFE.i = -1; return; }
    LIFE.i = i;
    const hit = svg.querySelector('[data-i="' + i + '"]'), col = svg.querySelector("[data-lcol]");
    col.setAttribute("x", hit.getAttribute("x"));
    col.setAttribute("width", hit.getAttribute("width"));
    col.setAttribute("visibility", "visible");
    const cfg = R.cfg, row = (name, real, x, cls = "") => '<tr class="' + cls + '"><th>' + name + '</th><td class="mn-num">' + real + '</td><td class="mn-num sp-lx">' + Y.times(x) + "</td></tr>";
    const where = r.homes.map((h) => esc(h.place)).join(" → ");
    const net = Object.fromEntries(Object.entries(r.net).filter(([, v]) => v));
    tip.innerHTML = '<p class="sp-lth"><b class="mn-num">' + r.y + "</b>" + (where ? "<span>" + where + "</span>" : "") + "</p><table>" +
      row("Year-end total", r.total ? esc(Y.bagText(r.total)) : '<span class="sp-lmiss">not entered</span>', r.x.total) +
      row("Income", esc(Y.bagText(r.inc)), r.x.inc, "in") + row("Spent", esc(Y.bagText(r.out)), r.x.out, "out") +
      row("Saved (ledger)", Object.keys(net).length ? (Object.values(net).every((v) => v >= 0) ? "+" : "") + esc(Y.bagText(net)) : "—", r.x.ledger) + "</table>" +
      '<p class="sp-lcp">' + (r.y === cfg.base ? "Base year: ×1" : "Inflation that year " + Y.rateIn(cfg, r.y) + "% · ×" + r.f.toFixed(3) + " to " + cfg.base + " money") + " · fixed rates" +
      (r.change !== null ? " · total " + pctText(r.change) + " in real terms" : "") + (r.early ? " · rent not recorded yet" : "") + "</p>";
    tip.hidden = false;
    const wrap = tip.parentElement, x = Number(hit.getAttribute("x")) * (svg.clientWidth / (Number(svg.getAttribute("width")) || 1)), w = Number(hit.getAttribute("width")) * (svg.clientWidth / (Number(svg.getAttribute("width")) || 1));
    const right = x + w + 10, tw = tip.offsetWidth;
    tip.style.left = (right + tw > wrap.clientWidth ? Math.max(0, x - tw - 10) : right) + "px";
  }
  root.addEventListener("pointermove", (e) => { const h = e.target.closest?.(".sp-lchart [data-i]"); if (h && Number(h.dataset.i) !== LIFE.i) lifeAt(Number(h.dataset.i)); });
  root.addEventListener("pointerout", (e) => { if (e.target.closest?.(".sp-lchart") && !e.relatedTarget?.closest?.(".sp-lchart") && document.activeElement !== $("[data-lchart]")) lifeAt(-1); });
  root.addEventListener("focusin", (e) => { if (e.target.matches?.("[data-lchart]") && LIFE.i < 0 && LIFE.data) lifeAt(Math.max(0, LIFE.data.years.findIndex((r) => r.y === LIFE.data.cfg.base))); });
  root.addEventListener("focusout", (e) => { if (e.target.matches?.("[data-lchart]")) lifeAt(-1); });
  root.addEventListener("keydown", (e) => {
    if (!e.target.matches?.("[data-lchart]") || !LIFE.data) return;
    const n = LIFE.data.years.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); lifeAt(Math.min(n - 1, Math.max(0, (LIFE.i < 0 ? 0 : LIFE.i) + (e.key === "ArrowLeft" ? -1 : 1)))); }
    else if (e.key === "Home" || e.key === "End") { e.preventDefault(); lifeAt(e.key === "Home" ? 0 : n - 1); }
    else if (e.key === "Escape") lifeAt(-1);
  });

  // 齿轮里的 Years：基准年、默认 CPI；每年一行（住在哪、年底总余额、那一年的 CPI）；住在哪、固定汇率折起来
  function yearsSetHTML() {
    const raw = yearsCfg(), cfg = Y.settings(raw), t = todayP();
    const first = SP.entries().reduce((m, e) => Math.min(m, Number(String(e.d).slice(0, 4)) || m), t.y);
    const lo = Math.min(first, cfg.base, ...Object.keys(cfg.totals).map(Number)), years = [];
    for (let y = t.y; y >= lo; y--) years.push(y);
    const rowOf = (y) => {
      const tot = cfg.totals[String(y)] || "", bad = tot ? Y.parseTotal(tot).bad : [], cp = String(y) in cfg.cpiBy ? cfg.cpiBy[String(y)] : "";
      return '<tr' + (y === cfg.base ? ' class="sp-ybase"' : "") + '><td class="num">' + y + (y === cfg.base ? ' <span class="msub">×1</span>' : "") + '</td><td class="msub">' + esc(Y.homesIn(cfg.homes, y).map((h) => h.place).join(" → ")) + "</td>" +
        '<td><input class="sp-yt' + (bad.length ? " bad" : "") + '" data-ytot="' + y + '" value="' + esc(tot) + '"' + (y === t.y ? ' placeholder="e.g. 52000 CAD + 30000 RMB"' : "") + ' aria-label="Year-end total ' + y + '"' + (bad.length ? ' title="Couldn\'t read: ' + esc(bad.join(", ")) + '"' : "") + "></td>" +
        '<td class="r"><input class="num sp-bv sp-yn" data-ycpiy="' + y + '" value="' + esc(String(cp)) + '" placeholder="' + cfg.cpi + '" inputmode="decimal" aria-label="Inflation in ' + y + ' (%)"> %</td></tr>';
    };
    const rateCurs = M.CURS.filter((c) => c.k !== "cny");
    return '<p class="msub">The <b>All years</b> chart puts every year in ' + cfg.base + " money: adjusted for inflation (CPI), converted at the fixed rates below, then drawn as a multiple of " + cfg.base + ". Resting on a year shows the real amounts in the currencies they were in.</p>" +
      '<div class="sp-setrow"><label>Base year (×1) <select data-ybase>' + years.map((y) => "<option" + (y === cfg.base ? " selected" : "") + ">" + y + "</option>").join("") + "</select></label>" +
      '<label>Inflation <input class="num sp-bv sp-yn" data-ycpi value="' + cfg.cpi + '" inputmode="decimal" aria-label="Inflation a year (%)"> % a year, unless a year says otherwise</label></div>' +
      '<table class="mtable sp-ytab"><thead><tr><th>Year</th><th>Lived in</th><th>Year-end total <span class="msub">every account, any currencies</span></th><th class="r">Inflation</th></tr></thead><tbody>' + years.map(rowOf).join("") + "</tbody></table>" +
      '<p class="msub">A total without a currency is in the money of the place you lived at the end of that year. “52k”, “3万 RMB”, “¥30,000 + A$2,000” all work.</p>' +
      '<details class="sp-paste"><summary>Where you lived</summary><p class="msub">One line per move: when (year, or year.month), where, and its currency. It shades the chart and names the years above.</p>' +
      '<textarea data-yhomes rows="5" spellcheck="false">' + esc(cfg.homesText) + '</textarea><div class="sp-setrow"><button type="button" class="btn" data-sact="yhomes">Save</button><button type="button" class="btn ghosty" data-sact="yhreset">Back to the default</button></div></details>' +
      '<details class="sp-paste"><summary>Fixed rates for this chart</summary><p class="msub">Only for All years, so exchange-rate swings don\'t look like your money changing. Everything is in RMB.</p>' +
      '<table class="mtable"><tbody>' + rateCurs.map((c) => "<tr><td>1 " + esc(c.code) + ' <span class="msub">' + esc(c.sym) + '</span> =</td><td class="r"><input class="num sp-bv" data-yrate="' + c.k + '" value="' + cfg.rates[c.k] + '" inputmode="decimal" aria-label="RMB for one ' + esc(c.code) + '"> RMB</td></tr>').join("") + "</tbody></table></details>";
  }

  // ---------- 右边：按类别 ----------
  function renderCats() {
    const p = V.cur, mode = V.mode, isIn = V.side === "in", cats = SP.cats();
    segTo("side", V.side);
    const rows = shownEntries().filter((e) => M.inPeriod(e, p, mode) && (e.v > 0) === isIn), by = new Map();
    let total = 0;
    for (const e of rows) { const x = by.get(e.c) || { v: 0, n: 0 }; x.v += Math.abs(e.v); x.n++; by.set(e.c, x); total += Math.abs(e.v); }
    const list = [...by].sort((a, b) => b[1].v - a[1].v), max = list[0]?.[1].v || 1;
    $("[data-cats]").innerHTML = list.length ? list.map(([k, x]) => {
      const role = M.roleOf(cats, k), on = V.filt === k;
      return '<button type="button" class="sp-cat' + (on ? " on" : "") + '" data-cat="' + esc(k) + '" aria-pressed="' + on + '" title="' + esc((on ? "Show every category" : "Show only " + k) + " · " + x.n + " transaction" + (x.n === 1 ? "" : "s")) + '">' +
        '<span class="sp-cn">' + esc(k) + (role === "base" ? " <small>base</small>" : role === "outside" ? " <small>not in budget</small>" : "") + "</span>" +
        '<span class="sp-cv mn-num">' + (isIn ? "+" : "−") + cents(M.money(x.v)) + '</span><span class="sp-cp mn-num">' + (x.v / (total || 1) * 100).toFixed(1) + "%</span>" +
        '<i class="sp-cb' + (isIn ? " in" : "") + '" style="--w:' + (x.v / max * 100).toFixed(1) + '%"></i></button>';
    }).join("") : '<p class="sp-empty">No ' + (isIn ? "income" : "spending") + " in " + esc(periodTitle(p, mode)) + "</p>";
    $("[data-catfoot]").textContent = list.length ? rows.length + " transaction" + (rows.length === 1 ? "" : "s") + " in " + list.length + " categor" + (list.length === 1 ? "y" : "ies") : "";
  }

  // ---------- 流水表 ----------
  const dayTitle = (d) => {
    const p = M.parts(d), t = today();
    const label = d === t ? "Today" : d === M.addDaysISO(t, -1) ? "Yesterday" : WD[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
    return label + ", " + M.MON[p.m - 1] + " " + p.d + (p.y !== todayP().y ? ", " + p.y : "");
  };
  const RECENT = 20;
  function txRows() {
    const q = V.q.trim().toLowerCase();
    // Recent：最近记 / 改过的那几笔，不管哪一期（改动时间新的在前）
    if (V.recent && !q) return SP.entries().slice().sort((a, b) => (b.u || 0) - (a.u || 0)).slice(0, RECENT);
    if (q) return SP.entries().filter((e) => findText(e).includes(q)).sort(M.byNewest);
    return SP.entries().filter((e) => M.inPeriod(e, V.cur, V.mode) && (!V.filt || e.c === V.filt)).sort(M.byNewest);
  }
  const amountHTML = (e) => (e.v > 0 ? "+" : "−") + cents(M.money(e.v, M.curOf(e))) + (convOf(e) ? '<small class="sp-conv">' + esc(convOf(e)) + "</small>" : "");
  const rowHTML = (e, dated) => '<tr class="sp-row' + (e.id === fresh ? " new" : "") + '" data-id="' + esc(e.id) + '" tabindex="0" aria-label="' + esc(e.c + " " + amtOf(e) + (e.n ? ", " + e.n : "") + ", " + M.fmtDate(e.d) + " — press Enter to edit") + '">' +
    (dated ? '<td class="d mn-num">' + M.MON[M.parts(e.d).m - 1] + " " + M.parts(e.d).d + (M.parts(e.d).y !== todayP().y ? ", " + M.parts(e.d).y : "") + "</td>" : "") +
    '<td class="c">' + esc(e.c) + (e.d > today() ? ' <span class="sp-up" title="Dated ' + esc(M.fmtDate(e.d)) + ' — already counted">Upcoming</span>' : "") + '</td><td class="n" title="' + esc(e.n || "") + '">' + esc(e.n || "") + "</td>" +
    '<td class="r mn-num' + (e.v > 0 ? " in" : "") + '">' + amountHTML(e) + "</td>" +
    '<td class="a"><button type="button" class="sp-ra" data-act="edit" tabindex="-1">Edit</button><button type="button" class="sp-ra x" data-act="del" tabindex="-1" aria-label="Delete" title="Delete">×</button></td></tr>';

  // 新的一笔记在哪天：看的这一期里有今天就是今天，不然是那个月（那年）的头一天
  function entryDate() {
    const t = todayP();
    if (V.mode === "month") return V.cur.y === t.y && V.cur.m === t.m ? today() : M.iso(V.cur.y, V.cur.m, 1);
    return V.cur.y === t.y ? today() : M.iso(V.cur.y, 1, 1);
  }
  // 能选的类别：这一种（支出 / 收入）里没藏起来的；改旧的那笔时，它原来那一类就算藏起来了也列上
  function catsFor(kind, e) {
    const list = visible(kind);
    if (e && e.c && !list.includes(e.c) && M.kindOf(SP.cats(), e.c) === kind) list.push(e.c);
    return list;
  }
  const firstCat = (kind) => { const l = visible(kind); return kind === "out" ? (l.includes("Food") ? "Food" : l[Math.min(1, l.length - 1)] || "") : l[0] || ""; };
  const signHTML = () => '<button type="button" class="sp-sign' + (F.kind === "in" ? " in" : "") + '" data-act="sign" aria-label="' + (F.kind === "in" ? "Income — switch to an expense" : "Expense — switch to income") + '" title="' + (F.kind === "in" ? "Income" : "Expense") + ' — click to switch">' + (F.kind === "in" ? "+" : "−") + "</button>";
  function formInner(e) {
    const cats = catsFor(F.kind, e);
    if (!cats.includes(F.cat)) F.cat = cats.includes(firstCat(F.kind)) ? firstCat(F.kind) : cats[0] || "";
    // 下拉里两组都列上：收入不用先找到左边那格才看得见
    const groups = [["out", "Expense"], ["in", "Income"]].map(([k, l]) => [k, l, k === F.kind ? cats : catsFor(k, e)]).filter((g) => g[2].length);
    const used = M.notesOf(SP.entries(), F.cat), t = todayP();
    const view = V.mode === "year" ? (V.cur.y === t.y ? { y: t.y, m: t.m } : null) : { y: V.cur.y, m: V.cur.m };
    const recs = e ? [] : M.recommend(SP.entries(), SP.cats(), view, today());
    return '<div class="sp-fl">' +
      signHTML() +
      '<input class="sp-fi sp-f-amt mn-num" data-f="v" inputmode="decimal" autocomplete="off" placeholder="0.00" value="' + esc(F.v) + '" aria-label="Amount (12.50+8 adds up)" title="12.50+8 adds up">' +
      '<select class="sp-fi sp-f-cur" data-f="cur" aria-label="Currency" title="Currency — new records keep using the one you pick">' + M.CURS.map((c) => '<option value="' + c.k + '"' + (c.k === F.cur ? " selected" : "") + ">" + c.code + "</option>").join("") + "</select>" +
      '<select class="sp-fi sp-f-cat" data-f="c" aria-label="Category">' + groups.map(([k, l, list]) => '<optgroup label="' + l + '">' + list.map((c) => '<option value="' + esc(c) + '" data-k="' + k + '"' + (k === F.kind && c === F.cat ? " selected" : "") + ">" + esc(c) + "</option>").join("") + "</optgroup>").join("") + "</select>" +
      '<input class="sp-fi sp-f-note" data-f="n" autocomplete="off" placeholder="' + esc(used[0] ? "e.g. " + used[0] : "Note") + '" value="' + esc(F.n) + '" aria-label="Note">' +
      '<input class="sp-fi sp-f-date" type="date" data-f="d" value="' + esc(F.d) + '" aria-label="Date">' +
      '<span class="sp-fb">' + (e ? '<button type="button" class="sp-link warn" data-act="fdel">Delete</button>' : "") + '<button type="button" class="sp-link" data-act="cancel">Cancel</button>' +
      '<button type="button" class="sp-save" data-act="save">Save<kbd>↵</kbd></button></span></div><p class="sp-ferr" data-ferr role="alert"></p>' +
      (recs.length ? '<div class="sp-recs"><span>Quick add</span>' + recs.map((x, i) => '<button type="button" class="sp-rec" data-rec="' + i + '" data-c="' + esc(x.c) + '" data-v="' + x.v + '" data-cur="' + esc(x.cur || "cad") + '" data-n="' + esc(x.n || "") + '">' + esc(x.c) + ' <span class="mn-num">' + esc(M.money(x.v, x.cur)) + "</span></button>").join("") + "</div>" : "");
  }
  const formRow = (cols, e) => '<tr class="sp-form" data-form="' + esc(e.id) + '"><td colspan="' + cols + '">' + formInner(e) + "</td></tr>";
  // 新记一笔的那一行：在页头下面（已经开着就不重画，正在打的字、光标都留着；force = 切了支出 / 收入、刚打开）
  function renderAdd(force = false) {
    const w = $("[data-add]");
    if (V.edit !== "new") { w.innerHTML = ""; return; }
    if (!force && w.firstElementChild) return;
    w.innerHTML = '<div class="sp-form sp-addbar" data-form="new">' + formInner(null) + "</div>";
  }
  // 正在填的那一行：先把格子里的读回 F（重画、切支出收入的时候不丢）
  function readForm() {
    const f = $(".sp-form");
    if (!f) return;
    const val = (k) => f.querySelector('[data-f="' + k + '"]')?.value ?? "";
    Object.assign(F, { v: val("v"), cat: val("c") || F.cat, n: val("n"), d: val("d") || F.d, cur: val("cur") || F.cur });
    const k = f.querySelector('[data-f="c"]')?.selectedOptions[0]?.dataset.k;   // 是支出还是收入，照选中的那个类别在哪一组
    if (k) F.kind = k;
  }
  function renderTable() {
    readForm();
    const q = V.q.trim(), rows = txRows(), recent = V.recent && !q, dated = Boolean(q) || V.mode === "year" || recent;
    const shown = V.all ? rows : rows.slice(0, CAP), cols = dated ? 5 : 4;
    const groups = new Map();
    for (const e of shown) { const k = dated ? e.d.slice(0, 7) : e.d; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    const editing = V.edit && V.edit !== "new" ? SP.get(V.edit) : null;   // 新记的那一行在页头下面（renderAdd），这里只有原地改的
    let body = "";
    const R = RATES(), show = SP.show(), inShow = (e) => M.convert(e.v, M.curOf(e), show, R);
    if (recent) body = '<tbody><tr class="sp-grp"><th colspan="' + cols + '" scope="rowgroup">Recently added or changed <small>newest first</small></th></tr>' +
      shown.map((e) => (editing && e.id === editing.id ? formRow(cols, e) : rowHTML(e, true))).join("") + "</tbody>";
    else for (const [k, list] of groups) {
      const out = list.reduce((s, e) => s + (e.v < 0 ? -inShow(e) : 0), 0), inc = list.reduce((s, e) => s + (e.v > 0 ? inShow(e) : 0), 0);
      const title = dated ? M.MONTH[Number(k.slice(5, 7)) - 1] + " " + k.slice(0, 4) : dayTitle(k);
      body += '<tbody><tr class="sp-grp"><th colspan="' + (cols - 2) + '" scope="rowgroup">' + esc(title) + " <small>" + list.length + "</small></th>" +
        '<td class="r mn-num">' + (out ? "−" + esc(M.money(out)) : "") + (inc ? ' <span class="in">+' + esc(M.money(inc)) + "</span>" : "") + "</td><td></td></tr>" +
        list.map((e) => (editing && e.id === editing.id ? formRow(cols, e) : rowHTML(e, dated))).join("") + "</tbody>";
    }
    const empty = !shown.length ? '<tbody><tr><td colspan="' + cols + '" class="sp-none">' + (q ? "Nothing matches “" + esc(q) + "”" : V.filt ? "No " + esc(V.filt) + " in " + esc(periodTitle(V.cur, V.mode)) : "No transactions in " + esc(periodTitle(V.cur, V.mode)) + ". Press <kbd>N</kbd> to add one.") + "</td></tr></tbody>" : "";
    $("[data-table]").innerHTML = '<table class="sp-table' + (dated ? " dated" : "") + '"><colgroup>' + (dated ? '<col class="d">' : "") + '<col class="c"><col class="n"><col class="r"><col class="a"></colgroup>' +
      "<thead><tr>" + (dated ? '<th class="d" scope="col">Date</th>' : "") + '<th class="c" scope="col">Category</th><th class="n" scope="col">Note</th><th class="r" scope="col">Amount</th><th class="a"><span class="sp-sr">Actions</span></th></tr></thead>' +
      body + empty + "</table>" +
      (rows.length > shown.length ? '<button type="button" class="sp-more" data-act="all">Show all ' + rows.length + "</button>" : "");
    $("[data-count]").textContent = rows.length ? String(rows.length) : "";
    $("[data-pills]").innerHTML = (!q ? '<button type="button" class="sp-pill' + (V.recent ? " on" : "") + '" data-act="recent" aria-pressed="' + Boolean(V.recent) + '" title="' + (V.recent ? "Back to " + esc(periodTitle(V.cur, V.mode)) : "The last " + RECENT + " you added or changed") + '">Recent</button>' : "") + (q ? '<button type="button" class="sp-pill" data-act="unq" title="Clear the search">Search: ' + esc(q) + " <span aria-hidden=\"true\">×</span></button>" : "") +
      (V.filt && !q && !V.recent ? '<button type="button" class="sp-pill" data-act="unfilt" title="Show every category">' + esc(V.filt) + ' <span aria-hidden="true">×</span></button>' : "");
    fresh = null;
  }

  // ---------- 记一笔 / 改 / 删 ----------
  // 光标放进金额那一格；那一行不在屏幕里（往下滚了）才把页面挪过去
  function focusAmount() {
    requestAnimationFrame(() => {
      const i = $('.sp-form [data-f="v"]');
      if (!i) return;
      i.focus({ preventScroll: true });
      i.select();
      const r = i.closest(".sp-form").getBoundingClientRect();
      if (r.top < 8 || r.bottom > innerHeight - 8) scrollTo({ top: scrollY + r.top - 80, behavior: quiet() ? "auto" : "smooth" });
    });
  }
  function startNew() {
    if (V.edit === "new") { focusAmount(); return; }
    const wasEditing = Boolean(V.edit);
    V.edit = "new";
    Object.assign(F, { kind: "out", cat: firstCat("out"), d: entryDate(), v: "", n: "", cur: SP.inCur() });
    renderAdd(true);
    if (wasEditing) renderTable();
    if (!quiet()) $(".sp-addbar")?.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: "cubic-bezier(.16, 1, .3, 1)" });
    focusAmount();
  }
  function startEdit(id) {
    const e = SP.get(id);
    if (!e) return;
    if (V.edit === "new") { V.edit = null; renderAdd(); }
    V.edit = id;
    Object.assign(F, { kind: e.v < 0 ? "out" : "in", cat: e.c, d: e.d, v: (Math.abs(e.v) / 100).toFixed(2), n: e.n || "", cur: M.curOf(e) });
    renderTable();
    focusAmount();
  }
  function closeForm() {
    if (!V.edit) return;
    const add = V.edit === "new";
    V.edit = null;
    if (add) renderAdd(); else renderTable();
  }
  function saveForm() {
    readForm();
    const s = sumOfAmount(F.v), err = $("[data-ferr]");
    if (!(s > 0)) { if (err) err.textContent = "Type an amount first"; focusAmount(); return; }
    if (!F.cat) { if (err) err.textContent = "Add " + (F.kind === "in" ? "an income" : "a") + " category in Settings first"; return; }
    if (!/^\d{4}-\d\d-\d\d$/.test(F.d)) { if (err) err.textContent = "Pick a date"; return; }
    const v = Math.round(s * 100) * (F.kind === "out" ? -1 : 1), row = { d: F.d, v, c: F.cat, n: F.n.trim(), cur: F.cur }, id = V.edit;
    if (id && id !== "new") {
      const old = SP.get(id);
      V.edit = null;
      fresh = id;
      SP.update(id, row);
      if (old) toast("Saved " + row.c + " " + M.money(v, F.cur), () => SP.update(id, { d: old.d, v: old.v, c: old.c, n: old.n, cur: M.curOf(old) }));
      return;
    }
    // 新记的：记上以后这一行收起来（她要的：记完自己收回去）；焦点回到 + Add，要接着记再按 N / 回车
    Object.assign(F, { v: "", n: "" });
    V.edit = null;
    renderAdd();
    const e = SP.add({ id: SP.newId(), ...row });
    fresh = e.id;
    toast("Added " + e.c + " " + M.money(e.v, M.curOf(e)), () => SP.remove(e.id));
    $('[data-act="add"]')?.focus({ preventScroll: true });
  }
  function del(id) {
    const e = SP.remove(id);
    if (e) toast("Deleted " + e.c + " " + M.money(e.v, M.curOf(e)), () => { fresh = e.id; SP.restore(e); });
  }

  // 新记一笔那一行开着、还什么都没打：点到它外面就收起来（打了字的留着，免得一下点丢）
  document.addEventListener("pointerdown", (e) => {
    if (V.edit !== "new" || !root.isConnected || e.target.closest?.(".sp-addbar, [data-act=add], .menu, #modal, #toast")) return;
    readForm();
    if (!String(F.v).trim() && !String(F.n).trim()) closeForm();
  }, true);

  // ---------- 换期间 ----------
  function shift(k) {
    if (V.mode === "life") return;
    let { y, m } = V.cur;
    if (V.mode === "month") ({ y, m } = M.addMonths(y, m, k)); else y += k;
    if (y < 2000 || y > todayP().y + 5) return;
    V.cur = { y, m, d: 1 };
    V.filt = null; V.all = false; V.edit = null; V.recent = false;
    render(true);
    if (!quiet()) $("[data-title]").animate([{ transform: "translateX(" + k * 10 + "px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 280, easing: "cubic-bezier(.16, 1, .3, 1)" });
  }

  function render(animate = false) {
    renderHead();
    if (V.mode === "life") { renderLife(); renderAdd(); return; }
    const c = renderChart(animate);
    renderKpis(c);
    renderCats();
    renderTable();
    renderAdd();
  }

  // ---------- 点哪儿做什么 ----------
  root.addEventListener("click", (e) => {
    const segBtn = e.target.closest("[data-seg] > button");
    if (segBtn) {
      const name = segBtn.parentNode.dataset.seg, v = segBtn.dataset.v;
      if (name === "mode" && v !== V.mode) {
        V.mode = v;
        const t = todayP();
        if (v === "month" && V.cur.y === t.y) V.cur = { y: t.y, m: t.m, d: 1 };
        V.filt = null; V.all = false; V.edit = null;
        render(true);
      } else if (name === "side" && v !== V.side) { V.side = v; renderCats(); }
      return;
    }
    const cat = e.target.closest("[data-cat]");
    if (cat) { V.filt = V.filt === cat.dataset.cat ? null : cat.dataset.cat; V.all = false; V.edit = null; renderCats(); renderTable(); return; }
    const rec = e.target.closest("[data-rec]");
    if (rec) {
      const x = SP.add({ id: SP.newId(), d: F.d || entryDate(), v: Number(rec.dataset.v), c: rec.dataset.c, n: rec.dataset.n || "", cur: rec.dataset.cur });
      fresh = x.id;
      toast("Added " + x.c + " " + M.money(x.v, M.curOf(x)), () => SP.remove(x.id));
      return;
    }
    const a = e.target.closest("[data-act]");
    if (!a) {
      const row = e.target.closest(".sp-row");
      if (row && !window.getSelection()?.toString()) startEdit(row.dataset.id);
      return;
    }
    const act = a.dataset.act, rowId = a.closest("[data-id]")?.dataset.id;
    if (act === "prev") shift(-1);
    else if (act === "next") shift(1);
    else if (act === "now") { V.cur = todayP(); V.filt = null; V.all = false; V.edit = null; V.recent = false; render(true); }
    else if (act === "recent") { V.recent = !V.recent; V.all = false; V.edit = null; renderTable(); }
    else if (act === "add") startNew();
    else if (act === "set") openSettings();
    else if (act === "set-years") { SET.tab = "years"; openSettings(); }
    else if (act === "edit" && rowId) startEdit(rowId);
    else if (act === "del" && rowId) del(rowId);
    else if (act === "sign") { readForm(); F.kind = F.kind === "out" ? "in" : "out"; F.cat = firstCat(F.kind); if (V.edit === "new") renderAdd(true); else renderTable(); focusAmount(); }
    else if (act === "save") saveForm();
    else if (act === "cancel") closeForm();
    else if (act === "fdel") { const id = V.edit; V.edit = null; renderTable(); if (id && id !== "new") del(id); }
    else if (act === "unfilt") { V.filt = null; renderCats(); renderTable(); }
    else if (act === "unq") { V.q = ""; $("[data-q]").value = ""; renderTable(); }
    else if (act === "all") { V.all = true; renderTable(); }
  });
  root.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t.closest?.(".sp-form")) {
      if (e.key === "Enter" && !t.matches("select, button")) { e.preventDefault(); saveForm(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeForm(); }
    } else if (t.matches?.("[data-q]") && e.key === "Escape") { e.preventDefault(); V.q = ""; t.value = ""; renderTable(); t.blur(); }
    else if (t.matches?.(".sp-row") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); startEdit(t.dataset.id); }
    else if (t.matches?.(".sp-row") && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); del(t.dataset.id); }
  });
  root.addEventListener("input", (e) => {
    if (e.target.matches("[data-q]")) { V.q = e.target.value; V.all = false; V.edit = null; renderTable(); }
    else if (e.target.matches('[data-f="v"]')) { const err = $("[data-ferr]"); if (err) err.textContent = ""; }
  });
  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-show]")) { setShowCur(e.target.value); wantRate(e.target.value); return; }
    if (e.target.matches('.sp-form [data-f="cur"]')) { F.cur = e.target.value; if (V.edit === "new") SP.setInCur(F.cur); wantRate(F.cur); return; }
    if (!e.target.matches('.sp-form [data-f="c"]')) return;
    F.cat = e.target.value;
    // 选了另一组的类别：支出 / 收入跟着换，只换左边那格（打了的数、备注不动）
    const k = e.target.selectedOptions[0]?.dataset.k, sign = $(".sp-form .sp-sign");
    if (k && k !== F.kind) { F.kind = k; if (sign) sign.outerHTML = signHTML(); }
    const used = M.notesOf(SP.entries(), F.cat), note = $('.sp-form [data-f="n"]');
    if (note) note.placeholder = used[0] ? "e.g. " + used[0] : "Note";
  });

  // 选了一种还没填过汇率的钱：在后台拉一下欧洲央行当天的（没网就先用粗略的那个）
  const wantRate = (k) => { if (!M.rateSet(fx(), k)) fetchRates([k], true).catch(() => {}); };

  // ---------- 设定（苦昼短的弹窗） ----------
  const SET = { tab: "budget", catKind: "out", expM: null };
  function setHTML() {
    const tabs = [["budget", "Budget"], ["cats", "Categories"], ["currency", "Currency"], ["years", "Years"], ["export", "Export"], ["import", "Import"]];
    const [st, bad] = statusText();
    return '<h3>Spending settings</h3><div class="sp-sett"><span class="seg">' + tabs.map(([k, l]) => '<button type="button" data-sact="tab" data-v="' + k + '"' + (SET.tab === k ? ' class="on"' : "") + ">" + l + "</button>").join("") + "</span></div>" +
      '<div class="sp-setb">' + setBody() + '</div><p class="msub sp-sets' + (bad ? " bad" : "") + '">' + esc(st) + " · Totals in " + esc(curLabel(SP.show())) + "</p>";
  }
  function setBody() {
    const t = todayP();
    if (SET.tab === "budget") {
      // 每个预算按当时用的那种钱记（澳洲那两年澳币、国内人民币、现在加币）；从哪个月起：年、月分开选，最早 2000 年
      const pts = SP.budgets().slice().reverse(), curSel = (attr, k) => '<select ' + attr + ' aria-label="Currency">' + M.CURS.map((c) => '<option value="' + c.k + '"' + (c.k === k ? " selected" : "") + ">" + c.code + "</option>").join("") + "</select>";
      const last = pts[0], years = Array.from({ length: t.y + 2 - 2000 }, (_, i) => t.y + 1 - i);
      return '<p class="msub">Each month uses the latest budget set on or before it, in the currency you lived on then. Base categories (like House) are the bottom of the trapezoid; ones marked “not in budget” don\'t count against it.</p>' +
        '<div class="sp-setrow"><label>From <select data-nby aria-label="Year">' + years.map((y) => '<option' + (y === t.y ? " selected" : "") + ">" + y + "</option>").join("") + '</select></label><select data-nbmo aria-label="Month">' + M.MONTH.map((n, i) => '<option value="' + (i + 1) + '"' + (i + 1 === t.m ? " selected" : "") + ">" + n + "</option>").join("") + "</select>" +
        '<input class="num sp-bv" data-nbv inputmode="decimal" placeholder="3580.00" aria-label="Amount a month">' + curSel("data-nbc", last?.cur || "cad") + '<button type="button" class="btn" data-sact="nbs">Set budget</button></div>' +
        '<details class="sp-paste"><summary>Paste several</summary><p class="msub">One per line: month, amount, and the currency when it changes — it carries on to the lines below. “Prior” is the one before all others.</p>' +
        '<textarea data-bpaste rows="6" spellcheck="false" placeholder="Prior 2000 (AUD)&#10;2018.08 5000 (RMB)&#10;2020.09 9100&#10;2023.09 2720 (CAD)"></textarea><div class="sp-setrow"><button type="button" class="btn" data-sact="bpaste">Add these</button><span class="msub" data-bpr></span></div></details>' +
        (pts.length ? '<table class="mtable"><thead><tr><th>From</th><th class="r">Per month</th><th></th><th></th></tr></thead><tbody>' + pts.map((x) => {
          const p = M.parts(x.from + "-01");
          return "<tr><td>" + M.MONTH[p.m - 1] + " " + p.y + '</td><td class="r"><input class="num sp-bv" data-bpv="' + x.from + '" value="' + (x.v / 100).toFixed(2) + '" inputmode="decimal" aria-label="Budget from ' + M.MONTH[p.m - 1] + " " + p.y + '"></td><td>' + curSel('data-bcur="' + x.from + '"', x.cur || "cad") + '</td><td class="r"><button type="button" class="link" data-sact="bprm" data-from="' + x.from + '">Remove</button></td></tr>';
        }).join("") + "</tbody></table>" : '<p class="msub">No budget yet.</p>');
    }
    if (SET.tab === "cats") {
      const all = SP.cats(), mine = all.filter((c) => c.kind === SET.catKind), cnt = new Map();
      for (const e of SP.entries()) cnt.set(e.c, (cnt.get(e.c) || 0) + 1);
      const row = (c) => '<tr' + (c.hidden ? ' class="dim"' : "") + '><td><input class="sp-cin" data-rn="' + esc(c.name) + '" value="' + esc(c.name) + '" aria-label="Rename ' + esc(c.name) + '"></td>' +
        // 预算里怎么算：— = 照常；base = 梯形下面那一截（房租这类）；not in budget = 算支出、不算进预算（押金这类）。收入类没有这一格
        "<td>" + (c.kind === "out" ? '<select class="sp-role" data-role="' + esc(c.name) + '" aria-label="How ' + esc(c.name) + ' counts in the budget">' + [["", "—"], ["base", "base"], ["outside", "not in budget"]].map(([v, l]) => '<option value="' + v + '"' + ((c.role || "") === v ? " selected" : "") + ">" + l + "</option>").join("") + "</select>" : "") + '</td><td class="r num">' + (cnt.get(c.name) || 0) + "</td>" +
        '<td class="r">' + (cnt.get(c.name) ? '<button type="button" class="link" data-sact="hide" data-c="' + esc(c.name) + '">' + (c.hidden ? "Show" : "Hide") + "</button>" : '<button type="button" class="link sp-warn" data-sact="cdel" data-c="' + esc(c.name) + '">Delete</button>') + "</td></tr>";
      return '<div class="sp-setrow"><span class="seg">' + [["out", "Expense"], ["in", "Income"]].map(([k, l]) => '<button type="button" data-sact="catk" data-v="' + k + '"' + (SET.catKind === k ? ' class="on"' : "") + ">" + l + "</button>").join("") + "</span></div>" +
        '<table class="mtable"><thead><tr><th>Name</th><th>' + (SET.catKind === "out" ? "Budget" : "") + '</th><th class="r">Records</th><th></th></tr></thead><tbody>' + mine.filter((c) => !c.hidden).map(row).join("") + mine.filter((c) => c.hidden).map(row).join("") + "</tbody></table>" +
        '<div class="sp-setrow"><input class="sp-cin" data-newcat placeholder="New category" aria-label="New category name"><button type="button" class="btn" data-sact="addcat">Add</button></div>' +
        '<p class="msub">Budget: <b>base</b> is the bottom of the trapezoid (like House); <b>not in budget</b> still counts as spending but not against the budget (like Bonds). Records = how many transactions use it. Used ones can be hidden (kept for old records, not offered when adding); unused ones can be deleted.</p>';
    }
    if (SET.tab === "currency") {
      const R = RATES();
      return '<p class="msub">Each record keeps the currency it was paid in. Totals, the chart and the budget are shown in one currency (on this computer); budgets are set in CAD.</p>' +
        '<div class="sp-setrow"><label>Show totals in <select data-sshow>' + M.CURS.map((c) => '<option value="' + c.k + '"' + (c.k === SP.show() ? " selected" : "") + ">" + c.code + " " + c.sym + "</option>").join("") + "</select></label>" +
        '<label>New records in <select data-sin>' + M.CURS.map((c) => '<option value="' + c.k + '"' + (c.k === SP.inCur() ? " selected" : "") + ">" + c.code + " " + c.sym + "</option>").join("") + "</select></label></div>" +
        '<table class="mtable"><thead><tr><th>1 CAD =</th><th class="r">Rate</th><th>From</th></tr></thead><tbody>' + M.CURS.filter((c) => c.k !== "cad").map((c) =>
          "<tr><td>" + esc(c.code) + ' <span class="msub">' + esc(c.sym) + '</span></td><td class="r"><input class="num sp-bv" data-rate="' + c.k + '" value="' + R[c.k] + '" inputmode="decimal" aria-label="' + esc(c.code) + ' for one Canadian dollar"></td><td class="msub">' + esc(rateNote(c.k)) + "</td></tr>").join("") + "</tbody></table>" +
        '<div class="sp-setrow"><button type="button" class="btn" data-sact="ecb">Use today\'s rates</button><span class="msub" data-ecbr>From the European Central Bank (frankfurter.dev), only when you click. “rough” = not set yet.</span></div>';
    }
    if (SET.tab === "years") return yearsSetHTML();
    if (SET.tab === "export") {
      const e = SET.expM || (SET.expM = { y: V.cur.y, m: V.mode === "year" ? (V.cur.y === t.y ? t.m : 12) : V.cur.m });
      return '<div class="sp-setrow"><button type="button" class="btn ghosty" data-sact="exp" aria-label="Earlier month">‹</button><b class="sp-expm">' + M.MONTH[e.m - 1] + " " + e.y + '</b><button type="button" class="btn ghosty" data-sact="exn" aria-label="Later month">›</button>' +
        '<button type="button" class="btn" data-sact="exgo">Export this month (.md)</button><button type="button" class="btn ghosty" data-sact="exall">Everything as one .md</button></div>' +
        '<pre class="sp-md" data-mdp hidden></pre><p class="msub">The tables can be imported back (Import).</p>';
    }
    return '<p class="msub">Paste an exported .md, or one line per record: date, category, amount, note. Income categories count as income; a + in front of the amount does too.</p>' +
      '<textarea class="sp-imp" data-imp rows="7" placeholder="2026-10-03, Food, 23.15, lunch&#10;2026-10-05, Salary, 2400&#10;Oct 6, 2026, Traffic, 3.30, presto"></textarea>' +
      '<div class="sp-setrow"><button type="button" class="btn" data-sact="impgo">Import</button><span class="msub" data-impr></span></div>';
  }
  function renderSet() {
    const box = modalSheet()?.querySelector(".sp-set");
    if (box) box.innerHTML = setHTML();
  }
  function shareFile(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function addCat(input) {
    const n = input?.value.trim();
    if (!n) return;
    if (SP.cats().some((c) => c.name.toLowerCase() === n.toLowerCase())) { toast(n + " is already there"); return; }
    SP.setCats([...SP.cats(), { name: n, kind: SET.catKind, hidden: false, role: "" }]);
    renderSet();
    modalSheet()?.querySelector("[data-newcat]")?.focus();
  }
  function openSettings() {
    SET.expM = null;
    const sheet = openModal('<div class="sp-set">' + setHTML() + "</div>", { wide: true });
    sheet.addEventListener("click", (e) => {
      const b = e.target.closest("[data-sact]");
      if (!b) return;
      const act = b.dataset.sact;
      if (act === "tab") { SET.tab = b.dataset.v; renderSet(); }
      else if (act === "catk") { SET.catKind = b.dataset.v; renderSet(); }
      else if (act === "bprm") { const before = SP.budgets(); SP.setBudgets(before.filter((x) => x.from !== b.dataset.from)); renderSet(); toast("Budget removed", () => { SP.setBudgets(before); renderSet(); }); }
      else if (act === "nbs") {
        const q = (s) => sheet.querySelector(s).value, v = M.toCents(q("[data-nbv]")), from = M.ym(+q("[data-nby]"), +q("[data-nbmo]")), cur = q("[data-nbc]");
        if (!(v > 0)) { sheet.querySelector("[data-nbv]").focus(); return; }
        SP.setBudgets([...SP.budgets().filter((x) => x.from !== from), { from, v, cur }]);
        renderSet();
        toast("Budget saved");
      }
      else if (act === "bpaste") {
        // Prior = 最早那一笔账的那个月（还没有账就 2000 年 1 月）
        const first = SP.entries().reduce((m, e) => (e.d < m ? e.d : m), "9999"), prior = first < "9999" ? first.slice(0, 7) : "2000-01";
        const r = M.budgetsFromText(sheet.querySelector("[data-bpaste]").value, prior), before = SP.budgets();
        if (r.list.length) {
          const by = new Map(before.map((x) => [x.from, x]));
          for (const x of r.list) by.set(x.from, x);
          SP.setBudgets([...by.values()]);
          renderSet();
          toast("Added " + r.list.length + (r.list.length === 1 ? " budget" : " budgets") + (r.bad ? " · " + r.bad + " line" + (r.bad === 1 ? "" : "s") + " skipped" : ""), () => { SP.setBudgets(before); renderSet(); });
        } else sheet.querySelector("[data-bpr]").textContent = "Nothing to add — check the lines";
      }
      else if (act === "hide") { SP.setCats(SP.cats().map((c) => (c.name === b.dataset.c ? { ...c, hidden: !c.hidden } : c))); renderSet(); }
      else if (act === "cdel") { const before = SP.cats(); SP.setCats(before.filter((c) => c.name !== b.dataset.c)); renderSet(); toast("Deleted " + b.dataset.c, () => { SP.setCats(before); renderSet(); }); }
      else if (act === "addcat") addCat(sheet.querySelector("[data-newcat]"));
      else if (act === "yhomes") { saveYears({ homes: sheet.querySelector("[data-yhomes]").value }, "Saved where you lived"); }
      else if (act === "yhreset") { saveYears({ homes: Y.DEFAULT_HOMES }, "Back to the default places"); renderSet(); }
      else if (act === "ecb") {
        const note = sheet.querySelector("[data-ecbr]");
        note.textContent = "Getting today's rates…";
        fetchRates().then((d) => { renderSet(); toast("Rates from the ECB · " + M.fmtDate(d)); }).catch(() => { note.textContent = "Couldn't reach the ECB. Check the connection, or type the rates in."; });
      }
      else if (act === "exp" || act === "exn") { SET.expM = M.addMonths(SET.expM.y, SET.expM.m, act === "exp" ? -1 : 1); renderSet(); }
      else if (act === "exgo" || act === "exall") {
        const which = act === "exgo" ? SET.expM : null, md = M.toMarkdown(SP.entries(), SP.cats(), SP.budgets(), which, today(), SP.show(), RATES()), pre = sheet.querySelector("[data-mdp]");
        pre.hidden = false;
        pre.textContent = md.split("\n").slice(0, 18).join("\n") + (md.split("\n").length > 18 ? "\n…" : "");
        shareFile(which ? "spending-" + M.ym(which.y, which.m) + ".md" : "spending-all-" + today() + ".md", md);
      }
      else if (act === "impgo") {
        const r = M.fromText(sheet.querySelector("[data-imp]").value, SP.cats());
        if (r.added.length) SP.setCats([...SP.cats(), ...r.added]);
        const made = r.rows.length ? SP.addMany(r.rows) : [];
        sheet.querySelector("[data-impr]").textContent = made.length + " imported" + (r.bad ? " · " + r.bad + " line" + (r.bad === 1 ? "" : "s") + " skipped" : "") + (r.added.length ? " · new categories: " + r.added.map((c) => c.name).join(", ") : "");
        if (made.length) { sheet.querySelector("[data-imp]").value = ""; toast("Imported " + made.length + " records", () => SP.removeMany(made.map((x) => x.id))); }
      }
    });
    sheet.addEventListener("change", (e) => {
      const t = e.target;
      if (t.matches("[data-bpv]")) {
        const v = M.toCents(t.value);
        if (v > 0) { SP.setBudgets(SP.budgets().map((x) => (x.from === t.dataset.bpv ? { ...x, v } : x))); toast("Budget saved"); }
      } else if (t.matches("[data-bcur]")) {
        SP.setBudgets(SP.budgets().map((x) => (x.from === t.dataset.bcur ? { ...x, cur: t.value } : x))); toast("Budget saved");
      } else if (t.matches("[data-rn]")) {
        const from = t.dataset.rn, to = t.value.trim();
        if (!to || SP.cats().some((c) => c.name.toLowerCase() === to.toLowerCase() && c.name !== from)) { t.value = from; return; }
        if (to !== from) { SP.renameCat(from, to); if (V.filt === from) V.filt = to; renderSet(); }
      } else if (t.matches("[data-rate]")) {
        const v = parseFloat(String(t.value).replace(/[^\d.]/g, ""));
        if (v > 0) { setRate(t.dataset.rate, v); toast("1 CAD = " + v + " " + curLabel(t.dataset.rate)); } else t.value = RATES()[t.dataset.rate];
      } else if (t.matches("[data-sshow]")) { setShowCur(t.value); wantRate(t.value); renderSet(); }
      else if (t.matches("[data-role]")) {
        const before = SP.cats(), name = t.dataset.role, role = t.value;
        SP.setCats(before.map((c) => (c.name === name ? { ...c, role } : c)));
        renderSet();
        toast(name + (role === "base" ? " is the base now" : role === "outside" ? " no longer counts against the budget" : " counts as usual"), () => { SP.setCats(before); renderSet(); });
      }
      else if (t.matches("[data-sin]")) { SP.setInCur(t.value); wantRate(t.value); }
      else if (t.matches("[data-ybase]")) { saveYears({ base: Number(t.value) }, Number(t.value) + " is ×1 now"); renderSet(); }
      else if (t.matches("[data-ycpi]")) { const v = parseFloat(String(t.value).replace(/[^\d.-]/g, "")); if (Number.isFinite(v)) saveYears({ cpi: v }, "Inflation " + v + "% a year"); else t.value = Y.settings(yearsCfg()).cpi; }
      else if (t.matches("[data-ytot]")) {
        const y = t.dataset.ytot, totals = { ...(yearsCfg().totals || {}) }, v = t.value.trim();
        if (v) totals[y] = v; else delete totals[y];
        saveYears({ totals }, v ? "Saved " + y : "Cleared " + y);
        const bad = v ? Y.parseTotal(v).bad : [];
        t.classList.toggle("bad", bad.length > 0);
        t.title = bad.length ? "Couldn't read: " + bad.join(", ") : "";
      } else if (t.matches("[data-ycpiy]")) {
        const y = t.dataset.ycpiy, cpiBy = { ...(yearsCfg().cpiBy || {}) }, v = parseFloat(String(t.value).replace(/[^\d.-]/g, ""));
        if (Number.isFinite(v)) cpiBy[y] = v; else { delete cpiBy[y]; t.value = ""; }
        saveYears({ cpiBy }, Number.isFinite(v) ? "Inflation in " + y + ": " + v + "%" : "Inflation in " + y + " back to the default");
      } else if (t.matches("[data-yrate]")) {
        const v = parseFloat(String(t.value).replace(/[^\d.]/g, "")), k = t.dataset.yrate;
        if (v > 0) saveYears({ rates: { ...(yearsCfg().rates || {}), [k]: v } }, "1 " + curLabel(k) + " = " + v + " RMB on the chart"); else t.value = Y.settings(yearsCfg()).rates[k];
      }
    });
    sheet.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (e.target.matches("[data-newcat]")) { e.preventDefault(); addCat(e.target); }
      else if (e.target.matches("[data-nbv]")) { e.preventDefault(); sheet.querySelector('[data-sact="nbs"]')?.click(); }
      else if (e.target.matches("[data-bpv], [data-rn], [data-rate], [data-ytot], [data-ycpi], [data-ycpiy], [data-yrate]")) { e.preventDefault(); e.target.blur(); }
    });
  }

  // ---------- 对外 ----------
  // 宽度变了：图表按新的宽度重画，分段开关的滑块重新对齐
  let lastW = 0;
  if (typeof ResizeObserver === "function") new ResizeObserver(() => {
    if (!shown || !root.isConnected || root.clientWidth === lastW) return;
    lastW = root.clientWidth;
    if (V.mode === "life") renderLife(); else renderChart(false);
    segTo("mode", V.mode);
    segTo("side", V.side);
  }).observe(root);

  function refresh() {
    if (!shown) return;
    renderHead();
    if (V.mode === "life") {
      renderLife();
      renderAdd();
      if (modalSheet()?.querySelector(".sp-set") && !modalSheet().contains(document.activeElement?.closest?.("input, textarea") || null)) renderSet();
      return;
    }
    const c = renderChart(false);
    renderKpis(c);
    renderCats();
    // 正在原地改的那一行有光标：先不重画流水（同步回来之类），收起那一行的时候再画
    if (!(V.edit && V.edit !== "new" && $("tr.sp-form")?.contains(document.activeElement))) renderTable();
    renderAdd();
    if (modalSheet()?.querySelector(".sp-set") && !modalSheet().contains(document.activeElement?.closest?.("input, textarea") || null)) renderSet();
  }
  // 每次进 Spending 页：数从头滚、图表画一遍
  function show() {
    shown = true;
    V.nohouse = false;   // 每次进来图都是完整的（包括 House）
    requestAnimationFrame(() => { lastW = root.clientWidth; render(true); });
  }
  const focusSearch = () => { const q = $("[data-q]"); q.focus(); q.select(); };
  return { el: root, show, refresh, startNew, focusSearch, formOpen: () => Boolean(V.edit) };
}
