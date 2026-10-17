// 底图上偶尔经过的小东西（挂在 #sky 里，从侧栏、卡片、计时浮条后面过；#sky 是 js/fx.js 建的）：
//   飞机，3–5 分钟一趟：白天是高空的一个小点拖两道长尾迹；夜里是红眼航班——一闪一闪的红灯加一颗小白灯
//   潮水，6–10 分钟一次：又宽又矮的一片水贴着底边从右下角斜着滑进来、再退回去，一次两道；夜里是荧光海
//   少见的那样，10–15 分钟一次：白天按季节飘东西（春嫩叶、夏康乃馨、秋枫叶、冬雪花，有风时一两片会打个小旋）；夜里一阵流星雨
// 各管各的（2026-10-17 她说的「随机性的美」）：每样按自己的节奏来，撞上了就一起出现，不再一次只放一样。
// 平时只挂一个定时器，没有常驻的动画；东西只动 transform / opacity，放完就拿掉。
// （彩虹 / 极光不在天上随机出现了，改成点开时间饼图时在它后面浮现，在 js/ui/sun.js 和 css 的 .sun-halo）
// 不放：页面在后台、系统要求减少动态、设置里关了动效。手机上只有潮水（手机的任务是直接铺在底色上的，天上那几样会搅在字里）。

// ---------- 排班（只算数，test/sky.test.mjs） ----------

export const GAPS = { plane: [180, 300], tide: [360, 600], rare: [600, 900] };   // 两趟之间隔多久（秒）
// 刚打开时第一趟来得早一点：看一两分钟就走的人也见得到飞机和潮水；少见的、更少见的照常排
export const FIRST = { plane: [20, 60], tide: [60, 180], rare: GAPS.rare };
export const ORDER = ["rare", "tide", "plane"];
const between = ([a, b], rnd) => (a + (b - a) * rnd()) * 1000;

export const firstDue = (now, rnd = Math.random) => Object.fromEntries(ORDER.map((k) => [k, now + between(FIRST[k], rnd)]));

// 现在到点了哪几样 → { kinds, due, wait }：到点的全放（撞在一起就一起出现），各自排到下一趟；wait = 离最近的那一样还有多久
//   can = 现在能放的那几样（手机上只有潮水）：不在里面的不放、也不动它排的时间
export function turn(now, due, rnd = Math.random, can = ORDER) {
  const live = ORDER.filter((k) => can.includes(k));
  if (!live.length) return { kinds: [], due, wait: 60000 };
  const kinds = live.filter((k) => due[k] <= now), next = { ...due };
  for (const k of kinds) next[k] = now + between(GAPS[k], rnd);
  return { kinds, due: next, wait: Math.min(...live.map((k) => next[k])) - now };
}

// 几月飘什么（月份 1–12，用这台设备的当地日期）
export const seasonOf = (month) => (month >= 3 && month <= 4 ? "spring" : month >= 5 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter");

// ---------- 画 ----------

const reduce = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
const R = Math.random;
const pick = ([a, b]) => a + (b - a) * R();
let host = null, timer = 0, due = null, enabled = true, serial = 0;

const night = () => document.documentElement.dataset.theme === "dark";
const phone = () => document.body.classList.contains("phone");
const can = () => (phone() ? ["tide"] : ORDER);   // 手机上只有潮水（任务行直接铺在底图上，别的会搅在字里）
const allowed = () => enabled && !reduce.matches && document.visibilityState === "visible";
const nextIn = () => Math.min(...can().map((k) => due[k])) - Date.now();

function piece(cls, html = "") {
  const el = document.createElement("span");
  el.className = "sky-ev " + cls;
  el.innerHTML = html;
  host.appendChild(el);
  return el;
}

// 一样东西沿一条略斜的直线横穿，头朝前（尾迹拖在后面），speed 是每秒多少像素；返回要多久（毫秒）。
// 元素本身头在右端、绕着头转向（css 的 transform-origin），所以位置都按「头在哪」算：从一边屏幕外进来，整个出了另一边才算完
function cross(cls, html, speed) {
  const el = piece(cls, html), W = innerWidth, H = innerHeight, w = el.offsetWidth, ltr = R() < 0.5;
  const y0 = H * (0.1 + R() * 0.45), y1 = y0 + (R() * 0.12 - 0.09) * H;
  const x0 = ltr ? -20 : W + 20, x1 = ltr ? W + w + 20 : -w - 20;
  const turnTo = " rotate(" + (Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI).toFixed(2) + "deg)";
  const at = (x, y) => ({ transform: "translate(" + (x - w).toFixed(0) + "px," + y.toFixed(0) + "px)" + turnTo });
  const ms = Math.round(Math.hypot(x1 - x0, y1 - y0) / speed * 1000);
  el.animate([at(x0, y0), at(x1, y1)], { duration: ms, easing: "linear" }).onfinish = () => el.remove();
  return ms;
}

// 四季飘的东西：n 几片，size 多宽（px），secs 从顶落到底要几秒，sway 左右摆多少，spin 一路转多少度，colors 三套颜色，svg 画一片
const CARNATION = (c) => '<svg viewBox="0 0 24 28"><path d="M9.2 17.2h5.6l-1.3 9h-3z" fill="#7DBE6A"/><path d="M9.2 17.2 7.6 15.4 10 16.2 12 14.8 14 16.2 16.4 15.4 14.8 17.2z" fill="#68A957"/>' +
  '<path d="M12 18 2.2 9.4 4.4 8.8 3.6 6 6.2 6.5 6.3 3.6 8.7 4.8 9.7 2 12 3.8 14.3 2 15.3 4.8 17.7 3.6 17.8 6.5 20.4 6 19.6 8.8 21.8 9.4Z" fill="' + c[0] + '"/>' +
  '<path d="M12 18 5.6 10.6 7.6 10.4 7.2 8 9.4 8.6 10 6.2 12 7.6 14 6.2 14.6 8.6 16.8 8 16.4 10.4 18.4 10.6Z" fill="' + c[2] + '"/>' +
  '<path d="M12 17.5 8.2 7M12 17.5V5M12 17.5 15.8 7" stroke="' + c[1] + '" stroke-width=".7" stroke-linecap="round" opacity=".6"/></svg>';
const SEASONS = {
  spring: { n: 6, size: [11, 15], secs: [14, 19], sway: 22, spin: [300, 500], colors: ["#B9E27E", "#9FD460", "#CDEBA0"],
    svg: (c) => '<svg viewBox="0 0 20 12"><path d="M1 6C5 0 14 0 19 6C14 12 5 12 1 6Z" fill="' + c + '"/><path d="M3 6H17" stroke="rgba(90,150,50,.55)" stroke-width=".8"/></svg>' },
  summer: { n: 6, size: [14, 19], secs: [15, 20], sway: 14, spin: [110, 200], colors: [["#F27DA4", "#E2557F", "#F9B4CB"], ["#EE6E97", "#D2447A", "#F7A6C0"], ["#FDEEF3", "#F27DA4", "#FBD3DF"]], svg: CARNATION },
  autumn: { n: 5, size: [13, 18], secs: [16, 22], sway: 30, spin: [300, 500], colors: ["#E2622B", "#D2452E", "#EFA23A"],
    svg: (c) => '<svg viewBox="0 0 24 24"><path d="M12 1 14 6 17.5 4.5 16.5 9.5 22 8.5 19.5 12 22.5 14 16 15.5 16.8 18.5 12.6 17.6V23H11.4V17.6L7.2 18.5 8 15.5 1.5 14 4.5 12 2 8.5 7.5 9.5 6.5 4.5 10 6Z" fill="' + c + '"/></svg>' },
  winter: { n: 9, size: [9, 13], secs: [20, 28], sway: 10, spin: [60, 120], colors: ["#8FC3E8", "#A9D2EE", "#7DB5E0"],
    svg: (c) => '<svg viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="1.8" stroke-linecap="round">' + [0, 60, 120, 180, 240, 300].map((a) => '<path transform="rotate(' + a + ' 12 12)" d="M12 12V2.5M12 6 9.6 3.8M12 6 14.4 3.8"/>').join("") + "</svg>" }
};

// 这一季的东西从上往下斜着飘；有风：其中一两片落到半路绕一个小圈再接着落（绕圈那两秒多里几乎不往下掉，不然屏幕一高，圈就被下落拉成一道弯）。
// 路径取点做关键帧，只动 transform
function fall(season) {
  const S = SEASONS[season] || SEASONS[seasonOf(new Date().getMonth() + 1)], W = innerWidth, H = innerHeight, STEPS = 24, RING = 12;
  const first = Math.floor(R() * S.n), second = R() < 0.6 ? (first + 2 + Math.floor(R() * (S.n - 3))) % S.n : -1;
  let longest = 0;
  for (let i = 0; i < S.n; i++) {
    const el = piece("sky-fall", S.svg(S.colors[i % S.colors.length])), loop = i === first || i === second;
    el.style.width = pick(S.size).toFixed(1) + "px";
    const x = W * (0.04 + R() * 0.72), dx = W * (0.07 + R() * 0.1), r = R() * 360, spin = pick(S.spin);
    const base = pick(S.secs) * 1000, whirl = loop ? 2400 : 0, total = base + whirl, at = 0.3 + R() * 0.25, ring = 18 + R() * 6;
    const frame = (t, ox, oy, turn, ms) => ({ transform: "translate(" + (x + dx * t + Math.sin(t * 6.3) * S.sway + ox).toFixed(1) + "px," + (-28 + (H + 56) * t + oy).toFixed(1) + "px) rotate(" + (r + spin * t + turn).toFixed(0) + "deg)", offset: Math.min(1, ms / total) });
    const frames = [];
    let whirled = false;
    for (let k = 0; k <= STEPS; k++) {
      const t = k / STEPS;
      if (!loop || t < at) { frames.push(frame(t, 0, 0, 0, t * base)); continue; }
      if (!whirled) {
        // 到了起风的地方：原地绕一圈（顺手往前、往下带一点），转一整圈身
        for (let q = 0; q <= RING; q++) { const p = q / RING, th = 2 * Math.PI * p; frames.push(frame(at, ring * Math.sin(th) + 10 * p, ring * (Math.cos(th) - 1) + 14 * p, 360 * p, at * base + whirl * p)); }
        whirled = true;
      }
      frames.push(frame(t, 10, 14, 360, t * base + whirl));
    }
    const delay = i * 750;
    el.animate(frames, { duration: total, delay, easing: "linear", fill: "backwards" }).onfinish = () => el.remove();
    longest = Math.max(longest, total + delay);
  }
  return Math.round(longest);
}

// 流星雨：十颗左右，都朝左下，八九秒里陆续划过
function meteors() {
  const W = innerWidth, H = innerHeight, a = 150 * Math.PI / 180, cx = Math.cos(a), cy = Math.sin(a);
  let longest = 0;
  for (let i = 0; i < 10; i++) {
    const el = piece("sky-meteor"), len = 46 + R() * 60, x = W * (0.25 + R() * 0.8), y = -10 + R() * H * 0.45, d = 200 + R() * 140;
    el.style.width = len.toFixed(0) + "px";
    const ms = 900 + R() * 500, delay = i * 800 + R() * 500;
    el.animate([{ transform: "translate(" + x.toFixed(0) + "px," + y.toFixed(0) + "px) rotate(150deg)", opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 },
      { transform: "translate(" + (x + cx * d).toFixed(0) + "px," + (y + cy * d).toFixed(0) + "px) rotate(150deg)", opacity: 0 }], { duration: ms, delay, easing: "ease-in", fill: "both" }).onfinish = () => el.remove();
    longest = Math.max(longest, ms + delay);
  }
  return Math.round(longest);
}

// ---------- 潮水 ----------
// 一道 = 贴在右下角的一片又宽又矮的水：往左越来越薄、收成一个尖。画在 1000 × 100 的格子里再横向拉开（线宽不跟着拉，css 里 non-scaling-stroke）。
// 水面的高低（0–1，x 从左到右）：左边贴地，往右下角慢慢高起来
const tideTop = (x) => 0.2 + 0.8 * Math.pow(x, 1.7);
// 浪边每一道现算：沿着水面取点、各自随机矮一点，再连成顺的曲线——不会两次一样
function tideEdge() {
  const n = 18, p = [];
  for (let i = 0; i <= n; i++) { const x = i / n; p.push([x * 1000, 100 - 100 * tideTop(x) * (0.8 + R() * 0.2)]); }
  p[0][1] = 100; p[1][1] = 96;
  let d = "M0 100";
  for (let i = 1; i < n; i++) d += "Q" + p[i][0].toFixed(0) + " " + p[i][1].toFixed(1) + " " + ((p[i][0] + p[i + 1][0]) / 2).toFixed(0) + " " + ((p[i][1] + p[i + 1][1]) / 2).toFixed(1);
  return d + "L1000 " + p[n][1].toFixed(1);
}
const line = (d, stroke, width, more = "") => '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + width + '" stroke-linecap="round" ' + more + "/>";
const GLOW = 'style="filter:drop-shadow(0 0 3px #3CE8FF) drop-shadow(0 0 9px #2A7BFF)"';
// 进来快、停一下、退得慢：从右下角屏幕外斜着滑到位，再斜着退回去
const SWASH = [{ transform: "translate(72%,115%)", easing: "cubic-bezier(.15,.7,.3,1)" }, { transform: "translate(0,0)", offset: 0.3, easing: "ease-in-out" },
  { transform: "translate(-1.5%,5%)", offset: 0.42, easing: "cubic-bezier(.5,0,.8,.5)" }, { transform: "translate(64%,118%)" }];

// 一道：后面一层淡的（晚一点，叠出层次）、前面一层带浪边的、退走后留在最远处的那一道（泡沫 / 荧光点，慢慢淡掉）
function wash(dark, width, height, delay) {
  const e = tideEdge(), body = e + "L1000 100L0 100Z", id = "sky-g" + (++serial);
  const layer = (w, h, html) => { const el = piece("sky-tide", '<svg viewBox="0 0 1000 100" preserveAspectRatio="none">' + html + "</svg>"); el.style.width = w + "%"; el.style.height = h.toFixed(0) + "px"; return el; };
  const grad = (top, bottom) => '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + top + '"/><stop offset="1" stop-color="' + bottom + '"/></linearGradient><path d="' + body + '" fill="url(#' + id + ')"/>';
  let front, back, left;
  if (dark) {
    // 荧光海：水几乎看不见，浪边是发光的青蓝细线，水里一道道忽明忽暗的小横杠
    let dashes = "";
    for (let i = 0; i < 11; i++) { const x = 0.2 + R() * 0.76, y0 = 100 - 100 * tideTop(x) * 0.8 + 16, y = y0 + R() * Math.max(4, 92 - y0); dashes += '<rect x="' + (x * 1000 - 30).toFixed(0) + '" y="' + y.toFixed(0) + '" width="' + (18 + R() * 54).toFixed(0) + '" height="3.4" rx="1.6" fill="#8FF8FF"/>'; }
    back = layer(width * 0.9, height * 0.8, '<path d="' + body + '" fill="rgba(40,120,220,.12)"/>');
    front = layer(width, height, grad("rgba(40,120,220,.08)", "rgba(24,80,170,.26)") + "<g " + GLOW + ">" + line(e, "#6FF6FF", 2) + "</g>" + dashes);
    left = layer(width, height, "<g " + GLOW + ">" + line(e, "#B8FBFF", 2.2, 'stroke-dasharray=".1 9"') + line(e, "#8FF8FF", 1.6, 'stroke-dasharray=".1 23 .1 13 .1 31" transform="translate(6 14)"') + "</g>");
    front.querySelectorAll("rect").forEach((r) => r.animate([{ opacity: 0.1 }, { opacity: 1 }, { opacity: 0.25 }, { opacity: 0.9 }, { opacity: 0.1 }], { duration: 900 + R() * 900, iterations: Infinity, delay: -R() * 900 }));
  } else {
    // 白天：海水色从浪边到底边由浅到深；白浪边两侧各压一道错开的粉线和蓝线（丝网印错版）；水里两道断断续续的白水纹，浪边下一串碎泡沫点
    back = layer(width * 0.9, height * 0.8, '<path d="' + body + '" fill="rgba(62,178,214,.16)"/>');
    front = layer(width, height, grad("rgba(110,205,228,.2)", "rgba(40,160,208,.4)") +
      line(e, "rgba(255,255,255,.55)", 1, 'stroke-dasharray="46 30 18 52" transform="translate(10 24)"') + line(e, "rgba(255,255,255,.4)", 1, 'stroke-dasharray="26 44 60 36" transform="translate(-14 48)"') +
      line(e, "rgba(255,62,165,.5)", 1, 'transform="translate(-3 -5)"') + line(e, "rgba(40,140,230,.55)", 1, 'transform="translate(3 5)"') + line(e, "#fff", 2.6) +
      line(e, "rgba(255,255,255,.9)", 2.6, 'stroke-dasharray=".1 11 .1 19 .1 7 .1 26" transform="translate(4 9)"'));
    left = layer(width, height, '<path d="' + body + '" fill="rgba(62,178,214,.08)"/>' + line(e, "rgba(255,255,255,.95)", 1.8, 'stroke-dasharray="2 7"') + line(e, "rgba(40,140,230,.4)", 1, 'stroke-dasharray="2 7" transform="translate(2 4)"'));
  }
  const life = 9000;
  back.animate(SWASH, { duration: life, delay: delay + 380, fill: "both" }).onfinish = () => back.remove();
  front.animate(SWASH, { duration: life, delay, fill: "both" }).onfinish = () => front.remove();
  left.animate([{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 0.9, offset: 0.36 }, { opacity: 0, offset: 0.9 }, { opacity: 0 }], { duration: life, delay, fill: "both" }).onfinish = () => left.remove();
  return delay + life + 380;
}

// 一次两道，后一道短一点、矮一点。高度跟着屏幕：电脑约屏高的 7%，手机约 5.5%
function tide(dark) {
  const H = innerHeight, small = innerWidth <= 760, h = small ? Math.max(30, Math.min(48, H * 0.055)) : Math.max(34, Math.min(64, H * 0.07));
  wash(dark, 94, h, 0);
  return wash(dark, 76, h * 0.78, 5600);
}

const SHOWS = {
  plane: () => cross("sky-plane", '<span class="sky-trails"><b></b><b></b></span><span class="sky-dot"></span>', 45),
  redeye: () => cross("sky-redeye", '<span class="sky-red"></span><span class="sky-white"></span>', 38),
  fall, meteors,
  tide: (how) => tide(how ? how === "night" : night())
};

// 放一样，返回要多久。平时由下面的 tick 挑；预览里也可以手动叫它看样子：
//   show("plane") / show("redeye") / show("meteors") / show("fall", "spring" | "summer" | "autumn" | "winter") / show("tide", "day" | "night")
export function show(kind, how) {
  if (!host || !SHOWS[kind]) return 0;
  return SHOWS[kind](how);
}

// 排班里的三样 → 这会儿该放的那一个（白天夜里不一样）
const SHOW_OF = { plane: () => (night() ? "redeye" : "plane"), tide: () => "tide", rare: () => (night() ? "meteors" : "fall") };

function arm(ms) {
  clearTimeout(timer);
  timer = setTimeout(tick, Math.max(1000, ms));
}

function tick() {
  if (!allowed()) { if (enabled && document.visibilityState === "visible") arm(60000); return; }   // 系统要求减少动态：一分钟后再看一眼
  const t = turn(Date.now(), due, R, can());
  due = t.due;
  for (const k of t.kinds) show(SHOW_OF[k]());
  arm(t.wait);
}

// 正在放的那样直接拿掉（换了白天 / 夜里、关了动效）
export function clearSky() {
  if (!host) return;
  host.querySelectorAll(".sky-ev").forEach((el) => el.remove());
}

// 设置里的 Sparkles and confetti：关了就不放，正在放的也拿掉
export function setSky(on) {
  enabled = on;
  if (!host) return;
  if (on) arm(nextIn());
  else { clearTimeout(timer); clearSky(); }
}

export function initSky(el) {
  host = el;
  due = firstDue(Date.now());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") clearTimeout(timer);   // 在后台：定时器也不挂
    else if (enabled) arm(nextIn());
  });
  if (enabled) arm(nextIn());
}
