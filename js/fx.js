// 触摸星星（点哪里冒一圈，按住划动留星轨）和守住安全线时的一把礼花。纯装饰，不接收点击。
// 系统开了「减弱动态效果」或设置里关掉时，全都不放。

let layer = null, live = 0, hue = 0, enabled = true;
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

let palette = null;
function colors() {
  if (palette) return palette;
  const cs = getComputedStyle(document.documentElement);
  return (palette = ["--c-Main", "--c-Work", "--c-Fun", "--c-Chore", "--accent"].map((n) => cs.getPropertyValue(n).trim()));
}

// 换了白天/夜间主题后重新取颜色
export function refreshFxColors() { palette = null; }

function spawn(el, x, y, frames, ms, easing) {
  el.style.left = x + "px";
  el.style.top = y + "px";
  layer.appendChild(el);
  live++;
  el.animate(frames, { duration: ms, easing: easing || "linear" }).onfinish = () => { el.remove(); live--; };
}

function star(x, y, dist, size, ms, fall, dotChance, palette) {
  if (live > 90) return;
  const s = document.createElement("i"), dot = Math.random() < dotChance;
  const z = size * (0.65 + Math.random() * 0.7) * (dot ? 0.4 : 1);
  s.className = dot ? "dot" : Math.random() < 0.35 ? "shard" : "star";
  s.style.cssText = "width:" + z + "px;height:" + z + "px;margin:" + -z / 2 + "px 0 0 " + -z / 2 + "px;--c:" + palette[hue++ % palette.length];
  const a = Math.random() * Math.PI * 2, d = dist * (0.45 + Math.random() * 0.55), r = (Math.random() - 0.5) * 300;
  const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
  const at = (k, f, sc, rot) => "translate(" + dx * k + "px," + (dy * k + fall * f) + "px) scale(" + sc + ") rotate(" + r * rot + "deg)";
  spawn(s, x, y, [
    { transform: at(0, 0, 0, 0), opacity: 1, easing: "cubic-bezier(.2,.9,.3,1.25)" },
    { transform: at(0.75, 0, 1.15, 0.4), opacity: 1, offset: 0.3 },
    { transform: at(0.9, 0.5, 1, 0.7), opacity: 1, offset: 0.65 },
    { transform: at(1, 1, 0.2, 1), opacity: 0 }
  ], ms * (0.85 + Math.random() * 0.4));
}

export function setFx(on) { enabled = on; }

export function burst(x, y, n = 20, dist = 120) {
  if (!layer || !enabled || reduce()) return;
  const p = colors();
  for (let k = 0; k < n; k++) star(x, y, dist, 20, 1100, 16, 0.25, p);
}

// 守住今天的线：从屏幕下方往上撒一把纸片
export function confetti() {
  if (!layer || !enabled || reduce()) return;
  const p = colors(), w = innerWidth, h = innerHeight;
  for (let k = 0; k < 70; k++) {
    const c = document.createElement("i");
    const z = 7 + Math.random() * 8;
    c.className = "paper";
    c.style.cssText = "width:" + z + "px;height:" + z * 0.6 + "px;--c:" + p[k % p.length];
    const x = w / 2 + (Math.random() - 0.5) * 80, y = h * 0.7;
    const dx = (Math.random() - 0.5) * w * 0.9, up = -h * (0.35 + Math.random() * 0.35), rot = (Math.random() - 0.5) * 900;
    spawn(c, x, y, [
      { transform: "translate(0,0) rotate(0)", opacity: 1 },
      { transform: "translate(" + dx * 0.7 + "px," + up + "px) rotate(" + rot * 0.5 + "deg)", opacity: 1, offset: 0.45 },
      { transform: "translate(" + dx + "px," + (up + h * 0.55) + "px) rotate(" + rot + "deg)", opacity: 0 }
    ], 2200 + Math.random() * 900, "cubic-bezier(.15,.7,.35,1)");
  }
}

export function initFx() {
  layer = document.createElement("div");
  layer.className = "fx";
  document.body.appendChild(layer);
  let down = false, lx = 0, ly = 0, lt = 0;
  addEventListener("pointerdown", (e) => {
    if (!enabled || reduce() || e.target.closest("input,textarea,select,[data-drag],[data-drag-row]")) return;
    if (e.timeStamp - lt < 50 && Math.hypot(e.clientX - lx, e.clientY - ly) < 10) return;
    down = true; lx = e.clientX; ly = e.clientY; lt = e.timeStamp;
    const p = colors();
    const o = document.createElement("i");
    o.className = "ring";
    spawn(o, lx, ly, [{ transform: "scale(.2)", opacity: 0.9 }, { transform: "scale(1.5)", opacity: 0 }], 600, "ease-out");
    for (let k = 0; k < 10; k++) star(lx, ly, 70, 18, 950, 10, 0.2, p);
  }, { passive: true });
  addEventListener("pointermove", (e) => {
    if (!down || !enabled || (Math.hypot(e.clientX - lx, e.clientY - ly) < 16 && e.timeStamp - lt < 45)) return;
    lx = e.clientX; ly = e.clientY; lt = e.timeStamp;
    star(lx, ly, 16, 13, 800, 16, 0.45, colors());
  }, { passive: true });
  addEventListener("pointerup", () => { down = false; }, { passive: true });
  addEventListener("pointercancel", () => { down = false; }, { passive: true });
}
