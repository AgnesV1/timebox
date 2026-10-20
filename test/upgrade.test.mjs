// 这台设备上存着旧格式（schema 3）的数据、打开新版：store.js 一加载就升级。升级里出一点错整个网页都起不来（黑屏），
// 只有已经在用的设备会走到这里（新设备、截图、别的测试都是空的），所以单独测一遍
import { test } from "node:test";
import assert from "node:assert/strict";

test("old data on the device (schema 3) upgrades on load instead of crashing the app", async () => {
  console.warn = () => {};
  const saved = {
    schema: 3,
    data: {
      tasks: {
        a: { id: "a", date: "2026-10-01", title: "French", est: 45, status: "partial", reason: "tired", order: 1, updated: 1 },
        b: { id: "b", date: "2026-10-01", title: "Deck", est: 60, status: "later", order: 2, updated: 1 },
        c: { id: "c", date: "2026-10-01", title: "Gym", est: 40, status: "done", order: 3, updated: 1 },
        d: { id: "d", date: "2026-10-01", title: "Read", est: 30, status: "done", actual: 20, times: "20m", order: 4, updated: 1 }
      },
      projects: {}, items: {}, log: {}, settings: {}, friends: {}, meets: {}
    },
    pending: {}, deletes: [], cursor: 123, local: { url: "https://example.com/exec", secret: "x" }
  };
  const mem = new Map([["kuzhouduan-v1", JSON.stringify(saved)]]);
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  try {
    const store = await import("../js/store.js?upgrade");
    const t = (id) => store.get("tasks", id);
    assert.deepEqual([t("a").status, t("b").status, t("c").status, t("d").status], ["delay", "delay", "done", "done"]);
    assert.equal(t("a").reason, "tired", "the reason stays");
    assert.equal(t("c").actual, 40, "an untimed Done gets its estimate as a record");
    assert.equal(t("d").actual, 20, "a timed one stays as it was");
    assert.equal(store.needsFull(), true, "the next sync pulls the whole sheet");
  } finally {
    delete globalThis.localStorage;
  }
});
