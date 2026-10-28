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
  assert.deepEqual(tx.header(), ["Date", "Kind", "Category", "Note", "Amount", "Currency", "ID", "Updated", "Synced"]);
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

test("spend: a record in another currency keeps it on the sheet and on the other device; typed rows can name one too", async () => {
  const { book, sync } = sheet();
  const phone = await device(), mac = await device();
  phone.setInCur("cny");
  const a = phone.add({ d: "2026-10-18", v: -8800, c: "Food", n: "noodles", cur: phone.inCur() });
  const b = phone.add({ d: "2026-10-18", v: -1200, c: "Drink", cur: "cad" });
  assert.equal(a.cur, "cny");
  assert.equal("cur" in b, false, "CAD isn't written");
  sync(phone);
  const tx = book.getSheetByName("Transactions"), o = tx.objects();
  assert.deepEqual(o.map((x) => x.Amount + " " + x.Currency), ["88 RMB", "12 "]);
  sync(mac);
  assert.equal(mac.get(a.id).cur, "cny");
  assert.equal(mac.get(b.id).cur, undefined);
  // 改成加币：那一格清空，另一边也跟着
  mac.update(a.id, { cur: "cad" });
  sync(mac); sync(phone);
  assert.equal(phone.get(a.id).cur, undefined);
  assert.equal(tx.objects().find((x) => x.Note === "noodles").Currency, "");
  // 表格里手打的一行写 CNY / usd
  const r = tx.getLastRow() + 1;
  ["2026-10-19", "Expense", "Food", "dumplings", 30, "CNY"].forEach((v, j) => tx.put(r, j + 1, v));
  ["2026-10-19", "Expense", "Traffic", "taxi", 15, "usd"].forEach((v, j) => tx.put(r + 1, j + 1, v));
  phone.link(false); phone.link(true);
  sync(phone);
  assert.equal(phone.entries().find((e) => e.n === "dumplings").cur, "cny");
  assert.equal(phone.entries().find((e) => e.n === "taxi").cur, "usd");
  // 记一笔用哪种、看哪种：只在这台设备上
  assert.equal(phone.inCur(), "cny");
  assert.equal(mac.inCur(), "cad");
  mac.setShow("usd");
  assert.equal(mac.show(), "usd");
  assert.equal(phone.show(), "cad");
});

test("spend: an old Code.gs (no currencies yet) keeps the RMB record queued and its currency on this device", async () => {
  const { g, sync } = sheet();
  const phone = await device();
  const a = phone.add({ d: "2026-10-18", v: -8800, c: "Food", cur: "cny" });
  phone.add({ d: "2026-10-18", v: -500, c: "Food" });
  // 装作旧脚本：回来的没有 curs、每一笔也不带币种
  const old = (rq) => { const res = g.post({ secret: "CHANGE_ME", spend: rq }).spend; delete res.curs; res.rows.forEach((r) => delete r.cur); return res; };
  let rq = phone.request();
  phone.apply(old(rq), rq);
  assert.match(phone.error(), /Update Code\.gs/);
  assert.equal(phone.get(a.id).cur, "cny");
  assert.deepEqual(phone.request().put.map((x) => x.id), [a.id], "only the RMB one waits");
  phone.link(false); phone.link(true);   // 整份拉一次也不丢
  rq = phone.request();
  phone.apply(old(rq), rq);
  assert.equal(phone.get(a.id).cur, "cny");
  // 换上新脚本：发出去、错误消掉
  sync(phone);
  assert.equal(phone.error(), "");
  assert.deepEqual(phone.request().put, []);
  assert.equal(phone.get(a.id).cur, "cny");
});

test("spend: thousands of imported records go to the sheet in one write, signs and currencies kept", async () => {
  const { book, sync } = sheet();
  const phone = await device(), mac = await device();
  const tx = book.getSheetByName("Transactions") || null;
  phone.addMany(Array.from({ length: 3000 }, (_, i) => ({ d: "2019-0" + (1 + (i % 9)) + "-1" + (i % 10), v: i % 7 ? -(100 + i) : 5000, c: i % 7 ? "Food" : "Gift", ...(i % 3 ? { cur: "aud" } : {}) })));
  const t0 = Date.now();
  sync(phone);
  assert.ok(Date.now() - t0 < 20000);
  const rows = book.getSheetByName("Transactions").objects();
  assert.equal(rows.length, 3000);
  assert.equal(rows.filter((r) => r.Currency === "AUD").length, 2000);
  assert.equal(rows.filter((r) => r.Kind === "Income" && r.Category === "Gift").length, 429, "a positive Gift stays money in");
  sync(mac);
  assert.equal(mac.entries().length, 3000);
  assert.equal(mac.entries().filter((e) => e.cur === "aud").length, 2000);
  void tx;
});

test("spend: budgets keep the currency they were set in, on the sheet and the other device", async () => {
  const { book, sync } = sheet();
  const phone = await device(), mac = await device();
  phone.setBudgets([{ from: "2017-11", v: 200000, cur: "aud" }, { from: "2018-08", v: 500000, cur: "cny" }, { from: "2023-09", v: 272000 }]);
  sync(phone);
  assert.deepEqual(book.getSheetByName("Budgets").objects().map((r) => [r.From, r.Amount, r.Currency]), [["2017-11", 2000, "AUD"], ["2018-08", 5000, "RMB"], ["2023-09", 2720, ""]]);
  sync(mac);
  assert.deepEqual(mac.budgets(), [{ from: "2017-11", v: 200000, cur: "aud" }, { from: "2018-08", v: 500000, cur: "cny" }, { from: "2023-09", v: 272000 }]);
});

test("spend: a date comes back exactly as the sheet shows it, whatever the time zones", async () => {
  const { g, book, sync } = sheet();
  const phone = await device(), mac = await device();
  phone.add({ d: "2026-10-23", v: -1800, c: "Food" });
  phone.setBudgets([{ from: "2026-10", v: 300000 }]);
  sync(phone);
  // 表格和脚本时区不一样时，按时刻换算会差一天：这里故意让换算总差一天，读回来的仍要是表格里显示的那天
  g.sandbox.Utilities.formatDate = (d) => { const x = new Date(d.getTime() - 864e5); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
  sync(mac);
  assert.deepEqual(mac.entries().map((e) => e.d), ["2026-10-23"]);
  assert.deepEqual(mac.budgets().map((b) => b.from), ["2026-10"]);
  void book;
});

test("spend: Reload everything brings every record back as the sheet has it, keeping ones not sent yet", async () => {
  const { sync } = sheet();
  const phone = await device(), mac = await device();
  const a = phone.add({ d: "2026-10-23", v: -195000, c: "House", n: "rent" });
  sync(phone);
  // 拉取按「这个时刻及以后写过的」算（同一毫秒的也拉，宁多勿漏）：手机写进去和电脑第一次拉落在同一毫秒时，
  // 电脑下一次普通同步会把这一行又拉回来（这条测试偶尔失败过）。中间等两毫秒
  for (const t0 = Date.now(); Date.now() - t0 < 2;) { /* 等 */ }
  sync(mac);
  mac.get(a.id).d = "2026-10-22";   // 这台设备上存的是一天前的（旧脚本拉回来时差了一天）
  const pending = mac.add({ d: "2026-10-24", v: -500, c: "Food" });
  sync(mac);
  assert.equal(mac.get(a.id).d, "2026-10-22", "an ordinary sync only brings back what changed");
  mac.forceFull();
  assert.equal(mac.request().since, 0);
  sync(mac);
  assert.equal(mac.get(a.id).d, "2026-10-23");
  assert.equal(mac.get(pending.id).d, "2026-10-24");
});

test("spend: ids stay unique even when thousands are made in the same millisecond", async () => {
  const SP = await import("../js/spend.js?ids");
  const ids = Array.from({ length: 20000 }, () => SP.newId());
  assert.equal(new Set(ids).size, ids.length);
});

test("spend: a poll with nothing new doesn't open the spending sheet; a change made elsewhere still comes back (she said 2026-10-28 it was slow)", async () => {
  const { g, book, sync } = sheet();
  let opened = 0;
  const open = g.sandbox.SpreadsheetApp.openById;
  g.sandbox.SpreadsheetApp.openById = (id) => { opened++; return open(id); };
  const phone = await device(), desk = await device();
  phone.add({ d: "2026-10-27", v: -1200, c: "Food", n: "lunch" });
  const wait = () => { const t = Date.now(); while (Date.now() === t) { /* 下一毫秒 */ } };
  // 新表格的类别页是空的：头一回同步后手机会把自己的类别写过去（也算写）。来回几轮，到没东西要写、各自的 cursor 都在最后一次写之后
  for (let i = 0; i < 3; i++) { sync(phone); wait(); sync(desk); wait(); }
  opened = 0;
  const quiet = sync(phone);
  assert.deepEqual([opened, quiet.rows.length, quiet.ok], [0, 0, true], "nothing new: answered without opening the sheet");
  assert.equal(phone.entries().length, 1, "and nothing on the phone changes");
  // 电脑记一笔 → 手机下一次拉要真的去读
  desk.add({ d: "2026-10-28", v: -450, c: "Drink", n: "tea" });
  sync(desk);
  wait();
  opened = 0;
  sync(phone);
  assert.ok(opened > 0, "after a write the sheet is opened again");
  assert.deepEqual(phone.entries().map((e) => e.n).sort(), ["lunch", "tea"]);
  // 整份拉照样整份（表格里手改的就靠它）
  const tx = book.getSheetByName("Transactions");
  const r = tx.getLastRow() + 1;
  ["2026-10-28", "Expense", "Food", "typed in", 3].forEach((v, j) => tx.put(r, j + 1, v));
  wait(); sync(phone);
  assert.ok(!phone.entries().some((e) => e.n === "typed in"), "a row typed into the sheet waits for the full pull");
  phone.forceFull();
  sync(phone);
  assert.ok(phone.entries().some((e) => e.n === "typed in"), "the full pull brings it");
});

test("spend: a sync carries the spending part only when it's needed", async () => {
  const { sync } = sheet();
  const phone = await device();
  assert.equal(phone.due(), true, "nothing pulled yet");
  sync(phone);
  sync(phone);   // 新表格：头一回把类别写过去
  assert.equal(phone.due(), false, "just pulled, nothing waiting, not looking at it");
  phone.view(true);
  assert.equal(phone.due(), true, "the ledger is open");
  phone.view(false);
  phone.add({ d: "2026-10-28", v: -100, c: "Food", n: "" });
  assert.equal(phone.due(), true, "a record waiting to go");
  sync(phone);
  assert.equal(phone.due(), false);
  phone.forceFull();
  assert.equal(phone.due(), true, "Reload everything");
});
