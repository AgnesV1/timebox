// On the side（Stats 页饼图那一块）：边健身、边通勤看的剧 / 小说，一个月一个总数（怎么画见 js/stats.js 的 sideHaze）
// 存在 Settings 页里，一个月一行：side:2026-09 = { month: "2026-09", min }。
// 上一版是一条一行（side:<随机 id>，带种类、备注、full）：读的时候同一个月的加起来，写哪个月就把那个月的旧行一起换掉。
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

export default function (core) {
  const { entries, put, drop, change, memo } = core;

  const SIDE_RE = /^side:(.+)$/;
  const MONTH_RE = /^\d{4}-\d{2}$/;
  const rowsOf = () => entries("settings").filter(([key, r]) => SIDE_RE.test(key) && r.value && typeof r.value === "object" && MONTH_RE.test(String(r.value.month || "")));

  // [{ month, min }]，新的月份在前
  const sides = () => memo("sides", () => {
    const by = new Map();
    for (const [, r] of rowsOf()) by.set(r.value.month, (by.get(r.value.month) || 0) + (Number(r.value.min) || 0));
    return [...by.entries()].map(([month, min]) => ({ month, min })).sort((a, b) => b.month.localeCompare(a.month));
  });
  const sideOf = (month) => sides().find((x) => x.month === month)?.min || 0;
  // 那个月填过没有（填 0 也算填过；Stats 页 Adjust 旁边的红点看它）
  const sideFilled = (month) => sides().some((x) => x.month === month);

  // 某个月一共多少分钟：null / 空 = 拿掉（算没填）；0 = 存一行 0（她说那个月就是没有）
  function setSide(month, min) {
    if (!MONTH_RE.test(String(month))) return;
    const keep = min === null || min === "" || min === undefined ? null : Math.max(0, Math.round(Number(min) || 0));
    change(() => {
      for (const [key, r] of rowsOf()) if (r.value.month === month) drop("settings", key);
      if (keep !== null) put("settings", { id: "side:" + month, key: "side:" + month, value: { month, min: keep } });
    });
  }

  return { sides, sideOf, sideFilled, setSide };
}
