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

test("setup migrates the old sheet in place, with backups, and slims it", () => {
  const g = oldSheet();
  g.sandbox.setup();
  const names = g.ss.getSheets().map((s) => s.name);
  assert.ok(names.some((n) => n.startsWith("Backup Tasks")), names.join(","));
  assert.ok(names.includes("Items") && names.includes("Log") && names.includes("Settings") && names.includes("Deleted"));
  assert.ok(!names.includes("Notes") && !names.includes("Groups") && !names.includes("Time"), names.join(","));
  const hidden = g.ss.getSheets().filter((s) => s.isSheetHidden()).map((s) => s.name);
  assert.ok(["Log", "Settings", "Deleted", "Old Day capacity"].every((n) => hidden.includes(n)), hidden.join(","));
  assert.ok(hidden.some((n) => n.startsWith("Backup Tasks")));
  assert.ok(!hidden.includes("Tasks") && !hidden.includes("Projects") && !hidden.includes("Items"));
  const tasks = g.ss.getSheetByName("Tasks");
  const head = tasks.header();
  assert.equal(head[head.length - 1], "Description");
  assert.ok(head.includes("ID") && head.includes("Project ID") && head.includes("Optional") && head.includes("Times"));
  assert.ok(!head.includes("Category") && !head.includes("Done order"), head.join(","));
  const rows = tasks.objects();
  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.ID && r.Updated && r.Synced));
  const read = rows.find((r) => r.Task === "Read");
  assert.equal(read.Status, "Partial");
  assert.equal(read.Reason, "too tired");
  assert.equal(read.Optional, true, "max order of a day with several orders is optional");
  assert.equal(rows.find((r) => r.Task === "Gym").Status, "Done");
  assert.equal(rows.find((r) => r.Task === "Laundry").Description, "- step 1");
  const psheet = g.ss.getSheetByName("Projects");
  assert.ok(!psheet.header().includes("Planned min") && !psheet.header().includes("Progress"));
  const proj = psheet.objects();
  const m4 = proj.find((p) => p.Project === "Module #4");
  assert.ok(m4.ID);
  assert.equal(m4.Kind, "Total");
  assert.equal(m4.Place, "Pool");
  const linked = rows.filter((r) => r["Project ID"] === m4.ID);
  assert.equal(linked.length, 2, "case/space-insensitive name match");
  assert.equal(linked[0].Project, "Module #4");
  const items = g.ss.getSheetByName("Items").objects();
  assert.equal(items.length, 1, "only projects with planned or done time get an item");
  assert.equal(items[0]["Est min"], 600, "planned minutes read before the column goes");
  const cap = g.post({ secret: "CHANGE_ME", pull: true, since: 0 }).pull.tables.settings.find((r) => r.key === "capacity");
  assert.deepEqual(cap.value.overrides, { "2026-10-03": 180 });

  // running setup again changes nothing important
  g.sandbox.setup();
  assert.equal(g.ss.getSheets().filter((s) => s.name.startsWith("Backup Tasks")).length, 1);
  assert.equal(g.ss.getSheets().filter((s) => s.name.startsWith("Old ")).length, 1);
  assert.equal(g.ss.getSheetByName("Items").objects().length, 1);
  assert.equal(g.ss.getSheetByName("Tasks").objects().length, 6);
});

test("pull, push, LWW, delete and log merge", () => {
  const g = oldSheet();
  g.sandbox.setup();
  assert.equal(g.post({ secret: "nope" }).error, "denied");
  const raw = (body) => JSON.parse(g.sandbox.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  assert.equal(raw({ secret: "CHANGE_ME", pull: true, push: { rows: { tasks: [{ id: "x", title: "old", updated: 9e15 }] } } }).error, "old page", "pages without a version are turned away");
  const hello = g.post({ secret: "CHANGE_ME" });
  assert.equal(hello.version, 3);
  const all = g.post({ secret: "CHANGE_ME", pull: true, since: 0 });
  assert.equal(all.ok, true);
  assert.equal(all.pull.tables.tasks.length, 6);
  assert.deepEqual(Object.keys(all.pull.tables).sort(), ["items", "log", "projects", "settings", "tasks"]);
  const t0 = all.pull.tables.tasks.find((t) => t.title === "Laundry");
  assert.equal(t0.date, "2026-10-02");
  assert.equal(t0.status, "");
  const since = all.now;

  const later = Date.now() + 1000;
  const res = g.post({
    secret: "CHANGE_ME", pull: true, since,
    push: {
      rows: {
        tasks: [
          { id: "new-1", date: "2026-10-04", title: "=not a formula", est: 30, status: "", order: 1, updated: later },
          { id: t0.id, status: "done", actual: 25, times: "09:00-09:25 25m", updated: later },
          { id: "new-1", est: 35, updated: later + 1 }
        ],
        log: [{ date: "2026-10-04", need: 60, projects: { a: 60 }, updated: later }],
        settings: [{ key: "capacity", value: { default: 300, weekly: null, overrides: {} }, updated: later }]
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
  assert.equal(changed.find((t) => t.id === t0.id).times, "09:00-09:25 25m");
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

test("deleted rows don't come back from a stale device, but an undo does", () => {
  const g = load(CODE);
  g.sandbox.setup();
  g.post({ secret: "CHANGE_ME", push: { rows: { tasks: [{ id: "rt:r1:2026-10-06", date: "2026-10-06", title: "Gym", est: 40, updated: 1 }] } } });
  g.post({ secret: "CHANGE_ME", push: { deletes: [{ table: "tasks", id: "rt:r1:2026-10-06", at: 5000 }] } });
  assert.equal(g.ss.getSheetByName("Tasks").objects().length, 0);
  g.post({ secret: "CHANGE_ME", push: { rows: { tasks: [{ id: "rt:r1:2026-10-06", date: "2026-10-06", title: "Gym", est: 40, updated: 1 }] } } });
  assert.equal(g.ss.getSheetByName("Tasks").objects().length, 0, "generated again elsewhere: stays deleted");
  g.post({ secret: "CHANGE_ME", push: { rows: { tasks: [{ id: "rt:r1:2026-10-06", date: "2026-10-06", title: "Gym", est: 40, updated: 6000 }] } } });
  assert.equal(g.ss.getSheetByName("Tasks").objects().length, 1, "undo is newer than the delete");
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
  assert.equal(proj.Status, "Active");
  assert.equal(proj.Kind, "Total");
  assert.equal(proj.Place, "Pool");
  assert.equal(g.ss.getSheetByName("Tasks").objects()[0].Project, "French B2");
  assert.equal(g.ss.getSheetByName("Items").objects()[0].Project, "French B2");
  const back = g.post({ secret: "CHANGE_ME", pull: true, since: 0 }).pull.tables.projects[0];
  assert.equal(back.kind, "total");
  assert.equal(back.place, "pool");
});

test("last version's sheet: the Time tab folds into Times, old deletes are pruned", () => {
  const g = load(CODE);
  const put = (name, rows) => { const sh = g.ss.insertSheet(name); rows.forEach((r, i) => r.forEach((v, j) => sh.put(i + 1, j + 1, v))); return sh; };
  put("Tasks", [
    ["Date", "Task", "Est min", "Actual min", "Order", "Category", "Status", "Done order", "Reason", "Project", "Optional", "ID", "Project ID", "Item ID", "Updated", "Synced", "Description"],
    [D("2026-10-04"), "French", 45, 50, 1, "Main", "Done", 1, "", "", "", "t1", "", "", 111, 222, ""],
    [D("2026-10-04"), "=SUM(1)", 20, "", 2, "", "", "", "", "", "", "t2", "", "", 111, 222, ""]
  ]);
  put("Time", [
    ["Date", "Task", "From", "To", "Min", "ID", "Task ID", "Updated", "Synced"],
    [D("2026-10-04"), "French", "14:00", "14:20", 20, "x2", "t1", 1, 1],
    [D("2026-10-04"), "French", "09:10", "09:40", 30, "x1", "t1", 1, 1],
    [D("2026-10-04"), "French", "", "", 5, "x3", "t1", 1, 1]
  ]);
  put("Groups", [["Group"], ["Work 1"]]);
  put("Notes", [["Date", "Note"], [D("2026-10-04"), "hi"]]);
  put("Deleted", [["Table", "ID", "Deleted at", "Synced"], ["tasks", "gone-old", 1, Date.now() - 100 * 864e5], ["tasks", "gone-new", 1, Date.now() - 864e5]]);
  g.sandbox.setup();
  const rows = g.ss.getSheetByName("Tasks").objects();
  const fr = rows.find((r) => r.ID === "t1");
  assert.equal(fr.Times, "09:10-09:40 30m; 14:00-14:20 20m; 5m");
  assert.equal(fr["Actual min"], 55);
  assert.equal(fr.Updated, 111, "the change time stays, so newer edits on a device still win");
  assert.ok(fr.Synced > 222);
  assert.equal(rows.find((r) => r.ID === "t2").Task, "=SUM(1)");
  assert.ok(g.ss.getSheetByName("Old Time").isSheetHidden());
  assert.ok(g.ss.getSheetByName("Notes").isSheetHidden());
  assert.equal(g.ss.getSheetByName("Groups"), null);
  assert.deepEqual(g.ss.getSheetByName("Deleted").objects().map((r) => r.ID), ["gone-new"]);
  const pulled = g.post({ secret: "CHANGE_ME", pull: true, since: 0 }).pull.tables.tasks.find((t) => t.id === "t1");
  assert.equal(pulled.times, "09:10-09:40 30m; 14:00-14:20 20m; 5m");
});

test("day capacity edits from two devices are merged per day", () => {
  const g = load(CODE);
  g.sandbox.setup();
  const push = (value, updated) => g.post({ secret: "CHANGE_ME", push: { rows: { settings: [{ key: "capacity", value, updated }] } } });
  push({ default: 420, weekly: null, overrides: { "2026-10-08": 90, "2026-10-09": 60 } }, 10);
  push({ default: 300, weekly: null, overrides: { "2026-10-10": 0, "2026-10-09": null } }, 20);
  push({ default: 999, weekly: null, overrides: { "2026-10-11": 30, "2026-10-10": 120 } }, 15);   // older device
  const cap = g.post({ secret: "CHANGE_ME", pull: true, since: 0 }).pull.tables.settings.find((r) => r.key === "capacity");
  assert.equal(cap.value.default, 300, "the newer default wins");
  assert.deepEqual(cap.value.overrides, { "2026-10-08": 90, "2026-10-09": null, "2026-10-10": 0, "2026-10-11": 30 });
  assert.equal(cap.updated, 20);
});

test("old repeat rules become Regular plans; future untouched ones go, the rest link up", () => {
  const g = load(CODE);
  g.sandbox.setup();
  const pad = (n) => String(n).padStart(2, "0");
  const day = (k) => { const d = new Date(); d.setDate(d.getDate() + k); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const rule = { id: "r1", title: "Gym", category: "Fun", projectId: "p1", optional: false, days: [40, 40, 40, 40, 40, 40, 40], start: day(-2), end: day(5), skip: [day(1)], order: 1 };
  g.post({ secret: "CHANGE_ME", push: { rows: {
    projects: [{ id: "p1", name: "Fitness 2026", group: "Main - Fitness", color: "#00C2A8", updated: 5 }],
    settings: [{ key: "routines", value: [rule], updated: 7 }],
    tasks: [
      { id: "rt:r1:" + day(-1), date: day(-1), title: "Gym", est: 40, status: "done", projectId: "p1", updated: 9 },
      { id: "rt:r1:" + day(0), date: day(0), title: "Gym", est: 40, status: "", updated: 1 },
      { id: "rt:r1:" + day(2), date: day(2), title: "Gym", est: 40, status: "", updated: 1 },
      { id: "rt:r1:" + day(3), date: day(3), title: "Gym", est: 40, status: "", times: "20m", actual: 20, updated: 4 },
      { id: "rt:r1:" + day(4), date: day(4), title: "Gym", est: 40, status: "", updated: 1 }
    ]
  } } });
  g.sandbox.setup();
  const all = g.post({ secret: "CHANGE_ME", pull: true, since: 0 }).pull;
  const plan = all.tables.projects.find((p) => p.id === "r1");
  assert.equal(plan.name, "Gym");
  assert.equal(plan.group, "Main - Fitness");
  assert.equal(plan.kind, "regular");
  assert.equal(plan.place, "auto");
  assert.equal(plan.color, "#00C2A8");
  assert.deepEqual(plan.rule, { days: rule.days, start: rule.start, end: rule.end, skip: rule.skip, optional: false });
  const ids = all.tables.tasks.map((t) => t.id).sort();
  assert.deepEqual(ids, ["rt:r1:" + day(-1), "rt:r1:" + day(0), "rt:r1:" + day(3)].sort(), "future untouched ones are gone");
  assert.ok(all.tables.tasks.every((t) => t.projectId === "r1"));
  assert.equal(all.tables.tasks.find((t) => t.id === "rt:r1:" + day(-1)).updated, 9, "change times stay");
  assert.ok(!all.tables.settings.some((r) => r.key === "routines"));
  assert.ok(all.deleted.some((d) => d.id === "rt:r1:" + day(2)) && all.deleted.some((d) => d.table === "settings" && d.id === "routines"));
  // 再跑一次 setup 不出事
  g.sandbox.setup();
  assert.equal(g.ss.getSheetByName("Projects").objects().filter((p) => p.ID === "r1").length, 1);
});

test("reading: every tab is searched, new things go to a Want tab, duplicates are caught", () => {
  const g = load(CODE);
  g.sandbox.setup();
  const url = "https://docs.google.com/spreadsheets/d/1ReadingSheetIdAbcdefghijklmnop/edit?usp=sharing";
  const book = g.spreadsheet("https://docs.google.com/spreadsheets/d/1ReadingSheetIdAbcdefghijklmnop");
  const tab = (name, rows) => { const sh = book.insertSheet(name); rows.forEach((r, i) => r.forEach((v, j) => sh.put(i + 1, j + 1, v))); return sh; };
  const books = tab("Book", [["", "not a header", "secret-ish", "年度笔记"], [], ["Year", "Month", "Name", "这一切真的值得吗"],
    [2023, "July", "《法国高中生哲学课本1》", "🥰", "book"], [2026, "February", "The Last Days Of Socrates", "🥰", "English", "nice"]]);
  tab("TV", [[], ["Year", "Month", "Name", "这一切真的值得吗"], [2023, "July", "白莲花度假村1", "🥰"], [2025, "May", "Severance", "🎉", "", "great"], ["", "", "奥本海默"]]);
  tab("Notes", [["just some text"], ["no header here"]]);
  const read = (reading) => g.post({ secret: "CHANGE_ME", reading }).reading;
  assert.equal(read({ list: true }).error, "no sheet", "no link yet");
  g.post({ secret: "CHANGE_ME", push: { rows: { settings: [{ key: "reading", value: { url }, updated: 1 }] } } });

  const list = read({ list: true });
  assert.deepEqual(list.types, ["Book", "TV", "Notes"]);
  assert.deepEqual(list.rows.map((r) => r.tab + ": " + r.title), ["Book: 《法国高中生哲学课本1》", "Book: The Last Days Of Socrates", "TV: 白莲花度假村1", "TV: Severance", "TV: 奥本海默"], "rows above the header are skipped");
  const soc = list.rows[1];
  assert.equal(soc.when, "2026 Feb");
  assert.equal(soc.mark, "🥰");
  assert.equal(soc.note, "English · nice");
  assert.equal(list.rows[4].when, "", "a not-yet-dated row is still searchable");
  assert.equal(book.getSheetByName("Want"), null, "just looking doesn't add a tab");

  const res = read({ list: true, add: [
    { id: "a1", title: "法国高中生哲学课本1", type: "Book", vibe: "🎉" },
    { id: "a2", title: "The Bear", type: "TV", vibe: "😊", note: "=chef" },
    { id: "a3", title: " the  bear ", type: "TV" },
    { id: "a4", title: "奥本海默", type: "TV" }
  ] });
  assert.deepEqual(res.added, ["a2"]);
  assert.deepEqual(res.dupes.map((d) => d.id + " " + d.tab), ["a1 Book", "a3 TV", "a4 TV"], "any tab counts; 《》, case and spaces don't matter");
  const want = book.getSheetByName("Want");
  assert.deepEqual(want.header(), ["Added", "Name", "Type", "Vibe", "Note"]);
  const row = want.objects()[0];
  assert.equal(row.Name, "The Bear");
  assert.equal(row.Type, "TV");
  assert.equal(row.Vibe, "😊");
  assert.equal(row.Note, "=chef", "text, not a formula");
  assert.equal(books.objects().length, 4, "other tabs untouched");
  const again = read({ list: true });
  const bear = again.rows.find((r) => r.title === "The Bear");
  assert.equal(bear.want, true);
  assert.equal(bear.tab, "TV");
  assert.equal(bear.mark, "😊");
  assert.equal(bear.note, "=chef");
  assert.ok(!again.types.includes("Want"));
});
