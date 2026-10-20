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
  assert.ok(head.includes("Deep") && head.indexOf("Deep") < head.indexOf("Description"), "the new Deep column is added before Description");
  assert.ok(!head.includes("Category") && !head.includes("Done order"), head.join(","));
  const rows = tasks.objects();
  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.ID && r.Updated && r.Synced));
  const read = rows.find((r) => r.Task === "Read");
  assert.equal(read.Status, "Delay", "Partial and Later are one status now");
  assert.equal(read.Reason, "too tired");
  const gym = rows.find((r) => r.Task === "Gym");
  assert.deepEqual([gym.Times, gym["Actual min"]], ["40m", 40], "a Done with nothing recorded gets its estimate written down, so old totals stay the same");
  assert.equal(rows.find((r) => r.Task === "Module #4").Times, "", "one with Actual min already has its time");
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

test("version 6: Partial / Later become Delay, untimed Done gets a record, with a backup, once", () => {
  const g = load(CODE);
  g.sandbox.setup();
  const sh = g.ss.getSheetByName("Tasks"), head = sh.header();
  const row = (vals) => head.map((h) => (h in vals ? vals[h] : ""));
  [
    { Date: D("2026-10-01"), Task: "A", "Est min": 30, Status: "Partial", ID: "a", Updated: 1 },
    { Date: D("2026-10-01"), Task: "B", "Est min": 45, Status: "Later｜rain", ID: "b", Updated: 1 },
    { Date: D("2026-10-02"), Task: "C", "Est min": 50, Status: "Done", ID: "c", Updated: 1 },
    { Date: D("2026-10-02"), Task: "D", "Est min": 50, "Actual min": 20, Times: "20m", Status: "Done", ID: "d", Updated: 1 },
    { Date: D("2026-10-02"), Task: "Chores", "Est min": 0, Status: "Done", ID: "chore-2026-10-02", Updated: 1 },
    { Date: D("2026-10-03"), Task: "E", "Est min": 25, Status: "Drop", ID: "e", Updated: 1 }
  ].forEach((v, i) => row(v).forEach((x, j) => sh.put(i + 2, j + 1, x)));
  const tick = () => { const t = Date.now(); while (Date.now() <= t + 1); };   // 拉的时候同一毫秒写的也算，隔开一点
  g.sandbox.readAll_("tasks", true);   // 当它们是上一版留下的、已经同步过的行
  tick();
  const all0 = g.post({ secret: "CHANGE_ME", pull: true, since: 0 });
  tick();
  g.sandbox.setup();
  const rows = sh.objects(), by = (id) => rows.find((r) => r.ID === id);
  assert.deepEqual([by("a").Status, by("b").Status, by("c").Status, by("e").Status], ["Delay", "Delay｜rain", "Done", "Drop"]);
  assert.deepEqual([by("c").Times, by("c")["Actual min"]], ["50m", 50]);
  assert.deepEqual([by("d").Times, by("d")["Actual min"]], ["20m", 20], "recorded time is left alone");
  assert.equal(by("chore-2026-10-02").Times, "");
  assert.equal(by("c").Updated, 1, "Updated stays, so a newer edit on a device still wins");
  assert.ok(g.ss.getSheets().some((s) => s.name.startsWith("Backup Tasks")));
  const pulled = g.post({ secret: "CHANGE_ME", pull: true, since: all0.now }).pull.tables.tasks;
  assert.deepEqual(pulled.map((t) => t.id + " " + t.status + " " + (t.actual || 0)).sort(), ["a delay 0", "b delay 0", "c done 50"], "the changed rows come down on the next pull");
  const backups = g.ss.getSheets().filter((s) => s.name.startsWith("Backup Tasks")).length;
  g.sandbox.setup();
  assert.equal(g.ss.getSheets().filter((s) => s.name.startsWith("Backup Tasks")).length, backups, "nothing left to change, no new backup");
  g.post({ secret: "CHANGE_ME", push: { rows: { tasks: [{ id: "a", status: "delay", updated: Date.now() }] } } });
  assert.equal(sh.objects().find((r) => r.ID === "a").Status, "Delay");
});

test("pull, push, LWW, delete and log merge", () => {
  const g = oldSheet();
  g.sandbox.setup();
  assert.equal(g.post({ secret: "nope" }).error, "denied");
  const raw = (body) => JSON.parse(g.sandbox.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  assert.equal(raw({ secret: "CHANGE_ME", pull: true, push: { rows: { tasks: [{ id: "x", title: "old", updated: 9e15 }] } } }).error, "old page", "pages without a version are turned away");
  const hello = g.post({ secret: "CHANGE_ME" });
  assert.equal(hello.version, 6);
  const all = g.post({ secret: "CHANGE_ME", pull: true, since: 0 });
  assert.equal(all.ok, true);
  assert.equal(all.pull.tables.tasks.length, 6);
  assert.deepEqual(Object.keys(all.pull.tables).sort(), ["friends", "items", "log", "meets", "projects", "settings", "tasks"]);
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
  assert.deepEqual(want.header(), ["Name", "Type", "Vibe", "Note", "Priority"], "no date column");
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

test("reading: a priority on what's in Want — set when adding, changed later, cleared", () => {
  const g = load(CODE);
  g.sandbox.setup();
  const url = "https://docs.google.com/spreadsheets/d/1ReadingSheetIdAbcdefghijklmnop/edit";
  const book = g.spreadsheet("https://docs.google.com/spreadsheets/d/1ReadingSheetIdAbcdefghijklmnop");
  const tab = (name, rows) => { const sh = book.insertSheet(name); rows.forEach((r, i) => r.forEach((v, j) => sh.put(i + 1, j + 1, v))); return sh; };
  tab("Book", [["Year", "Month", "Name", "这一切真的值得吗"], [2026, "February", "Book two", "🥰"], ["", "", "Undated book"]]);
  // 以前建的 Want 页没有 Priority 那一列
  const want = tab("Want", [["Name", "Type", "Vibe", "Note"], ["The Bear", "TV", "😊", "chef"], ["Dune", "Book", "🎉", ""]]);
  g.post({ secret: "CHANGE_ME", push: { rows: { settings: [{ key: "reading", value: { url }, updated: 1 }] } } });
  const read = (reading) => g.post({ secret: "CHANGE_ME", reading }).reading;
  const prios = () => want.objects().map((r) => r.Name + ":" + (r.Priority || ""));

  const first = read({ list: true });
  assert.deepEqual(first.rows.filter((r) => r.want).map((r) => r.title + ":" + r.prio), ["The Bear:", "Dune:"]);
  assert.deepEqual(first.ranked, [], "a script that knows about priorities says so");
  assert.deepEqual(want.header(), ["Name", "Type", "Vibe", "Note"], "just looking doesn't add the column");

  const res = read({ list: true, add: [{ id: "a1", title: "Hades II", type: "Game", vibe: "👀", prio: "Soon" }, { id: "a2", title: "Arrival", type: "TV" }],
    rank: [{ id: "k1", title: " the bear", prio: "5 years" }, { id: "k2", title: "Hades II", prio: "5 years" }, { id: "k3", title: "Book two", prio: "Soon" }, { id: "k4", title: "Nowhere", prio: "Soon" }] });
  assert.deepEqual(want.header(), ["Name", "Type", "Vibe", "Note", "Priority"], "the column is added the first time it's needed");
  assert.deepEqual(res.added, ["a1", "a2"]);
  assert.deepEqual(res.ranked, ["k1", "k2"], "by name, and something added in the same request can be ranked too");
  assert.deepEqual(res.failed.map((f) => f.id), ["k3", "k4"], "only what's in Want: not a finished book, not something unknown");
  assert.deepEqual(prios(), ["The Bear:5 years", "Dune:", "Hades II:5 years", "Arrival:"]);
  assert.deepEqual(res.rows.filter((r) => r.want).map((r) => r.title + ":" + r.prio), ["The Bear:5 years", "Dune:", "Hades II:5 years", "Arrival:"], "the list that comes back is the Sheet as it is now");
  assert.equal(res.rows.find((r) => r.title === "Book two").prio, "", "other tabs have none");

  assert.deepEqual(read({ rank: [{ id: "k5", title: "The Bear", prio: "" }, { id: "k6", title: "Dune", prio: "Soon" }] }).ranked, ["k5", "k6"]);
  assert.deepEqual(prios(), ["The Bear:", "Dune:Soon", "Hades II:5 years", "Arrival:"]);
  // 看完了：那一行连同它的优先级一起离开 Want
  assert.deepEqual(read({ done: [{ id: "d1", title: "Dune", tab: "Book", year: 2026, month: 10 }] }).logged, ["d1"]);
  assert.deepEqual(prios(), ["The Bear:", "Hades II:5 years", "Arrival:"]);
});

test("reading: finished things land on their own tab, and leave Want", () => {
  const g = load(CODE);
  g.sandbox.setup();
  const url = "https://docs.google.com/spreadsheets/d/1ReadingSheetIdAbcdefghijklmnop/edit";
  const book = g.spreadsheet("https://docs.google.com/spreadsheets/d/1ReadingSheetIdAbcdefghijklmnop");
  const tab = (name, rows) => { const sh = book.insertSheet(name); rows.forEach((r, i) => r.forEach((v, j) => sh.put(i + 1, j + 1, v))); return sh; };
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const books = tab("Book", [["Year", "Month", "Name", "这一切真的值得吗"], [2023, "July", "Book one", "🥰", "book", "old note"], [2026, "February", "Book two", "🥰", "English"]]);
  books.dropdown(1, ["2023", "2024", "2025", "2026"]).dropdown(2, months).dropdown(4, ["🥰", "🎉", "💢"]).dropdown(5, ["book", "English", "image", "EN/book"]);
  const tv = tab("TV", [[], ["Year", "Month", "Name", "这一切真的值得吗"], [2025, "May", "Severance", "🎉", "", "great"], ["", "", "奥本海默"], ["", "", "Later show", "", "", "kept"]]);
  const fiction = tab("Fiction", [["Year", "Month", "Name", "这一切真的值得吗"], [2026, 5, "Novel one", "🎉"]]);
  tab("Game", [["Year", "Month", "Name", "这一切真的值得吗"], [2026, "May", "Game one", "🥰", "played"], [2026, "June", "Game two", "", "completed"], [2026, "June", "Game three", "", "played"]]);
  // 以前建的 Want 页带着 Added 那一列：照样能用，新加的那一格空着
  const want = tab("Want", [["Added", "Name", "Type", "Vibe", "Note"], ["2026-10-01", "The Bear", "TV", "😊", "chef"]]);
  g.post({ secret: "CHANGE_ME", push: { rows: { settings: [{ key: "reading", value: { url }, updated: 1 }] } } });
  const read = (reading) => g.post({ secret: "CHANGE_ME", reading }).reading;
  const line = (sh, n) => sh.rows[n - 1].slice(0, 6);

  assert.deepEqual(read({ add: [{ id: "w1", title: "Dune", type: "Book" }] }).added, ["w1"]);
  assert.deepEqual(line(want, 3), ["", "Dune", "Book", "", "", ""], "no date written any more");
  assert.deepEqual(read({ list: true }).kinds, { Book: ["book", "English", "image", "EN/book"], Game: ["played", "completed"] }, "the dropdown's options, or what the column already holds");

  const res = read({ list: true, done: [
    { id: "d1", title: "Book three", tab: "book", year: 2026, month: 10, mark: "🎉", kind: "EN/book", note: "=fun" },
    { id: "d2", title: "The Bear", tab: "TV", year: 2026, month: 10, mark: "🥰", note: "finale" },
    { id: "d3", title: "奥本海默", tab: "Book", year: 2026, month: 3, mark: "💢" },
    { id: "d4", title: "severance", tab: "TV", year: 2026, month: 1 },
    { id: "d5", title: "Nowhere", tab: "Films", year: 2026, month: 1 },
    { id: "d6", title: "Book four", tab: "Book", year: 2027, month: 1, mark: "🥰" },
    { id: "d7", title: "Novel two", tab: "Fiction", year: 2026, month: 7 }
  ] });
  assert.deepEqual(res.logged, ["d1", "d2", "d3", "d7"]);
  assert.deepEqual(res.dupes.map((d) => d.id + " " + d.tab), ["d4 TV"], "already there with a date");
  assert.deepEqual(res.failed.map((f) => f.id), ["d5", "d6"]);
  assert.match(res.failed[0].why, /no Films tab/);
  assert.match(res.failed[1].why, /Book: the Year dropdown has no "2027"/);

  assert.deepEqual(line(books, 4), [2026, "October", "Book three", "🎉", "EN/book", "=fun"], "right under the last dated row; the note stays text");
  assert.equal(books.getLastRow(), 4, "the one the dropdown refused left nothing behind");
  assert.deepEqual(line(tv, 3), [2025, "May", "Severance", "🎉", "", "great"]);
  assert.deepEqual(line(tv, 4), [2026, "October", "The Bear", "🥰", "", "chef\nfinale"], "a row is put in above the undated ones; the Want note comes along");
  assert.deepEqual(line(tv, 5), [2026, "March", "奥本海默", "💢", "", ""], "an undated row is filled in where it is, whatever tab was picked");
  assert.deepEqual(line(tv, 6), ["", "", "Later show", "", "", "kept"]);
  assert.deepEqual(line(fiction, 3), [2026, 7, "Novel two", "", "", ""], "months the way that tab writes them");
  assert.deepEqual(want.objects().map((r) => r.Name), ["Dune"], "finished = out of Want");
  const bear = res.rows.find((r) => r.title === "The Bear");
  assert.deepEqual([bear.tab, bear.want, bear.when, bear.mark], ["TV", false, "2026 Oct", "🥰"]);
  assert.ok(!("row" in bear) && !("full" in bear));

  // 把 Added 那一列删掉：之后不会再补回来
  want.deleteColumn(1);
  assert.deepEqual(read({ add: [{ id: "w2", title: "Arrival", type: "TV", vibe: "👀" }] }).added, ["w2"]);
  assert.deepEqual(want.header(), ["Name", "Type", "Vibe", "Note", "Priority"]);
  assert.deepEqual(want.objects().map((r) => r.Name + " " + r.Type), ["Dune Book", "Arrival TV"]);
  // 下拉只是提醒（不拒绝）：照写
  books.dropdown(1, ["2023", "2024", "2025", "2026"], false);
  assert.deepEqual(read({ done: [{ id: "d8", title: "Book four", tab: "Book", year: 2027, month: 1 }] }).logged, ["d8"]);
  assert.deepEqual(line(books, 5), [2027, "January", "Book four", "", "", ""]);
});

test("deep work: the flag goes up, shows as a tick in the Deep column, and comes back", () => {
  const g = oldSheet();
  g.sandbox.setup();
  const now = Date.now() + 1000;
  const res = g.post({ secret: "CHANGE_ME", pull: true, since: 0, push: { rows: { tasks: [
    { id: "deep-1", date: "2026-10-04", title: "Mock test", est: 60, deep: true, updated: now },
    { id: "deep-2", date: "2026-10-04", title: "Dishes", est: 15, deep: false, updated: now }
  ] } } });
  const back = Object.fromEntries(res.pull.tables.tasks.map((t) => [t.id, t]));
  assert.equal(back["deep-1"].deep, true);
  assert.equal(back["deep-2"].deep, false);
  const rows = g.ss.getSheetByName("Tasks").objects();
  assert.equal(rows.find((r) => r.ID === "deep-1").Deep, true);
  assert.equal(rows.find((r) => r.ID === "deep-2").Deep, "");
  assert.equal(back[Object.keys(back).find((k) => back[k].title === "Gym")].deep, false, "old rows are simply not deep");
});

// ---------- VERSION 5：大类、Friends、季度表、归档 ----------

const SEC = "CHANGE_ME";
const push = (g, rows, extra = {}) => g.post({ secret: SEC, push: { rows }, ...extra });
const pullAll = (g) => g.post({ secret: SEC, pull: true, since: 0 }).pull.tables;

test("group: a task can sit right on a project; plan tasks follow their plan's project", () => {
  const g = load(CODE);
  g.sandbox.setup();
  const head = g.ss.getSheetByName("Tasks").header();
  assert.ok(head.includes("Group") && head.indexOf("Group") < head.indexOf("Description"));
  push(g, { projects: [{ id: "p1", name: "Deck", group: "Work", updated: 1 }], tasks: [{ id: "t1", date: "2026-10-04", title: "Slides", est: 30, projectId: "p1", group: "Work", updated: 1 }, { id: "t2", date: "2026-10-04", title: "Vacuum", est: 20, group: "Chores", updated: 1 }] });
  const rows = () => Object.fromEntries(g.ss.getSheetByName("Tasks").objects().map((r) => [r.ID, r]));
  assert.deepEqual([rows().t1.Project, rows().t1.Group, rows().t2.Project, rows().t2.Group], ["Deck", "Work", "", "Chores"]);
  assert.equal(pullAll(g).tasks.find((t) => t.id === "t2").group, "Chores");
  // 只推任务（没动 Projects）：计划名在写入时就填上了，不用整页重填
  g.sandbox.recount_ = () => { throw new Error("full recount on a tasks-only push"); };
  const res = push(g, { tasks: [{ id: "t3", date: "2026-10-05", title: "Notes", est: 15, projectId: "p1", group: "Work", updated: 2 }] });
  assert.equal(res.recount, undefined);
  assert.equal(rows().t3.Project, "Deck");
});

test("group: moving a plan to another project refreshes its tasks' Group", () => {
  const g = load(CODE);
  g.sandbox.setup();
  push(g, { projects: [{ id: "p1", name: "Deck", group: "Work", updated: 1 }], tasks: [{ id: "t1", date: "2026-10-04", title: "Slides", est: 30, projectId: "p1", group: "Work", updated: 1 }, { id: "t2", date: "2026-10-04", title: "Vacuum", est: 20, group: "Chores", updated: 1 }] });
  push(g, { projects: [{ id: "p1", name: "Pitch deck", group: "Build", updated: 5 }] });
  const rows = Object.fromEntries(g.ss.getSheetByName("Tasks").objects().map((r) => [r.ID, r]));
  assert.deepEqual([rows.t1.Project, rows.t1.Group, rows.t2.Group], ["Pitch deck", "Build", "Chores"]);
});

test("friends: your own columns come and go by their header; With and Last are filled in", () => {
  const g = load(CODE);
  g.sandbox.setup();
  assert.deepEqual(g.ss.getSheetByName("Friends").header(), ["Name", "Next", "By", "Last", "ID", "Updated", "Synced"]);
  // 网页里排好的字段 → 表格里的列（插在 Next 前面）
  push(g, { settings: [{ key: "friend-fields", value: ["Field A", "Field B"], updated: 1 }] });
  assert.deepEqual(g.ss.getSheetByName("Friends").header().slice(0, 4), ["Name", "Field A", "Field B", "Next"]);
  push(g, {
    friends: [{ id: "f1", name: "Ana", more: { "Field A": "=x", "Field C": "new col" }, next: "send the notes", nextDate: "2026-10-20", updated: 1 }, { id: "f2", name: "Bo", more: {}, updated: 1 }],
    meets: [{ id: "m1", date: "2026-10-01", friends: ["f1", "f2"], note: "coffee", watch: "moving in May", updated: 1 }, { id: "m2", date: "2026-10-03", friends: ["f1"], note: "call", updated: 1 }, { id: "m3", date: "2999-01-01", friends: ["f2"], note: "planned", updated: 1 }]
  });
  const fr = g.ss.getSheetByName("Friends");
  assert.deepEqual(fr.header().slice(0, 5), ["Name", "Field A", "Field B", "Field C", "Next"]);
  const ana = fr.objects().find((r) => r.ID === "f1"), bo = fr.objects().find((r) => r.ID === "f2");
  assert.equal(ana["Field A"], "=x", "kept as text");
  assert.equal(ana["Field C"], "new col");
  assert.equal(ana.Next, "send the notes");
  const iso = (v) => (v instanceof Date ? v.getFullYear() + "-" + String(v.getMonth() + 1).padStart(2, "0") + "-" + String(v.getDate()).padStart(2, "0") : v);
  assert.equal(iso(ana.Last), "2026-10-03");
  assert.equal(iso(bo.Last), "2026-10-01", "a planned one in the future isn't the last time");
  assert.deepEqual(g.ss.getSheetByName("Catch-ups").objects().map((r) => r.With), ["Ana, Bo", "Ana", "Bo"]);
  const back = pullAll(g);
  assert.deepEqual(back.friends.find((f) => f.id === "f1").more, { "Field A": "=x", "Field C": "new col" });
  assert.equal(back.friends.find((f) => f.id === "f1").nextDate, "2026-10-20");
  assert.deepEqual(back.meets.find((m) => m.id === "m1").friends, ["f1", "f2"]);
  // 表格里手动加一列、填一格：下次拉下来就在 more 里；只改一个字段不动别的
  const cols = fr.header();
  fr.put(1, cols.length + 1, "Typed by hand");
  fr.put(2, cols.length + 1, "hello");
  push(g, { friends: [{ id: "f1", more: { "Field A": "changed" }, updated: 9 }] });
  const again = pullAll(g).friends.find((f) => f.id === "f1");
  assert.deepEqual(again.more, { "Field A": "changed", "Field C": "new col", "Typed by hand": "hello" });
  // 删掉一个人：行没了，别的还在
  g.post({ secret: SEC, push: { deletes: [{ table: "friends", id: "f2", at: Date.now() }] } });
  assert.deepEqual(g.ss.getSheetByName("Friends").objects().map((r) => r.Name), ["Ana"]);
});

test("friends: fields and people sent together still get their columns in the order you set", () => {
  const g = load(CODE);
  g.sandbox.setup();
  push(g, { friends: [{ id: "f1", name: "Ana", more: { "Field B": "b", "Field A": "a" }, updated: 1 }], settings: [{ key: "friend-fields", value: ["Field A", "Field B", "Field C"], updated: 1 }] });
  assert.deepEqual(g.ss.getSheetByName("Friends").header().slice(0, 5), ["Name", "Field A", "Field B", "Field C", "Next"]);
  assert.equal(g.ss.getSheetByName("Friends").objects()[0]["Field B"], "b");
});

test("quarter sheet: only the two cells of that day are written", () => {
  const g = load(CODE);
  g.sandbox.setup();
  const url = "https://docs.google.com/spreadsheets/d/1QuarterSheetIdAbcdefghijklmnop/edit#gid=0";
  const book = g.spreadsheet("https://docs.google.com/spreadsheets/d/1QuarterSheetIdAbcdefghijklmnop");
  const sh = book.insertSheet("2026 q4");
  [["", "", "+", "-", "progress", "focus", "read", "note"], ["", 1.25, 116, 50, 70, 0.4, 10, ""],
    [D("2026-10-09"), 0.99, 93, 34, 65, 0.2, 8, "by hand"], [D("2026-10-10"), 0.57, 40, 38, 10, 0, 6, "by hand"], ["2026-10-11", "", "", "", "", "", "", "keep me"], [D("2026-10-12"), "", "", "", "", "", "", ""]]
    .forEach((r, i) => r.forEach((v, j) => sh.put(i + 1, j + 1, v)));
  const ask = (rows) => g.post({ secret: SEC, quarter: { rows } }).quarter;
  assert.equal(ask([{ date: "2026-10-11", progress: 60, focus: 0.3 }]).error, "no sheet", "no link yet");
  push(g, { settings: [{ key: "quarter", value: { url, from: "2026-10-11" }, updated: 1 }] });
  const res = ask([{ date: "2026-10-11", progress: 60, focus: 0.3 }, { date: "2026-10-12", progress: 0, focus: 0 }, { date: "2026-10-13", progress: 5, focus: 0 }, { date: "2027-01-02", progress: 5, focus: 0 }]);
  assert.deepEqual(res.done, ["2026-10-11", "2026-10-12"]);
  assert.deepEqual(res.missing.map((m) => m.why), ["No row for 2026-10-13 on 2026 Q4", "No tab named 2027 Q1"]);
  assert.deepEqual(sh.rows.slice(2, 6).map((r) => [r[4], r[5], r[6], r[7]]), [[65, 0.2, 8, "by hand"], [10, 0, 6, "by hand"], [60, 0.3, "", "keep me"], [0, 0, "", ""]]);
  assert.deepEqual(sh.rows[1].slice(1, 6), [1.25, 116, 50, 70, 0.4], "the row under the header is left alone");
  // 只发日期、不带数：什么都不写，只回这一天找不找得到（贴完链接先探一下用）
  assert.deepEqual(ask([{ date: "2026-10-12" }, { date: "2026-10-20" }]), { done: ["2026-10-12"], missing: [{ date: "2026-10-20", why: "No row for 2026-10-20 on 2026 Q4" }], cells: true });
  assert.deepEqual(sh.rows[5].slice(4, 6), [0, 0], "a look-up without numbers writes nothing");
  // 没有这个页签、但整个表格就叫这个名字：用第一页
  const solo = g.spreadsheet("https://docs.google.com/spreadsheets/d/1SoloQuarterIdAbcdefghijklmnopq");
  solo.name = "2027 Q1";
  const s1 = solo.insertSheet("Sheet1");
  [["date", "Progress", "Focus"], [D("2027-01-02"), "", ""]].forEach((r, i) => r.forEach((v, j) => s1.put(i + 1, j + 1, v)));
  push(g, { settings: [{ key: "quarter", value: { url: "https://docs.google.com/spreadsheets/d/1SoloQuarterIdAbcdefghijklmnopq/edit" }, updated: 2 }] });
  assert.deepEqual(ask([{ date: "2027-01-02", progress: 42, focus: 0.1 }]).done, ["2027-01-02"]);
  assert.deepEqual(s1.rows[1].slice(1, 3), [42, 0.1]);
});

test("quarter sheet: the day's own scores and note go under their headers; nothing else moves", () => {
  const g = load(CODE);
  g.sandbox.setup();
  const book = g.spreadsheet("https://docs.google.com/spreadsheets/d/1QuarterSheetIdAbcdefghijklmnop");
  const sh = book.insertSheet("2026 Q4");
  [["", "+", "progress", "focus", "Read ", "g y m", "$", "note", "rest"], ["", 116, 70, 0.4, 10, 15, 2, "", 10],
    [D("2026-10-15"), 14, 14, 0, "", "", "", "Leak - wall", 0], [D("2026-10-16"), 0, "", "", 7, 8, 1, "by hand", 0]]
    .forEach((r, i) => r.forEach((v, j) => sh.put(i + 1, j + 1, v)));
  push(g, { settings: [{ key: "quarter", value: { url: "https://docs.google.com/spreadsheets/d/1QuarterSheetIdAbcdefghijklmnop/edit" }, updated: 1 }] });
  const ask = (rows) => g.post({ secret: SEC, quarter: { rows } }).quarter;
  const raw = [], put = sh.put.bind(sh);
  sh.put = (r, c, v) => { raw.push(v); put(r, c, v); };   // 写进去之前的样子（表格会把开头的 ' 吃掉）
  const res = ask([{ date: "2026-10-15", progress: 20, focus: 0.1, cells: { read: 8, gym: 0, $: 2, note: "period", nap: 3 } }, { date: "2026-10-16", cells: { read: 9, gym: "", note: "=1+1" } }]);
  assert.deepEqual(res.done, ["2026-10-15", "2026-10-16"]);
  assert.equal(res.cells, true, "tells the page this script knows cells");
  assert.deepEqual(res.skipped, [{ date: "2026-10-15", col: "nap", why: 'No "nap" column on 2026 Q4' }]);
  assert.deepEqual(sh.rows[2].slice(1, 9), [14, 20, 0.1, 8, 0, 2, "period", 0], "headers matched without case or spaces; 0 is written; the other cells stay");
  assert.deepEqual(sh.rows[3].slice(1, 9), [0, "", "", 9, "", 1, "=1+1", 0], "no progress / focus sent: those stay empty; \"\" clears a cell");
  assert.ok(raw.includes("'period") && raw.includes("'=1+1"), "a note goes in as plain text, never as a formula");
  raw.length = 0;
  ask([{ date: "2026-10-16", cells: { read: 9, note: "=1+1" } }]);
  assert.deepEqual(raw, [], "the same values again: nothing is rewritten");
  assert.deepEqual(ask([{ date: "2026-10-15", cells: { progress: 99, focus: 9 } }]).skipped.map((x) => x.col), ["progress", "focus"], "cells can't write over the two worked-out columns");
  assert.deepEqual(sh.rows[2].slice(2, 4), [20, 0.1]);
});

test("archive: old tasks move to the Archive tab, except ones a running plan still counts on", () => {
  const g = load(CODE);
  g.sandbox.setup();
  push(g, {
    projects: [{ id: "live", name: "Thesis", kind: "total", status: "active", updated: 1 }, { id: "closed", name: "Old course", kind: "total", status: "done", updated: 1 }],
    items: [{ id: "i1", projectId: "live", title: "Ch 1", est: 600, updated: 1 }, { id: "i2", projectId: "closed", title: "Unit", est: 60, updated: 1 }],
    tasks: [
      { id: "a", date: "2024-03-01", title: "=old one", est: 30, status: "done", updated: 1 },
      { id: "b", date: "2024-03-02", title: "Ch 1 draft", est: 60, status: "done", projectId: "live", itemId: "i1", updated: 1 },
      { id: "c", date: "2024-03-03", title: "Unit", est: 60, status: "done", projectId: "closed", itemId: "i2", updated: 1 },
      { id: "d", date: "2025-01-01", title: "New year", est: 10, status: "done", updated: 1 },
      { id: "e", date: "2024-12-31", title: "Last day", est: 10, updated: 1 }
    ]
  });
  const since = g.post({ secret: SEC, pull: true, since: 0 }).now;
  const res = g.post({ secret: SEC, pull: true, since, archive: { before: "2025-01-01" } });
  assert.equal(res.archive.moved, 3);
  assert.deepEqual(g.ss.getSheetByName("Tasks").objects().map((r) => r.ID), ["b", "d"]);
  const ar = g.ss.getSheetByName("Archive");
  assert.deepEqual(ar.header(), g.ss.getSheetByName("Tasks").header());
  assert.deepEqual(ar.objects().map((r) => r.ID + ":" + r.Task), ["a:=old one", "c:Unit", "e:Last day"]);
  assert.deepEqual(res.pull.deleted.map((d) => d.table + ":" + d.id).sort(), ["tasks:a", "tasks:c", "tasks:e"], "devices drop them on their next sync");
  assert.equal(g.post({ secret: SEC, archive: { before: "2025-01-01" } }).archive.moved, 0);
  assert.equal(g.post({ secret: SEC, archive: { before: "nonsense" } }).archive.moved, 0);
  // 第二次归档接在后面
  assert.equal(g.post({ secret: SEC, archive: { before: "2025-06-01" } }).archive.moved, 1);
  assert.deepEqual(ar.objects().map((r) => r.ID), ["a", "c", "e", "d"]);
});

test("tidy: delete records older than two weeks are cleared when the page asks", () => {
  const g = load(CODE);
  g.sandbox.setup();
  const del = g.ss.getSheetByName("Deleted");
  [["tasks", "old", 1, Date.now() - 15 * 864e5], ["tasks", "recent", 1, Date.now() - 13 * 864e5]].forEach((r, i) => r.forEach((v, j) => del.put(i + 2, j + 1, v)));
  g.post({ secret: SEC, pull: true });
  assert.equal(del.objects().length, 2, "not on every sync");
  g.post({ secret: SEC, tidy: true });
  assert.deepEqual(del.objects().map((r) => r.ID), ["recent"]);
});
