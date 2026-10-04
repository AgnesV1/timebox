// 数据层：本机存一份（localStorage），所有改动都从这里走，记下哪些行还没推到表格。
// 每行都有 updated（改动时间），两台设备改了同一行，以后改的为准。

import { todayIso, addDays } from "./dates.js";
import * as E from "./engine.js";
import * as R from "./routines.js";
import { readLocal, writeLocal } from "./dom.js";

const KEY = "kuzhouduan-v1";
const OLD_KEY = "timebox-v1";
export const TABLES = ["tasks", "projects", "items", "capacity", "notes", "log", "settings"];
const KEYED = { capacity: "date", notes: "date", log: "date", settings: "key" };

// 只把这些字段发给表格；Planned / Spent / 项目名这些是表格自己算的
const FIELDS = {
  tasks: ["date", "title", "est", "actual", "order", "category", "status", "doneOrder", "reason", "optional", "projectId", "itemId", "desc"],
  projects: ["name", "group", "status", "deadline", "start", "early", "color", "order", "calib"],
  items: ["title", "module", "est", "origEst", "order", "projectId"],
  capacity: ["date", "min"],
  notes: ["date", "note"],
  log: ["date", "need", "projects"],
  settings: ["key", "value"]
};

export const PROJECT_COLORS = ["#B8F000", "#2F5BFF", "#FF3EA5", "#FF7A1A", "#9B5CFF", "#00C2A8", "#FFC400", "#FF4D4D"];

function blank() {
  return {
    data: Object.fromEntries(TABLES.map((t) => [t, {}])),
    pending: {},   // "表:id" → 发送时比对用的 updated
    deletes: [],   // 待推送的删除
    cursor: 0,     // 上次从表格拉到的时间点
    local: { url: "", secret: "", theme: "auto", fx: true, calMode: "week", pool: true }   // 只存在这台设备上
  };
}

let S = load();
let ctxCache = null;
let tx = null;
const listeners = new Set();
const undoListeners = new Set();

function load() {
  const saved = readLocal(KEY, null);
  const s = saved || blank();
  TABLES.forEach((t) => { s.data[t] = s.data[t] || {}; });
  s.pending = s.pending || {};
  s.deletes = s.deletes || [];
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

function persist() {
  if (!writeLocal(KEY, S)) console.warn("Can't save on this device");
}

// ---------- 读 ----------

export const all = (t) => Object.values(S.data[t]);
export const get = (t, id) => S.data[t][id] || null;
export const local = () => S.local;
export const cursor = () => S.cursor;
export const hasPending = () => Object.keys(S.pending).length > 0 || S.deletes.length > 0;
export const pendingCount = () => Object.keys(S.pending).length + S.deletes.length;

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
  for (const r of all("capacity")) if (r.min !== null && r.min !== "" && r.min !== undefined) overrides[r.date] = Number(r.min);
  const log = {};
  for (const r of all("log")) log[r.date] = { need: Number(r.need) || 0, projects: r.projects || {} };
  ctxCache = {
    today: t,
    projects: all("projects").sort(byOrder),
    items: all("items").sort(byOrder),
    tasks: all("tasks"),
    capacity: { default: Number(cap.default) || 0, weekly: Array.isArray(cap.weekly) ? cap.weekly : null, overrides },
    log,
    level: prefs().level !== false
  };
  return ctxCache;
}

export function tasksOn(date) {
  return all("tasks").filter((t) => t.date === date).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
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
  const prev = S.data[t][row.id];
  row.updated = generated && !prev ? 1 : Math.max(Date.now(), (Number(prev?.updated) || 0) + 1);
  S.data[t][row.id] = row;
  S.pending[t + ":" + row.id] = row.updated;
  S.deletes = S.deletes.filter((d) => !(d.table === t && d.id === row.id));
}

function drop(t, id) {
  if (!S.data[t][id]) return;
  remember(t, id);
  delete S.data[t][id];
  delete S.pending[t + ":" + id];
  S.deletes.push({ table: t, id, at: Date.now() });
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

// 推送成功：发出去之后没再改过的行才算推上去了
export function pushed(out) {
  for (const [k, u] of Object.entries(out.stamp)) if (S.pending[k] === u) delete S.pending[k];
  S.deletes = S.deletes.filter((d) => !out.deletes.some((x) => x.table === d.table && x.id === d.id && x.at === d.at));
  persist();
}

function normalize(t, raw) {
  const r = { ...raw };
  r.id = String(KEYED[t] ? raw[KEYED[t]] : raw.id);
  if (t === "tasks") {
    r.status = r.status || "";
    r.est = Number(r.est) || 0;
    r.optional = Boolean(r.optional);
    r.projectId = r.projectId || "";
    r.itemId = r.itemId || "";
  }
  if (t === "items") { r.est = Number(r.est) || 0; r.projectId = r.projectId || ""; }
  if (t === "projects") r.status = r.status || "active";
  return r;
}

export function applyPull(pull, now, { full = false } = {}) {
  if (!pull) return;
  for (const d of pull.deleted || []) {
    const r = S.data[d.table]?.[d.id];
    if (!r) continue;
    const k = d.table + ":" + d.id;
    if (S.pending[k] && (Number(r.updated) || 0) > (Number(d.at) || 0)) continue;
    delete S.data[d.table][d.id];
    delete S.pending[k];
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
        S.data.log[row.id] = { ...row, projects: shares, need: Object.values(shares).reduce((a, v) => a + (Number(v) || 0), 0), updated: extra ? cur.updated : row.updated };
        if (!extra) delete S.pending[k];
        continue;
      }
      if (cur && S.pending[k] && (Number(cur.updated) || 0) > (Number(row.updated) || 0)) continue;
      S.data[t][row.id] = row;
      delete S.pending[k];
    }
    // 整表重拉时：表格里已经没有、本机也没改过的行，删掉（比如在表格里手动删了行）
    if (full) for (const id of Object.keys(S.data[t])) if (!seen.has(id) && !S.pending[t + ":" + id]) delete S.data[t][id];
  }
  if (now) S.cursor = now;
  persist();
  ctxCache = null;
  emit({ pulled: true });
}

export function resetCursor() { S.cursor = 0; persist(); }

export function exportData() {
  return { app: "苦昼短", exportedAt: new Date().toISOString(), data: S.data };
}

// ---------- 任务 ----------

function nextOrder(date) {
  return tasksOn(date).reduce((m, t) => Math.max(m, Number(t.order) || 0), 0) + 1;
}

// 直接在某天加项目任务时，要挂到一个条目上计划才会前进：同名条目、或者项目只有一个大块条目（老表迁移来的那种）
// 就挂上去；都没有就新建一个条目，算作计划外多做的
function itemFor(projectId, title, est) {
  const items = all("items").filter((i) => i.projectId === projectId);
  const key = (s) => String(s || "").trim().toLowerCase();
  const hit = items.find((i) => key(i.title) === key(title)) || (items.length === 1 && items[0].est > 120 ? items[0] : null);
  if (hit) return hit.id;
  const id = newId();
  put("items", { id, projectId, module: "Added", title, est: Number(est) || 0, origEst: null, order: items.reduce((m, i) => Math.max(m, Number(i.order) || 0), 0) + 1 });
  return id;
}

export function addTask(fields) {
  const id = newId();
  const date = fields.date || today();
  change(() => {
    const itemId = fields.projectId && !fields.itemId ? itemFor(fields.projectId, fields.title, fields.est) : fields.itemId || "";
    put("tasks", {
      id, title: "", est: 30, actual: null, category: "", status: "", doneOrder: null, reason: "",
      optional: false, projectId: "", desc: "", ...fields, date, itemId, order: nextOrder(date)
    });
  });
  return id;
}

export function updateTask(id, patch, label, opts) {
  const t = get("tasks", id);
  if (!t) return;
  change(() => put("tasks", { ...t, ...patch }), label, opts);
}

// 和旧版一样：再点一次同一个就取消；Done / Partial 记下这是今天第几件做完的
export function setStatus(id, s) {
  const t = get("tasks", id);
  if (!t) return;
  const off = t.status === s;
  const fin = s === "done" || s === "partial";
  const finished = tasksOn(t.date).filter((x) => x.doneOrder !== null && x.doneOrder !== undefined && x.doneOrder !== "").length;
  updateTask(id, {
    status: off ? "" : s,
    doneOrder: off ? null : fin ? (t.doneOrder ?? finished + 1) : null,
    reason: s === "done" && !off ? "" : t.reason,
    actual: !off && fin ? t.actual : null
  });
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

// 换项目：解开原来的条目，再按名字挂到新项目的条目上
export function setTaskProject(id, projectId) {
  const t = get("tasks", id);
  if (!t || t.projectId === projectId) return;
  change(() => put("tasks", { ...t, projectId, itemId: projectId ? itemFor(projectId, t.title, t.est) : "" }));
}

export function reorder(ids) {
  change(() => ids.forEach((id, i) => {
    const t = get("tasks", id);
    if (t && Number(t.order) !== i + 1) put("tasks", { ...t, order: i + 1 });
  }));
}

// 删掉重复任务的某一次：记进规则的 skip，以后不再给那天生成
export function deleteTask(id) {
  const rt = R.parseRoutineTaskId(id);
  change(() => {
    drop("tasks", id);
    if (rt) {
      const list = routines();
      const r = list.find((x) => x.id === rt.rid);
      if (r && !(r.skip || []).includes(rt.date)) writeRoutines(list.map((x) => (x.id === rt.rid ? { ...x, skip: [...(x.skip || []), rt.date] } : x)));
    }
  }, "Deleted");
}

// Later → 原来那条留着（原因还在），在明天放一条新的
export function toTomorrow(id) {
  const t = get("tasks", id);
  if (!t) return;
  const date = addDays(t.date < today() ? today() : t.date, 1);
  change(() => {
    if (t.status !== "later") put("tasks", { ...t, status: "later", doneOrder: null, actual: null });
    put("tasks", { ...t, id: newId(), date, status: "", doneOrder: null, actual: null, reason: "", order: nextOrder(date) });
  }, "Moved to tomorrow");
}

// 从任务池拖到某天：小条目整块排进去；大块的（比如 600 分钟的总任务）按每天该做的量切一块
export function scheduleItem(itemId, date) {
  const item = get("items", itemId);
  if (!item) return;
  const c = ctx();
  const st = E.itemState(c, item);
  if (st.unscheduled < 0.5) return;
  let est = st.unscheduled;
  if (est > 120) {
    const p = get("projects", item.projectId);
    const need = p ? E.projectPlan(c, p).dailyNeed : 0;
    est = need ? Math.min(120, Math.max(15, Math.round(need / 15) * 15)) : 60;
  }
  const id = newId();
  change(() => put("tasks", {
    id, date, title: item.title, est: Math.round(est), actual: null, category: "", status: "", doneOrder: null, reason: "",
    optional: false, projectId: item.projectId, itemId, desc: "", order: nextOrder(date)
  }), "Scheduled");
  return id;
}

// 拖回任务池：只有从条目来的、还没开始的任务能拖回去
export function unschedule(id) {
  const t = get("tasks", id);
  if (!t || !t.itemId || t.status) return false;
  change(() => drop("tasks", id), "Back to pool");
  return true;
}

export function spreadOverdue() {
  const moves = E.planOverdue(ctx());
  if (!moves.length) return 0;
  change(() => moves.forEach((m) => {
    const t = get("tasks", m.id);
    if (t) put("tasks", { ...t, date: m.to, order: nextOrder(m.to) });
  }), "Spread " + moves.length + " task" + (moves.length > 1 ? "s" : ""));
  return moves.length;
}

// ---------- 项目和条目 ----------

export function saveProject(p) {
  const id = p.id || newId();
  const prev = get("projects", id);
  const order = prev?.order ?? all("projects").reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1;
  const color = p.color || prev?.color || PROJECT_COLORS[all("projects").length % PROJECT_COLORS.length];
  change(() => put("projects", { name: "", group: "", status: "active", deadline: "", start: "", early: 2, calib: null, ...prev, ...p, id, order, color }));
  return id;
}

// 删项目：条目一起删；做过的任务留着当记录，只是不再挂在项目上
export function deleteProject(id) {
  change(() => {
    all("items").filter((i) => i.projectId === id).forEach((i) => drop("items", i.id));
    all("tasks").filter((t) => t.projectId === id).forEach((t) => put("tasks", { ...t, projectId: "", itemId: "" }));
    drop("projects", id);
  }, "Deleted project");
}

export function addItems(projectId, module, titles, est) {
  let order = all("items").filter((i) => i.projectId === projectId).reduce((m, i) => Math.max(m, Number(i.order) || 0), 0);
  change(() => titles.forEach((title) => put("items", { id: newId(), projectId, module: module || "", title, est: Number(est) || 0, origEst: null, order: ++order })));
}

export function updateItem(id, patch) {
  const i = get("items", id);
  if (!i) return;
  change(() => {
    put("items", { ...i, ...patch });
    if (patch.title !== undefined) {
      all("tasks").filter((t) => t.itemId === id && !t.status && t.title === i.title).forEach((t) => put("tasks", { ...t, title: patch.title }));
    }
  });
}

export function deleteItem(id) {
  change(() => {
    all("tasks").filter((t) => t.itemId === id).forEach((t) => (t.status ? put("tasks", { ...t, itemId: "" }) : drop("tasks", t.id)));
    drop("items", id);
  }, "Deleted item");
}

// 按实际速度改这个模块剩下条目的估时（第一次改时记下原来的估时）
export function applyCalibration(projectId, module) {
  const p = get("projects", projectId);
  if (!p) return;
  const s = E.moduleStats(ctx(), p, module);
  change(() => {
    s.proposals.forEach(({ item, est }) => {
      put("items", { ...item, origEst: item.origEst ?? item.est, est });
      all("tasks").filter((t) => t.itemId === item.id && !t.status).forEach((t) => put("tasks", { ...t, est: Math.min(t.est, est) }));
    });
    put("projects", { ...get("projects", projectId), calib: { ...(p.calib || {}), [module]: s.samples.length } });
  }, "Updated " + s.proposals.length + " estimates");
}

export function keepPlan(projectId, module) {
  const p = get("projects", projectId);
  if (!p) return;
  const s = E.moduleStats(ctx(), p, module);
  change(() => put("projects", { ...p, calib: { ...(p.calib || {}), [module]: s.samples.length } }));
}

// ---------- 容量、备注、设置、早上的线 ----------

export function setDayCapacity(date, min) {
  change(() => (min === null || min === "" ? drop("capacity", date) : put("capacity", { id: date, date, min: Number(min) })));
}

export function setSetting(key, value) {
  change(() => put("settings", { id: key, key, value }));
}

export function setNote(date, note) {
  change(() => put("notes", { id: date, date, note }), null, { quiet: true });
}

export function ensureTodayLog() {
  const c = ctx();
  const tl = E.todayLine(c);
  if (tl.fresh) change(() => put("log", { id: c.today, date: c.today, need: tl.line, projects: tl.shares }));
  else if (tl.added) {
    const need = Object.values(tl.shares).reduce((a, v) => a + (Number(v) || 0), 0);
    change(() => put("log", { ...get("log", c.today), need, projects: tl.shares }));
  }
}

// ---------- 项目 / 子项目 ----------
// 子项目就是 projects 表里的一行；它的 group 就是上一层的「项目」名字

export function renameGroup(from, to) {
  const name = String(to || "").trim();
  if (!name || name === from) return;
  change(() => all("projects").filter((p) => (p.group || "") === from).forEach((p) => put("projects", { ...p, group: name })), "Renamed project");
}

// ---------- 重复任务 ----------
// 规则存在 Settings 表的 routines 里（一份 JSON），生成出来的任务进 Tasks 表

export const routines = () => (setting("routines", []) || []).slice().sort(byOrder);

function writeRoutines(list) {
  put("settings", { id: "routines", key: "routines", value: list });
}

// 补上接下来两周还没生成的那几次
function generate(list, t) {
  let n = 0;
  for (const r of list) {
    for (const o of R.occurrences(r, t)) {
      const id = R.routineTaskId(r.id, o.date);
      if (S.data.tasks[id]) continue;
      put("tasks", {
        id, date: o.date, title: r.title, est: o.est, actual: null, category: r.category || "", status: "", doneOrder: null,
        reason: "", optional: Boolean(r.optional), projectId: r.projectId || "", itemId: "", desc: "", order: nextOrder(o.date)
      }, { generated: true });
      n += 1;
    }
  }
  return n;
}

export function materializeRoutines() {
  const list = routines(), t = today();
  if (!list.some((r) => R.occurrences(r, t).some((o) => !S.data.tasks[R.routineTaskId(r.id, o.date)]))) return 0;
  let n = 0;
  change(() => { n = generate(list, t); });
  return n;
}

// 改规则：未来还没开始的那几次跟着改，规则里没有了的删掉，再把缺的补上；做过的不动
export function saveRoutine(input) {
  const list = routines();
  const id = input.id || newId();
  const prev = list.find((x) => x.id === id);
  const r = {
    title: "", category: "", projectId: "", optional: false, days: [0, 0, 0, 0, 0, 0, 0], start: today(), end: "", skip: [],
    order: prev?.order ?? list.reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1, ...prev, ...input, id
  };
  const t = today();
  change(() => {
    const next = [...list.filter((x) => x.id !== id), r];
    writeRoutines(next);
    for (const task of all("tasks")) {
      const p = R.parseRoutineTaskId(task.id);
      if (!p || p.rid !== id || task.status || task.date < t) continue;
      const m = R.minutesOn(r, p.date);
      if (!m || !R.inRange(r, p.date) || r.paused) drop("tasks", task.id);
      else put("tasks", { ...task, title: r.title, est: m, category: r.category || "", projectId: r.projectId || "", optional: Boolean(r.optional) });
    }
    generate(next, t);
  }, prev ? "Routine updated" : null);
  return id;
}

export function deleteRoutine(id) {
  const t = today();
  change(() => {
    all("tasks").filter((x) => { const p = R.parseRoutineTaskId(x.id); return p && p.rid === id && !x.status && x.date >= t; }).forEach((x) => drop("tasks", x.id));
    writeRoutines(routines().filter((x) => x.id !== id));
  }, "Deleted routine");
}
