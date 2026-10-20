// 大类：旧名字归位、任务直接挂在大类上、改名 / 并进别的大类；Friends：任务带的那条记录跟着任务走
import { test } from "node:test";
import assert from "node:assert/strict";
import * as GR from "../js/groups.js";
import * as F from "../js/friends.js";
import * as store from "../js/store.js";

console.warn = () => {};   // store 在 node 里存不下来，只是提示

test("old project names find their new home; unknown ones stay as they are", () => {
  assert.deepEqual(["Work 1", "work", "Main - Gym", "Main - Fitness", "Main - English", "Main - French", "Fun", "Chores", "Friends", "Garden", ""].map(GR.match),
    ["Work", "Work", "Fitness", "Fitness", "Build", "Build", "Leisure", "Chores", "Friends", "", ""]);
  const [green, blue, , purple, ivory] = GR.PALETTE;
  const { groups, moves } = GR.adopt([
    { id: "a", name: "Deck", group: "Work 1", color: "#2F5BFF" }, { id: "b", name: "IELTS", group: "Main - English", color: "#FF3EA5" },
    { id: "c", name: "Gym", group: "", color: "#FF7A1A" }, { id: "d", name: "Tomatoes", group: "Garden", color: "#9B5CFF" },
    { id: "e", name: "Beans", group: "Garden", color: "#FFC400" }, { id: "f", name: "Loose plan", group: "", color: "#ABCDEF" },
    { id: "g", name: "Emails", group: "Work", color: blue }
  ]);
  assert.deepEqual(groups.map((g) => g.name), ["Build", "Work", "Friends", "Leisure", "Fitness", "Chores", "Garden"]);
  assert.deepEqual(moves, [
    { id: "a", group: "Work", color: blue }, { id: "b", group: "Build", color: green }, { id: "c", group: "Fitness", color: ivory },
    { id: "d", group: "Garden", color: purple }, { id: "e", group: "Garden", color: purple }
  ], "plans keep their own names; a plan with no project is matched by its name; untouched ones aren't listed");
  assert.equal(groups.find((g) => g.name === "Garden").color, purple, "an unknown project keeps going, in the new palette");
  assert.deepEqual(GR.withPlans(GR.DEFAULTS, [{ group: "Garden", color: "#111" }, { group: "Work" }]).map((g) => g.name).slice(-2), ["Chores", "Garden"]);
});

test("the six projects, sorted into once, with an undo", () => {
  const a = store.saveProject({ name: "IELTS", group: "Main - English", kind: "regular", place: "pool", rule: { perWeek: 3, min: 30 }, color: "#FF3EA5" });
  const b = store.saveProject({ name: "Gym", group: "", kind: "regular", place: "pool", rule: { perWeek: 3, min: 30 }, color: "#FF7A1A" });
  assert.deepEqual(store.groups().map((g) => g.name), ["Build", "Work", "Friends", "Leisure", "Fitness", "Chores", "Main - English"], "before sorting: the defaults plus what's there");
  const done = store.adoptGroups();
  assert.deepEqual(done.names.sort(), ["Build", "Fitness"]);
  assert.deepEqual([store.get("projects", a).group, store.get("projects", b).group], ["Build", "Fitness"]);
  assert.equal(store.get("projects", a).color, store.groupByName("Build").color);
  assert.equal(store.adoptGroups(), null, "only once");
  done.undo();
  assert.deepEqual([store.get("projects", a).group, store.get("projects", b).group, store.get("projects", a).color], ["Main - English", "", "#FF3EA5"]);
  assert.deepEqual(store.groups().map((g) => g.name), ["Build", "Work", "Friends", "Leisure", "Fitness", "Chores", "Main - English"]);
  assert.equal(store.adoptGroups(), null, "undone stays undone");
});

test("a task sits on a project directly, or follows its plan", () => {
  const plan = store.saveProject({ name: "Deck", group: "Work", kind: "regular", place: "pool", rule: { perWeek: 1, min: 30 } });
  const t1 = store.addTask({ title: "Vacuum", group: "Chores" }), t2 = store.addTask({ title: "Slides", projectId: plan, group: "Chores" });
  assert.equal(store.get("tasks", t1).group, "Chores");
  assert.equal(store.get("tasks", t2).group, "Work", "with a plan, the plan's project wins");
  assert.equal(store.groupOf(store.get("tasks", t2)), "Work");
  store.setTaskProject(t2, "", "Leisure");
  assert.deepEqual([store.get("tasks", t2).projectId, store.get("tasks", t2).group], ["", "Leisure"]);
  store.setTaskProject(t2, plan);
  assert.equal(store.get("tasks", t2).group, "Work");
  assert.equal(store.outgoing().rows.tasks.find((r) => r.id === t1).group, "Chores", "the group goes to the Sheet");
  // 改名：计划、直接挂着的任务都跟着
  store.renameGroup("Chores", "Home");
  assert.equal(store.get("tasks", t1).group, "Home");
  assert.ok(store.groupByName("Home") && !store.groupByName("Chores"));
  // 改成已经有的名字 = 并进去
  store.renameGroup("Home", "Work");
  assert.equal(store.get("tasks", t1).group, "Work");
  assert.ok(!store.groupByName("Home"));
  // 删计划：做过的任务还留在原来那个大类里
  store.setStatus(t2, "done");
  store.deleteProject(plan);
  assert.deepEqual([store.get("tasks", t2).projectId, store.get("tasks", t2).group], ["", "Work"]);
  // 换颜色：还用着原来颜色的计划跟着换
  const p2 = store.saveProject({ name: "Run", group: "Fitness", kind: "regular", place: "pool", rule: { perWeek: 1, min: 30 } });
  assert.equal(store.get("projects", p2).color, store.groupByName("Fitness").color);
  store.saveGroup("Fitness", { color: "#123456", grow: "deep" });
  assert.deepEqual([store.get("projects", p2).color, store.groupByName("Fitness").grow], ["#123456", "deep"]);
  store.addGroup("Garden");
  assert.ok(store.groupByName("Garden"));
  store.removeGroup("Garden");
  store.removeGroup("Fitness");
  assert.ok(!store.groupByName("Garden") && store.groupByName("Fitness"), "only an empty project can be removed");
});

test("friends: the record a task carries follows the task", () => {
  const ana = store.saveFriend({ name: "Ana", more: { City: "Toronto" } }), bo = store.saveFriend({ name: "Bo" });
  store.setSetting("friend-fields", ["Field A", "City"]);
  assert.deepEqual(store.friendFields(), ["Field A", "City"]);
  store.saveFriend({ id: bo, more: { Extra: "x" } });
  assert.deepEqual(store.friendFields(), ["Field A", "City", "Extra"], "a column that only exists on a person shows up too");
  const T = store.today();
  const t = store.addTask({ title: "Coffee", group: "Friends" });
  store.setTaskMeet(t, { note: "" });
  assert.equal(store.meetOfTask(t), null, "nothing to keep yet");
  store.setTaskMeet(t, { friends: [ana, bo] });
  store.setTaskMeet(t, { note: "caught up" });
  assert.deepEqual([store.meetOfTask(t).friends, store.meetOfTask(t).note, store.meetOfTask(t).date], [[ana, bo], "caught up", T]);
  assert.deepEqual(store.lastContact(), { [ana]: T, [bo]: T });
  // Delay：这次没见成，不算见过；记录还挂在这条任务上（要另约就自己再开一条）
  store.setStatus(t, "delay");
  assert.deepEqual(store.meetOfTask(t).friends, [ana, bo]);
  assert.deepEqual(store.lastContact(), {}, "a delayed catch-up didn't happen");
  store.setStatus(t, "delay");
  const next = new Date(Date.UTC(...T.split("-").map((v, i) => Number(v) - (i === 1 ? 1 : 0)))); next.setUTCDate(next.getUTCDate() + 1);
  store.moveTask(t, next.toISOString().slice(0, 10));
  assert.equal(store.meetOfTask(t).date, next.toISOString().slice(0, 10), "moving the task moves the record");
  assert.deepEqual(store.lastContact(), {}, "tomorrow hasn't happened");
  store.moveTask(t, T);
  const copy = store.get("tasks", t);
  assert.equal(store.meetOfTask(copy.id).date, T);
  // 做完了该做的事：记一条、清掉
  store.saveFriend({ id: ana, next: "send the notes", nextDate: "2026-01-01" });
  assert.equal(F.todo(store.friends(), T).due, 1);
  store.doneNext(ana, "sent");
  assert.deepEqual([store.get("friends", ana).next, store.get("friends", ana).nextDate], ["", ""]);
  assert.ok(store.meets().some((m) => m.note === "sent" && m.friends.join() === ana && m.date === T));
  // 删一个人：他一个人的记录一起删，几个人的那条只把他拿掉；删任务：它带的记录一起删
  store.deleteFriend(ana);
  assert.ok(!store.meets().some((m) => m.note === "sent"));
  assert.deepEqual(store.meetOfTask(copy.id).friends, [bo]);
  store.deleteTask(copy.id);
  assert.equal(store.all("meets").length, 0);
});

test("friends: last contact, to-dos and filters", () => {
  const T = "2026-10-11";
  const people = [
    { id: "a", name: "Ana", more: { City: "Toronto", Field: "Design" }, next: "lunch", nextDate: "2026-10-09" },
    { id: "b", name: "Bo", more: { City: "Montreal" }, next: "call", nextDate: "2026-10-20" },
    { id: "c", name: "Cy", more: { City: "Toronto" }, next: "", nextDate: "" },
    { id: "d", name: "Di", more: {}, next: "someday", nextDate: "" }
  ];
  const meets = [{ id: "1", date: "2026-10-01", friends: ["a", "b"] }, { id: "2", date: "2026-08-01", friends: ["c"] }, { id: "3", date: "2026-10-12", friends: ["c"] }, { id: "mt:x", date: "2026-10-10", friends: ["b"], taskId: "x" }];
  const last = F.lastContact(meets, T, (id) => (id === "x" ? "drop" : ""));
  assert.deepEqual(last, { a: "2026-10-01", b: "2026-10-01", c: "2026-08-01" }, "a dropped task or a future date isn't a contact");
  const td = F.todo(people, T);
  assert.deepEqual(td.list.map((x) => x.friend.name + (x.late ? "!" : "")), ["Ana!", "Bo", "Di"]);
  assert.equal(td.due, 1);
  const names = (opts) => F.filter(people, opts, last, T).map((f) => f.name).join("");
  assert.equal(names({ q: "toro" }), "AnaCy");
  assert.equal(names({ where: [{ field: "City", value: "toronto" }, { field: "Field", value: "des" }] }), "Ana");
  assert.equal(names({ todo: "has" }), "AnaBoDi");
  assert.equal(names({ todo: "late" }), "Ana");
  assert.equal(names({ seen: "never" }), "Di");
  assert.equal(names({ seen: "30" }), "CyDi");
  assert.deepEqual(F.valuesOf(people, "City"), ["Toronto", "Montreal"]);
  assert.deepEqual(F.parseFields(" One \n\nTwo\none\n"), ["One", "Two"]);
  assert.deepEqual([F.ago("2026-10-11", T), F.ago("2026-10-09", T), F.ago("2026-10-13", T), F.ago("", T)], ["today", "2 days ago", "in 2 days", ""]);
});

test("storage: warns two weeks before this device fills up", () => {
  const fine = store.usageOf(400000, 420, 49);            // 7 a day: years of room
  assert.ok(!fine.warn && fine.daysLeft > 1000);
  assert.equal(store.usageOf(4960000, 420, 49).warn, true, "13 days of room left at this pace");
  assert.equal(store.usageOf(4700000, 420, 0).warn, true, "over 90% used, even with nothing logged lately");
  assert.equal(store.usageOf(1000, 420, 0).daysLeft, Infinity);
  assert.equal(store.usageOf(1000, 420, 7, true).warn, true, "the last save didn't fit");
  const now = store.storage();   // node 里没有 localStorage：每次都存不进去，所以这里是 full
  assert.ok(now.tasks >= 0 && now.used > 0 && now.limit === 5e6);
  assert.equal(now.warn, now.full);
});

test("friends: rows pasted from a spreadsheet", () => {
  assert.deepEqual(F.parseDated("5.17 coffee", 2026), { date: "2026-05-17", note: "coffee" });
  assert.deepEqual(F.parseDated("6/5", 2025), { date: "2025-06-05", note: "" });
  assert.deepEqual(F.parseDated("2024-1-9 call  about the move ", 2026), { date: "2024-01-09", note: "call  about the move" });
  assert.deepEqual(F.parseDated("20260517 picnic", 1999), { date: "2026-05-17", note: "picnic" });
  assert.deepEqual(["13.1 x", "2.30 x", "Mock", "5.17coffee", "", "3 people"].map((c) => F.parseDated(c, 2026)), [null, null, null, null, null, null]);
  const body = [
    "Ana\tDesign\tToronto\t\t5.17 coffee\t6.5 lunch",
    "",
    "Bo",
    "Cy\t\tMontreal\t20260517 the picnic\tstray note\t5.20 call",
    "ana\t\tOttawa\tkept\t5.17 coffee\t7.1",
    "\tno name\tignored"
  ].join("\r\n");
  const want = [
    { name: "Ana", values: { "Field A": "Design", "Field B": "Ottawa", "Field C": "kept" }, meets: [{ date: "2026-05-17", note: "coffee" }, { date: "2026-06-05", note: "lunch" }, { date: "2026-07-01", note: "" }] },
    { name: "Bo", values: {}, meets: [] },
    { name: "Cy", values: { "Field B": "Montreal", "Field C": "20260517 the picnic · stray note" }, meets: [{ date: "2026-05-20", note: "call" }] }
  ];
  // 没有表头：按字段的顺序
  const byPlace = F.parseImport(body, ["Field A", "Field B", "Field C"], 2026);
  assert.deepEqual(byPlace.rows, want, "blank lines skipped; the same name merges; a dated cell inside the fields stays text; an undated extra joins the last field");
  assert.deepEqual([byPlace.headed, byPlace.added], [false, []]);
  // 有表头：照表头对列，字段清单多一个、顺序不一样都不要紧
  const head = " name \tfield-a\tFIELD B\tField C\t\t\n";
  const byHead = F.parseImport(head + body, ["Extra", "Field C", "Field B", "Field A"], 2026);
  assert.deepEqual(byHead.rows, want, "headings win over position, however many fields there are and whatever their order");
  assert.deepEqual([byHead.headed, byHead.added, byHead.fields], [true, [], ["Extra", "Field C", "Field B", "Field A"]]);
  // 表头里的新名字 = 新字段；不带日期的多余格子并进 Note
  const fresh = F.parseImport("Name\tCity\tNote\t\nEd\tParis\tkind\tstray\t5.1 tea", ["Field A"], 2026);
  assert.deepEqual(fresh.rows, [{ name: "Ed", values: { City: "Paris", Note: "kind · stray" }, meets: [{ date: "2026-05-01", note: "tea" }] }]);
  assert.deepEqual([fresh.added, fresh.fields], [["City", "Note"], ["Field A", "City", "Note"]]);
  assert.deepEqual(F.parseImport("", ["Field A"], 2026).rows, []);
});

test("friends: importing fills people in by name and never doubles anything", () => {
  store.setSetting("friend-fields", ["Field A", "Field B", "Field C"]);
  for (const f of store.friends()) store.deleteFriend(f.id);
  const dee = store.saveFriend({ name: "Dee", more: { "Field A": "old", "Field B": "keep me" }, next: "write back" });
  const x = F.parseImport("dee\tnew\t\t\t5.17 coffee\nEd\t\tParis\t\t5.17 coffee\t5.18 walk\nFay", store.friendFields(), 2026);
  store.importFriends(x.rows, x.added);
  const names = () => store.friends().map((f) => f.name);
  assert.deepEqual(names(), ["Dee", "Ed", "Fay"]);
  assert.deepEqual(store.get("friends", dee).more, { "Field A": "new", "Field B": "keep me" }, "filled cells win, empty ones leave what was there");
  assert.equal(store.get("friends", dee).next, "write back");
  const ed = store.friends().find((f) => f.name === "Ed");
  assert.deepEqual(ed.more, { "Field B": "Paris" });
  const log = () => store.meets().map((m) => m.date + " " + m.note + " " + m.friends.map((id) => store.get("friends", id).name).join("+")).sort();
  assert.deepEqual(log(), ["2026-05-17 coffee Dee", "2026-05-17 coffee Ed", "2026-05-18 walk Ed"], "one record per person");
  store.importFriends(x.rows, x.added);
  assert.deepEqual(names(), ["Dee", "Ed", "Fay"]);
  assert.equal(log().length, 3, "pasting the same rows again adds nothing");
  assert.equal(store.lastContact()[ed.id], "2026-05-18");
  // 带表头、表头里有新名字：字段清单接上新的那个
  const y = F.parseImport("Name\tfield b\tTown\nFay\tx\tLyon", store.friendFields(), 2026);
  store.importFriends(y.rows, y.added);
  assert.deepEqual(store.friendFields(), ["Field A", "Field B", "Field C", "Town"]);
  assert.deepEqual(store.friends().find((f) => f.name === "Fay").more, { "Field B": "x", Town: "Lyon" });
});

test("friends: birthdays, greetings and key dates", () => {
  assert.deepEqual([F.lunarEve(2026), F.lunarEve(2027), F.lunarEve(2028), F.lunarEve(2030)], ["2026-02-16", "2027-02-05", "2028-01-25", "2030-02-02"]);
  assert.match(F.lunarEve(2045), /^2045-0[12]-\d\d$/, "beyond the table it is worked out");
  assert.deepEqual(["3.14", "03-14", "3/14", "1995-03-14", "19950314", "2.30", "13.1", "soon", ""].map((s) => F.formatDay(F.parseDay(s))), ["03-14", "03-14", "03-14", "1995-03-14", "1995-03-14", "", "", "", ""]);
  const dates = F.parseDates("06-20 graduation; 2027-5-1 moving day\n7.4;nonsense here");
  assert.deepEqual(dates, [{ y: 0, m: 6, d: 20, label: "graduation" }, { y: 2027, m: 5, d: 1, label: "moving day" }, { y: 0, m: 7, d: 4, label: "" }]);
  assert.equal(F.formatDates(dates), "06-20 graduation; 2027-05-01 moving day; 07-04");
  assert.deepEqual(F.greetKeys("christmas, New years eve、Teachers' Day, Easter"), ["teachers", "christmas", "new-year-eve"]);
  assert.equal(F.formatGreet(["lunar-eve", "christmas"]), "Christmas, Lunar New Year's Eve");
  assert.deepEqual(F.specialFields(["Field A", "birthday", "GIFT", "Key Dates", "Greetings"]), { birthday: "birthday", greet: "Greetings", dates: "Key Dates", gift: "GIFT", marks: "" });
  assert.deepEqual(F.specialFields(["Field A", "MARKS"]), { birthday: "", greet: "", dates: "", gift: "", marks: "MARKS" });

  const names = { birthday: "Birthday", greet: "Greetings", dates: "Key dates", gift: "Gift" };
  const ana = { id: "a", name: "Ana", more: { Birthday: "1995-10-25", Gift: "tea set", Greetings: "Christmas, Lunar New Year's Eve", "Key dates": "10-20 thesis day; 2026-11-01 moving" } };
  const bo = { id: "b", name: "Bo", more: { Birthday: "02-29", Greetings: "Christmas" } };
  const got = (f, from, to) => F.occasions(f, names, from, to).map((o) => o.date + " " + o.label + (o.gift ? " [" + o.gift + "]" : "") + " " + o.id);
  assert.deepEqual(got(ana, "2026-10-01", "2027-02-28").sort(), [
    "2026-10-20 thesis day oc:a:d1020-thesisday:2026", "2026-10-25 Birthday [tea set] oc:a:birthday:2026", "2026-11-01 moving oc:a:d1101-moving:2026",
    "2026-12-25 Christmas oc:a:christmas:2026", "2027-02-05 Lunar New Year's Eve oc:a:lunar-eve:2027"
  ]);
  assert.deepEqual(got(bo, "2027-02-01", "2028-03-01"), ["2027-02-28 Birthday oc:b:birthday:2027", "2028-02-29 Birthday oc:b:birthday:2028", "2027-12-25 Christmas oc:b:christmas:2027"], "Feb 29 falls on the 28th in other years");
  assert.deepEqual(got({ id: "c", name: "Cy", more: {} }, "2026-01-01", "2026-12-31"), []);
  assert.deepEqual(F.occasions(ana, F.specialFields([]), "2026-01-01", "2026-12-31"), [], "no such fields, nothing to show");

  // 接下来 30 天；过了没做的留 7 天；同一天同一件事的人排在一起
  const done = new Set(["oc:a:d1020-thesisday:2026"]);
  const up = F.comingUp([bo, ana, { id: "d", name: "Di", more: { Birthday: "10-25" } }], names, "2026-10-22", { ahead: 30, back: 7 }, (id) => done.has(id));
  assert.deepEqual(up.groups.map((g) => g.date + " " + g.label + ": " + g.items.map((x) => x.friend.name + (x.done ? "✓" : "")).join(",")), ["2026-10-25 Birthday: Ana,Di", "2026-11-01 moving: Ana"], "a past one that's done is gone");
  assert.equal(up.due, 2, "the two birthdays are within three days");
  const late = F.comingUp([ana], names, "2026-10-22", { ahead: 5, back: 7 }, () => false);
  assert.deepEqual(late.groups.map((g) => g.label + (g.late ? "!" : "")), ["thesis day!", "Birthday"]);
  const year = F.comingUp([ana, bo], names, "2026-10-22", { ahead: 365, back: 0 }, () => false);
  assert.deepEqual(year.groups.find((g) => g.label === "Christmas").items.map((x) => x.friend.name), ["Ana", "Bo"]);
});

test("friends: ticking a day off logs it once, and can be undone", () => {
  for (const f of store.friends()) store.deleteFriend(f.id);
  store.setSetting("friend-fields", ["Field A", "gift"]);
  const T = store.today(), md = T.slice(5);
  const gil = store.saveFriend({ name: "Gil", more: { gift: "tea", Birthday: md, Greetings: "Christmas" } });
  assert.deepEqual(store.friendSpecial(), { birthday: "Birthday", greet: "Greetings", dates: "", gift: "gift", marks: "" }, "the three date fields are found once someone has them; Gift is the user's own");
  assert.deepEqual(store.friendFields(), ["Field A", "gift", "Birthday", "Greetings"]);
  const up = () => F.comingUp(store.friends(), store.friendSpecial(), T, { ahead: 3, back: 0 }, store.occasionDone);
  const [oc] = up().groups[0].items;
  assert.deepEqual([oc.label, oc.gift, oc.done, up().due], ["Birthday", "tea", false, 1]);
  store.toggleOccasion(oc.id, gil, "Birthday (gift)");
  assert.deepEqual([up().groups[0].items[0].done, up().due], [true, 0]);
  assert.deepEqual(store.meets().filter((m) => m.friends.includes(gil)).map((m) => m.date + " " + m.note), [T + " Birthday (gift)"], "it is in their history");
  assert.equal(store.lastContact()[gil], T);
  store.toggleOccasion(oc.id, gil, "Birthday (gift)");
  assert.deepEqual([up().groups[0].items[0].done, store.meets().length], [false, 0]);
});

test("friends: three marks that light up, and filtering by them", () => {
  const [hall, mind, spark] = F.MARKS;
  assert.deepEqual(F.marksOf("x " + spark + hall + " y"), [hall, spark], "always in the same order, whatever else is in the cell");
  assert.deepEqual([F.marksOf(""), F.marksOf(undefined)], [[], []]);
  assert.equal(F.toggleMark("", mind), mind);
  assert.equal(F.toggleMark(spark + mind, hall), hall + mind + spark);
  assert.equal(F.toggleMark(hall + mind + spark, mind), hall + spark);
  assert.equal(F.toggleMark(hall, hall), "");
  assert.deepEqual(F.MARKS, ["🏛️", "🧠", "✨"]);
  assert.deepEqual(F.marksOf("🫂🎩"), [hall, spark], "the two earlier marks still light up as the new ones");
  assert.deepEqual(F.marksOf("🏛"), [hall], "with or without the variation selector");
  assert.equal(F.toggleMark("🎩", mind), hall + mind, "and are written back the new way");
  assert.deepEqual([F.freshMarks("🎩🫂"), F.freshMarks(hall + mind), F.freshMarks(""), F.freshMarks(undefined)], [hall + spark, hall + mind, "", ""]);
  const people = [{ id: "a", name: "Ana", more: { Marks: hall + mind } }, { id: "b", name: "Bo", more: { Marks: mind } }, { id: "c", name: "Cy", more: {} }];
  const names = (marks) => F.filter(people, { marks, marksField: "Marks" }, {}, "2026-10-12").map((f) => f.name).join("");
  assert.deepEqual([names([]), names([mind]), names([hall, mind]), names([spark])], ["AnaBoCy", "AnaBo", "Ana", ""], "every lit mark has to be there");
});

test("projects: what each one is watched for, and its health over the last week", async () => {
  const GR = await import("../js/groups.js");
  const S = await import("../js/stats.js");
  assert.deepEqual(["Work", "Chores", "Build", "Fitness", "Leisure", "Friends"].map((name) => GR.trackOf(GR.DEFAULTS.find((g) => g.name === name))), ["", "", "progress", "min", "range", "contact"]);
  assert.equal(GR.trackOf({ name: "Gym" }), "min", "a name that reads like one of them");
  assert.equal(GR.trackOf({ ...GR.DEFAULTS.find((g) => g.name === "Leisure"), friends: true }), "range", "Leisure that can pick people is still watched for Relax");
  assert.equal(GR.trackOf({ name: "Side gig" }), "progress", "unknown ones keep showing progress");
  assert.equal(GR.trackOf({ name: "Work", track: "progress" }), "progress", "a saved choice wins");
  assert.equal(GR.trackOf({ name: "Build", track: "" }), "");
  assert.equal(GR.trackOf(null), "progress");

  const groups = [{ name: "Fitness", grow: "all" }, { name: "Leisure", grow: "deep" }, { name: "Friends", grow: "", friends: true }, { name: "Work", grow: "all" }];
  const t = (date, group, actual, extra = {}) => ({ id: date + group + actual, date, group, status: "done", est: actual, actual, ...extra });
  const ctx = { today: "2026-10-12", groups, items: [], projects: [{ id: "g", name: "Gym", group: "Fitness" }], tasks: [
    t("2026-10-06", "", 60, { projectId: "g" }), t("2026-10-10", "Fitness", 90), t("2026-10-05", "Fitness", 240),   // the 5th is eight days back
    t("2026-10-08", "Leisure", 200), t("2026-10-11", "Leisure", 120, { deep: true }), t("2026-10-12", "Work", 500)
  ] };
  const fit = S.groupHealth(ctx, groups[0]);
  assert.deepEqual([fit.kind, fit.min, fit.limit, fit.level], ["min", 150, 180, "low"], "plans and loose tasks of the last 7 days, against 3 hours");
  assert.equal(S.groupHealth(ctx, { ...groups[0], min: 120 }).level, "ok", "its own number of hours");
  const lei = S.groupHealth(ctx, groups[1], { weekly: { relaxMin: 300, relaxMax: 1200 } });
  assert.deepEqual([lei.min, lei.lo, lei.hi, lei.level], [200, 300, 1200, "low"], "deep leisure is growth, not relax");
  assert.equal(S.groupHealth(ctx, groups[1], { weekly: { relaxMin: 60, relaxMax: 180 } }).level, "high");
  assert.equal(S.groupHealth(ctx, groups[1], { weekly: { relaxMin: 0, relaxMax: 0 } }).level, "ok", "no limits, nothing to miss");
  assert.deepEqual([S.groupHealth(ctx, groups[2], { lastContact: "2026-09-28" }).level, S.groupHealth(ctx, groups[2], { lastContact: "2026-09-27" }).level], ["ok", "low"], "fourteen days is still fine");
  assert.deepEqual(S.groupHealth(ctx, groups[2]), { kind: "contact", days: null, limit: 14, level: "low" });
  assert.equal(S.groupHealth(ctx, groups[3]), null, "work isn't watched");
});

test("projects: default colours changed once, and each has a neon twin for the dial", async () => {
  const GR = await import("../js/groups.js");
  const [GREEN, BLUE, ORANGE, PURPLE, IVORY] = GR.PALETTE;
  assert.deepEqual(["Fitness", "Leisure", "Friends"].map((n) => GR.DEFAULTS.find((g) => g.name === n).color), [IVORY, ORANGE, PURPLE]);
  const old = [{ name: "Work", color: BLUE }, { name: "Gym", color: ORANGE }, { name: "Leisure", color: PURPLE }, { name: "Friends", color: IVORY.toLowerCase() }];
  assert.deepEqual(GR.recolor(old), [{ name: "Gym", color: IVORY }, { name: "Leisure", color: ORANGE }, { name: "Friends", color: PURPLE }], "the three still on the earlier defaults move together, whatever they were renamed to");
  assert.deepEqual(GR.recolor(old.map((g) => (g.name === "Leisure" ? { ...g, color: GREEN } : g))), [], "one of them was changed by hand: leave all three");
  assert.deepEqual(GR.recolor(GR.DEFAULTS), [], "already the new colours");
  assert.deepEqual(GR.recolor([]), []);
  assert.equal(new Set(GR.PALETTE.map(GR.neon)).size, 8, "eight different neons");
  assert.equal(GR.neon(IVORY.toLowerCase()), "#FFFFFF");
  assert.equal(GR.neon("#123456"), "", "a colour picked by hand has none");
});
