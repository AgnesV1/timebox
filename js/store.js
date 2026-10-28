// 数据层：本机存一份（localStorage），所有改动都从这里走，记下哪些行还没推到表格。
// 每行都有 updated（改动时间），两台设备改了同一行，以后改的为准。
// 数据和读写都在这个文件里；几块各管一摊的（重复、计时、Friends、目标、备餐、灵感池、每天的打分）写在 js/store/ 下面，
// 最底下把它们接回来——对外还是 store.xxx，名字不变。

import { todayIso, addDays, fmtShort } from "./dates.js";
import * as E from "./engine.js";
import * as R from "./routines.js";
import * as GR from "./groups.js";
import * as OD from "./offdays.js";
import * as F from "./friends.js";
import { readLocal, writeLocal } from "./dom.js";
import { formatTimes, sumTimes } from "./times.js";
import { OLD_NUM } from "./lists.js";
import seriesStore from "./store/series.js";
import timerStore from "./store/timer.js";
import sideStore from "./store/side.js";
import friendStore from "./store/friends.js";
import goalStore from "./store/goals.js";
import readPlanStore from "./store/readplan.js";
import mealStore from "./store/meals.js";
import ideaStore from "./store/ideas.js";
import scoreStore from "./store/scores.js";
import quadStore from "./store/quads.js";
import listStore from "./store/lists.js";

const KEY = "kuzhouduan-v1";
const OLD_KEY = "timebox-v1";
const SCHEMA = 4;   // 和表格的 Code.gs 版本对应（见 sync.js）
export const TABLES = ["tasks", "projects", "items", "log", "settings", "friends", "meets"];
const KEYED = { log: "date", settings: "key" };

// 只把这些字段发给表格；项目名这种是表格自己填的
const FIELDS = {
  tasks: ["date", "title", "est", "actual", "order", "status", "reason", "optional", "deep", "projectId", "group", "itemId", "times", "desc"],
  projects: ["name", "group", "kind", "place", "status", "deadline", "start", "early", "rule", "color", "order", "calib"],
  items: ["title", "module", "est", "origEst", "order", "projectId"],
  log: ["date", "need", "projects"],
  settings: ["key", "value"],
  friends: ["name", "more", "next", "nextDate"],
  meets: ["date", "note", "watch", "friends", "taskId"]
};

export const PROJECT_COLORS = GR.PALETTE;

function blank() {
  return {
    data: Object.fromEntries(TABLES.map((t) => [t, {}])),
    pending: {},   // "表:id" → 发送时比对用的 updated
    deletes: [],   // 待推送的删除
    cursor: 0,     // 上次从表格拉到的时间点
    schema: SCHEMA,
    needFull: false,   // 下次同步整表重拉（本机刚升级过数据格式）
    local: { url: "", secret: "", themeHold: null, fx: true, calMode: "week", pool: true, serverVersion: 0 }   // 只存在这台设备上
  };
}

let S = load();
let ctxCache = null;
let rev = 0;   // 数据每动一下加一（put / drop / 从表格拉回来）
const memos = new Map();
// 同一份数据里算过一次的不再算：Settings 里一条一行的那几样（目标、备餐）每次重画都要整页读一遍。
// 拿到的东西是共用的，只读；要改先抄一份
function memo(key, fn) {
  const hit = memos.get(key);
  if (hit && hit.rev === rev) return hit.value;
  const value = fn();
  memos.set(key, { rev, value });
  return value;
}
let tx = null;
const listeners = new Set();
const undoListeners = new Set();

function load() {
  const saved = readLocal(KEY, null);
  const s = saved || blank();
  s.pending = s.pending || {};
  s.deletes = s.deletes || [];
  if (saved && (saved.schema || 0) < SCHEMA) upgrade(s);
  TABLES.forEach((t) => { s.data[t] = s.data[t] || {}; });
  s.local = { ...blank().local, ...(s.local || {}) };
  if (!saved) {
    // 第一次打开新版：从旧版 Timebox 搬 Apps Script 网址、口令和每天默认时长，不用重填
    const old = readLocal(OLD_KEY, null);
    if (old?.settings) {
      s.local.url = old.settings.url || "";
      s.local.secret = old.settings.secret || "";
      if (Number(old.settings.cap)) s.data.settings.capacity = { id: "capacity", key: "capacity", value: { default: Number(old.settings.cap), weekly: null }, updated: 1 };
    }
  }
  return s;
}

// 本机数据升级到新格式（表格那边 setup 也做同样的事）：
// 计时记录并进任务的 times；每天单独改的可用时间并进 settings.capacity.overrides；
// 不要了的：每日备注、分类、完成次序。升级完下次同步整表重拉一次，以表格为准；
// 还没推上去的改动照样留着待推送（它们改动时间更晚，表格那边会收下）。
function upgrade(s) {
  const d = s.data, pend = s.pending;
  const segs = {};
  for (const x of Object.values(d.time || {})) (segs[x.taskId] = segs[x.taskId] || []).push(x);
  for (const [tid, list] of Object.entries(segs)) {
    const t = d.tasks?.[tid];
    if (!t) continue;
    list.sort((a, b) => String(a.from || "~").localeCompare(String(b.from || "~")));
    t.times = formatTimes(list);
    t.actual = sumTimes(list) || t.actual || null;
    if (list.some((x) => pend["time:" + x.id])) {
      t.updated = Math.max(Number(t.updated) || 0, ...list.map((x) => Number(x.updated) || 0));
      pend["tasks:" + tid] = t.updated;
    }
  }
  const caps = Object.values(d.capacity || {}).filter((r) => r.min !== null && r.min !== "" && r.min !== undefined);
  if (caps.length) {
    d.settings = d.settings || {};
    const row = d.settings.capacity || { id: "capacity", key: "capacity", value: {}, updated: 1 };
    const overrides = { ...Object.fromEntries(caps.map((r) => [r.date || r.id, Number(r.min)])), ...(row.value?.overrides || {}) };
    d.settings.capacity = { ...row, value: { ...(row.value || {}), overrides } };
    if (caps.some((r) => pend["capacity:" + r.id])) {
      d.settings.capacity.updated = Math.max(Number(row.updated) || 0, ...caps.map((r) => Number(r.updated) || 0));
      pend["settings:capacity"] = d.settings.capacity.updated;
    }
  }
  // 重复规则（settings.routines）→ Projects 里的规律计划，计划 id = 规则 id（rt: 任务 ID 不用改）。
  // 以后的、没动过的那几次删掉（以后只画预览）；留下的挂到计划上
  const rules = d.settings?.routines?.value;
  if (Array.isArray(rules)) {
    const projects = (d.projects = d.projects || {});
    const T = todayIso(d.settings?.prefs?.value?.dayStartsAt || "04:00");
    let order = Object.values(projects).reduce((m, x) => Math.max(m, Number(x.order) || 0), 0);
    rules.forEach((r, k) => {
      if (!r?.id || projects[r.id]) return;
      const host = projects[r.projectId];
      projects[r.id] = { id: r.id, name: r.title || "Routine", group: host ? host.group || host.name || "" : "", kind: "regular", place: "auto",
        status: r.end && r.end < T ? "done" : "active", deadline: "", start: "", early: 0, calib: null,
        rule: { days: r.days || [0, 0, 0, 0, 0, 0, 0], start: r.start || "", end: r.end || "", skip: r.skip || [], optional: Boolean(r.optional) },
        color: host?.color || PROJECT_COLORS[k % PROJECT_COLORS.length], order: ++order, updated: 1 };
    });
    for (const t of Object.values(d.tasks || {})) {
      const x = R.parseRoutineTaskId(t.id);
      if (!x || !projects[x.rid]) continue;
      if (t.date > T && !t.status && !t.times && !(Number(t.actual) > 0) && !pend["tasks:" + t.id]) delete d.tasks[t.id];
      else t.projectId = x.rid;
    }
    delete d.settings.routines;
    delete pend["settings:routines"];
  }
  for (const t of Object.values(d.tasks || {})) { delete t.category; delete t.doneOrder; }
  // 4：Partial / Later 并成 Delay；时间只看记下的，以前没计时就标了 Done 的补一段记录（= 预计），以前的统计数字不变。表格那边 setup 做同一件事
  for (const t of Object.values(d.tasks || {})) {
    t.status = statusIn(t.status);
    if (t.status === "done" && !(Number(t.actual) > 0) && !t.times && Number(t.est) > 0 && !E.isChore(t)) { t.actual = Number(t.est); t.times = formatTimes([{ from: "", to: "", min: Number(t.est) }]); }
  }
  for (const gone of ["time", "capacity", "notes"]) {
    delete d[gone];
    for (const k of Object.keys(pend)) if (k.startsWith(gone + ":")) delete pend[k];
  }
  s.deletes = s.deletes.filter((x) => TABLES.includes(x.table));
  s.schema = SCHEMA;
  s.cursor = 0;
  s.needFull = true;
  if (s.local) s.local.serverVersion = 0;
}

let full = false;   // 上一次没存进去（这台设备的存储满了）
function persist() {
  full = !writeLocal(KEY, S);
  if (full) console.warn("Can't save on this device");
}

// ---------- 读 ----------

export const all = (t) => Object.values(S.data[t]);
export const get = (t, id) => S.data[t][id] || null;
export const local = () => S.local;
export const cursor = () => S.cursor;
export const hasPending = () => Object.keys(S.pending).length > 0 || S.deletes.length > 0;
export const pendingCount = () => Object.keys(S.pending).length + S.deletes.length;
export const needsFull = () => Boolean(S.needFull);

export const setting = (key, fallback) => S.data.settings[key]?.value ?? fallback;
export const prefs = () => ({ dayStartsAt: "04:00", weekStartsOn: "monday", level: true, ...(setting("prefs", {}) || {}) });
export const capacitySettings = () => ({ default: 420, weekly: null, ...(setting("capacity", {}) || {}) });
export const today = () => todayIso(prefs().dayStartsAt);

const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name || a.title || "").localeCompare(String(b.name || b.title || ""));

// 给计算引擎的快照；数据一改就重建
export function ctx() {
  const t = today();
  if (ctxCache && ctxCache.today === t) return ctxCache;
  const cap = capacitySettings();
  const overrides = {};
  for (const [d, v] of Object.entries(cap.overrides || {})) if (v !== null && v !== "" && v !== undefined) overrides[d] = Number(v);
  const log = {};
  for (const r of all("log")) log[r.date] = { need: Number(r.need) || 0, projects: r.projects || {} };
  ctxCache = {
    today: t,
    projects: all("projects").sort(byOrder),
    items: all("items").sort(byOrder),
    tasks: all("tasks"),
    capacity: { default: Number(cap.default) || 0, weekly: Array.isArray(cap.weekly) ? cap.weekly : null, overrides },
    log,
    level: prefs().level !== false,
    weekStartsOn: prefs().weekStartsOn,
    commute: setting("commute", null),
    life: setting("life", null),
    side: sides(),
    groups: groups()
  };
  return ctxCache;
}

// 按了 Chore 又不到一分钟就停的那天：Chores 那条建了、没记到时间，不列出来（不然条上、日历里多一个小点）
export function tasksOn(date) {
  return all("tasks").filter((t) => t.date === date && !(E.isChore(t) && !t.times && !(Number(t.actual) > 0))).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

// ---------- 订阅 ----------

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onUndo(fn) { undoListeners.add(fn); }
function emit(meta) { listeners.forEach((fn) => fn(meta)); }

// ---------- 写 ----------
// change(fn, label)：fn 里的所有改动算一次；给了 label 就弹「撤销」。quiet = 不重画页面（打字时用）

export function change(fn, label, { quiet = false } = {}) {
  const outer = !tx;
  if (outer) tx = { before: new Map() };
  try { fn(); } finally {
    if (outer) {
      const done = tx;
      tx = null;
      persist();
      ctxCache = null;
      emit({ quiet, dirty: true });
      if (label && done.before.size) undoListeners.forEach((f) => f(label, done.before));
    }
  }
}

function remember(t, id) {
  const k = t + ":" + id;
  if (tx && !tx.before.has(k)) tx.before.set(k, S.data[t][id] ? structuredClone(S.data[t][id]) : null);
}

// generated = 重复任务自动生成的那一次：改动时间记成 1，哪台设备上真改过它都比这个新，不会被盖掉
function put(t, row, { generated = false } = {}) {
  remember(t, row.id);
  rev++;
  const prev = S.data[t][row.id];
  row.updated = generated && !prev ? 1 : Math.max(Date.now(), (Number(prev?.updated) || 0) + 1);
  // 任务属于哪个大类写在任务自己身上（表格里一眼能看）：挂了计划就跟计划，没挂就是直接挂的那个
  if (t === "tasks") row.group = row.projectId && S.data.projects[row.projectId] ? groupFor(row.projectId) : String(row.group || "");
  S.data[t][row.id] = row;
  S.pending[t + ":" + row.id] = row.updated;
  S.deletes = S.deletes.filter((d) => !(d.table === t && d.id === row.id));
  // 任务带着的那条记录（和谁、聊了什么）日期跟着任务走
  const meet = t === "tasks" ? S.data.meets[F.meetId(row.id)] : null;
  if (meet && meet.date !== row.date) put("meets", { ...meet, date: row.date });
}

function drop(t, id) {
  if (!S.data[t][id]) return;
  remember(t, id);
  rev++;
  delete S.data[t][id];
  delete S.pending[t + ":" + id];
  S.deletes.push({ table: t, id, at: Date.now() });
  if (t === "tasks") { drop("meets", F.meetId(id)); ideaTaskDropped(id); }   // 任务删了：它带着的那条记录一起删，挑来的灵感回到池子
}

export function undo(before) {
  change(() => {
    for (const [k, row] of before) {
      const i = k.indexOf(":"), t = k.slice(0, i), id = k.slice(i + 1);
      if (row) put(t, { ...row });
      else drop(t, id);
    }
  });
}

export function setLocal(patch) {
  Object.assign(S.local, patch);
  persist();
  emit({ local: true });
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---------- 同步要用的 ----------

function pick(t, r) {
  const o = { id: r.id, updated: r.updated };
  for (const f of FIELDS[t]) if (r[f] !== undefined) o[f] = r[f];
  if (KEYED[t]) o[KEYED[t]] = r.id;
  return o;
}

export function outgoing() {
  const rows = {};
  const stamp = { ...S.pending };
  for (const k of Object.keys(stamp)) {
    const i = k.indexOf(":"), t = k.slice(0, i), id = k.slice(i + 1);
    const r = S.data[t]?.[id];
    if (!r) { delete S.pending[k]; delete stamp[k]; continue; }
    (rows[t] = rows[t] || []).push(pick(t, r));
  }
  return { rows, deletes: S.deletes.slice(), stamp };
}

// 推送成功：发出去之后没再改过的行才算推上去了。known = 表格认识的表，不认识的先留在本机
export function pushed(out, known = TABLES) {
  for (const [k, u] of Object.entries(out.stamp)) if (S.pending[k] === u && known.includes(k.slice(0, k.indexOf(":")))) delete S.pending[k];
  S.deletes = S.deletes.filter((d) => !out.deletes.some((x) => x.table === d.table && x.id === d.id && x.at === d.at));
  persist();
}

// 状态只有 "" / done / delay / drop；以前的 Partial、Later 都读成 Delay。
// 写成 function（会提前生效）：文件一开头的 load() → upgrade() 就要用它，写成 const 那时还没定义，整个网页起不来
export function statusIn(s) { return s === "partial" || s === "later" ? "delay" : s || ""; }

function normalize(t, raw) {
  const r = { ...raw };
  r.id = String(KEYED[t] ? raw[KEYED[t]] : raw.id);
  if (t === "tasks") {
    r.status = statusIn(r.status);
    r.est = Number(r.est) || 0;
    r.optional = Boolean(r.optional);
    r.deep = Boolean(r.deep);
    r.projectId = r.projectId || "";
    r.group = r.group || "";
    r.itemId = r.itemId || "";
    r.times = r.times || "";
  }
  if (t === "items") { r.est = Number(r.est) || 0; r.projectId = r.projectId || ""; }
  if (t === "friends") { r.more = r.more && typeof r.more === "object" ? r.more : {}; r.next = r.next || ""; r.nextDate = r.nextDate || ""; }
  if (t === "meets") { r.friends = Array.isArray(r.friends) ? r.friends : []; r.taskId = r.taskId || ""; r.note = r.note || ""; r.watch = r.watch || ""; }
  if (t === "projects") {
    r.status = r.status || "active";
    r.kind = r.kind === "regular" ? "regular" : "total";
    r.place = r.place === "auto" ? "auto" : "pool";
  }
  return r;
}

// 拉回来的：changed 数真正变了的行，一条都没变就 quiet（只刷同步状态那个小点，不整页重画——现在每 30 秒拉一次）
export function applyPull(pull, now, { full = false } = {}) {
  if (!pull) return;
  rev++;
  let changed = 0;
  for (const d of pull.deleted || []) {
    const r = S.data[d.table]?.[d.id];
    if (!r) continue;
    const k = d.table + ":" + d.id;
    if (S.pending[k] && (Number(r.updated) || 0) > (Number(d.at) || 0)) continue;
    delete S.data[d.table][d.id];
    delete S.pending[k];
    changed++;
  }
  for (const t of TABLES) {
    const seen = new Set();
    for (const raw of pull.tables?.[t] || []) {
      const row = normalize(t, raw);
      seen.add(row.id);
      const k = t + ":" + row.id, cur = S.data[t][row.id];
      if (t === "log" && cur) {
        // 早上的线：表格里先到的份额为准，本机多出来的项目补上（留着待推送）
        const shares = { ...(cur.projects || {}), ...(row.projects || {}) };
        const extra = Object.keys(cur.projects || {}).some((p) => !(p in (row.projects || {})));
        if (JSON.stringify(row.projects || {}) !== JSON.stringify(cur.projects || {}) || row.updated !== cur.updated) changed++;
        S.data.log[row.id] = { ...row, projects: shares, need: Object.values(shares).reduce((a, v) => a + (Number(v) || 0), 0), updated: extra ? cur.updated : row.updated };
        if (!extra) delete S.pending[k];
        continue;
      }
      if (cur && S.pending[k] && (Number(cur.updated) || 0) > (Number(row.updated) || 0)) continue;
      if (!cur || JSON.stringify(cur) !== JSON.stringify(row)) changed++;
      S.data[t][row.id] = row;
      delete S.pending[k];
    }
    // 整表重拉时：表格里已经没有、本机也没改过的行，删掉（比如在表格里手动删了行）
    if (full) for (const id of Object.keys(S.data[t])) if (!seen.has(id) && !S.pending[t + ":" + id]) { delete S.data[t][id]; changed++; }
  }
  if (now) S.cursor = now;
  if (full) S.needFull = false;
  persist();
  if (changed) ctxCache = null;
  emit({ pulled: true, ...(changed ? {} : { quiet: true }) });
}

export function resetCursor() { S.cursor = 0; persist(); }

export function exportData() {
  return { app: "苦昼短", exportedAt: new Date().toISOString(), data: S.data };
}

// ---------- 任务 ----------

function nextOrder(date) {
  return tasksOn(date).reduce((m, t) => Math.max(m, Number(t.order) || 0), 0) + 1;
}

// 计划 Pool 里和这个名字一样的那一项（不分大小写）；没写名字、没有一样的 = null
const key = (s) => String(s || "").trim().toLowerCase();
function poolItemFor(projectId, title) {
  if (!key(title)) return null;
  return all("items").find((i) => i.projectId === projectId && key(i.title) === key(title)) || null;
}

// 在某天加一条挂在计划上的任务（她 2026-10-26 定的）：写的名字是 Pool 里的一项 = 挑了那一项（带号、带步骤，见 js/store/lists.js 的 placeItem）；
// 别的都是这个计划自己的一条，不拆成下面的子项——没写名字、或者写的就是计划名，那天已经有那一行了就是那一行，不再建第二条；
// 写了别的名字就是计划下面单独一条任务（和以前一样有 Done / Delay / Drop）。挂了项的，顺手把那天的那一行建好（计时在它身上）
export function addTask(fields) {
  let id = fields.id || newId();   // 给了 id 就用它（Chore 键那条每天固定是 chore-日期）
  const date = fields.date || today();
  const plan = fields.projectId ? get("projects", fields.projectId) : null;
  if (plan && fields.itemId === undefined && !fields.id) {
    const hit = poolItemFor(plan.id, fields.title);
    const placed = hit ? placeItem(hit.id, date) : "";
    if (placed) return placed;
  }
  change(() => {
    const itemId = fields.itemId || "";
    const own = plan && !itemId && !fields.id && (!key(fields.title) || key(fields.title) === key(plan.name));
    const row = own ? rowOf(plan.id, date) : null;
    if (row) { id = row.id; return; }
    put("tasks", {
      id, title: "", est: 30, actual: null, status: "", reason: "", optional: false, deep: planDeep(fields.projectId), projectId: "", group: "", times: "", desc: "",
      ...fields, title: fields.title || plan?.name || "", date, itemId, order: nextOrder(date)
    });
    if (plan && itemId) ensureRow(plan.id, date);
  });
  return id;
}

export function updateTask(id, patch, label, opts) {
  const t = get("tasks", id);
  if (!t) return;
  change(() => put("tasks", { ...t, ...patch }), label, opts);
}

// 和旧版一样：再点一次同一个就取消。只改状态，记下的时间不动（时间是真花了的，和标什么无关）
export function setStatus(id, s) {
  const t = get("tasks", id);
  if (!t) return;
  const off = t.status === s;
  updateTask(id, { status: off ? "" : s, reason: s === "done" && !off ? "" : t.reason });
}

export function moveTask(id, date) {
  const t = get("tasks", id);
  if (!t || t.date === date) return;
  change(() => put("tasks", { ...t, date, order: nextOrder(date) }), "Moved to " + date);
}

export function moveMany(ids, date) {
  change(() => ids.forEach((id) => {
    const t = get("tasks", id);
    if (t && t.date !== date) put("tasks", { ...t, date, order: nextOrder(date) });
  }), "Moved " + ids.length + " task" + (ids.length > 1 ? "s" : ""));
}

// 换计划：解开原来的项，名字和新计划 Pool 里哪一项一样就挂上那一项，不一样就是新计划自己的一条。不挂计划时可以直接挂在大类上（group）
export function setTaskProject(id, projectId, group = "") {
  const t = get("tasks", id);
  if (!t || (t.projectId === projectId && (projectId || (t.group || "") === group))) return;
  change(() => put("tasks", { ...t, projectId, group: projectId ? "" : group, itemId: projectId ? poolItemFor(projectId, t.title)?.id || "" : "" }));
}

export function reorder(ids) {
  change(() => ids.forEach((id, i) => {
    const t = get("tasks", id);
    if (t && Number(t.order) !== i + 1) put("tasks", { ...t, order: i + 1 });
  }));
}

// 删任务（计时记录在任务自己身上，一起没了）；正在计时的话计时器也停掉
function dropTask(id) {
  if (timer()?.taskId === id) put("settings", { id: "timer", key: "timer", value: null });
  drop("tasks", id);
}

// 动过的任务：标了状态，或者计过时
const started = (t) => Boolean(t.status) || hasTime(t.id);

// 删掉规律计划的某一次：记进规则的 skip，那天不再出现
export function deleteTask(id) {
  const rt = R.parseRoutineTaskId(id);
  change(() => {
    dropTask(id);
    const p = rt && routineOf(id);
    if (p && !(p.rule?.skip || []).includes(rt.date)) setRule(p, { skip: [...(p.rule?.skip || []), rt.date] });
  }, "Deleted");
}

// 从 Pool 拖一项到某天（见 js/store/lists.js 的 placeItem）
export const scheduleItem = (itemId, date) => placeItem(itemId, date);
// 拖回 Pool：项回去（勾了一半的留记录）；那一行没动过（没记时间、没标状态）就删掉，那天它下面没勾的项一起回去
export function unschedule(id) {
  const t = get("tasks", id);
  if (!t) return false;
  if (t.itemId) return backToPool(id);
  if (!t.projectId || started(t)) return false;
  const lines = all("tasks").filter((x) => x.date === t.date && x.projectId === t.projectId && x.itemId && x.status !== "done");
  change(() => { lines.forEach((x) => backToPool(x.id)); dropTask(id); }, "Back to the pool");
  return true;
}

// ---------- 计划和 Pool 里的项 ----------
// 计划 = projects 表一行，kind 都是 regular（以前的 total 打开时搬过来，见 js/store/lists.js）；place：auto（固定星期几自己出现）/ pool（拖到哪天）。
// Pool 里的项 = items 表一行，它的设置在计划的 rule.items 里

const nextPlanOrder = () => all("projects").reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1;
// 同一个大类里的计划默认用大类的颜色
const colorFor = (group) => groupByName(group)?.color || all("projects").find((x) => group && x.group === group)?.color || PROJECT_COLORS[all("projects").length % PROJECT_COLORS.length];
// 任务挂着的计划属于哪个大类（没有 group 的计划自己算一个）
const groupFor = (projectId) => { const p = get("projects", projectId); return p ? p.group || p.name || "" : ""; };
// 任务属于哪个大类：挂了计划就是计划的；没挂就是直接挂的那个
export const groupOf = (t) => (t.projectId && get("projects", t.projectId) ? groupFor(t.projectId) : String(t.group || ""));
// 计划的「默认深度」（rule.deep）：从它来的任务一开始就标成 Deep
export const planDeep = (projectId) => Boolean(projectId && get("projects", projectId)?.rule?.deep);

// p.total（分钟）：以前新建整块计划时只填了总时长，就建一个同名的大条目（现在的编辑框不给 total 了，测试里还用）
export function saveProject(p) {
  const id = p.id || newId();
  const prev = get("projects", id);
  const { total, ...fields } = p;
  const row = { name: "", group: "", kind: "regular", place: "pool", status: "active", deadline: "", start: "", early: 0, calib: null, rule: null, ...prev, ...fields, id };
  row.order = prev?.order ?? nextPlanOrder();
  row.color = fields.color || prev?.color || colorFor(row.group);
  if (row.kind === "regular") { const { id: _i, title: _t, ...rule } = R.ruleOf(row); row.rule = rule; }
  change(() => {
    if (row.group && groupsSaved() && !groupByName(row.group)) putGroups([...groups(), { name: row.group, color: row.color, labor: false, grow: "" }]);
    put("projects", row);
    if (!prev && row.kind === "total" && Number(total) > 0) put("items", { id: newId(), projectId: id, module: "", title: row.name, est: Math.round(Number(total)), origEst: null, order: 1 });
  });
  // 刚变成「自动排」的：今天的那份马上排进来
  if (E.isAuto(row) && E.isActive(row) && (!prev || !E.isAuto(prev) || !E.isActive(prev))) autoToday(id);
  return id;
}

// 归档 / 放回来（Projects 页卡片上的 Archive / Restore）：和编辑框里的 Status 是同一个字段（done / active），多一句能撤销的提示
export function archiveProject(id, on = true) {
  const p = get("projects", id);
  if (!p || E.isActive(p) !== on) return;
  change(() => put("projects", { ...p, status: on ? "done" : "active" }), (on ? "Archived " : "Restored ") + (p.name || "plan"));
  if (!on && E.isAuto(p)) autoToday(id);   // 放回来的自动排的计划：今天的那份马上排进来（和 saveProject 一样）
}

// 改计划的「默认深度」：已经有的任务一起改（之后单个任务还能各自改）
export function setPlanDeep(id, on) {
  const p = get("projects", id);
  if (!p) return;
  const deep = Boolean(on);
  change(() => {
    put("projects", { ...p, rule: { ...(p.rule || {}), deep } });
    for (const t of all("tasks")) if (t.projectId === id && Boolean(t.deep) !== deep) put("tasks", { ...t, deep });
  }, deep ? "Marked as deep work" : "No longer deep work");
}

// 删计划：条目一起删；做过的任务留着当记录，只是不再挂在计划上；自动排出来还没动的删掉
export function deleteProject(id) {
  change(() => {
    all("items").filter((i) => i.projectId === id).forEach((i) => drop("items", i.id));
    const group = groupFor(id);   // 留下来的任务还算在原来那个大类里
    all("tasks").filter((t) => t.projectId === id).forEach((t) => (E.isAutoTask(t) && !started(t) ? dropTask(t.id) : put("tasks", { ...t, projectId: "", itemId: "", group })));
    drop("projects", id);
    renameGoalRef("p:" + id, "");   // 目标上连着它的那一条也拿掉
  }, "Deleted plan");
}

export function addItems(projectId, module, titles, est) {
  let order = all("items").filter((i) => i.projectId === projectId).reduce((m, i) => Math.max(m, Number(i.order) || 0), 0);
  change(() => titles.forEach((title) => put("items", { id: newId(), projectId, module: module || "", title, est: Number(est) || 0, origEst: null, order: ++order })));
}

// 改了名字：还没勾的那几次跟着改（以前带着 #k 的，号一起拿掉）
export function updateItem(id, patch) {
  const i = get("items", id);
  if (!i) return;
  change(() => {
    put("items", { ...i, ...patch });
    if (patch.title !== undefined) {
      for (const t of all("tasks")) {
        if (t.itemId !== id || t.status) continue;
        if (t.title === i.title || t.title.replace(OLD_NUM, "") === i.title) put("tasks", { ...t, title: patch.title });
      }
    }
  });
}

// 删一项：做过的那几次留着当记录（不再挂在这一项上），没动过的删掉；计划里它的设置一起拿掉
export function deleteItem(id) {
  const i = get("items", id), p = i && get("projects", i.projectId);
  change(() => {
    all("tasks").filter((t) => t.itemId === id).forEach((t) => (started(t) ? put("tasks", { ...t, itemId: "" }) : dropTask(t.id)));
    drop("items", id);
    if (p?.rule?.items?.[id]) { const items = { ...p.rule.items }; delete items[id]; put("projects", { ...p, rule: { ...p.rule, items } }); }
  }, "Deleted " + (i?.title || "item"));
}

// ---------- 容量、设置、今天该出现的 ----------

// 某天单独改可用时间：存在 settings.capacity.overrides 里；清空 = 回到每周默认（记成 null，表格合并时才知道是清空了）
export function setDayCapacity(date, min) {
  const cap = capacitySettings();
  const overrides = { ...(cap.overrides || {}) };
  overrides[date] = min === null || min === "" ? null : Number(min);
  setSetting("capacity", { ...cap, overrides });
}

export function setSetting(key, value) {
  change(() => put("settings", { id: key, key, value }));
}

// 电脑日历里一天天点的标记：Settings 里一条 {days: {"2026-10-08": true}}，一年前的顺手清掉；v 是 undefined = 去掉那天
const dayMarks = (key) => setting(key, null)?.days || {};

function markDay(key, date, v, msg) {
  const cut = addDays(today(), -366);
  const days = Object.fromEntries(Object.entries(dayMarks(key)).filter(([d, x]) => typeof x === "boolean" && d >= cut));
  if (v === undefined) delete days[date];
  else days[date] = v;
  change(() => put("settings", { id: key, key, value: { days } }), msg);
}

// 通勤日
export const isCommuteDay = (date) => Boolean(dayMarks("commute")[date]);
export const toggleCommute = (date) => (isCommuteDay(date) ? markDay("commute", date, undefined, "Not a commute day") : markDay("commute", date, true, "Commute day " + fmtShort(date)));

// 不上班（请假、公众假日，js/offdays.js）：点回和自动算的一样时就不留记录
export const offDay = (date) => OD.offState(date, setting("offday", null));
export function toggleOffDay(date) {
  const { off, holiday } = offDay(date);
  markDay("offday", date, !off === Boolean(holiday) ? undefined : !off, (off ? "Work day " : "Day off ") + fmtShort(date));
}

// 超级休息日：日历上那天的进度条变金色，别的都不管
export const isSuperRest = (date) => Boolean(dayMarks("super-rest")[date]);
export const toggleSuperRest = (date) => (isSuperRest(date) ? markDay("super-rest", date, undefined, "Not a super rest day") : markDay("super-rest", date, true, "Super rest day " + fmtShort(date)));

// 自动排出来的任务（generated：改动时间记成 1，哪台设备真改过它都比这个新）
function putAuto(x) {
  put("tasks", { actual: null, status: "", reason: "", optional: false, deep: false, itemId: "", times: "", desc: "", ...x, order: nextOrder(x.date) }, { generated: true });
}

// 规律计划（Auto）今天该出现、还没有的那一次
function regularsDueToday(c) {
  return c.projects.filter((p) => E.isActive(p) && E.isRegular(p) && E.isAuto(p)).map((p) => {
    const id = R.routineTaskId(p.id, c.today), est = R.dueOn(R.ruleOf(p), c.today);
    return est && !get("tasks", id) ? { id, date: c.today, title: p.name, est, projectId: p.id, optional: Boolean(p.rule?.optional), deep: Boolean(p.rule?.deep) } : null;
  }).filter(Boolean);
}

// 今天该自己出现的：固定星期几的计划那天的那一次（还没有的）。打开时、换天时、刚建好 / 放回来一个这样的计划时各看一次
export function ensureToday() {
  const regs = regularsDueToday(ctx());
  if (regs.length) change(() => regs.forEach(putAuto));
}
const autoToday = () => ensureToday();

// 以后某天的预览变成真任务（拖动 / 点开它的时候）：返回任务 id
export function materialize(key) {
  const x = R.parseRoutineTaskId(key);
  const p = x && routineOf(key);
  if (!p) return "";
  if (!get("tasks", key)) {
    const est = R.dueOn(R.ruleOf(p), x.date) || R.minutesOn(R.ruleOf(p), x.date);
    change(() => put("tasks", { id: key, date: x.date, title: p.name, est, actual: null, status: "", reason: "", optional: Boolean(p.rule?.optional), deep: Boolean(p.rule?.deep),
      projectId: p.id, itemId: "", times: "", desc: "", order: nextOrder(x.date) }));
  }
  return key;
}

// Pool 里的计划自己拖到某天：那天的那一行（已经有了就是那一条）
export const placeRegular = (pid, date) => ensureRow(pid, date);

// ---------- 大类（界面上的 Project）和它下面的计划 ----------
// 大类清单在 Settings 的 groups 里（见 js/groups.js）；计划的 group、直接挂在大类上的任务的 group 存的都是大类的名字

const groupsSaved = () => Array.isArray(setting("groups", null));
function putGroups(list) { put("settings", { id: "groups", key: "groups", value: list }); }

// 还没存过（刚更新、还没从表格拉到数据）就先用默认的六个，加上计划里出现过的名字
export function groups() {
  const saved = setting("groups", null);
  return GR.sortGroups(Array.isArray(saved) ? saved : GR.withPlans(GR.DEFAULTS, all("projects")));
}
export const groupByName = (name) => (name ? GR.byName(groups(), name) : null);

// 第一次：把现有的计划归进六个大类、换成新颜色。返回 { names, undo }（没什么可归的返回 null）；
// undo = 计划的大类和颜色改回去（清单留着：默认的六个加上原来的名字）
export function adoptGroups() {
  if (groupsSaved()) return null;
  const { groups: list, moves } = GR.adopt(all("projects"));
  const before = moves.map((m) => { const p = get("projects", m.id); return { id: m.id, group: p.group || "", color: p.color || "" }; });
  const apply = (rows, value) => change(() => {
    putGroups(value);
    for (const m of rows) { const p = get("projects", m.id); if (p) put("projects", { ...p, group: m.group, color: m.color }); }
  });
  apply(moves, list);
  if (!moves.length) return null;
  return { names: [...new Set(moves.map((m) => m.group).filter(Boolean))], undo: () => apply(before, GR.withPlans(GR.DEFAULTS, before.map((b) => ({ group: b.group, color: b.color })))) };
}

// 三个大类的默认颜色换过（见 groups.js 的 recolor）：还用着原来那套的换成新的，下面的计划跟着换
export function adoptColors() {
  if (!groupsSaved()) return;
  for (const g of GR.recolor(groups())) saveGroup(g.name, { color: g.color });
}

// 改大类的设置（颜色、labor、grow、friends）。换颜色时，还用着原来那个颜色的计划跟着换
export function saveGroup(name, patch) {
  if (!groupsSaved()) adoptGroups();
  const list = groups(), cur = GR.byName(list, name);
  if (!cur) return;
  change(() => {
    putGroups(list.map((g) => (g.name === name ? { ...g, ...patch, name } : g)));
    if (patch.color && patch.color !== cur.color) all("projects").filter((p) => (p.group || "") === name && p.color === cur.color).forEach((p) => put("projects", { ...p, color: patch.color }));
  });
}

export function addGroup(name) {
  if (!groupsSaved()) adoptGroups();
  const n = String(name || "").trim(), list = groups();
  if (!n || GR.byName(list, n)) return;
  change(() => putGroups([...list, { name: n, color: PROJECT_COLORS[list.length % PROJECT_COLORS.length], labor: false, grow: "" }]));
}

// 空的大类（下面没有计划）才能拿掉；直接挂在它上面的任务留着名字
export function removeGroup(name) {
  if (!groupsSaved()) adoptGroups();
  if (all("projects").some((p) => (p.group || "") === name)) return;
  change(() => putGroups(groups().filter((g) => g.name !== name)), "Removed " + name);
}

// 改名；改成一个已经有的名字 = 并进去（计划、直接挂着的任务都跟过去）
export function renameGroup(from, to) {
  const name = String(to || "").trim();
  if (!name || name === from) return;
  if (!groupsSaved()) adoptGroups();
  const list = groups(), merge = Boolean(GR.byName(list, name));
  change(() => {
    putGroups(merge ? list.filter((g) => g.name !== from) : list.map((g) => (g.name === from ? { ...g, name } : g)));
    all("projects").filter((p) => (p.group || "") === from).forEach((p) => put("projects", { ...p, group: name }));
    all("tasks").filter((t) => !t.projectId && (t.group || "") === from).forEach((t) => put("tasks", { ...t, group: name }));
    renameGoalRef("g:" + from, "g:" + name);   // 为哪些目标服务，跟着新名字走
  }, merge ? "Moved " + from + " into " + name : "Renamed project");
}

// ---------- 这台设备的存储 ----------
// 整份数据是 localStorage 里的一段文字，上限大约 5MB。算一算用了多少、按最近 7 天的量还能撑多久（十分钟内不重算）。
const LIMIT = 5e6;
let usage = null;
// used = 现在用了多少字符；each = 一条任务平均多少字符；recent = 最近 7 天记了几条。
// warn = 已经存不进去了、用过九成了、或者照这个量两周内会满
export function usageOf(used, each, recent, isFull = false, limit = LIMIT) {
  const perDay = (recent / 7) * each;
  const daysLeft = perDay > 0 ? Math.max(0, (limit - used) / perDay) : Infinity;
  return { used, limit, recent, daysLeft, full: isFull, warn: isFull || used / limit > 0.9 || daysLeft < 14 };
}
export function storage() {
  if (usage && Date.now() - usage.at < 6e5 && usage.full === full) return usage;
  const tasks = all("tasks"), T = today(), from = addDays(T, -6);
  const each = tasks.length ? JSON.stringify(S.data.tasks).length / tasks.length : 420;
  usage = { at: Date.now(), tasks: tasks.length, ...usageOf(JSON.stringify(S).length, each, tasks.filter((t) => t.date >= from && t.date <= T).length, full) };
  return usage;
}
export const forgetStorage = () => { usage = null; };

// ---------- 分出去的几块（js/store/）：各拿到下面这几样读写，接回来的名字和原来一样 ----------
// 上面的函数也会用到它们（删任务要问是不是重复的那一次、标状态要看计了多久）：都是调用时才用，这时已经接好了。

const core = { all, get, entries: (t) => Object.entries(S.data[t]), put, drop, change, memo, newId, today, setting, prefs, byOrder,
  groupFor, colorFor, nextPlanOrder, nextOrder, started, dropTask, addTask, updateTask, deleteTask, ctx, planDeep, saveProject };

const tm = timerStore(core);
export const { timer, timeOf, hasTime, timeTotal, clockOf, clockNow, startTimer, stopTimer, setTimerStart, setTimerTag, discardTimer, logTime, addLogged, tagTime, editTime, deleteTime } = tm;

// Chore 键：每天一条 Chores 任务（ID 固定 chore-日期，表格里不用加列就认得出），标着 Done、est = 当天合计；每按一次 = 多一段计时。
// 挂在叫 Chores 的大类上，没有就第一个 labor 的，再没有就不挂。有别的在跑先停下记好（返回记了多少，和 startTimer 一样）
export const choreId = (date) => "chore-" + date;
export const isChore = E.isChore;
const choreGroup = () => (groups().find((g) => g.name === "Chores") || groups().find((g) => g.labor))?.name || "";
export function startChore(tag = "") {
  const id = choreId(today());
  let logged = null;
  change(() => {
    if (!get("tasks", id)) addTask({ id, title: "Chores", est: 0, status: "done", group: choreGroup() });
    logged = startTimer(id, tag);
  });
  return logged;
}

export const { sides, sideOf, sideFilled, setSide } = sideStore(core);

const fr = friendStore(core);
export const { friends, meets, meetOfTask, friendFields, lastContact, saveFriend, deleteFriend, saveMeet, deleteMeet, setTaskMeet, importFriends, friendSpecial, adoptMarks, occasionDone, toggleOccasion, doneNext } = fr;
const { moveMeet } = fr;

const idea = ideaStore(core);
export const { ideas, ideaOf, ideaOfTask, saveIdea, addIdeas, deleteIdea, pickIdea, unpickIdea, settleIdeas } = idea;
const { ideaTaskDropped, moveIdea } = idea;

const series = seriesStore({ ...core, timer, setTimer: tm.setTimer, moveMeet, moveIdea });
export const { routines, routineOf, seriesTasks, addRepeating, repeatTask, replanSeries, editSeries, seriesScope, deleteSeries, setSeriesGroup } = series;
const { setRule } = series;

export const { scores, scoreOf, scoreSetup, scoreCells, setScore, setScoreNote } = scoreStore(core);

export const { quads, quadOf, quadBoard, addQuad, moveQuad, editQuad, doneQuad, deleteQuad, restoreQuad, adoptQuads } = quadStore(core);

export const { itemCfg, setItemCfg, setPlanNotes, setSectionLater, rowOf, ensureRow, placeItem, moveLine, moveBlock, blockToPool, tickLine, tickStep, backToPool, settleLists, addPoolLines, planShape, planText, pastePlan, adoptLists } = listStore(core);

export const { goals, saveGoal, deleteGoal, setParent, linkGoal, renameGoalRef, ensureNorthStar, northStar, saveNorth } = goalStore(core);
export const { readPlan, addReadPlan, moveReadPlan, removeReadPlan } = readPlanStore(core);
export const { meals, mealPrefs, saveMeal, deleteMeal, saveWeek, setMealDay, checkDeal, addMealExamples, importMeals, clearMealExamples, addDishes, dishToBox } = mealStore(core);
