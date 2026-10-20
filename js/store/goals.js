// 目标（Projects 页最上面的目标板，见 js/goals.js）
// 存在 Settings 页里，一条目标一行：goal:<id> = { text, tag, span, due, done, order, up, by }
//   up = 上级目标（一个）；by = ["g:项目名", "p:计划 id"]，哪些项目 / 计划为它服务（多对多，只存在目标这一边）
// North star 那一段字另存一行 north-star = { text }，[ ] 里的词就是 span 为 north 的那几条目标（见最下面的 saveNorth）
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

  // ---------- North star 那一段字（Settings 的 north-star = { text }）----------
  // 显示 / 打开来改的字：见 js/goals.js 的 northText（没存过就用现有的 North star 目标拼一段）
  const northStar = () => G.northText(setting("north-star")?.text, goals());

  // 存这段字：[ ] 里的每个词对上一条 North star 目标（字一样的留着；剩下的按先后对上，改了措辞还是那条，上级、服务的链接都在），
  // 多出来的新建，文字里没有了的删掉（挂在它下面的不再有上级）。先后变了才重排 order（只改了字的不动别的行，同步少传几行）。
  // 一次改动：提示条上撤销，字和目标一起回去
  function saveNorth(text) {
    const value = String(text ?? "").replace(/\s+$/, "");
    const north = goals().filter((g) => g.span === "north"), at = new Map(north.map((g) => [g.id, g]));
    const phrases = G.parseNorth(value), { ids, left } = G.matchNorth(phrases, north);
    const known = ids.filter(Boolean).map((id) => Number(at.get(id).order) || 0);
    const reorder = left.length > 0 || ids.some((id) => !id) || known.some((v, i) => i && v <= known[i - 1]);
    const base = Date.now();
    change(() => {
      phrases.forEach((p, i) => {
        const g = ids[i] ? at.get(ids[i]) : null, order = reorder ? base + i : Number(g?.order) || base + i;
        if (!g) put("settings", row({ id: newId().replace(/-/g, "").slice(0, 10), text: p.text, tag: "", span: "north", due: "", done: "", order, up: "", by: [] }));
        else if (g.text !== p.text || Number(g.order) !== order) put("settings", row({ ...g, text: p.text, order }));
      });
      for (const g of left) {
        drop("settings", "goal:" + g.id);
        goals().filter((x) => x.up === g.id).forEach((x) => put("settings", row({ ...x, up: "" })));
      }
      put("settings", { id: "north-star", key: "north-star", value: { text: value } });
    }, "North star saved");
  }

  return { goals, saveGoal, deleteGoal, setParent, linkGoal, renameGoalRef: renameRef, ensureNorthStar, northStar, saveNorth };
}
