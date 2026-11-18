// Friends 页的问候清单：每个节问候谁、这一次问候了没有
import { test } from "node:test";
import assert from "node:assert/strict";
import * as F from "../js/friends.js";

console.warn = () => {};   // store 在 node 里存不下来，只是提示

const names = { greet: "Greetings" };
const person = (id, greet) => ({ id, name: id, more: { Greetings: greet } });
const people = [person("Bo", "Christmas, New Year's Eve"), person("Ana", "christmas"), person("Cy", "")];
const byKey = (list) => Object.fromEntries(list.map((g) => [g.key, g]));

test("greetings: every holiday, soonest first, with who to greet by name", () => {
  const list = F.greetings(people, names, "2026-11-17");
  assert.deepEqual(list.map((g) => [g.key, g.date]), [["christmas", "2026-12-25"], ["new-year-eve", "2026-12-31"], ["lunar-eve", "2027-02-05"], ["teachers", "2027-09-10"]]);
  assert.deepEqual(list[0].people.map((p) => p.friend.id), ["Ana", "Bo"]);
  assert.deepEqual(list[2].people, [], "a holiday nobody is on still shows, so people can be added");
  assert.equal(list[0].people[0].id, "oc:Ana:christmas:2026", "the same record Coming up uses");
  assert.deepEqual(F.comingUp(people, names, "2026-12-20", {}, () => false).groups[0].items.map((x) => x.id), ["oc:Ana:christmas:2026", "oc:Bo:christmas:2026"]);
});

test("greetings: a day just gone stays until everyone is greeted or a week has passed", () => {
  const done = new Set(["oc:Ana:christmas:2026"]);
  const late = byKey(F.greetings(people, names, "2026-12-28", (id) => done.has(id))).christmas;
  assert.deepEqual([late.date, late.late, late.done], ["2026-12-25", true, 1]);
  done.add("oc:Bo:christmas:2026");
  const next = byKey(F.greetings(people, names, "2026-12-28", (id) => done.has(id))).christmas;
  assert.deepEqual([next.date, next.late, next.done], ["2027-12-25", false, 0], "everyone greeted: on to next year, all unticked");
  assert.equal(byKey(F.greetings(people, names, "2027-01-02")).christmas.date, "2027-12-25", "more than a week late: next year");
  assert.equal(byKey(F.greetings(people, names, "2027-01-02"))["new-year-eve"].date, "2026-12-31", "the year before still counts in the first days of January");
  assert.deepEqual(F.greetings(people, {}, "2026-11-17").flatMap((g) => g.people), [], "no Greetings field yet");
});

test("withGreet adds and removes one holiday and keeps words it doesn't know", () => {
  assert.equal(F.withGreet("", "christmas", true), "Christmas");
  assert.equal(F.withGreet("New Year's Eve, Christmas", "teachers", true), "Teachers' Day, Christmas, New Year's Eve", "always in the same order");
  assert.equal(F.withGreet("christmas; Mid-Autumn", "christmas", false), "Mid-Autumn");
  assert.equal(F.withGreet("Mid-Autumn", "christmas", true), "Christmas, Mid-Autumn");
  assert.deepEqual(F.greetKeys("Christmas，lunar-eve、Mid-Autumn"), ["christmas", "lunar-eve"]);
});

test("store: choosing who to greet and ticking them off", async () => {
  const store = await import("../js/store.js?greetings");
  const ana = store.saveFriend({ name: "Ana" }), bo = store.saveFriend({ name: "Bo", more: { Greetings: "Christmas" } });
  store.setGreet(ana, "christmas", true);
  const of = () => store.greetings().find((g) => g.key === "christmas");
  assert.deepEqual(of().people.map((p) => p.friend.id), [ana, bo]);
  assert.equal(store.get("friends", ana).more.Greetings, "Christmas", "the same cell Greet on writes");
  const x = of().people[0];
  store.toggleOccasion(x.id, ana, "Christmas", { silent: true });
  assert.deepEqual([of().done, of().people[0].done], [1, true]);
  const log = store.get("meets", x.id);
  assert.deepEqual([log.friends, log.note, log.date], [[ana], "Christmas", store.today()], "ticking writes it into their history");
  assert.deepEqual(store.lastContact(), { [ana]: store.today() });
  store.toggleOccasion(x.id, ana, "Christmas", { silent: true });
  assert.equal(of().done, 0, "ticking again takes it back");
  store.setGreet(bo, "christmas", false);
  assert.deepEqual(of().people.map((p) => p.friend.id), [ana]);
});
