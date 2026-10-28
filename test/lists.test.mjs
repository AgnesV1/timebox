import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../js/lists.js";

const T = "2026-10-29";   // 星期四
const plan = (id, items = {}, x = {}) => ({ id, name: id, kind: "regular", place: "pool", status: "active", order: 1, rule: { items }, ...x });
const task = (x) => ({ id: x.id, date: T, title: "", est: 0, status: "", reason: "", projectId: "", itemId: "", desc: "", times: "", actual: null, order: 1, ...x });
const ctx = (x) => ({ today: T, weekStartsOn: "monday", projects: [], items: [], tasks: [], ...x });

test("steps live in the description as GitHub-style checkboxes", () => {
  const desc = "Do it at home\n\n- [x] Listening set · 35min\n- [ ] Reading · 1h\n- [ ] Writing T1 · T2";
  const { steps, rest } = L.stepsOf(desc);
  assert.equal(rest, "Do it at home");
  assert.deepEqual(steps, [{ t: "Listening set", min: 35, done: true }, { t: "Reading", min: 60, done: false }, { t: "Writing T1 · T2", min: 0, done: false }]);
  assert.equal(L.withSteps(rest, steps), "Do it at home\n\n- [x] Listening set · 35min\n- [ ] Reading · 1h\n- [ ] Writing T1 · T2");
  assert.equal(L.withSteps("", [{ t: "A", min: 0, done: false }]), "- [ ] A");
});

test("counting: done, still open, half done and back in the pool; Any never runs out", () => {
  const cfg = { ...L.DEFAULT, n: 5 };
  const lines = [
    task({ id: "a", title: "Mock #1", status: "done" }),
    task({ id: "b", title: "Mock #2", status: "delay", reason: L.BACK, desc: "- [x] Listening\n- [ ] Reading" }),
    task({ id: "c", title: "Mock #3" }),
    task({ id: "d", title: "Mock #4", status: "delay", reason: L.CONTINUED, desc: "- [x] Listening\n- [ ] Reading" }),
    task({ id: "e", title: "Mock #4" }),
    task({ id: "f", title: "Mock #5", status: "drop" })
  ];
  const c = L.countOf(lines, cfg);
  assert.deepEqual([c.done, c.open, c.left], [1, 2, 2]);
  assert.deepEqual(c.carry, [{ steps: [{ t: "Reading", min: 0, done: false }], from: "b" }], "only the one whose rest hasn't been dragged out again");
  assert.equal(L.countOf([], { ...L.DEFAULT, n: 0 }).left, Infinity);
  assert.equal(L.countOf([task({ id: "x", status: "done" })], L.DEFAULT).left, 0, "Once, done: nothing left");
});

test("this week counts done and placed from Monday", () => {
  const lines = [task({ id: "a", date: "2026-10-26", status: "done" }), task({ id: "b", date: "2026-10-30" }), task({ id: "c", date: "2026-10-25", status: "done" }), task({ id: "d", date: "2026-10-27", status: "drop" })];
  assert.deepEqual(L.weekOf(lines, T), { done: 1, placed: 2 });
});

test("the pool: each live plan, its items that are left, Later and finished ones hidden", () => {
  const c = ctx({
    projects: [plan("ielts", { l3: { n: 2, perWeek: 2 }, mock: { n: 1, later: true }, once: {} }), plan("swim"), plan("old", {}, { status: "done" })],
    items: [{ id: "l3", projectId: "ielts", title: "L3", est: 120, order: 2 }, { id: "once", projectId: "ielts", title: "Book", est: 30, order: 1 }, { id: "mock", projectId: "ielts", title: "Mock", est: 455, order: 3 }],
    tasks: [task({ id: "t1", projectId: "ielts", itemId: "l3", title: "L3 #1", status: "done", date: "2026-10-27" }), task({ id: "t2", projectId: "ielts", itemId: "once", status: "done" })]
  });
  const p = L.pool(c);
  assert.deepEqual(p.map((g) => g.plan.id), ["ielts", "swim"], "archived plans aren't in the pool; a plan with nothing in it still is");
  assert.deepEqual(p[0].items.map((x) => [x.item.id, x.count.left, x.week.done]), [["l3", 1, 1]]);
  assert.deepEqual(L.poolTotals(c, c.projects[0]), { items: 1, times: 1, min: 120, later: 1 });
});

test("a day grouped by plan: the row, its lines, plain tasks in between", () => {
  const c = ctx({ projects: [plan("ielts"), plan("swim")] });
  const tasks = [task({ id: "w", order: 1, title: "Work" }), task({ id: "l1", order: 2, projectId: "ielts", itemId: "i1" }), task({ id: "r", order: 5, projectId: "ielts" }),
    task({ id: "s", order: 3, projectId: "swim" }), task({ id: "l2", order: 6, projectId: "ielts", itemId: "i2" }), task({ id: "r2", order: 7, projectId: "ielts" }), task({ id: "chore-" + T, order: 0, projectId: "ielts" })];
  const b = L.dayBlocks(c, tasks);
  assert.deepEqual(b.map((x) => x.task ? x.task.id : x.plan.id + ":" + (x.row?.id || "-") + ":" + x.lines.map((t) => t.id).join("+")), ["chore-" + T, "w", "ielts:r:l1+l2", "swim:s:", "r2"]);
  assert.equal(L.rowOn(ctx({ projects: c.projects, tasks }), "ielts", T).id, "r");
  assert.equal(L.rowId("ielts", T, (id) => id === "pd:ielts:" + T), "pd:ielts:" + T + ":2");
});

test("the day after: unticked go back, half done stay as a record, empty rows go", () => {
  const P = "ielts", Y = "2026-10-28", from = "2026-10-26";
  const c = ctx({
    projects: [plan(P), plan("gym", {}, { place: "auto" })],
    tasks: [
      task({ id: "a", date: Y, projectId: P, itemId: "l3" }),
      task({ id: "b", date: Y, projectId: P, itemId: "mock", desc: "- [x] Listening\n- [ ] Reading" }),
      task({ id: "c", date: Y, projectId: P, itemId: "w3", status: "done" }),
      task({ id: "d", date: Y, projectId: P, itemId: "s3", times: "20m", actual: 20 }),
      task({ id: "e", date: Y, projectId: P, itemId: "x", desc: "- [x] One\n- [x] Two" }),
      task({ id: "f", date: Y, projectId: "swim-gone", itemId: "z" }),
      task({ id: "g", date: "2026-10-25", projectId: P, itemId: "old" }),
      task({ id: "h", date: T, projectId: P, itemId: "today" }),
      task({ id: "rowY", date: Y, projectId: P }),
      task({ id: "rowEmpty", date: "2026-10-27", projectId: P }),
      task({ id: "rowNote", date: "2026-10-27", projectId: "gym", desc: "felt tired" }),
      task({ id: "rt:gym:2026-10-27", date: "2026-10-27", projectId: "gym" }),
      task({ id: "rowTimed", date: "2026-10-27", projectId: P, times: "1h", actual: 60, order: 2 })
    ]
  });
  const s = L.settle(c, from);
  assert.deepEqual(s.drop, ["a"], "unticked, nothing recorded: back to the pool");
  assert.deepEqual(s.delay, ["b", "d"], "half the steps ticked, or time on it: kept as a record");
  assert.deepEqual(s.done, ["e"], "every step ticked counts as done");
  assert.deepEqual(s.rows, ["rowEmpty"], "a row with time, a note, lines left, or a fixed-day occurrence stays; before the switch nothing is touched");
  assert.deepEqual(L.settle(c, ""), { done: [], delay: [], drop: [], rows: [] });
});

// ---- 存储：真的店走一遍 ----

console.warn = () => {};   // 「Can't save on this device」
const SAMPLE = `# Exam prep

## One-off

- [ ] Book the exam · 30min · day 1–2

## Weekend: mock test (×3)

- [ ] Mock test #N
  - [ ] Listening · 30min
  - [ ] Reading · 1h

## Pool

- [ ] L3 listening set · 2h · ×4
- [ ] Words · 20min · any

Weekly: L3 ×2, W1 ×1

## Reserve

- [ ] R2 reading · 1h · ×2
`;

test("store: paste a plan, drag items onto days, tick steps, back to the pool, paste again", async () => {
  const store = await import("../js/store.js?lists");
  const day = store.today(), next = L.stepsOf;
  const made = store.pastePlan(SAMPLE, { group: "Build" });
  const plan = store.get("projects", made.planId);
  assert.equal(plan.name, "Exam prep");
  assert.deepEqual([plan.kind, plan.place, plan.group], ["regular", "pool", "Build"]);
  const items = store.all("items").filter((i) => i.projectId === plan.id).sort((a, b) => a.order - b.order);
  assert.deepEqual(items.map((i) => i.title + ":" + i.module), ["Book the exam:One-off", "Mock test:Weekend", "L3 listening set:Pool", "Words:Pool", "R2 reading:Reserve"]);
  const id = (title) => items.find((i) => i.title === title).id;
  assert.deepEqual(store.itemCfg(id("Mock test")).steps, [{ t: "Listening", min: 30 }, { t: "Reading", min: 60 }]);
  assert.equal(store.itemCfg(id("L3 listening set")).perWeek, 2);
  assert.equal(store.itemCfg(id("R2 reading")).later, true);

  // 拖一项进今天：那一行跟着建好，名字就是项的名字（不带号），步骤复制一份
  const m1 = store.placeItem(id("Mock test"), day);
  const row = L.rowOn(store.ctx(), plan.id, day);
  assert.ok(row && row.id.startsWith("pd:"), "the plan's row for the day");
  assert.equal(store.get("tasks", m1).title, "Mock test");
  assert.deepEqual(next(store.get("tasks", m1).desc).steps.map((s) => s.done), [false, false]);
  assert.equal(store.get("tasks", m1).est, 90);
  const l3 = store.placeItem(id("L3 listening set"), day);
  assert.equal(L.rowOn(store.ctx(), plan.id, day).id, row.id, "still one row");
  assert.equal(store.addTask({ title: "Exam prep", projectId: plan.id, date: day }), row.id, "adding the plan by name gives the same row");

  // 勾一步、再一步 → 这一项自己勾上；取消一步 → 跟着取消
  store.tickStep(m1, 0);
  assert.equal(store.get("tasks", m1).status, "");
  store.tickStep(m1, 1);
  assert.equal(store.get("tasks", m1).status, "done");
  store.tickStep(m1, 1);
  assert.equal(store.get("tasks", m1).status, "");

  // 放回 Pool：勾了一步的留着（Delay），剩下那步在 Pool 里接着做
  assert.ok(store.backToPool(m1));
  assert.equal(store.get("tasks", m1).status, "delay");
  const again = store.placeItem(id("Mock test"), day);
  assert.equal(store.get("tasks", again).title, "Mock test");
  assert.deepEqual(next(store.get("tasks", again).desc).steps.map((s) => s.t), ["Reading"]);
  assert.equal(store.get("tasks", m1).reason, L.CONTINUED);
  assert.equal(store.get("tasks", store.placeItem(id("Mock test"), day)).title, "Mock test", "the next time: no number either");
  assert.ok(store.backToPool(l3));
  assert.equal(store.get("tasks", l3), null, "nothing done on it: just gone");

  // Once 做完就拖不出来
  const book = store.placeItem(id("Book the exam"), day);
  store.tickLine(book);
  assert.equal(store.placeItem(id("Book the exam"), day), "");

  // 粘回来：改了名字的按代号对上，多了一项，少了的报出来（做过的标着 used）
  const res = store.pastePlan(SAMPLE.replace("L3 listening set · 2h · ×4", "L3 listening set + review · 2h · ×5").replace("- [ ] Book the exam · 30min · day 1–2\n", "- [ ] Score sheet · 15min\n"), { planId: plan.id });
  assert.equal(res.planId, plan.id);
  const after = store.all("items").filter((i) => i.projectId === plan.id);
  assert.ok(after.some((i) => i.id === id("L3 listening set") && i.title === "L3 listening set + review"), "same item, new name");
  assert.equal(store.itemCfg(id("L3 listening set")).n, 5);
  assert.ok(after.some((i) => i.title === "Score sheet"));
  assert.deepEqual(res.gone.map((g) => g.title + ":" + g.used), ["Book the exam:true"]);
  assert.match(store.planText(plan.id), /- \[ \] Mock test · ×3\n  - \[ \] Listening · 30min/);
});

test("store: the day after, unticked go back to the pool and empty rows go", async () => {
  const store = await import("../js/store.js?lists-settle");
  const day = store.today(), y = "2026-01-02";
  store.adoptLists();
  assert.equal(store.setting("lists-from"), day, "the day it switched over is kept");
  store.setSetting("lists-from", "2026-01-01");
  const plan = store.saveProject({ name: "Swim", group: "Fitness", kind: "regular", place: "pool" });
  const [a, b] = store.addPoolLines(plan, "Drills", "Kick sets · 20min · any\nTurns · 15min");
  const t1 = store.placeItem(a, y), t2 = store.placeItem(b, y);
  const free = store.ensureRow(plan, "2026-01-03");
  store.tickLine(t2);
  store.settleLists();
  assert.equal(store.get("tasks", t1), null, "unticked: back");
  assert.equal(store.get("tasks", t2).status, "done");
  assert.ok(L.rowOn(store.ctx(), plan, y), "the row with a done item under it stays");
  assert.equal(store.get("tasks", free), null, "an empty row goes");
  assert.equal(L.stateOf(store.ctx(), store.get("items", b)).count.left, 0);
});

test("store: old plans move over — Total becomes a plan with a pool, the big same-name item becomes the row", async () => {
  const store = await import("../js/store.js?lists-adopt");
  const p = store.saveProject({ name: "French", group: "Build", kind: "total", place: "auto", deadline: "2026-12-01", total: 600 });
  const big = store.all("items").find((i) => i.projectId === p);
  assert.equal(big.title, "French");
  store.addItems(p, "", ["Unit 1"], 45);
  const t = store.addTask({ title: "French", projectId: p, itemId: big.id, est: 60, date: "2026-01-05", status: "done" });
  store.adoptLists();
  const after = store.get("projects", p);
  assert.deepEqual([after.kind, after.place], ["regular", "pool"]);
  assert.equal(store.get("items", big.id), null);
  assert.equal(store.get("tasks", t).itemId, "", "its task is now the plan's row that day");
  assert.ok(store.all("items").some((i) => i.projectId === p && i.title === "Unit 1"), "other items stay, as Once");
  assert.equal(store.adoptLists(), false, "running it again changes nothing");
});

test("store: a task added under a plan is the plan's own unless its name picks a pool item (she said 2026-10-26)", async () => {
  const store = await import("../js/store.js?lists-own");
  const day = store.today();
  const plan = store.saveProject({ name: "IELTS CLB9", group: "Build", kind: "regular", place: "pool" });
  const [l3] = store.addPoolLines(plan, "Pool", "L3 listening set · 2h · ×11");
  const items = () => store.all("items").filter((i) => i.projectId === plan).length;

  const typed = store.addTask({ title: "IELTS", projectId: plan, date: day, est: 60 });
  assert.equal(store.get("tasks", typed).itemId, "", "a name that isn't in the pool: the plan's own task, not folded under it");
  assert.equal(items(), 1, "and nothing new is put in the pool");
  assert.equal(store.addTask({ title: "", projectId: plan, date: day }), typed, "no name: the plan's row for that day, which is the one already there");
  const second = store.addTask({ title: "Vocab review", projectId: plan, date: day });
  assert.notEqual(second, typed, "another name is its own task under the plan");
  const picked = store.addTask({ title: "l3 listening set", projectId: plan, date: day });
  assert.equal(store.get("tasks", picked).itemId, l3, "the name of a pool item picks it");
  assert.equal(store.get("tasks", picked).title, "L3 listening set");

  store.setStatus(typed, "done");
  assert.equal(store.get("tasks", typed).status, "done", "the plan's row can be marked done like any task");
});

test("store: tasks folded under items the old way are put back as the plan's own", async () => {
  const store = await import("../js/store.js?lists-unfold");
  const plan = store.saveProject({ name: "Work", group: "Work", kind: "regular", place: "pool" });
  store.addItems(plan, "Added", ["Work 1: deck"], 30);
  const added = store.all("items").find((i) => i.projectId === plan);
  const t = store.addTask({ title: "Work 1: deck", projectId: plan, itemId: added.id, date: "2026-10-26", est: 30, status: "done" });
  const [kept] = store.addPoolLines(plan, "Pool", "Quarterly report · 1h");
  store.adoptLists();
  assert.equal(store.get("items", added.id), null, "the item made on the side is gone");
  assert.equal(store.get("tasks", t).itemId, "", "its task is the plan's own again");
  assert.equal(store.get("tasks", t).status, "done", "and keeps what it had");
  assert.ok(store.get("items", kept), "items put in the pool on purpose stay");
});

test("store: no numbers on the times an item is done; old #k come off when opened (she said 2026-10-27)", async () => {
  const store = await import("../js/store.js?lists-nonum");
  const plan = store.saveProject({ name: "IELTS", group: "Build", kind: "regular", place: "pool" });
  // 加进 Pool 那一格打的是「•」、前面还带个点：照样认出时长和次数
  const [l4] = store.addPoolLines(plan, "", "• L4 listening error stats • 30min • ×3");
  const item = store.get("items", l4);
  assert.deepEqual([item.title, item.est, store.itemCfg(l4).n], ["L4 listening error stats", 30, 3]);
  const a = store.placeItem(l4, "2026-10-28"), b = store.placeItem(l4, "2026-10-29");
  assert.deepEqual([store.get("tasks", a).title, store.get("tasks", b).title], ["L4 listening error stats", "L4 listening error stats"]);
  // 以前留下来的「#2」「#8」：打开时拿掉；项自己名字里的 # 不碰，没挂项的不碰
  const [mock] = store.addPoolLines(plan, "", "Mock #3 · 1h · ×2");
  const old = store.addTask({ title: "L4 listening error stats #8", projectId: plan, itemId: l4, date: "2026-10-27", est: 30, status: "done" });
  const odd = store.addTask({ title: "Mock #3 #2", projectId: plan, itemId: mock, date: "2026-10-27", est: 60 });
  const own = store.placeItem(mock, "2026-10-28");
  const loose = store.addTask({ title: "Essay #2", date: "2026-10-27", est: 30 });
  store.adoptLists();
  assert.equal(store.get("tasks", old).title, "L4 listening error stats");
  assert.equal(store.get("tasks", odd).title, "Mock #3", "only the number at the end comes off");
  assert.equal(store.get("tasks", own).title, "Mock #3", "an item called that keeps its name");
  assert.equal(store.get("tasks", loose).title, "Essay #2", "not on an item: left alone");
  assert.equal(store.adoptLists(), false, "running it again changes nothing");
  // 改项的名字：还没勾的跟着改
  store.updateItem(l4, { title: "L4 error log" });
  assert.deepEqual([store.get("tasks", a).title, store.get("tasks", old).title], ["L4 error log", "L4 listening error stats"], "the done one keeps its name");
});

test("a day's planned minutes: a plan counts its items (its own minutes only without any); Delay and Drop don't count", () => {
  const c = ctx({ projects: [plan("ielts"), plan("swim")] });
  const tasks = [
    task({ id: "r", projectId: "ielts", est: 60 }),
    task({ id: "a", projectId: "ielts", itemId: "i1", est: 30, status: "done" }),
    task({ id: "b", projectId: "ielts", itemId: "i2", est: 105 }),
    task({ id: "c", projectId: "ielts", itemId: "i3", est: 8, status: "delay" }),
    task({ id: "s", projectId: "swim", est: 45 }),
    task({ id: "w", title: "Work", est: 20 }),
    task({ id: "x", title: "Dropped", est: 50, status: "drop" })
  ];
  assert.equal(L.dayMin(L.dayBlocks(c, tasks)), 30 + 105 + 45 + 20, "IELTS's own 60 isn't added on top of its items");
  assert.equal(L.dayMin([]), 0);
});
