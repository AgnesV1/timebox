// 记账表格：手机和电脑两台设备（js/spend.js 各一份）对着同一个 Code.gs（mock）同步
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { load } from "./mock-gas.mjs";

const CODE = fileURLToPath(new URL("../Code.gs", import.meta.url));
const URL_ = "https://docs.google.com/spreadsheets/d/FAKE-SPEND-00000000000000000000/edit";

function sheet() {
  const g = load(CODE);
  g.sandbox.setup();
  const book = g.spreadsheet(URL_.replace("/edit", ""));
  g.post({ secret: "CHANGE_ME", push: { rows: { settings: [{ key: "spend", value: { url: URL_ }, updated: 1 }] } } });
  const sync = (dev) => { const rq = dev.request(); const res = g.post({ secret: "CHANGE_ME", spend: rq }).spend; dev.apply(res, rq); return res; };
  return { g, book, sync };
}
let n = 0;
const device = async () => import("../js/spend.js?dev" + ++n);

test("spend: what the phone logs reaches the sheet and the computer; edits and deletes follow", async () => {
  const { book, sync } = sheet();
  const phone = await device(), mac = await device();
  const a = phone.add({ d: "2026-10-15", v: -2315, c: "Food", n: "lunch" });
  phone.add({ d: "2026-10-15", v: 240000, c: "Salary" });
  sync(phone);
  const tx = book.getSheetByName("Transactions");
  assert.deepEqual(tx.header(), ["Date", "Kind", "Category", "Note", "Amount", "ID", "Updated", "Synced"]);
  const o = tx.objects();
  assert.equal(o.length, 2);
  assert.equal(o[0].Kind, "Expense");
  assert.equal(o[0].Amount, 23.15);
  assert.equal(o[1].Kind, "Income");
  assert.ok(book.getSheetByName("Deleted").isSheetHidden());
  // 类别清单：表格里还没有，第一次同步后把本机的默认那份发过去
  sync(phone);
  const cats = book.getSheetByName("Categories").objects();
  assert.equal(cats.length, 13);
  assert.deepEqual(cats.filter((c) => c.Budget).map((c) => c.Name + ":" + c.Budget), ["House:Base", "Bonds:Not counted"]);

  sync(mac);
  assert.equal(mac.entries().length, 2);
  assert.equal(mac.get(a.id).v, -2315);
  mac.update(a.id, { n: "lunch with Mia", v: -2850 });
  sync(mac);
  sync(phone);
  assert.equal(phone.get(a.id).n, "lunch with Mia");
  assert.equal(phone.get(a.id).v, -2850);

  phone.remove(a.id);
  sync(phone);
  assert.equal(tx.objects().length, 1);
  sync(mac);
  assert.equal(mac.get(a.id), undefined);
  assert.equal(mac.entries().length, 1);
});

test("spend: when both change the same record, the later edit wins", async () => {
  const { sync } = sheet();
  const phone = await device(), mac = await device();
  const a = phone.add({ d: "2026-10-10", v: -1000, c: "Food" });
  sync(phone); sync(mac);
  const t = Date.now;
  Date.now = () => t() + 1000; mac.update(a.id, { n: "from the mac" });
  Date.now = () => t() + 2000; phone.update(a.id, { n: "from the phone" });
  Date.now = t;
  sync(phone);   // later edit arrives first
  sync(mac);     // earlier edit arrives after — the sheet keeps the phone's
  sync(phone);
  assert.equal(mac.get(a.id).n, "from the phone");
  assert.equal(phone.get(a.id).n, "from the phone");
});

test("spend: rows typed straight into the sheet get an ID and show up; budgets and categories edited there too", async () => {
  const { book, sync } = sheet();
  const phone = await device();
  sync(phone);
  const tx = book.getSheetByName("Transactions");
  const r = tx.getLastRow() + 1;
  ["2026-10-12", "Expense", "Drink", "tea", 4.5].forEach((v, j) => tx.put(r, j + 1, v));
  const b = book.getSheetByName("Budgets");
  ["2026-10", 3580].forEach((v, j) => b.put(2, j + 1, v));
  phone.link(false); phone.link(true);   // 重新连上 = 下一次整份拉（平常是打开记账页时半小时一次）
  assert.equal(phone.request().since, 0);
  sync(phone);
  const tea = phone.entries().find((e) => e.n === "tea");
  assert.ok(tea, "hand-typed row came back");
  assert.equal(tea.v, -450);
  assert.ok(tx.objects().find((o) => o.Note === "tea").ID);
  assert.deepEqual(phone.budgets(), [{ from: "2026-10", v: 358000 }]);
  phone.setBudgets([{ from: "2026-10", v: 358000 }, { from: "2026-11", v: 400000 }]);
  sync(phone);
  assert.deepEqual(b.objects().map((o) => o.From + " " + o.Amount), ["2026-10 3580", "2026-11 4000"]);
});

test("spend: no link yet → the sheet says so and nothing is lost", async () => {
  const g = load(CODE);
  g.sandbox.setup();
  const phone = await device();
  phone.add({ d: "2026-10-01", v: -500, c: "Food" });
  const rq = phone.request();
  phone.apply(g.post({ secret: "CHANGE_ME", spend: rq }).spend, rq);
  assert.match(phone.error(), /Settings/);
  assert.equal(phone.pendingCount() >= 1, true);
  phone.apply(undefined, phone.request());   // an old Code.gs doesn't answer `spend`
  assert.match(phone.error(), /Update Code\.gs/);
});
