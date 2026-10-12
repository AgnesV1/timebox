// 灵感池（Projects 页的 Ideas，见 js/ideas.js）
// 存在 Settings 页里，一条一行：idea:<id> = { text, kind, date, by, note, taskId, doneAt, order }
// 挑进任务 = 记下 taskId；那条任务做完时记下 doneAt（老任务归档以后会从这台设备上拿走，记下来才不会又回到池子里）。
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

export default function (core) {
  const { entries, get, put, drop, change, memo, newId } = core;

  const IDEA_RE = /^idea:(.+)$/;
  const keyOf = (id) => "idea:" + id;
  const BLANK = { text: "", kind: "", date: "", by: false, note: "", taskId: "", doneAt: "" };
  const fin = (t) => t?.status === "done" || t?.status === "partial";
  const shortId = () => newId().replace(/-/g, "").slice(0, 10);

  const ideas = () => memo("ideas", () => {
    const out = [];
    for (const [key, r] of entries("settings")) {
      const m = IDEA_RE.exec(key);
      if (m && r.value && typeof r.value === "object") out.push({ ...BLANK, ...r.value, id: m[1] });
    }
    return out.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  });
  const ideaOf = (id) => ideas().find((i) => i.id === id) || null;
  const ideaOfTask = (taskId) => (taskId ? ideas().find((i) => i.taskId === taskId) || null : null);

  function putIdea(row) {
    const { id, ...value } = row;
    put("settings", { id: keyOf(id), key: keyOf(id), value });
  }

  function saveIdea(row, label, opts) {
    const id = row.id || shortId();
    change(() => putIdea({ ...BLANK, order: Date.now(), ...(ideaOf(id) || {}), ...row, id }), label, opts);
    return id;
  }

  // 一次加几条（粘进来的几行）；fields = 这几条共用的（类别、日子）
  function addIdeas(texts, fields = {}) {
    const now = Date.now();
    change(() => texts.forEach((text, k) => putIdea({ ...BLANK, ...fields, text, id: shortId(), order: now + k })),
      texts.length > 1 ? "Added " + texts.length + " ideas" : "");
  }

  function deleteIdea(id) {
    change(() => drop("settings", keyOf(id)), "Idea deleted");
  }

  // 挑进这条任务（任务已经做完的话直接算去过了）
  function pickIdea(id, taskId) {
    const i = ideaOf(id), t = get("tasks", taskId);
    if (i && t) change(() => putIdea({ ...i, taskId, doneAt: fin(t) ? t.date : "" }));
  }

  // 放回池子：不动那条任务
  function unpickIdea(id) {
    const i = ideaOf(id);
    if (i) change(() => putIdea({ ...i, taskId: "", doneAt: "" }), "Back in the pool");
  }

  // ---- 下面三个是 store.js 写任务时顺手叫的（已经在一次改动里，撤销时一起回去） ----

  // 任务写进去了：做完 = 记下哪天；又不算做完了 = 擦掉
  function ideaTaskPut(task) {
    const i = ideaOfTask(task.id);
    if (!i) return;
    const doneAt = fin(task) ? task.date : "";
    if ((i.doneAt || "") !== doneAt) putIdea({ ...i, doneAt });
  }

  // 任务删了：回到池子
  function ideaTaskDropped(taskId) {
    const i = ideaOfTask(taskId);
    if (i) putIdea({ ...i, taskId: "", doneAt: "" });
  }

  // 任务换了一条（挪到明天、改成重复的）：跟过去
  function moveIdea(fromTask, toTask) {
    const i = ideaOfTask(fromTask);
    if (i) putIdea({ ...i, taskId: toTask, doneAt: "" });
  }

  // 从表格拉回来以后对一遍：在别的设备上、或者直接在表格里标的状态，不走上面那条路
  function settleIdeas() {
    const want = (i) => { const t = i.taskId ? get("tasks", i.taskId) : null; return t ? (fin(t) ? t.date : "") : null; };
    const stale = ideas().filter((i) => { const d = want(i); return d !== null && d !== (i.doneAt || ""); });
    if (stale.length) change(() => stale.forEach((i) => putIdea({ ...i, doneAt: want(i) })), "", { quiet: true });
  }

  return { ideas, ideaOf, ideaOfTask, saveIdea, addIdeas, deleteIdea, pickIdea, unpickIdea, settleIdeas, ideaTaskPut, ideaTaskDropped, moveIdea };
}
