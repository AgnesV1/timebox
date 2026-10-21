// 阅读页右边「今年接下来想读的」（电脑，见 js/ui/reading.js）。存在 Settings 页里，一条一行：read-plan:<id> = { title, tab, y, order }
//   tab = 阅读表格里的哪一页（Book、TV…，从 Want 里挑的才有）；y = 哪一年加进来的（去年没读完的跟到今年，见 js/reading.js 的 planView）；order = 先后
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

export default function (core) {
  const { entries, put, drop, change, memo, newId } = core;
  const RE = /^read-plan:(.+)$/;

  const readPlan = () => memo("read-plan", () => {
    const out = [];
    for (const [key, r] of entries("settings")) {
      const m = RE.exec(key);
      if (m && r.value && typeof r.value === "object") out.push({ ...r.value, id: m[1] });
    }
    return out.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  });

  const row = (x) => { const { id, ...value } = x; return { id: "read-plan:" + id, key: "read-plan:" + id, value }; };

  // 加在最后；同名的（不分大小写）已经在单子上就不再加，返回 ""
  function addReadPlan({ title, tab = "" }, y) {
    const t = String(title || "").trim();
    if (!t || readPlan().some((x) => x.title.toLowerCase() === t.toLowerCase())) return "";
    const id = newId().replace(/-/g, "").slice(0, 10), last = readPlan().reduce((m, x) => Math.max(m, Number(x.order) || 0), 0);
    change(() => put("settings", row({ id, title: t, tab: String(tab || ""), y: Number(y) || 0, order: last + 1 })));
    return id;
  }

  // 挪到第 to 个（从 0 数）：只改先后变了的那几行
  function moveReadPlan(id, to) {
    const list = readPlan().slice(), i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [x] = list.splice(i, 1);
    list.splice(Math.max(0, Math.min(list.length, to)), 0, x);
    change(() => list.forEach((r, k) => { if (Number(r.order) !== k + 1) put("settings", row({ ...r, order: k + 1 })); }));
  }

  function removeReadPlan(id) {
    const x = readPlan().find((r) => r.id === id);
    if (x) change(() => drop("settings", "read-plan:" + id), "Removed " + x.title);
  }

  return { readPlan, addReadPlan, moveReadPlan, removeReadPlan };
}
