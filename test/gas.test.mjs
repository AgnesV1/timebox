import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { load } from "./mock-gas.mjs";

const CODE = fileURLToPath(new URL("../Code.gs", import.meta.url));   // 路径里有空格，要这样转
const D = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

function oldSheet() {
  const g = load(CODE);
  const t = g.ss.insertSheet("Tasks");
  const rows = [
    ["Date", "Task", "Est min", "Actual min", "Order", "Category", "Status", "Done order", "Reason", "Description"],
    [D("2026-10-01"), "Module #4", 45, 50, 1, "Main", "Done", 1, "", "listening"],
    [D("2026-10-01"), "Gym", 40, "", 2, "Fun", "ok", 2, "", ""],
    [D("2026-10-01"), "Read", 30, "", 3, "Fun", "Partial｜too tired", "", "", ""],
    [D("2026-10-02"), "module #4 ", 45, "", 1, "Main", "Done", 1, "", ""],
    [D("2026-10-02"), "Laundry", 20, "", 1, "Chore", "", "", "", "- step 1"],
    [D("2026-10-03"), "Work 1: deck", 60, 35, 1, "Work", "Partial", 1, "call ran over", ""]
  ];
  rows.forEach((r, i) => r.forEach((v, j) => t.put(i + 1, j + 1, v)));
  const p = g.ss.insertSheet("Projects");
  [["Project", "Group", "Planned min", "Status", "Spent min", "Progress"], ["Module #4", "Main - French", 600, "Active", 95, 0.16], ["Empty one", "", "", "", "", ""]]
    .forEach((r, i) => r.forEach((v, j) => p.put(i + 1, j + 1, v)));
  const c = g.ss.insertSheet("Day capacity");
  [["Date", "Available min"], [D("2026-10-03"), 180]].forEach((r, i) => r.forEach((v, j) => c.put(i + 1, j + 1, v)));
  return g;
}

test("setup migrates the old sheet in place, with backups", () => {
  const g = oldSheet();
  g.sandbox.setup();
  const names = g.ss.getSheets().map((s) => s.name);
  assert.ok(names.some((n) => n.startsWith("Backup Tasks")), names.join(","));
  assert.ok(names.includes("Items") && names.includes("Notes") && names.includes("Log") && names.includes("Settings") && names.includes("Deleted"));
  const tasks = g.ss.getSheetByName("Tasks");
  const head = tasks.header();
  assert.equal(head[head.length - 1], "Description");
  assert.ok(head.includes("ID") && head.includes("Project ID") && head.includes("Optional"));
  const rows = tasks.objects();
  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.ID && r.Updated && r.Synced));
  const read = rows.find((r) => r.Task === "Read");
  assert.equal(read.Status, "Partial");
  assert.equal(read.Reason, "too tired");
  assert.equal(read.Optional, true, "max order of a day with several orders is optional");
  assert.equal(rows.find((r) => r.Task === "Gym").Status, "Done");
  assert.equal(rows.find((r) => r.Task === "Laundry").Description, "- step 1");
  const proj = g.ss.getSheetByName("Projects").objects();
  const m4 = proj.find((p) => p.Project === "Module #4");
  assert.ok(m4.ID);
  const linked = rows.filter((r) => r["Project ID"] === m4.ID);
  assert.equal(linked.length, 2, "case/space-insensitive name match");
  assert.equal(linked[0].Project, "Module #4");
  const items = g.ss.getSheetByName("Items").objects();
  assert.equal(items.length, 1, "only projects with planned or done time get an item");
  assert.equal(items[0]["Est min"], 600);
  assert.equal(m4["Planned min"], 600);
  assert.equal(m4["Spent min"], 95);
  assert.equal(Math.round(m4.Progress * 100), 15);
  assert.equal(g.ss.getSheetByName("Day capacity").objects()[0].Synced > 0, true);

  // running setup again changes nothing important
  g.sandbox.setup();
  assert.equal(g.ss.getSheets().filter((s) => s.name.startsWith("Backup Tasks")).length, 1);
  assert.equal(g.ss.getSheetByName("Items").objects().length, 1);
  assert.equal(g.ss.getSheetByName("Tasks").objects().length, 6);
});

test("pull, push, LWW, delete and log merge", () => {
  const g = oldSheet();
  g.sandbox.setup();
  assert.equal(g.post({ secret: "nope" }).error, "denied");
  assert.equal(g.post({ secret: "CHANGE_ME", rows: [], removed: [] }).error, "old page");
  const all = g.post({ secret: "CHANGE_ME", pull: true, since: 0 });
  assert.equal(all.ok, true);
  assert.equal(all.pull.tables.tasks.length, 6);
  const t0 = all.pull.tables.tasks.find((t) => t.title === "Laundry");
  assert.equal(t0.date, "2026-10-02");
  assert.equal(t0.status, "");
  assert.equal(all.pull.tables.capacity[0].date, "2026-10-03");
  const since = all.now;

  const later = Date.now() + 1000;
  const res = g.post({
    secret: "CHANGE_ME", pull: true, since,
    push: {
      rows: {
        tasks: [
          { id: "new-1", date: "2026-10-04", title: "=not a formula", est: 30, status: "", order: 1, updated: later },
          { id: t0.id, status: "done", actual: 25, updated: later },
          { id: "new-1", est: 35, updated: later + 1 }
        ],
        log: [{ date: "2026-10-04", need: 60, projects: { a: 60 }, updated: later }],
        settings: [{ key: "capacity", value: { default: 300, weekly: null }, updated: later }]
      },
      deletes: [{ table: "tasks", id: all.pull.tables.tasks.find((t) => t.title === "Gym").id, at: later }]
    }
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const changed = res.pull.tables.tasks;
  assert.equal(changed.length, 2, "only rows touched since the cursor");
  const n1 = changed.find((t) => t.id === "new-1");
  assert.equal(n1.title, "=not a formula");
  assert.equal(n1.est, 35);
  assert.equal(changed.find((t) => t.id === t0.id).status, "done");
  assert.equal(res.pull.deleted.length, 1);
  assert.equal(g.ss.getSheetByName("Tasks").objects().length, 6);
  assert.equal(res.pull.tables.settings[0].value.default, 300);

  // older edit loses
  g.post({ secret: "CHANGE_ME", push: { rows: { tasks: [{ id: t0.id, status: "", updated: later - 5000 }] } } });
  assert.equal(g.ss.getSheetByName("Tasks").objects().find((r) => r.ID === t0.id).Status, "Done");

  // log: the first share of a project stays, new projects are added
  g.post({ secret: "CHANGE_ME", push: { rows: { log: [{ date: "2026-10-04", need: 90, projects: { a: 90, b: 30 }, updated: later + 9 }] } } });
  const log = g.post({ secret: "CHANGE_ME", pull: true, since: 0 }).pull.tables.log[0];
  assert.deepEqual(log.projects, { a: 60, b: 30 });
  assert.equal(log.need, 90);
});

test("a fresh, empty spreadsheet works too", () => {
  const g = load(CODE);
  g.sandbox.setup();
  const r = g.post({ secret: "CHANGE_ME", pull: true, since: 0 });
  assert.equal(r.ok, true);
  assert.equal(r.pull.tables.tasks.length, 0);
  const p = g.post({ secret: "CHANGE_ME", push: { rows: { projects: [{ id: "p1", name: "French B2", status: "active", deadline: "2026-11-20", early: 2, updated: 1 }], items: [{ id: "i1", projectId: "p1", title: "Unit 1", est: 120, updated: 1 }], tasks: [{ id: "t1", date: "2026-10-04", title: "Unit 1", est: 60, status: "done", projectId: "p1", itemId: "i1", updated: 1 }] } } });
  assert.equal(p.ok, true, JSON.stringify(p));
  const proj = g.ss.getSheetByName("Projects").objects()[0];
  assert.equal(proj["Planned min"], 120);
  assert.equal(proj["Spent min"], 60);
  assert.equal(proj.Progress, 0.5);
  assert.equal(proj.Status, "Active");
  assert.equal(g.ss.getSheetByName("Tasks").objects()[0].Project, "French B2");
});

test("time log: its own sheet, task name filled in, old pages told which tables exist", () => {
  const g = load(CODE);
  g.sandbox.setup();
  assert.ok(g.ss.getSheetByName("Time"));
  const r = g.post({ secret: "CHANGE_ME", pull: true, since: 0, push: { rows: {
    tasks: [{ id: "t1", date: "2026-10-04", title: "French", est: 45, status: "", actual: 30, updated: 1 }],
    time: [{ id: "x1", date: "2026-10-04", taskId: "t1", from: "09:10", to: "09:40", min: 30, updated: 1 }]
  } } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.tables.includes("time"));
  const row = g.ss.getSheetByName("Time").objects()[0];
  assert.equal(row.Task, "French");
  assert.equal(row.From, "09:10");
  assert.equal(row.Min, 30);
  assert.deepEqual({ ...r.pull.tables.time[0], synced: 0 }, { date: "2026-10-04", task: "French", from: "09:10", to: "09:40", min: 30, id: "x1", taskId: "t1", updated: 1, synced: 0 });
});

test("spent counts timed tasks that aren't marked yet", () => {
  const g = load(CODE);
  g.sandbox.setup();
  g.post({ secret: "CHANGE_ME", push: { rows: {
    projects: [{ id: "p1", name: "French", status: "active", updated: 1 }],
    tasks: [{ id: "t1", date: "2026-10-04", title: "Unit 1", est: 60, status: "", actual: 25, projectId: "p1", updated: 1 },
      { id: "t2", date: "2026-10-04", title: "Unit 2", est: 60, status: "drop", actual: 10, projectId: "p1", updated: 1 }]
  } } });
  assert.equal(g.ss.getSheetByName("Projects").objects()[0]["Spent min"], 25);
});
