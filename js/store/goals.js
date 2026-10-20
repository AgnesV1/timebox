// 目标（Projects 页最上面的目标板，见 js/goals.js）
// 存在 Settings 页里，一条目标一行：goal:<id> = { text, tag, span, due, done, order, up, by }
//   up = 上级目标（一个）；by = ["g:项目名", "p:计划 id"]，哪些项目 / 计划为它服务（多对多，只存在目标这一边）
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

import * as G from "../goals.js";

export default function (core) {
  const { entries, put, drop, change, memo, newId, setting } = core;

  const GOAL_RE = /^goal:(.+)$/;

  const goals = () => memo("goals", () => {
    const out = [];
    for (const [key, r] of entries("settings")) {
      const m = GOAL_RE.exec(key);
      if (m && r.value && typeof r.value === "object") out.push({ ...r.value, id: m[1] });
    }
    return out.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  });

  const row = (g) => { const { id, ...value } = g; return { id: "goal:" + id, key: "goal:" + id, value }; };

  function saveGoal(goal, label, opts) {
    const id = goal.id || newId().replace(/-/g, "").slice(0, 10);
    const { id: _id, ...value } = goal;
    if (!value.order) value.order = Date.now();
    change(() => put("settings", row({ ...value, id })), label, opts);
    return id;
  }

  // 删一条：挂在它下面的那几条不再有上级（不然它们指着一条不存在的）
  function deleteGoal(id) {
    change(() => {
      drop("settings", "goal:" + id);
      goals().filter((g) => g.up === id).forEach((g) => put("settings", row({ ...g, up: "" })));
    }, "Goal deleted");
  }

  const goal = (id) => goals().find((g) => g.id === id) || null;

  // 设上级（一条只有一个，会换掉原来的）；会连成环的不设，返回 false
  function setParent(id, parentId) {
    const g = goal(id);
    if (!g || !G.canParent(goals(), id, parentId)) return false;
    if ((g.up || "") === (parentId || "")) return true;
    change(() => put("settings", row({ ...g, up: parentId || "" })), parentId ? "Linked to " + (goal(parentId)?.text || "a goal") : "Unlinked");
    return true;
  }

  // 一个项目（"g:名字"）/ 计划（"p:id"）为这条目标服务，或者不再服务
  function linkGoal(id, ref, on = true) {
    const g = goal(id);
    if (!g || !ref) return;
    const by = (Array.isArray(g.by) ? g.by : []).filter((r) => r !== ref);
    if (on) by.push(ref);
    change(() => put("settings", row({ ...g, by })), on ? "Linked" : "Unlinked");
  }

  // 项目改名 / 并进别的项目、计划删掉：各条目标里的链接跟着改（在调用方的 change 里做，算同一步撤销）
  function renameRef(from, to) {
    for (const g of goals()) {
      const by = Array.isArray(g.by) ? g.by : [];
      if (!by.includes(from)) continue;
      put("settings", row({ ...g, by: [...new Set(by.map((r) => (r === from ? to : r)).filter(Boolean))] }));
    }
  }

  // 原来 2031 那一栏（今年之后的第五年）现在是 North star：那时在那一栏（及更远）的年度目标搬过去。只搬一次，记在 Settings 的 goals-north
  function ensureNorthStar(today) {
    if (setting("goals-north") || !goals().length) return;
    const far = Number(String(today).slice(0, 4)) + G.YEARS_AHEAD + 1;
    change(() => {
      goals().filter((g) => (g.span || "year") === "year" && Number(String(g.due || g.done || "").slice(0, 4)) >= far)
        .forEach((g) => put("settings", row({ ...g, span: "north", due: "" })));
      put("settings", { id: "goals-north", key: "goals-north", value: { at: today } });
    }, "", { quiet: true });
  }

  return { goals, saveGoal, deleteGoal, setParent, linkGoal, renameGoalRef: renameRef, ensureNorthStar };
}
