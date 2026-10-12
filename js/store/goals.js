// 目标（Projects 页最上面的目标板，见 js/goals.js）
// 存在 Settings 页里，一条目标一行：goal:<id> = { text, tag, span, due, done, order }
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

export default function (core) {
  const { entries, put, drop, change, memo, newId } = core;

  const GOAL_RE = /^goal:(.+)$/;

  const goals = () => memo("goals", () => {
    const out = [];
    for (const [key, r] of entries("settings")) {
      const m = GOAL_RE.exec(key);
      if (m && r.value && typeof r.value === "object") out.push({ ...r.value, id: m[1] });
    }
    return out.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  });

  function saveGoal(row, label, opts) {
    const id = row.id || newId().replace(/-/g, "").slice(0, 10);
    const { id: _id, ...value } = row;
    if (!value.order) value.order = Date.now();
    change(() => put("settings", { id: "goal:" + id, key: "goal:" + id, value }), label, opts);
    return id;
  }

  function deleteGoal(id) {
    change(() => drop("settings", "goal:" + id), "Goal deleted");
  }

  return { goals, saveGoal, deleteGoal };
}
