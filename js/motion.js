// 用户亲手点了什么之后的那一次重画：用浏览器自带的 View Transitions，让任务行、进度条、浮条平滑挪到新的样子，
// 而不是一闪就变。只有点按钮的地方先调 animateNext()；同步拉下来的重画、每秒的计时都不过渡。
// 浏览器不支持、系统开了「减弱动态效果」时照常直接画。

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
let want = "", at = 0;

// kind："on" 普通（行挪位、淡入淡出）/ "page" 换页 / "next" "prev" 翻到后一天、前一天（列表左右滑）
export function animateNext(kind = "on") { want = kind; at = performance.now(); }
// 没人要过渡的时候才要一个普通的（点分段开关用：它自己的处理已经要了换页 / 翻天的，就不改）
export function animateSoft() { if (!want || performance.now() - at >= 500) animateNext("on"); }

// 这次重画要不要过渡：标记只管半秒，过期了就当没有（免得之后某次同步重画莫名其妙动一下）
export function takeTransition() {
  const k = want && performance.now() - at < 500 ? want : "";
  want = "";
  return document.startViewTransition && !reduce.matches ? k : "";
}

// 白天夜里互换的那一下（kind "theme"，整页慢慢淡过去），另外有两样，样子都在 css 里：
// 底边泛一阵霞光（#dusk，朝霞 / 晚霞两种颜色，过渡里出现一下就拿掉）；那颗日月（.ball）一落一升——太阳落下去、月亮升上来，反过来也一样
export function dusk(dark) {
  document.getElementById("dusk")?.remove();
  const el = document.createElement("i");
  el.id = "dusk";
  el.setAttribute("aria-hidden", "true");
  el.dataset.k = dark ? "dusk" : "dawn";   // 进夜里是晚霞，进白天是朝霞，颜色不一样
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);   // 霞光那段动画是 3s（css 的 #dusk::before）
}

// 过渡里每一行单独挪动：给行起名字（安全线进度条、浮条的名字写在 CSS 里）；换页、翻天时整块动，先把名字摘掉
export function nameParts(root, on) {
  root.querySelectorAll(".row[data-id]").forEach((r) => { r.style.viewTransitionName = on ? "r-" + r.dataset.id.replace(/[^\w-]/g, "_") : ""; });
}

// 系统要求减少动态、或设置里关了 Sparkles（html.fx-off，js/fx.js 的 setFx）：下面这些小动作都不放
const quiet = () => reduce.matches || document.documentElement.classList.contains("fx-off");
export const SPRING = "linear(0, .035, .121, .233, .354, .473, .582, .679, .761, .829, .883, .924, .956, .979, .994, 1.005, 1.011, 1.014, 1.015, 1.015, 1.014, 1.012, 1.01, 1.008, 1.007, 1.005, 1.004, 1.003, 1)";   // 同 css 的 --spring

// ---------- 选中的那块滑过去 ----------
// 分段开关（.seg）选中的那段、侧栏当前页底下各垫一块（.seg-pill / .snav-pill）。整页是 innerHTML 重画的，所以重画前量一次、重画后量一次，
// 用户点过的那次重画就从旧的位置滑到新的（弹簧）：侧栏在换页时滑，分段开关在同一页里点了才滑（换了页，第几个开关就对不上了）
export function measurePills() {
  const m = new Map(), side = document.querySelector("#side .snav-pill");
  if (side) m.set("side", side.getBoundingClientRect());
  document.querySelectorAll("#main .seg").forEach((s, i) => { const p = s.querySelector(":scope > .seg-pill"); if (p) m.set("seg" + i, [p.offsetLeft, p.offsetWidth]); });
  return m;
}

// 每次画完把分段开关的那块放到选中那段底下（没有选中的就拿掉）
export function placePills() {
  document.querySelectorAll(".seg").forEach((s) => {
    const on = s.querySelector(":scope > .on");
    let p = s.querySelector(":scope > .seg-pill");
    if (!on) { p?.remove(); return; }
    if (!p) { p = document.createElement("i"); p.className = "seg-pill"; p.setAttribute("aria-hidden", "true"); s.prepend(p); }
    p.style.left = on.offsetLeft + "px";
    p.style.width = on.offsetWidth + "px";
  });
}

export function glidePills(before, kind) {
  if (!before || quiet()) return;
  const opt = { duration: 420, easing: SPRING };
  const side = document.querySelector("#side .snav-pill"), was = before.get("side");
  if (kind === "page" && side && was) {
    const r = side.getBoundingClientRect(), dx = was.left - r.left, dy = was.top - r.top;
    if (dx || dy) side.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }], opt);
  }
  if (kind !== "on") return;
  document.querySelectorAll("#main .seg").forEach((s, i) => {
    const p = s.querySelector(":scope > .seg-pill"), o = before.get("seg" + i);
    if (!p || !o || (o[0] === p.offsetLeft && o[1] === p.offsetWidth)) return;
    p.animate([{ left: o[0] + "px", width: o[1] + "px" }, { left: p.offsetLeft + "px", width: p.offsetWidth + "px" }], opt);
  });
}

// ---------- 大数字一位一位滚过去 ----------
// 带 data-roll 的数字（今天页那个大数字；值里带着日期，翻到别的日子不算「变了」）：和上次画的不一样时，每一位从旧的数滚到新的数，
// 滚完换回普通的字。位数变了从右边对齐，多出来的那几位直接出现
const rolled = new Map();
const COLUMN = Array.from({ length: 10 }, (_, d) => "<span>" + d + "</span>").join("");
export function rollNumbers() {
  document.querySelectorAll("#main [data-roll]").forEach((el) => {
    const key = el.dataset.roll, now = el.textContent, was = rolled.get(key);
    rolled.set(key, now);
    if (was === undefined || was === now || quiet() || !/^\d+$/.test(now + was)) return;
    if (el.querySelector(".rl")) return;
    const shift = now.length - was.length;
    el.setAttribute("aria-label", now);
    // 原来的字留着但看不见（撑住宽度和基线，旁边的「/ 365 min」不跳），滚的那几列浮在它上面
    el.innerHTML = '<span class="rl-ghost">' + now + '</span><span class="rl" aria-hidden="true">' +
      [...now].map((d, i) => '<span class="dg"><span style="transform:translateY(-' + (i - shift >= 0 ? was[i - shift] : d) + 'em)">' + COLUMN + "</span></span>").join("") + "</span>";
    void el.offsetWidth;
    el.querySelectorAll(".dg > span").forEach((c, i) => { c.style.transform = "translateY(-" + now[i] + "em)"; });
    setTimeout(() => { if (el.isConnected && el.getAttribute("aria-label") === now) { el.textContent = now; el.removeAttribute("aria-label"); } }, 700);
  });
}

// ---------- 换页 / 翻天时的标题 ----------
// 夜里：标题的字先是一串乱码，从左到右一个个解出来（0.4 秒）；白天：粉、蓝两版错开着落下来对准（丝网印套色，样子在 css 的 .reg）
const GLYPHS = "<>/\\_=+*#01░▒";
export function titleIn() {
  const h = document.querySelector("#main .page-head h2");
  if (!h || quiet()) return;
  if (document.documentElement.dataset.theme !== "dark") {
    h.classList.remove("reg");
    void h.offsetWidth;
    h.classList.add("reg");
    return;
  }
  const node = [...h.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
  if (!node) return;
  const text = node.textContent, box = document.createElement("span"), N = 14;
  box.className = "scr";
  node.replaceWith(box);
  let f = 0;
  const step = () => {
    f++;
    box.innerHTML = [...text].map((c, i) => (c === " " || i < f * text.length / N ? c.replace(/[<>&]/g, (x) => "&#" + x.charCodeAt(0) + ";") : "<b>" + GLYPHS[Math.random() * GLYPHS.length | 0].replace(/[<>&]/g, (x) => "&#" + x.charCodeAt(0) + ";") + "</b>")).join("");
    if (f < N && box.isConnected) setTimeout(step, 30);
    else if (box.isConnected) box.replaceWith(document.createTextNode(text));
  };
  step();
}

// ---------- 夜里主卡片的边跟着鼠标亮 ----------
// 只在电脑（有鼠标悬停）、夜里：鼠标在哪张主卡片上，那张卡离鼠标近的那一段边亮起青柠（css 的 .edge-glow：--mx / --my 画的一圈渐变，只露出边框那 1px）。
// 光画在卡片里专门的一层上，只改这一层的 --mx / --my——改在卡片上的话，卡片里每一行都得跟着重算样式
export function initEdgeGlow() {
  if (!matchMedia("(hover: hover)").matches) return;
  let card = null, glow = null, x = 0, y = 0, queued = false;
  const layer = (c) => {
    let g = c.querySelector(":scope > .edge-glow");
    if (!g) { g = document.createElement("i"); g.className = "edge-glow"; g.setAttribute("aria-hidden", "true"); c.appendChild(g); }
    return g;
  };
  const paint = () => {
    queued = false;
    if (!card?.isConnected) return;
    glow = layer(card);
    const r = card.getBoundingClientRect();
    glow.style.setProperty("--mx", (x - r.left).toFixed(0) + "px");
    glow.style.setProperty("--my", (y - r.top).toFixed(0) + "px");
  };
  addEventListener("pointermove", (e) => {
    if (document.documentElement.dataset.theme !== "dark" || quiet()) return;
    const c = e.target.closest?.(".today-main, .pcard, .goals") || null;
    if (card && c !== card && glow) { glow.style.removeProperty("--mx"); glow.style.removeProperty("--my"); glow = null; }
    card = c; x = e.clientX; y = e.clientY;
    if (card && !queued) { queued = true; requestAnimationFrame(paint); }
  }, { passive: true });
}

// 手机今天页换天：日期条上选中的标记（.dmark）从原来那天弹着滑到新的那天，下面的清单按方向滑进来。
// before = 换之前标记的 offsetLeft；dir = 1 往后翻 / −1 往前翻。不靠 View Transitions（iPhone 上不一定有）
export function slideDay(before, dir) {
  if (quiet()) return;
  const mark = document.querySelector(".daystrip .dmark");
  if (mark && before !== null && before !== undefined && before !== mark.offsetLeft) mark.animate([{ transform: "translateX(" + (before - mark.offsetLeft) + "px)" }, { transform: "none" }], { duration: 480, easing: SPRING });
  const list = document.querySelectorAll(".phone-day .list, .phone-day .stripmeta, .phone-day .strip");
  if (dir) list.forEach((el) => el.animate([{ transform: "translateX(" + dir * 28 + "px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 320, easing: "cubic-bezier(.16, 1, .3, 1)" }));
}
