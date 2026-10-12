// 灵感池（Projects 页的 Ideas，见 js/ideas.js）
// 存在 Settings 页里，一条一行：idea:<id> = { text, kind, date, by, note, taskId, order }
// 挑进任务 = 记下 taskId；那条任务做完满一周，这条就删掉（settleIdeas）。
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

import * as I from "../ideas.js";

export default function (core) {
  const { entries, get, put, drop, change, memo, newId } = core;

  const IDEA_RE = /^idea:(.+)$/;
  const keyOf = (id) => "idea:" + id;
  const BLANK = { text: "", kind: "", date: "", by: false, note: "", taskId: "" };
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

  // 挑进这条任务
  function pickIdea(id, taskId) {
    const i = ideaOf(id);
    if (i && get("tasks", taskId)) change(() => putIdea({ ...i, taskId }));
  }

  // 放回池子：不动那条任务
  function unpickIdea(id) {
    const i = ideaOf(id);
    if (i) change(() => putIdea({ ...i, taskId: "" }), "Back in the pool");
  }

  // ---- 下面两个是 store.js 动任务时顺手叫的（已经在一次改动里，撤销时一起回去） ----

  // 任务删了：回到池子
  function ideaTaskDropped(taskId) {
    const i = ideaOfTask(taskId);
    if (i) putIdea({ ...i, taskId: "" });
  }

  // 任务换了一条（挪到明天、改成重复的）：跟过去
  function moveIdea(fromTask, toTask) {
    const i = ideaOfTask(fromTask);
    if (i) putIdea({ ...i, taskId: toTask });
  }

  // 去过的不留：挂着的任务做完满一周就删掉（打开页面、从表格拉回来以后各清一次）
  function settleIdeas() {
    const gone = I.stale(ideas(), (id) => get("tasks", id), Date.now());
    if (gone.length) change(() => gone.forEach((i) => drop("settings", keyOf(i.id))), "", { quiet: true });
  }

  return { ideas, ideaOf, ideaOfTask, saveIdea, addIdeas, deleteIdea, pickIdea, unpickIdea, settleIdeas, ideaTaskDropped, moveIdea };
}
