// 同步的时候不用把界面锁住（她 2026-10-24 问的）：同步途中本机改的、还没推上去的，表格拉回来一份旧的不会盖掉它；
// 别的设备之后改的（更新）才以那份为准；推送只认「发出去以后没再改过」的
import { test } from "node:test";
import assert from "node:assert/strict";
import * as store from "../js/store.js?merge";

console.warn = () => {};
const realNow = Date.now;
const at = (ms) => { Date.now = () => ms; };
test.afterEach(() => { Date.now = realNow; });

test("an edit made while a sync is in flight survives the pull and is sent next time", () => {
  at(1000);
  const id = store.addTask({ title: "Draft" });
  const out = store.outgoing();                   // 同步开始：这一刻要推的
  at(2000);
  store.updateTask(id, { title: "Draft, edited mid-sync" });
  const server = { ...out.rows.tasks.find((r) => r.id === id) };   // 表格回来的：还是发出去的那份
  store.pushed(out);
  store.applyPull({ tables: { tasks: [server] }, deleted: [] }, 1500);
  assert.equal(store.get("tasks", id).title, "Draft, edited mid-sync", "the newer local edit stays");
  assert.ok(store.outgoing().rows.tasks.some((r) => r.id === id), "and is still queued to send");
});

test("a later change from another device wins over an older local one", () => {
  at(1000);
  const id = store.addTask({ title: "Plan" });
  store.pushed(store.outgoing());
  at(3000);
  store.applyPull({ tables: { tasks: [{ ...store.get("tasks", id), title: "Changed on the phone", updated: 5000 }] }, deleted: [] }, 5000);
  assert.equal(store.get("tasks", id).title, "Changed on the phone");
});

test("a pull that brings nothing new is quiet (no full redraw every 30 seconds)", () => {
  at(1000);
  const id = store.addTask({ title: "Same" });
  store.pushed(store.outgoing());
  const seen = [];
  const off = store.subscribe((m) => seen.push(m));
  store.applyPull({ tables: { tasks: [{ ...store.get("tasks", id) }] }, deleted: [] }, 2000);
  store.applyPull({ tables: { tasks: [{ ...store.get("tasks", id), title: "Changed elsewhere", updated: 3000 }] }, deleted: [] }, 3000);
  off?.();
  assert.deepEqual(seen.map((m) => Boolean(m.quiet)), [true, false]);
});
