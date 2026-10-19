// 记账的数据：存在这台设备上（localStorage 单独一个 key），有了链接就和单独那张记账表格同步（Settings 的 spend = { url }，
// 和阅读表格一样走同一个 Apps Script）。手机、电脑都能记、都能改：每一笔有自己的 id 和 u（改的时间），两边改同一笔，后改的算数；
// 删掉的表格里记一条（Deleted 页），另一边下次同步也删掉。没网照样记，排着队，联网再发。
// 预算和类别各是一整张小清单：本机改过就整张发过去；没改过就用表格里的（表格里手改也认）。

import { readLocal, writeLocal } from "./dom.js";
import { DEFAULT_CATS, parts } from "./money.js";

const KEY = "kuzhouduan-spend";
const FULL_EVERY = 30 * 60000;   // 打开记账页时，半小时没整份对过就整份拉一次（表格里手改的那几行也能拉回来）
const STALE = 13 * 864e5;        // 太久没同步：表格里的删除记录只留 14 天，整份对一遍

let S = { entries: {}, budgets: [], cats: DEFAULT_CATS.map((c) => ({ ...c })), put: {}, del: {}, bDirty: false, cDirty: false, cursor: 0, fullAt: 0, wantFull: true, error: "", linked: false };
Object.assign(S, readLocal(KEY, {}) || {});

let version = 0, listCache = null, listVer = -1;
const listeners = new Set();
const save = () => { version++; writeLocal(KEY, S); };
const emit = (meta = {}) => listeners.forEach((fn) => fn(meta));
export const subscribe = (fn) => listeners.add(fn);
export const ver = () => version;

export const newId = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

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

export function add(x) {
  const e = { id: x.id || newId(), d: x.d, v: Math.round(x.v), c: x.c, n: String(x.n || "").trim(), u: Date.now() };
  change(() => { S.entries[e.id] = e; S.put[e.id] = e.u; delete S.del[e.id]; });
  return e;
}
export function addMany(list) {
  const out = [];
  change(() => {
    let u = Date.now();
    for (const x of list) {
      const e = { id: newId(), d: x.d, v: Math.round(x.v), c: x.c, n: String(x.n || "").trim(), u: u++ };
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
  change(() => { S.entries[id] = n; S.put[id] = n.u; });
  return n;
}
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
  change(() => { S.budgets = list.map((b) => ({ from: b.from, v: Math.round(b.v) })).sort((a, b) => a.from.localeCompare(b.from)); S.bDirty = true; });
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
export function wantFull() { if (Date.now() - (S.fullAt || 0) > FULL_EVERY) { S.wantFull = true; save(); return true; } return false; }

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
  if (!res) { S.error = "Update Code.gs in your 苦昼短 Sheet to sync spending"; save(); emit(); return; }
  if (res.error) { S.error = readError(res.error); save(); emit(); return; }
  S.error = "";
  // 发出去的：这期间没再改过的从队列里拿掉
  for (const e of sent.put) if (S.put[e.id] === e.u) delete S.put[e.id];
  for (const d of sent.del) if (S.del[d.id] === d.u) delete S.del[d.id];
  if (sent.budgets && JSON.stringify(sent.budgets) === JSON.stringify(S.budgets)) S.bDirty = false;
  if (sent.cats && JSON.stringify(sent.cats) === JSON.stringify(S.cats)) S.cDirty = false;
  // 拉回来的：排着队的那几笔以本机的为准
  const full = sent.since === 0;
  if (full) {
    const keep = {};
    for (const id of Object.keys(S.put)) if (S.entries[id]) keep[id] = S.entries[id];
    S.entries = keep;
  }
  for (const r of res.rows || []) {
    if (S.put[r.id] || S.del[r.id]) continue;
    S.entries[r.id] = { id: r.id, d: r.d, v: r.v, c: r.c, n: r.n || "", u: r.u || 0 };
  }
  for (const id of res.dels || []) if (!S.put[id]) delete S.entries[id];
  // 清单：本机没有没发出去的改动就用表格里的；表格里还是空的（刚建好）就把本机的发过去
  if (Array.isArray(res.budgets)) { if (!S.bDirty) { if (res.budgets.length || !S.budgets.length) S.budgets = res.budgets; else S.bDirty = true; } }
  if (Array.isArray(res.cats)) { if (!S.cDirty) { if (res.cats.length) S.cats = res.cats; else S.cDirty = true; } }
  S.cursor = res.now || Date.now();
  if (full) { S.fullAt = Date.now(); S.wantFull = false; }
  save();
  emit({ pulled: true, again: S.bDirty || S.cDirty });
}

// 时间轴从哪天画起：最早的那一笔（一笔都没有就是 null）
export const hasAny = () => Object.keys(S.entries).length > 0;
export const firstDay = () => { let min = ""; for (const e of Object.values(S.entries)) if (!min || e.d < min) min = e.d; return min ? parts(min) : null; };
