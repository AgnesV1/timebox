// 豹纹和斑马纹：SVG 小图平铺，颜色跟着主题生成，写成 CSS 变量给各处用。
//   --leo-dark   深色豹纹（叠在色块上，表示「部分完成」）
//   --leo-tex    主题自己的豹纹（Optional 任务底纹、装饰胶带）
//   --zebra-<分类> 用分类颜色画的斑马纹（表示「还没做」）

function uri(w, h, body) {
  return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' + body + "</svg>") + '")';
}

// 每朵「玫瑰斑」= 一个浅色芯 + 一圈断开的深色小块
export function leopard(spot, inner) {
  const R = [[20, 22, 8], [62, 16, 7], [42, 50, 9], [78, 60, 7], [16, 72, 7], [56, 84, 6], [86, 30, 5]];
  let b = "";
  R.forEach(([x, y, r], i) => {
    b += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (r * 0.62).toFixed(1) + '" ry="' + (r * 0.48).toFixed(1) + '" fill="' + inner + '" transform="rotate(' + i * 41 + " " + x + " " + y + ')"/>';
    const n = 4 + (i % 2);
    for (let k = 0; k < n; k++) {
      if ((i + k) % 7 === 3) continue;
      const a = (k / n) * Math.PI * 2 + i * 0.8;
      const bx = (x + Math.cos(a) * r).toFixed(1), by = (y + Math.sin(a) * r).toFixed(1);
      b += '<ellipse cx="' + bx + '" cy="' + by + '" rx="' + (r * 0.5).toFixed(1) + '" ry="' + (r * 0.23).toFixed(1) + '" fill="' + spot + '" transform="rotate(' + ((a * 180) / Math.PI + 90).toFixed(0) + " " + bx + " " + by + ')"/>';
    }
  });
  [[36, 30, 1.8], [70, 40, 2.2], [30, 90, 1.6], [48, 72, 1.5], [88, 82, 2], [8, 46, 1.7]].forEach(([x, y, r]) => {
    b += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + spot + '"/>';
  });
  return uri(96, 96, b);
}

// 竖向波浪条，中间粗细有变化，四边都能无缝平铺
export function zebra(ink) {
  const X = [[4, 4, 3], [18, 5, -3], [31, 6, 3], [45, 4.5, -2.5]];
  let b = "";
  X.forEach(([x, t, a], i) => {
    const m = t * (i % 2 ? 1.35 : 0.75);
    b += '<path fill="' + ink + '" d="M' + x + " 0 C" + (x + a) + " 19 " + (x - a) + " 37 " + x + " 56 L" + (x + t) + " 56 C" + (x + m - a) + " 37 " + (x + m + a) + " 19 " + (x + t) + ' 0 Z"/>';
  });
  return uri(56, 56, b);
}

// 任意颜色的斑马纹（项目颜色用），画过的记住
const zebraCache = new Map();
export function zebraFor(color) {
  if (!zebraCache.has(color)) zebraCache.set(color, zebra(color));
  return zebraCache.get(color);
}

export const CATEGORIES = ["Main", "Work", "Fun", "Chore"];

export function paintPatterns(root = document.documentElement) {
  const cs = getComputedStyle(root);
  const v = (n) => cs.getPropertyValue(n).trim();
  root.style.setProperty("--leo-dark", leopard("#111", "rgba(0,0,0,.3)"));
  root.style.setProperty("--leo-tex", leopard(v("--leo-spot"), v("--leo-inner")));
  root.style.setProperty("--zebra-tex", zebra(v("--zebra-ink")));
  CATEGORIES.concat("None").forEach((c) => root.style.setProperty("--zebra-" + c, zebra(v("--c-" + c))));
}
