// On the side（Stats 页）：边健身、边通勤边看的剧 / 小说，按月手填的总数（怎么算见 js/stats.js 的 sideHaze / withSide）
// 存在 Settings 页里，一条一行：side:<id> = { month: "2026-09", kind, min, full, note, order }
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

export default function (core) {
  const { entries, put, drop, change, memo, newId } = core;

  const SIDE_RE = /^side:(.+)$/;
  const keyOf = (id) => "side:" + id;
  const BLANK = { month: "", kind: "", min: 0, full: false, note: "" };
  const shortId = () => newId().replace(/-/g, "").slice(0, 10);

  // 新的月份在前，同一个月里后加的在前
  const sides = () => memo("sides", () => {
    const out = [];
    for (const [key, r] of entries("settings")) {
      const m = SIDE_RE.exec(key);
      if (m && r.value && typeof r.value === "object") out.push({ ...BLANK, ...r.value, id: m[1] });
    }
    return out.sort((a, b) => String(b.month).localeCompare(String(a.month)) || (Number(b.order) || 0) - (Number(a.order) || 0));
  });
  const sideOf = (id) => sides().find((x) => x.id === id) || null;

  // 加一条 / 改一条（给了 id 就是改，只改给了的那几样）
  function saveSide(row, label = "") {
    const id = row.id || shortId();
    const { id: _, ...value } = { ...BLANK, order: Date.now(), ...(sideOf(id) || {}), ...row };
    change(() => put("settings", { id: keyOf(id), key: keyOf(id), value }), label);
    return id;
  }

  function deleteSide(id) {
    change(() => drop("settings", keyOf(id)), "Removed");
  }

  return { sides, sideOf, saveSide, deleteSide };
}
