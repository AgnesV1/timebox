// 记账的数据：存在这台设备上（localStorage 单独一个 key），有了链接就和单独那张记账表格同步（Settings 的 spend = { url }，
// 和阅读表格一样走同一个 Apps Script）。手机、电脑都能记、都能改：每一笔有自己的 id 和 u（改的时间），两边改同一笔，后改的算数；
// 删掉的表格里记一条（Deleted 页），另一边下次同步也删掉。没网照样记，排着队，联网再发。
// 预算和类别各是一整张小清单：本机改过就整张发过去；没改过就用表格里的（表格里手改也认）。
// 每一笔记的是哪种钱（cur，加币不写）；记一笔时用哪种（inCur，换了就一直用它）、总数换成哪种看（show，默认加币）只管这台设备，不同步。

import { readLocal, writeLocal } from "./dom.js";
import { DEFAULT_CATS, parts, isCur } from "./money.js";

const KEY = "kuzhouduan-spend";
const FULL_EVERY = 864e5;        // 打开记账页时，一天没整份对过就整份拉一次（表格里手改的那几行也能拉回来）——以前半小时一次，每次几百 KB，手机上慢（她 2026-10-28）
const PULL_EVERY = 10 * 60000;   // 没看着记账时，同步隔这么久才带上它一次（今天页 Spend 旁边的 left 要跟上）
const STALE = 13 * 864e5;        // 太久没同步：表格里的删除记录只留 14 天，整份对一遍

let S = { entries: {}, budgets: [], cats: DEFAULT_CATS.map((c) => ({ ...c })), put: {}, del: {}, bDirty: false, cDirty: false, cursor: 0, fullAt: 0, wantFull: true, error: "", linked: false, inCur: "cad", show: "cad" };
Object.assign(S, readLocal(KEY, {}) || {});

let version = 0, listCache = null, listVer = -1;
const listeners = new Set();
const save = () => { version++; writeLocal(KEY, S); };
const emit = (meta = {}) => listeners.forEach((fn) => fn(meta));
export const subscribe = (fn) => listeners.add(fn);
export const ver = () => version;

// 一笔的 ID：时间 + 这台设备上数到第几笔 + 随机几位。一口气导入几千笔时同一毫秒里有几百笔，
// 原来只靠 5 位随机字符偶尔会撞上（后一笔把前一笔顶掉，测试里几十次撞一次）；加上计数就不会了
let seq = 0;
export const newId = () => "x" + Date.now().toString(36) + (seq++).toString(36) + "-" + Math.random().toString(36).slice(2, 7);

export function entries() {
  if (listVer !== version || !listCache) { listCache = Object.values(S.entries); listVer = version; }
  return listCache;
}
export const get = (id) => S.entries[id];
export const cats = () => S.cats;
export const budgets = () => S.budgets;
export const error = () => S.error;
export const pendingCount = () => Object.keys(S.put).length + Object.keys(S.del).length + (S.bDirty ? 1 : 0) + (S.cDirty ? 1 : 0);

function change(fn) { fn(); save(); emit({ dirty: true }); }

// 加币不写 cur（表格里那一格空着 = 加币）
const withCur = (e, cur) => { if (isCur(cur) && cur !== "cad") e.cur = cur; else delete e.cur; return e; };
export function add(x) {
  const e = withCur({ id: x.id || newId(), d: x.d, v: Math.round(x.v), c: x.c, n: String(x.n || "").trim(), u: Date.now() }, x.cur);
  change(() => { S.entries[e.id] = e; S.put[e.id] = e.u; delete S.del[e.id]; });
  return e;
}
export function addMany(list) {
  const out = [];
  change(() => {
    let u = Date.now();
    for (const x of list) {
      const e = withCur({ id: newId(), d: x.d, v: Math.round(x.v), c: x.c, n: String(x.n || "").trim(), u: u++ }, x.cur);
      S.entries[e.id] = e; S.put[e.id] = e.u; out.push(e);
    }
  });
  return out;
}
export function update(id, patch) {
  const e = S.entries[id];
  if (!e) return null;
  const n = { ...e, ...patch, id, u: Date.now() };
  if (patch.n !== undefined) n.n = String(patch.n || "").trim();
  if ("cur" in patch) withCur(n, patch.cur);
  change(() => { S.entries[id] = n; S.put[id] = n.u; });
  return n;
}

// 这台设备：记一笔时用哪种钱（换了就一直是它）、总数换成哪种看。只存本机，不进表格
export const inCur = () => (isCur(S.inCur) ? S.inCur : "cad");
export const show = () => (isCur(S.show) ? S.show : "cad");
export function setInCur(k) { if (isCur(k) && k !== S.inCur) { S.inCur = k; save(); } }
export function setShow(k) { if (isCur(k) && k !== S.show) { S.show = k; save(); emit(); } }
export function remove(id) {
  const e = S.entries[id];
  if (!e) return null;
  change(() => { delete S.entries[id]; delete S.put[id]; S.del[id] = Date.now(); });
  return e;
}
// 撤销删除：原样放回去（改的时间是现在，免得被表格里的删除记录盖掉）
export function restore(e) {
  const n = { ...e, u: Date.now() };
  change(() => { S.entries[n.id] = n; S.put[n.id] = n.u; delete S.del[n.id]; });
  return n;
}
export function removeMany(ids) {
  change(() => { for (const id of ids) { if (!S.entries[id]) continue; delete S.entries[id]; delete S.put[id]; S.del[id] = Date.now(); } });
}

export function setBudgets(list) {
  change(() => { S.budgets = list.map((b) => ({ from: b.from, v: Math.round(b.v), ...(b.cur && b.cur !== "cad" ? { cur: b.cur } : {}) })).sort((a, b) => a.from.localeCompare(b.from)); S.bDirty = true; });
}
export function setCats(list) {
  change(() => { S.cats = list.map((c) => ({ name: c.name, kind: c.kind, hidden: Boolean(c.hidden), role: c.role || "" })); S.cDirty = true; });
}
// 类别改名：清单里改，用了这个名字的每一笔也跟着改（这些笔都要重新发）
export function renameCat(from, to) {
  change(() => {
    S.cats = S.cats.map((c) => (c.name === from ? { ...c, name: to } : c));
    S.cDirty = true;
    const u = Date.now();
    for (const e of Object.values(S.entries)) if (e.c === from) { S.entries[e.id] = { ...e, c: to, u }; S.put[e.id] = u; }
  });
}

// 表格那张：设了链接才同步
export function link(on) { if (S.linked !== on) { S.linked = on; if (on) S.wantFull = true; save(); } }
// 下次同步整份从表格拉（Settings 的「Reload everything from the Sheet」）：本机每一笔照表格里的样子重来一遍，还没发出去的留着
export function forceFull() { S.wantFull = true; save(); }
export function wantFull() { if (Date.now() - (S.fullAt || 0) > FULL_EVERY) { S.wantFull = true; save(); return true; } return false; }

// 这一次同步要不要带上记账（她 2026-10-28 说手机拉下来慢：以前每一次都带，表格那边每次都要打开记账表格读几千行）：
// 有没发出去的、要整份拉、正看着记账（手机拉下来的那页、电脑的 Spending），或者离上次拉回来过了 PULL_EVERY
let viewing = false, pulledAt = 0;
export function view(on) { viewing = Boolean(on); }
export function due() {
  return viewing || S.wantFull || !S.cursor || S.bDirty || S.cDirty || Object.keys(S.put).length > 0 || Object.keys(S.del).length > 0 || Date.now() - pulledAt > PULL_EVERY;
}

// 同步时带上：要写的、要删的、改过的清单；从哪个时间点往后拉
export function request() {
  const stale = S.cursor && Date.now() - S.cursor > STALE;
  const full = S.wantFull || !S.cursor || stale;
  const put = Object.keys(S.put).map((id) => S.entries[id]).filter(Boolean);
  const del = Object.entries(S.del).map(([id, u]) => ({ id, u }));
  return { since: full ? 0 : S.cursor, put, del, ...(S.bDirty ? { budgets: S.budgets } : {}), ...(S.cDirty ? { cats: S.cats } : {}) };
}

export function readError(e) {
  if (e === "no sheet") return "Add your spending Sheet's link in Settings on the computer.";
  if (/permission|access|not found|openById|openByUrl/i.test(String(e))) return "Can't open the spending Sheet. It can stay private — share it (as Editor) with the Google account your 苦昼短 Sheet belongs to.";
  return String(e);
}

// 表格回来的。res 没有（旧脚本不认 spend）：提示换 Code.gs，排着的都留着
export function apply(res, sent) {
  if (!sent) return;
  pulledAt = Date.now();
  if (!res) { S.error = "Update Code.gs in your 苦昼短 Sheet to sync spending"; save(); emit(); return; }
  if (res.error) { S.error = readError(res.error); save(); emit(); return; }
  S.error = "";
  // 旧的 Code.gs 不认币种（回来的没有 curs）：不是加币的那几笔留在队列里（不然拉回来就变成加币了），提示换脚本
  const oldScript = !res.curs, held = oldScript ? sent.put.filter((e) => e.cur) : [];
  if (held.length) S.error = "Update Code.gs in your 苦昼短 Sheet to sync currencies";
  // 发出去的：这期间没再改过的从队列里拿掉
  for (const e of sent.put) if (S.put[e.id] === e.u && !(oldScript && e.cur)) delete S.put[e.id];
  for (const d of sent.del) if (S.del[d.id] === d.u) delete S.del[d.id];
  if (sent.budgets && JSON.stringify(sent.budgets) === JSON.stringify(S.budgets)) S.bDirty = false;
  if (sent.cats && JSON.stringify(sent.cats) === JSON.stringify(S.cats)) S.cDirty = false;
  // 拉回来的：排着队的那几笔以本机的为准
  const full = sent.since === 0;
  const prev = {};   // 整份拉之前本机每一笔的币种（旧脚本回来的不带币种，用它补上）
  if (full) {
    const keep = {};
    for (const e of Object.values(S.entries)) if (e.cur) prev[e.id] = e.cur;
    for (const id of Object.keys(S.put)) if (S.entries[id]) keep[id] = S.entries[id];
    S.entries = keep;
  }
  // changed：真正变了几处（拉回来的和本机一样就不叫界面重画——现在每 30 秒拉一次）
  let changed = full ? 1 : 0;
  const was0 = JSON.stringify([S.budgets, S.cats]);
  for (const r of res.rows || []) {
    if (S.put[r.id] || S.del[r.id]) continue;
    // 旧脚本回来的没有币种：本机记着的那个留着
    const was = full ? null : S.entries[r.id];
    const next = withCur({ id: r.id, d: r.d, v: r.v, c: r.c, n: r.n || "", u: r.u || 0 }, oldScript ? (was?.cur || prev[r.id]) : r.cur);
    if (!was || JSON.stringify(was) !== JSON.stringify(next)) changed++;
    S.entries[r.id] = next;
  }
  for (const id of res.dels || []) if (!S.put[id] && S.entries[id]) { delete S.entries[id]; changed++; }
  // 清单：本机没有没发出去的改动就用表格里的；表格里还是空的（刚建好）就把本机的发过去
  // 旧的 Code.gs 回来的预算不带币种（没有 bcur）：本机记着的那个留着
  const bcur = Object.fromEntries(S.budgets.filter((b) => b.cur).map((b) => [b.from, b.cur]));
  if (Array.isArray(res.budgets)) { if (!S.bDirty) { if (res.budgets.length || !S.budgets.length) S.budgets = res.bcur ? res.budgets : res.budgets.map((b) => (bcur[b.from] ? { ...b, cur: bcur[b.from] } : b)); else S.bDirty = true; } }
  if (!res.bcur && S.budgets.some((b) => b.cur)) S.error = "Update Code.gs in your 苦昼短 Sheet to sync budget currencies";
  if (Array.isArray(res.cats)) { if (!S.cDirty) { if (res.cats.length) S.cats = res.cats; else S.cDirty = true; } }
  if (JSON.stringify([S.budgets, S.cats]) !== was0) changed++;
  S.cursor = res.now || Date.now();
  if (full) { S.fullAt = Date.now(); S.wantFull = false; }
  save();
  emit({ pulled: true, again: S.bDirty || S.cDirty, ...(changed ? {} : { quiet: true }) });
}

// 时间轴从哪天画起：最早的那一笔（一笔都没有就是 null）
export const hasAny = () => Object.keys(S.entries).length > 0;
export const firstDay = () => { let min = ""; for (const e of Object.values(S.entries)) if (!min || e.d < min) min = e.d; return min ? parts(min) : null; };
