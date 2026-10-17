import { test } from "node:test";
import assert from "node:assert/strict";
import * as O from "../js/offdays.js";
import { addDays } from "../js/dates.js";

console.warn = () => {};   // 「Can't save on this device」

const days = (y) => [...O.holidays(y).keys()];

test("holidays: Ontario's nine plus Civic Holiday, by rule", () => {
  assert.deepEqual(days(2026), ["2026-01-01", "2026-02-16", "2026-04-03", "2026-05-18", "2026-07-01", "2026-08-03", "2026-09-07", "2026-10-12", "2026-12-25", "2026-12-28"]);
  assert.equal(O.holidayOn("2027-03-26"), "Good Friday");
  assert.equal(O.holidayOn("2027-05-24"), "Victoria Day", "May 24 itself when it is a Monday");
  assert.equal(O.holidayOn("2026-10-13"), "");
});

test("holidays on a weekend move to the next free weekday", () => {
  assert.equal(O.holidayOn("2026-12-26"), "", "Boxing Day 2026 is a Saturday…");
  assert.equal(O.holidayOn("2026-12-28"), "Boxing Day", "…so it's off on Monday");
  assert.deepEqual(days(2027).slice(-2), ["2027-12-27", "2027-12-28"], "Christmas on a Saturday, Boxing Day on a Sunday: Monday and Tuesday");
  assert.equal(O.holidayOn("2028-07-03"), "Canada Day");
  assert.equal(O.holidayOn("2028-01-03"), "New Year's Day");
});

test("payday: every other Wednesday from the first one, moved earlier around a holiday", () => {
  for (const d of ["2026-08-12", "2026-08-26", "2026-10-21", "2026-12-30"]) assert.equal(O.isPayday(d), true, d);
  for (const d of ["2026-08-05", "2026-08-19", "2026-10-14", "2026-10-22"]) assert.equal(O.isPayday(d), false, d);
  // 从 2027-12-28（节礼日顺延到的周二）起算：往前跳过 27 号（圣诞顺延）和周末，落在 24 号周五
  assert.equal(O.isPayday("2027-12-24", "2027-12-28"), true, "a holiday payday moves back to the last weekday before it");
  assert.equal(O.isPayday("2027-12-28", "2027-12-28"), false);
  assert.equal(O.isPayday("2028-01-11", "2027-12-28"), true, "the next one is back on schedule");
});

test("offState: holidays are off unless cleared, picked days are off, weekends are never marked", () => {
  assert.deepEqual(O.offState("2026-10-12", null), { off: true, holiday: "Thanksgiving" });
  assert.deepEqual(O.offState("2026-10-12", { days: { "2026-10-12": false } }), { off: false, holiday: "Thanksgiving" });
  assert.deepEqual(O.offState("2026-10-15", { days: { "2026-10-15": true } }), { off: true, holiday: "" });
  assert.deepEqual(O.offState("2026-10-17", { days: { "2026-10-17": true } }), { off: false, holiday: "" });
});

test("store: day off and super rest day toggle; going back to the default leaves no record", async () => {
  const store = await import("../js/store.js?offdays");
  const hol = [...O.holidays(Number(store.today().slice(0, 4)) + 1).keys()][2];   // 明年的 Good Friday（一年前的记录会被清掉，所以用以后的日子）
  const thu = addDays(hol, -1);
  store.toggleOffDay(hol);
  assert.equal(store.offDay(hol).off, false, "a holiday cleared as a work day");
  assert.deepEqual(store.setting("offday").days, { [hol]: false });
  store.toggleOffDay(hol);
  assert.equal(store.offDay(hol).off, true);
  store.toggleOffDay(thu);
  assert.deepEqual(store.setting("offday").days, { [thu]: true }, "the holiday is back to its default, so only the picked day is stored");
  store.toggleSuperRest(hol);
  assert.equal(store.isSuperRest(hol), true);
  store.toggleSuperRest(hol);
  assert.equal(store.isSuperRest(hol), false);
  assert.deepEqual(store.setting("super-rest").days, {});
});
