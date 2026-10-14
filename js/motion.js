// 用户亲手点了什么之后的那一次重画：用浏览器自带的 View Transitions，让任务行、进度条、浮条平滑挪到新的样子，
// 而不是一闪就变。只有点按钮的地方先调 animateNext()；同步拉下来的重画、每秒的计时都不过渡。
// 浏览器不支持、系统开了「减弱动态效果」时照常直接画。

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
let want = "", at = 0;

// kind："on" 普通（行挪位、淡入淡出）/ "page" 换页 / "next" "prev" 翻到后一天、前一天（列表左右滑）
export function animateNext(kind = "on") { want = kind; at = performance.now(); }

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
