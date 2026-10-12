// 阅读入口：你的阅读记录在另一个 Google 表格里（链接存在 Settings 的 reading），一页一种（Book、TV……）。
// 这里做三件事：往那个表格的 Want 页追加想看的东西；看完的记进它自己那一页（哪一页、年月、评价、小类、备注）；
// 在本机缓存一份所有页的条目，打字时查重。条目：{title, tab, want, when, mark, note}
// 要发的都先排队（没网也行，下次同步一起发）。缓存和排队都只在这台设备上（localStorage 单独一个 key），不进 Tasks 那些表。

import { readLocal, writeLocal } from "./dom.js";

const KEY = "kuzhouduan-reading";
const FRESH = 10 * 60000;   // 列表 10 分钟内拉过就不再拉（打开阅读页时总会拉一次）
export const VIBES = ["🎉", "😊", "👀"];   // 想看的：爽 / 成长 / 好奇
export const MARKS = ["🥰", "🎉", "💢"];   // 看完的：成长 / 爽了 / 踩雷（表格里名字后面那一格）
export const TYPES = ["Book", "PodCast", "Fiction", "TV", "Blogger", "Game", "Article", "etc"];   // 用户定的，和阅读表格的页名对应
const BY_HAND = ["etc", "article"];   // 看完的不在这里记的：etc 那一页太杂，只在表格里手写；Article 没有自己的页
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (m) => MON[m - 1] || "";

let R = { rows: [], types: [], kinds: {}, at: 0, pending: [], error: "" };
Object.assign(R, readLocal(KEY, {}) || {});
let wanted = false;   // 阅读页开着：同步时顺便拉列表
let lastDupes = [];
let lastFailed = [];
const listeners = new Set();

const save = () => writeLocal(KEY, R);
const emit = () => listeners.forEach((fn) => fn());
export const subscribe = (fn) => listeners.add(fn);

// 和表格那边 titleKey_ 一样：不分大小写，书名号、引号、空格都不算
export const titleKey = (s) => String(s || "").toLowerCase().replace(/[《》<>「」『』"'“”‘’\s]+/g, "");

export const state = () => R;
export const types = () => R.types || [];
export const takeDupes = () => { const d = lastDupes; lastDupes = []; return d; };
export const takeFailed = () => { const d = lastFailed; lastFailed = []; return d; };
// 看完的能记到哪几页：表格里真有的页（还没拉到列表就先用默认的那几个）
export const logTypes = () => (types().length ? types() : TYPES).filter((t) => !BY_HAND.includes(t.toLowerCase()));
// 这一页的小类（Book：book / English…；Game：played / completed），没有就是空的
export const kindsOf = (tab) => (R.kinds || {})[tab] || [];

export function want(on = true) { wanted = on; }

// 所有条目：排队还没发出去的排在前面（想看的 / 看完的），后面是表格里的
const everything = () => [...R.pending.map((x) => (x.done
  ? { title: x.title, tab: x.type, want: false, when: x.year + " " + monthName(x.month), mark: x.mark, note: x.note, queued: true }
  : { title: x.title, tab: x.type, want: true, mark: x.vibe, note: x.note, queued: true })), ...R.rows];

// 打字时找已有的：标题包含你打的字（排队还没发出去的也算）
export function search(q, limit = 8) {
  const k = titleKey(q);
  if (!k) return [];
  const all = everything();
  const exact = all.filter((r) => titleKey(r.title) === k);
  const part = all.filter((r) => titleKey(r.title) !== k && titleKey(r.title).includes(k));
  return [...exact, ...part].slice(0, limit);
}

// 已经有了的那一条（同名，不分大小写 / 空格 / 书名号）；没有就是 undefined
export const exists = (title) => search(title, 1).find((r) => titleKey(r.title) === titleKey(title));
// 已经记过看完的那一条：在自己那一页、带着日期（或者排着队还没发）
export const finished = (title) => { const k = titleKey(title); return k ? everything().find((r) => !r.want && r.when && titleKey(r.title) === k) : undefined; };
// 还没看的：Want 页里的，最新的在前（刚加、还没发出去的最前）
export const wants = () => { const all = everything().filter((r) => r.want); return [...all.filter((r) => r.queued).reverse(), ...all.filter((r) => !r.queued).reverse()]; };

export function add(entry) {
  const id = "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  R.pending.push({ id, title: String(entry.title).trim(), type: String(entry.type || "").trim(), vibe: entry.vibe || "", note: String(entry.note || "").trim() });
  save();
  emit();
  return id;
}

// 看完了一个：记进它那一页。entry = {title, type, year, month, mark, kind, note}
export function log(entry) {
  const id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  R.pending.push({ id, done: true, title: String(entry.title).trim(), type: String(entry.type || "").trim(), year: Number(entry.year), month: Number(entry.month),
    mark: entry.mark || "", kind: entry.kind || "", note: String(entry.note || "").trim() });
  save();
  emit();
  return id;
}

// 写不进去的那条（比如下拉里没有那一年）：不要了
export function drop(id) {
  R.pending = R.pending.filter((x) => x.id !== id);
  save();
  emit();
}

// 同步时带上：要发的（想看的 / 看完的分开）、要不要列表。没什么要做就不带
export function request() {
  const list = wanted || Date.now() - (R.at || 0) > FRESH;
  if (!R.pending.length && !list) return null;
  return { add: R.pending.filter((x) => !x.done),
    done: R.pending.filter((x) => x.done).map((x) => ({ id: x.id, title: x.title, tab: x.type, year: x.year, month: x.month, mark: x.mark, kind: x.kind, note: x.note })), list };
}

// 贴进来的像不像一个 Google 表格的链接
export const looksLikeSheet = (url) => /docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]{20,}/.test(String(url || ""));

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
    // 发了看完的、回来却没提这回事：表格里还是旧脚本，那几条先留着
    R.error = sent.done?.length && !Array.isArray(res.logged) ? "Update Code.gs in your Sheet to log finished things" : "";
    const done = new Set([...(res.added || []), ...(res.logged || []), ...(res.dupes || []).map((d) => d.id)]);
    R.pending = R.pending.filter((x) => !done.has(x.id));
    if (res.dupes?.length) lastDupes = res.dupes;
    // 没写进去的留在队列里、记着原因（下次同步再试）；同一个原因只提醒一次
    for (const f of res.failed || []) {
      const p = R.pending.find((x) => x.id === f.id);
      if (!p || p.why === f.why) continue;
      p.why = f.why;
      lastFailed.push({ title: p.title, why: f.why });
    }
    if (res.rows) { R.rows = res.rows; R.types = res.types || []; R.kinds = res.kinds || {}; R.at = Date.now(); }
  }
  save();
  emit();
}
