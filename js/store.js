// 数据层：本机存一份（localStorage），所有改动都从这里走，记下哪些行还没推到表格。
// 每行都有 updated（改动时间），两台设备改了同一行，以后改的为准。

import { todayIso, addDays, fmtShort } from "./dates.js";
import * as E from "./engine.js";
import * as R from "./routines.js";
import { readLocal, writeLocal } from "./dom.js";
import { parseTimes, formatTimes, sumTimes } from "./times.js";

const KEY = "kuzhouduan-v1";
const OLD_KEY = "timebox-v1";
const SCHEMA = 3;   // 和表格的 Code.gs 版本对应（见 sync.js）
export const TABLES = ["tasks", "projects", "items", "log", "settings"];
const KEYED = { log: "date", settings: "key" };

// 只把这些字段发给表格；项目名这种是表格自己填的
const FIELDS = {
  tasks: ["date", "title", "est", "actual", "order", "status", "reason", "optional", "projectId", "itemId", "times", "desc"],
  projects: ["name", "group", "kind", "place", "status", "deadline", "start", "early", "rule", "color", "order", "calib"],
  items: ["title", "module", "est", "origEst", "order", "projectId"],
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
    schema: SCHEMA,
    needFull: false,   // 下次同步整表重拉（本机刚升级过数据格式）
    local: { url: "", secret: "", theme: "auto", fx: true, calMode: "week", pool: true, serverVersion: 0 }   // 只存在这台设备上
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
    commute: setting("commute", null)
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

// 推送成功：发出去之后没再改过的行才算推上去了。known = 表格认识的表，不认识的先留在本机
export function pushed(out, known = TABLES) {
  for (const [k, u] of Object.entries(out.stamp)) if (S.pending[k] === u && known.includes(k.slice(0, k.indexOf(":")))) delete S.pending[k];
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
    r.times = r.times || "";
  }
  if (t === "items") { r.est = Number(r.est) || 0; r.projectId = r.projectId || ""; }
  if (t === "projects") {
    r.status = r.status || "active";
    r.kind = r.kind === "regular" ? "regular" : "total";
    r.place = r.place === "auto" ? "auto" : "pool";
  }
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
  if (full) S.needFull = false;
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
      id, title: "", est: 30, actual: null, status: "", reason: "", optional: false, projectId: "", times: "", desc: "",
      ...fields, date, itemId, order: nextOrder(date)
    });
  });
  return id;
}

export function updateTask(id, patch, label, opts) {
  const t = get("tasks", id);
  if (!t) return;
  change(() => put("tasks", { ...t, ...patch }), label, opts);
}

// 和旧版一样：再点一次同一个就取消。
// 实际分钟：有计时记录就是记录加起来，取消 / Later / Drop 也不清掉（时间是真花了的）
export function setStatus(id, s) {
  const t = get("tasks", id);
  if (!t) return;
  const off = t.status === s;
  const fin = s === "done" || s === "partial";
  updateTask(id, {
    status: off ? "" : s,
    reason: s === "done" && !off ? "" : t.reason,
    actual: !off && fin ? t.actual : timeTotal(id) || null
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

// Later → 原来那条留着（原因还在），在明天放一条新的
export function toTomorrow(id) {
  const t = get("tasks", id);
  if (!t) return;
  const date = addDays(t.date < today() ? today() : t.date, 1);
  change(() => {
    if (t.status !== "later") put("tasks", { ...t, status: "later" });
    put("tasks", { ...t, id: newId(), date, status: "", actual: null, times: "", reason: "", order: nextOrder(date) });
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
    id, date, title: item.title, est: Math.round(est), actual: null, status: "", reason: "",
    optional: false, projectId: item.projectId, itemId, times: "", desc: "", order: nextOrder(date)
  }), "Scheduled");
  return id;
}

// 拖回任务池：只有从条目来的、还没开始的任务能拖回去
export function unschedule(id) {
  const t = get("tasks", id);
  if (!t || !t.itemId || started(t)) return false;
  change(() => dropTask(id), "Back to pool");
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

// ---------- 计划和条目 ----------
// 计划 = projects 表一行。kind：total（总时长 + 截止日）/ regular（规律）；place：auto（自动排到每天）/ pool（进任务池）

const nextPlanOrder = () => all("projects").reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1;
// 同一个项目（group）里的计划默认用同一个颜色
const colorFor = (group) => all("projects").find((x) => group && x.group === group)?.color || PROJECT_COLORS[all("projects").length % PROJECT_COLORS.length];
// 任务挂着的计划属于哪个项目（没有 group 的计划自己就是项目）
const groupFor = (projectId) => { const p = get("projects", projectId); return p ? p.group || p.name || "" : ""; };

// p.total（分钟）：新建整块计划时只填了总时长，就建一个同名的大条目
export function saveProject(p) {
  const id = p.id || newId();
  const prev = get("projects", id);
  const { total, ...fields } = p;
  const row = { name: "", group: "", kind: "total", place: "pool", status: "active", deadline: "", start: "", early: 2, calib: null, rule: null, ...prev, ...fields, id };
  row.order = prev?.order ?? nextPlanOrder();
  row.color = fields.color || prev?.color || colorFor(row.group);
  if (row.kind === "regular") { const { id: _i, title: _t, ...rule } = R.ruleOf(row); row.rule = rule; }
  change(() => {
    put("projects", row);
    if (!prev && row.kind === "total" && Number(total) > 0) put("items", { id: newId(), projectId: id, module: "", title: row.name, est: Math.round(Number(total)), origEst: null, order: 1 });
  });
  // 刚变成「自动排」的：今天的那份马上排进来
  if (E.isAuto(row) && E.isActive(row) && (!prev || !E.isAuto(prev) || !E.isActive(prev))) autoToday(id);
  return id;
}

// 删计划：条目一起删；做过的任务留着当记录，只是不再挂在计划上；自动排出来还没动的删掉
export function deleteProject(id) {
  change(() => {
    all("items").filter((i) => i.projectId === id).forEach((i) => drop("items", i.id));
    all("tasks").filter((t) => t.projectId === id).forEach((t) => (E.isAutoTask(t) && !started(t) ? dropTask(t.id) : put("tasks", { ...t, projectId: "", itemId: "" })));
    drop("projects", id);
  }, "Deleted plan");
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
    all("tasks").filter((t) => t.itemId === id).forEach((t) => (started(t) ? put("tasks", { ...t, itemId: "" }) : dropTask(t.id)));
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

// ---------- 容量、设置、早上的线 ----------

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

// 通勤日：电脑日历里一天天点。存在 Settings 的 commute（{days: {"2026-10-08": true}}），一年前的顺手清掉
export const isCommuteDay = (date) => Boolean(setting("commute", null)?.days?.[date]);

export function toggleCommute(date) {
  const cut = addDays(today(), -366);
  const days = Object.fromEntries(Object.entries(setting("commute", null)?.days || {}).filter(([d, v]) => v && d >= cut));
  if (days[date]) delete days[date];
  else days[date] = true;
  change(() => put("settings", { id: "commute", key: "commute", value: { days } }), days[date] ? "Commute day " + fmtShort(date) : "Not a commute day");
}

// 自动排出来的任务（generated：改动时间记成 1，哪台设备真改过它都比这个新）
function putAuto(x) {
  put("tasks", { actual: null, status: "", reason: "", optional: false, itemId: "", times: "", desc: "", ...x, order: nextOrder(x.date) }, { generated: true });
}

// 规律计划（Auto）今天该出现、还没有的那一次
function regularsDueToday(c) {
  return c.projects.filter((p) => E.isActive(p) && E.isRegular(p) && E.isAuto(p)).map((p) => {
    const id = R.routineTaskId(p.id, c.today), est = R.dueOn(R.ruleOf(p), c.today);
    return est && !get("tasks", id) ? { id, date: c.today, title: p.name, est, projectId: p.id, optional: Boolean(p.rule?.optional) } : null;
  }).filter(Boolean);
}

// 拍今天的安全线快照（第一次打开时）；同时把今天的自动任务落成：规律的那一次、整块计划（Auto）今天的份额。
// 整块的份额只在快照新拍、或新加进快照时排一次——删掉了就不会再长出来
export function ensureTodayLog() {
  const c = ctx();
  const tl = E.todayLine(c);
  const before = c.log[c.today]?.projects || {};
  const fresh = Object.keys(tl.shares).filter((pid) => tl.fresh || !(pid in before));
  const chunks = fresh.length ? E.autoChunks(c, tl.shares, fresh) : [];
  const regs = regularsDueToday(c);
  if (!tl.fresh && !tl.added && !chunks.length && !regs.length) return;
  change(() => {
    if (tl.fresh) put("log", { id: c.today, date: c.today, need: tl.line, projects: tl.shares });
    else if (tl.added) put("log", { ...get("log", c.today), need: Object.values(tl.shares).reduce((a, v) => a + (Number(v) || 0), 0), projects: tl.shares });
    chunks.forEach(putAuto);
    regs.forEach(putAuto);
  });
}

function autoToday(pid) {
  ensureTodayLog();
  const c = ctx();
  const chunks = E.autoChunks(c, E.todayLine(c).shares, [pid]);
  if (chunks.length) change(() => chunks.forEach(putAuto));
}

// 以后某天的预览变成真任务（拖动 / 点开它的时候）：返回任务 id
export function materialize(key) {
  const x = R.parseRoutineTaskId(key);
  const p = x && routineOf(key);
  if (!p) return "";
  if (!get("tasks", key)) {
    const est = R.dueOn(R.ruleOf(p), x.date) || R.minutesOn(R.ruleOf(p), x.date);
    change(() => put("tasks", { id: key, date: x.date, title: p.name, est, actual: null, status: "", reason: "", optional: Boolean(p.rule?.optional),
      projectId: p.id, itemId: "", times: "", desc: "", order: nextOrder(x.date) }));
  }
  return key;
}

// 任务池里的规律计划（Pool）拖到某天：排一次
export function placeRegular(pid, date) {
  const p = get("projects", pid);
  if (!p) return "";
  return addTask({ date, title: p.name, est: Number(p.rule?.min) || 30, projectId: pid, optional: Boolean(p.rule?.optional) });
}

// ---------- 项目 / 子项目 ----------
// 子项目就是 projects 表里的一行；它的 group 就是上一层的「项目」名字

export function renameGroup(from, to) {
  const name = String(to || "").trim();
  if (!name || name === from) return;
  change(() => all("projects").filter((p) => (p.group || "") === from).forEach((p) => put("projects", { ...p, group: name })), "Renamed project");
}

// ---------- 规律计划（重复） ----------
// 规则在计划的 rule 里（见 routines.js）。只有今天的那一次是 Tasks 里的任务（ID 以 rt: 开头），以后的只是预览。
// 加任务框的「重复」、任务编辑框里的「Repeat」都是新建一个 Regular + Auto 的计划。

export const routines = () => all("projects").filter(E.isRegular).sort(byOrder);
export const routineOf = (taskId) => { const x = R.parseRoutineTaskId(taskId); const p = x ? get("projects", x.rid) : null; return p && E.isRegular(p) ? p : null; };
export const seriesTasks = (rid) => all("tasks").filter((x) => x.id.startsWith("rt:" + rid + ":")).sort((a, b) => a.date.localeCompare(b.date));
const origDate = (id) => R.parseRoutineTaskId(id)?.date || "";

function setRule(p, patch) {
  const { id: _i, title: _t, ...rule } = R.ruleOf(get("projects", p.id) || p);
  put("projects", { ...(get("projects", p.id) || p), rule: { ...rule, ...patch } });
}

function newRegular(name, projectId, rule) {
  const group = groupFor(projectId);
  return { id: newId(), name, group, kind: "regular", place: "auto", status: "active", deadline: "", start: "", early: 0, calib: null,
    rule: { days: [0, 0, 0, 0, 0, 0, 0], skip: [], ...rule }, color: get("projects", projectId)?.color || colorFor(group), order: nextPlanOrder() };
}

const repeatLabel = (end) => (end ? "Repeats until " + fmtShort(end) : "Repeats from now on");

// 加任务时直接设重复：days 是一周七天的分钟数，end 是最后一天（空 = 一直）。返回第一次的 ID（那天要做的话）
export function addRepeating(fields, days, end) {
  const start = fields.date || today();
  const p = newRegular(fields.title, fields.projectId, { days, start, end: R.clampEnd(start, end), optional: Boolean(fields.optional) });
  let first = "";
  change(() => {
    put("projects", p);
    const est = R.dueOn(R.ruleOf(p), start);
    if (est) {
      first = R.routineTaskId(p.id, start);
      put("tasks", { id: first, date: start, title: p.name, est, actual: null, status: "", reason: "", optional: Boolean(fields.optional),
        projectId: p.id, itemId: "", times: "", desc: "", order: nextOrder(start) });
    }
  }, repeatLabel(p.rule.end));
  return first;
}

// 已有的普通任务改成重复的：它自己变成第一次（换成 rt: 的 ID，计时记录跟着走）。返回它的新 ID
export function repeatTask(id, days, end) {
  const t = get("tasks", id);
  if (!t) return id;
  const p = newRegular(t.title, t.projectId, { days, start: t.date, end: R.clampEnd(t.date, end), optional: Boolean(t.optional) });
  const nid = R.routineTaskId(p.id, t.date);
  change(() => {
    put("projects", p);
    put("tasks", { ...t, id: nid, projectId: p.id, itemId: "" });
    if (timer()?.taskId === id) setTimer({ ...timer(), taskId: nid });
    drop("tasks", id);
  }, repeatLabel(p.rule.end));
  return nid;
}

// 改重复（从这一次起）：规则换成新的；已经落成、还没开始的那几次跟着变（新规则里没有的删掉）
export function replanSeries(id, days, end) {
  const t = get("tasks", id), p = routineOf(id);
  if (!t || !p) return;
  change(() => {
    setRule(p, { days, end: R.clampEnd(origDate(id), end) });
    const next = R.ruleOf(get("projects", p.id));
    for (const x of seriesTasks(p.id)) {
      if (origDate(x.id) < origDate(id) || started(x)) continue;
      const m = R.dueOn(next, origDate(x.id));
      if (x.id !== id && !m) dropTask(x.id);
      else if (m) put("tasks", { ...x, est: m });
    }
  }, "Repeat updated");
}

const SERIES_FIELDS = ["title", "est", "optional"];

// 改名字、分钟、可选：只改这一次 / 这次和以后 / 全部（做过的不动，除了这一次自己）
export function editSeries(id, patch, scope) {
  const t = get("tasks", id), p = routineOf(id);
  if (!t || !p || scope === "this") return updateTask(id, patch, null, { quiet: patch.title !== undefined });
  const fields = Object.fromEntries(Object.entries(patch).filter(([k]) => SERIES_FIELDS.includes(k)));
  change(() => {
    for (const x of seriesTasks(p.id)) {
      if (x.id !== id && (started(x) || (scope === "following" && origDate(x.id) < origDate(id)))) continue;
      put("tasks", { ...x, ...fields });
    }
    const plan = get("projects", p.id);
    const rule = { ...(plan.rule || {}) };
    if ("optional" in fields) rule.optional = Boolean(fields.optional);
    if ("est" in fields) rule.days = (rule.days || []).map((v) => (Number(v) > 0 ? Number(fields.est) || 0 : 0));
    put("projects", { ...plan, ...("title" in fields ? { name: fields.title } : {}), rule });
  }, null, { quiet: patch.title !== undefined });
}

// 删的时候会删掉哪几个已经落成的：only = 只这一次；following / earlier / all 只删还没开始的（这一次也一样）
export function seriesScope(id, scope) {
  const t = get("tasks", id), x = R.parseRoutineTaskId(id);
  if (!t) return [];
  if (scope === "this" || !x) return [t];
  return seriesTasks(x.rid).filter((s) => !started(s) &&
    (scope === "all" || (scope === "following" ? origDate(s.id) >= x.date : origDate(s.id) <= x.date)));
}

// following = 从这次起不再重复；earlier = 这次和以前的不要了（从下一次开始）；all = 整个计划不要了
// （做过的还在的话计划留着、标成 Dropped，统计里还认得出名字）
export function deleteSeries(id, scope) {
  const t = get("tasks", id), p = routineOf(id);
  if (!t || !p || scope === "this") return deleteTask(id);
  const od = origDate(id), gone = seriesScope(id, scope);
  change(() => {
    gone.forEach((x) => dropTask(x.id));
    if (scope === "following") setRule(p, { end: addDays(od, -1) });
    else if (scope === "earlier") setRule(p, { start: addDays(od, 1) });
    const r = R.ruleOf(get("projects", p.id));
    if (scope !== "all" && !(r.start && r.end && r.end < r.start)) return;
    // 一次都不剩了：做过的还在就留着计划（标 Dropped），不然整个删掉
    if (all("tasks").some((x) => x.projectId === p.id)) put("projects", { ...get("projects", p.id), status: "dropped" });
    else drop("projects", p.id);
  }, scope === "all" ? "Deleted repeat" : "Stopped repeating");
}

// ---------- 计时 ----------
// 正在跑的计时器存在 Settings 的 timer 里（{taskId, start}），所以手机上开始、电脑上也能停。
// 每段时间记在任务自己的 times 里（js/times.js 的写法）：「09:10-09:40 30m; 20m」。
// 任务的实际分钟 = 这些加起来。每段的 id = 「任务 id#第几段」。

export const timer = () => setting("timer", null);
export function timeOf(taskId) {
  const t = get("tasks", taskId);
  return t ? parseTimes(t.times).map((x, i) => ({ ...x, id: taskId + "#" + i, taskId, date: t.date })) : [];
}
export const hasTime = (taskId) => timeOf(taskId).length > 0;
export const timeTotal = (taskId) => sumTimes(timeOf(taskId));

const pad2 = (n) => String(n).padStart(2, "0");
export const clockOf = (ms) => { const d = new Date(ms); return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); };
export const clockNow = () => clockOf(Date.now());
const toMin = (hm) => { const [h, m] = String(hm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const fromMin = (v) => { const x = ((v % 1440) + 1440) % 1440; return pad2(Math.floor(x / 60)) + ":" + pad2(x % 60); };
// 一天从 dayStartsAt 算起：凌晨 1 点排在晚上 11 点后面；没有钟点的排最后
function clockKey(hm) { return hm ? (toMin(hm) - toMin(prefs().dayStartsAt) + 1440) % 1440 : 9999; }

function setTimer(value) { put("settings", { id: "timer", key: "timer", value }); }

function writeTimes(taskId, list) {
  const t = get("tasks", taskId);
  if (!t) return;
  const sorted = list.slice().sort((a, b) => clockKey(a.from || a.to) - clockKey(b.from || b.to));
  put("tasks", { ...t, times: formatTimes(sorted), actual: sumTimes(sorted) || null });
}

function addTime(taskId, min, to, from) {
  const t = get("tasks", taskId);
  if (!t) return;
  writeTimes(taskId, [...parseTimes(t.times), { from: to ? from ?? fromMin(toMin(to) - min) : "", to: to || "", min }]);
}

// 开始：已经有一个在跑就先停下记好（和 Toggl 一样一次只跑一个）
export function startTimer(taskId) {
  if (!get("tasks", taskId) || timer()?.taskId === taskId) return;
  let logged = null;
  change(() => {
    logged = stopRunning();
    setTimer({ taskId, start: Date.now() });
  });
  return logged;
}

function stopRunning() {
  const r = timer();
  if (!r) return null;
  setTimer(null);
  const now = Date.now();
  const min = Math.round((now - Number(r.start)) / 60000);
  if (min < 1 || !get("tasks", r.taskId)) return { taskId: r.taskId, min: 0 };
  addTime(r.taskId, min, clockOf(now), clockOf(Number(r.start)));
  return { taskId: r.taskId, min };
}

// 停下：返回记了多少分钟（不到 1 分钟不记）
export function stopTimer() {
  let logged = null;
  change(() => { logged = stopRunning(); });
  return logged;
}

export function discardTimer() {
  if (!timer()) return;
  change(() => setTimer(null), "Timer discarded");
}

// 手动补一段：用了多少分钟、几点结束（不填结束时间也行，只记分钟）
export function logTime(taskId, min, to) {
  min = Math.round(Number(min) || 0);
  if (min < 1 || !get("tasks", taskId)) return;
  change(() => addTime(taskId, min, to || ""), "Logged " + min + " min");
}

export function deleteTime(id) {
  const i = String(id).lastIndexOf("#");
  const taskId = String(id).slice(0, i), n = Number(String(id).slice(i + 1));
  const list = parseTimes(get("tasks", taskId)?.times);
  if (!list[n]) return;
  list.splice(n, 1);
  change(() => writeTimes(taskId, list), "Deleted time");
}

// ---------- 备餐（Meals 页；手机上只有「下次采购」那张单子） ----------
// 都存在 Settings 页里，一样东西一行（不用改 Code.gs，一格也不会太长）：
//   meal-ing:<id> 常买的东西 / meal-box:<id> 一顿 / meal-week:<这周第一天> 这周：days（日期 → {boxes} / {off}）、
//   粗排 rough（[{box, n}]）、买了没有 got、手动加的 extra、shopped、skip、note / meal-prefs 目标
//   meal-sup:<id> 规律要换 / 要补的东西（Restock：价格、每隔多久、下次哪天）；这周的行里还有 notes（采购单上写的备注）
//   （meal-pack:<id> 是 10-08 那版的 Day pack，现在只在读旧数据时展开成 Box）
const MEAL_RE = /^meal-(ing|box|pack|week|sup):(.+)$/;
const mealKey = (kind, id) => "meal-" + kind + ":" + id;
const OLD_UNIT = { g: "g", kg: "g", oz: "g", lb: "g", ml: "ml", L: "ml", "fl oz": "ml", gal: "ml" };

export function meals() {
  const D = { ing: {}, box: {}, pack: {}, week: {}, sup: {}, days: {} };
  for (const [key, r] of Object.entries(S.data.settings)) {
    const m = MEAL_RE.exec(key);
    if (m && r.value && typeof r.value === "object") D[m[1]][m[2]] = { ...r.value, id: m[2] };
  }
  // 旧格式读的时候换成新的：用量的数字 → 文字；某天 {pack} → 那个 pack 里的 Box；粗排 {pack, n} → 每个 Box × n
  for (const b of Object.values(D.box)) {
    b.parts = (b.parts || []).map((p) => (p.amt !== undefined || p.qty === undefined ? p
      : { ing: p.ing, amt: p.qty === "" || p.qty === null ? "" : p.qty + (OLD_UNIT[D.ing[p.ing]?.packUnit] ? " " + OLD_UNIT[D.ing[p.ing].packUnit] : "") }));
  }
  const unpack = (id) => (D.pack[id]?.boxes || []).filter((b) => D.box[b]);
  for (const w of Object.values(D.week)) {
    const days = {};
    for (const [d, e] of Object.entries(w.days || {})) days[d] = e?.pack ? { boxes: unpack(e.pack) } : e;
    w.days = days;
    const rough = [];
    for (const r of w.rough || []) {
      for (const box of r.pack ? unpack(r.pack) : [r.box]) {
        const hit = rough.find((x) => x.box === box);
        if (hit) hit.n += Number(r.n) || 0;
        else rough.push({ box, n: Number(r.n) || 0 });
      }
    }
    w.rough = rough;
  }
  // 每天吃什么存在那周的行里；改过「一周从周几开始」也照样找得到
  for (const w of Object.values(D.week)) Object.assign(D.days, w.days);
  return D;
}

// high = 每周 High 的 Box 最多几个；budget = 每周预算（0 = 不比）；shopDay = 星期几去买
export const mealPrefs = () => ({ high: 3, budget: 0, shopDay: 0, ...(setting("meal-prefs", {}) || {}) });

function putMeal(kind, id, row) {
  const { id: _id, ...value } = row;
  put("settings", { id: mealKey(kind, id), key: mealKey(kind, id), value });
}

export function saveMeal(kind, row, label, opts) {
  const id = row.id || newId().replace(/-/g, "").slice(0, 10);
  change(() => putMeal(kind, id, row), label, opts);
  return id;
}

// 删一样东西，用到它的地方一起改（一次撤销全回来）：食材 → 从各个 Box 里拿掉；Box → 从每天和粗排里拿掉
function removeMeal(kind, id) {
  const D = meals();
  if (kind === "ing") {
    for (const b of Object.values(D.box)) if (b.parts.some((p) => p.ing === id)) putMeal("box", b.id, { ...b, parts: b.parts.filter((p) => p.ing !== id) });
  }
  if (kind === "box") {
    for (const w of Object.values(D.week)) {
      let touched = false;
      const days = {};
      for (const [d, e] of Object.entries(w.days)) {
        if (!e?.boxes?.includes(id)) { days[d] = e; continue; }
        touched = true;
        const left = e.boxes.filter((x) => x !== id);
        if (left.length) days[d] = { ...e, boxes: left };
      }
      const rough = w.rough.filter((r) => r.box !== id);
      if (touched || rough.length !== w.rough.length) putMeal("week", w.id, { ...w, days, rough });
    }
  }
  drop("settings", mealKey(kind, id));
}

export function deleteMeal(kind, id, label) {
  change(() => removeMeal(kind, id), label);
}

export function saveWeek(start, patch, label, opts) {
  change(() => {
    const cur = meals().week[start] || {};
    putMeal("week", start, { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) });
  }, label, opts);
}

// 某天吃什么（entry = null 就清空）。别的周的行里要是也有这天（改过一周从周几开始），一起清掉
export function setMealDay(start, date, entry, label) {
  change(() => {
    const D = meals();
    for (const w of Object.values(D.week)) {
      if (w.id === start || !w.days?.[date]) continue;
      const days = { ...w.days };
      delete days[date];
      putMeal("week", w.id, { ...w, days });
    }
    const cur = D.week[start] || {};
    const days = { ...(cur.days || {}) };
    if (entry) days[date] = entry;
    else delete days[date];
    putMeal("week", start, { ...cur, days });
  }, label);
}

// 这一轮看过了：sale = {price, until} 在打折；null = 没打折。
// 两周以上一轮的，这次打折当新一轮的开始，下次照这个往后推
export function checkDeal(id, sale) {
  const ing = meals().ing[id];
  if (!ing) return;
  const T = today();
  const next = { ...ing, checked: T, sale: sale ? { price: Number(sale.price) || 0, from: T, until: sale.until || T } : null };
  if (sale && (Number(ing.every) || 0) >= 2) next.from = T;
  change(() => putMeal("ing", id, next), (sale ? "On sale: " : "Checked: ") + ing.name);
}

export function addMealExamples(rows) {
  change(() => { for (const kind of ["ing", "box", "pack", "week"]) for (const r of rows[kind] || []) putMeal(kind, r.id, r); }, "Examples added — remove them under Groceries");
}

export function importMeals(rows) {
  const n = (rows.ing || []).length, b = (rows.box || []).length, s = (rows.sup || []).length;
  change(() => { for (const kind of ["ing", "box", "sup"]) for (const r of rows[kind] || []) putMeal(kind, r.id, r); },
    "Imported " + n + (n === 1 ? " grocery" : " groceries") + " · " + b + (b === 1 ? " box" : " boxes") + (s ? " · " + s + " to restock" : ""));
}

export function clearMealExamples() {
  change(() => {
    for (const kind of ["box", "ing", "pack"]) for (const id of Object.keys(meals()[kind])) if (id.startsWith("ex-")) removeMeal(kind, id);
  }, "Examples removed");
}
