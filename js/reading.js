// 阅读入口：你的阅读记录在另一个 Google 表格里（链接存在 Settings 的 reading），一页一种（Book、TV……）。
// 这里做三件事：往那个表格的 Want 页追加想看的东西；看完的记进它自己那一页（哪一页、年月、评价、小类、备注）；
// 在本机缓存一份所有页的条目，打字时查重。条目：{title, tab, want, when, mark, note}
// 想看的可以标多想看（优先级，不是期限）：Soon = 这一两年 / 5 years = 五年内 / 不标。存在 Want 页的 Priority 那一列，表格里也能直接改。
// 今天页也用它：加任务时能挑 Want 里的；任务标了 Done、名字在 Want 里，就问一句看完没有（wantOf / notYet）。
// 要发的都先排队（没网也行，下次同步一起发）。缓存和排队都只在这台设备上（localStorage 单独一个 key），不进 Tasks 那些表。

import { readLocal, writeLocal } from "./dom.js";

const KEY = "kuzhouduan-reading";
const FRESH = 10 * 60000;   // 列表 10 分钟内拉过就不再拉（打开阅读页时总会拉一次）
export const VIBES = ["🎉", "😊", "👀"];   // 想看的：爽 / 成长 / 好奇
export const PRIOS = [["soon", "Soon", "This year or next"], ["five", "5 years", "Sometime in the next five years"]];   // 多想看；不标 = 没有
export const prioText = (k) => (PRIOS.find(([key]) => key === k) || [])[1] || "";
// 表格那一格里的字 → 哪一档（宽一点认：手写的 soon / this year / 1y、5y / five years 都行）
export function prioKey(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return !s ? "" : PRIOS.some(([k]) => k === s) ? s : /5|five/.test(s) ? "five" : /soon|1|one|year|now/.test(s) ? "soon" : "";
}
export const MARKS = ["🥰", "🎉", "💢"];   // 看完的：成长 / 爽了 / 踩雷（表格里名字后面那一格）
export const TYPES = ["Book", "PodCast", "Fiction", "TV", "Blogger", "Game", "Article", "etc"];   // 用户定的，和阅读表格的页名对应
const BY_HAND = ["etc", "article"];   // 看完的不在这里记的：etc 那一页太杂，只在表格里手写；Article 没有自己的页
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (m) => MON[m - 1] || "";

let R = { rows: [], types: [], kinds: {}, at: 0, pending: [], error: "", later: {} };
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

// 所有条目：排队还没发出去的排在前面（想看的 / 看完的），后面是表格里的。prio 都换成档位；刚点的优先级还排着队的，先叠上去
function everything() {
  const ranks = new Map(R.pending.filter((x) => x.rank).map((x) => [titleKey(x.title), x.prio || ""]));
  const all = [...R.pending.filter((x) => !x.rank).map((x) => (x.done
    ? { title: x.title, tab: x.type, want: false, when: x.year + " " + monthName(x.month), mark: x.mark, note: x.note, queued: true }
    : { title: x.title, tab: x.type, want: true, mark: x.vibe, note: x.note, prio: x.prio || "", queued: true })), ...R.rows.map((r) => ({ ...r, prio: r.want ? prioKey(r.prio) : "" }))];
  return ranks.size ? all.map((r) => (r.want && ranks.has(titleKey(r.title)) ? { ...r, prio: ranks.get(titleKey(r.title)) } : r)) : all;
}

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
// 还没看完的那一条（同名）：Want 里的，或者某页里还没写日期的；已经记过看完的、根本没有的都是 undefined
export const wantOf = (title) => { const k = titleKey(title); return k && !finished(title) ? everything().find((r) => (r.want || !r.when) && titleKey(r.title) === k) : undefined; };
// 问过「看完了吗」、答了还没：这条任务不再问（一本书要读很多次）。记 30 天
const ASK_AGAIN = 30 * 864e5;
export const askedNotYet = (taskId) => Boolean((R.later || {})[taskId]);
export function notYet(taskId) {
  const now = Date.now();
  R.later = { ...Object.fromEntries(Object.entries(R.later || {}).filter(([, at]) => now - at < ASK_AGAIN)), [taskId]: now };
  save();
  emit();
}
// 还没看的：Want 页里的。Soon 的在前，然后 5 years，然后没标的；同一档里最新的在前（刚加、还没发出去的最前）
const PRIO_RANK = { soon: 0, five: 1 };
export const wants = () => { const all = everything().filter((r) => r.want); return [...all.filter((r) => r.queued).reverse(), ...all.filter((r) => !r.queued).reverse()].sort((a, b) => (PRIO_RANK[a.prio] ?? 2) - (PRIO_RANK[b.prio] ?? 2)); };

// 给 Want 里的一条标优先级（prio = "soon" / "five" / "" 清掉）：还没发出去的那条直接改；已经在表格里的排一条改动，同一条只留最后一次
export function setPrio(title, prio) {
  const k = titleKey(title);
  if (!k) return;
  const mine = R.pending.find((x) => !x.done && !x.rank && titleKey(x.title) === k);
  if (mine) mine.prio = prio || "";
  else {
    R.pending = R.pending.filter((x) => !(x.rank && titleKey(x.title) === k));
    R.pending.push({ id: "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), rank: true, title: String(title).trim(), prio: prio || "" });
  }
  save();
  emit();
}

export function add(entry) {
  const id = "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  R.pending.push({ id, title: String(entry.title).trim(), type: String(entry.type || "").trim(), vibe: entry.vibe || "", prio: entry.prio || "", note: String(entry.note || "").trim() });
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

// 同步时带上：要发的（想看的 / 看完的分开）、要不要列表。没什么要做就不带。
// 有东西要发的时候清单也一起要回来：表格写完再读，本机这份马上就是新的（在今天页记了看完的，那句「看完了吗」才会收起来）；
// 上次没写进去、还卡着的那几条（why），等着新脚本的那几条（held）不算，免得每次同步都整本读一遍
export function request() {
  const list = wanted || R.pending.some((x) => !x.why && !x.held) || Date.now() - (R.at || 0) > FRESH;
  if (!R.pending.length && !list) return null;
  return { add: R.pending.filter((x) => !x.done && !x.rank).map((x) => ({ ...x, prio: prioText(x.prio) })),
    rank: R.pending.filter((x) => x.rank).map((x) => ({ id: x.id, title: x.title, prio: prioText(x.prio) })),
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
    // 表格里还是旧脚本（不认优先级）：刚加进去的那几条带着的优先级改成排队等着；排着的优先级标成 held，换了新脚本再写
    const old = !Array.isArray(res.ranked);
    if (old) {
      for (const id of res.added || []) {
        const p = R.pending.find((x) => x.id === id);
        if (p?.prio) R.pending.push({ id: "k" + id, rank: true, title: p.title, prio: p.prio });
      }
      for (const x of R.pending) if (x.rank) x.held = true;
    } else for (const x of R.pending) delete x.held;
    // 发了看完的、回来却没提这回事：也是旧脚本，那几条先留着
    R.error = sent.done?.length && !Array.isArray(res.logged) ? "Update Code.gs in your Sheet to log finished things"
      : old && R.pending.some((x) => x.rank) ? "Update Code.gs in your Sheet to save priorities" : "";
    const done = new Set([...(res.added || []), ...(res.logged || []), ...(res.ranked || []), ...(res.dupes || []).map((d) => d.id)]);
    R.pending = R.pending.filter((x) => !done.has(x.id));
    // 要标的那条已经不在 Want 里了（看完了、在表格里删了）：这次改动不要了
    const gone = new Set((res.failed || []).map((f) => f.id));
    R.pending = R.pending.filter((x) => !(x.rank && gone.has(x.id)));
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

// 阅读页右边「今年接下来想读的」该列哪几条（单子存在苦昼短的 Settings，见 js/store/readplan.js）：
//   今年加的都列；之前加的、还没读完的跟到今年（from = 哪年加的）；之前就读完了的不再列。
//   读完 = 阅读表格里记过同名的看完（finished(title)，带「年 月」）：今年读完的划掉，写哪个月（done = "Oct"）
export function planView(items, finishedOf, year) {
  const out = [];
  for (const x of items) {
    const f = finishedOf(x.title), fy = f ? Number(String(f.when).slice(0, 4)) : 0, mine = Number(x.y) || year;
    if (f && fy && fy < year && mine < year) continue;
    out.push({ ...x, done: f && fy === year ? String(f.when).slice(5).trim() || "✓" : "", from: mine < year && !(f && fy === year) ? mine : 0 });
  }
  return out;
}
