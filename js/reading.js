// 阅读入口：你的阅读记录在另一个 Google 表格里（链接存在 Settings 的 reading），一页一种（Book、TV……）。
// 这里只做两件事：往那个表格的 Want 页追加想看的东西（没网先排队，下次同步一起发），
// 和在本机缓存一份所有页的条目，打字时查重。条目：{title, tab, want, when, mark, note}
// 缓存和排队都只在这台设备上（localStorage 单独一个 key），不进 Tasks 那些表。

import { readLocal, writeLocal } from "./dom.js";

const KEY = "kuzhouduan-reading";
const FRESH = 10 * 60000;   // 列表 10 分钟内拉过就不再拉（打开阅读页时总会拉一次）
export const VIBES = ["🎉", "😊", "👀"];   // 爽 / 成长 / 好奇
export const TYPES = ["Book", "PodCast", "Fiction", "TV", "Blogger", "Game", "Article", "etc"];   // 用户定的，和阅读表格的页名对应

let R = { rows: [], types: [], at: 0, pending: [], error: "" };
Object.assign(R, readLocal(KEY, {}) || {});
let wanted = false;   // 阅读页开着：同步时顺便拉列表
let lastDupes = [];
const listeners = new Set();

const save = () => writeLocal(KEY, R);
const emit = () => listeners.forEach((fn) => fn());
export const subscribe = (fn) => listeners.add(fn);

// 和表格那边 titleKey_ 一样：不分大小写，书名号、引号、空格都不算
export const titleKey = (s) => String(s || "").toLowerCase().replace(/[《》<>「」『』"'“”‘’\s]+/g, "");

export const state = () => R;
export const types = () => R.types || [];
export const takeDupes = () => { const d = lastDupes; lastDupes = []; return d; };

export function want(on = true) { wanted = on; }

// 打字时找已有的：标题包含你打的字（排队还没发出去的也算）
export function search(q, limit = 8) {
  const k = titleKey(q);
  if (!k) return [];
  const all = [...R.pending.map((x) => ({ title: x.title, tab: x.type, want: true, mark: x.vibe, note: x.note, queued: true })), ...R.rows];
  const exact = all.filter((r) => titleKey(r.title) === k);
  const part = all.filter((r) => titleKey(r.title) !== k && titleKey(r.title).includes(k));
  return [...exact, ...part].slice(0, limit);
}

// 已经有了的那一条（同名，不分大小写 / 空格 / 书名号）；没有就是 undefined
export const exists = (title) => search(title, 1).find((r) => titleKey(r.title) === titleKey(title));

export function add(entry) {
  const id = "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  R.pending.push({ id, title: String(entry.title).trim(), type: String(entry.type || "").trim(), vibe: entry.vibe || "", note: String(entry.note || "").trim() });
  save();
  emit();
  return id;
}

// 同步时带上：要发的、要不要列表。没什么要做就不带
export function request() {
  const list = wanted || Date.now() - (R.at || 0) > FRESH;
  if (!R.pending.length && !list) return null;
  return { add: R.pending.slice(), list };
}

// 表格那边的错误换成看得懂的话。打不开多半是阅读表格属于另一个 Google 账号：
// 不用公开，把它共享给 苦昼短 表格所在的那个账号（编辑者）就行
export function readingError(e) {
  if (e === "no sheet") return "Add your reading Sheet's link in Settings on the computer.";
  if (/permission|access|not found|openById|openByUrl|权限|找不到/i.test(String(e))) {
    return "Can't open the reading Sheet. It can stay private — share it (as Editor) with the Google account your 苦昼短 Sheet belongs to.";
  }
  return String(e);
}

// 表格回来的：发成功的（加上了 / 重复了）从队列里拿掉；有列表就换成新的
export function apply(res, sent) {
  if (!res || !sent) return;
  if (res.error) {
    R.error = readingError(res.error);
  } else {
    R.error = "";
    const done = new Set([...(res.added || []), ...(res.dupes || []).map((d) => d.id)]);
    R.pending = R.pending.filter((x) => !done.has(x.id));
    if (res.dupes?.length) lastDupes = res.dupes;
    if (res.rows) { R.rows = res.rows; R.types = res.types || []; R.at = Date.now(); }
  }
  save();
  emit();
}
