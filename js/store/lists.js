// 计划的 Pool 和每天那一行：读写（算的那部分在 js/lists.js）。
// 项 = Items 表一行（名字、分区 module、大概分钟 est、顺序）；它的设置（次数、每周、步骤、备注、Later）在计划 rule.items[项 id]；
// 计划的 Notes 在 rule.notes。那一行（整块计时）和拖进那天的项都是 Tasks 里的任务。不改 Code.gs。
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样。

import * as L from "../lists.js";
import * as PT from "../plantext.js";
import { fmtShort } from "../dates.js";

const FROM = "lists-from";   // 换成这套的那天：过了那天回 Pool 只管这天以后的

export default function (core) {
  const { all, get, put, drop, change, newId, today, setting, nextOrder, ctx, planDeep, dropTask, saveProject } = core;

  const planOfItem = (itemId) => { const i = get("items", itemId); return i ? get("projects", i.projectId) : null; };
  const itemCfg = (itemId) => L.cfgOf(planOfItem(itemId), itemId);
  const linesOf = (itemId) => all("tasks").filter((t) => t.itemId === itemId);
  const key = (s) => String(s || "").trim().toLowerCase();

  // 项的设置：和默认一样的字段不存，表格里那一格短一点
  function cfgPatch(plan, itemId, patch) {
    const items = { ...(plan.rule?.items || {}) };
    const next = { ...L.cfgOf(plan, itemId), ...patch };
    const slim = Object.fromEntries(Object.entries(next).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(L.DEFAULT[k])));
    if (Object.keys(slim).length) items[itemId] = slim;
    else delete items[itemId];
    return { ...plan, rule: { ...(plan.rule || {}), items } };
  }
  function setItemCfg(itemId, patch, label) {
    const plan = planOfItem(itemId);
    if (plan) change(() => put("projects", cfgPatch(get("projects", plan.id), itemId, patch)), label);
  }
  function setPlanNotes(planId, notes) {
    const p = get("projects", planId);
    if (p) change(() => put("projects", { ...p, rule: { ...(p.rule || {}), notes: String(notes || "") } }), "", { quiet: true });
  }
  // 一个分区整个 Later / 放回来
  function setSectionLater(planId, section, on) {
    let p = get("projects", planId);
    if (!p) return;
    const ids = all("items").filter((i) => i.projectId === planId && (i.module || "") === section).map((i) => i.id);
    for (const id of ids) p = cfgPatch(p, id, { later: Boolean(on) });
    change(() => put("projects", p), (on ? "Later: " : "Back in the pool: ") + (section || "Pool"));
  }

  // ---------- 每天那一行 ----------

  // 那天这个计划的那一行（直接看数据，不走 ctx：同一次改动里刚建的也找得到）
  const rowOf = (planId, date) => all("tasks").filter((t) => t.date === date && t.projectId === planId && L.isRow(t)).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))[0] || null;

  // 那天这个计划的那一行；没有就建一条（ID pd:<计划>:<日期>，generated：哪台设备真改过都比它新）
  function ensureRow(planId, date) {
    const p = get("projects", planId);
    if (!p) return "";
    const hit = rowOf(planId, date);
    if (hit) return hit.id;
    const id = L.rowId(planId, date, (x) => Boolean(get("tasks", x)));
    change(() => put("tasks", { id, date, title: p.name, est: Number(p.rule?.min) || 0, actual: null, status: "", reason: "", optional: false, deep: planDeep(planId),
      projectId: planId, group: "", itemId: "", times: "", desc: "", order: nextOrder(date) }, { generated: true }));
    return id;
  }

  // ---------- 拖一项进某天 ----------
  // 勾了一半回了 Pool 的那次先接着做（带着剩下的步骤）；没有就是新的一次（步骤全新）。名字就是项的名字。做满了的拖不出来，返回空
  function placeItem(itemId, date) {
    const item = get("items", itemId), plan = item && get("projects", item.projectId);
    if (!plan) return "";
    const cfg = L.cfgOf(plan, itemId), lines = linesOf(itemId), count = L.countOf(lines, cfg);
    if (count.left <= 0) return "";
    const id = newId();
    change(() => {
      ensureRow(plan.id, date);
      const carry = count.carry[0];
      let steps;
      if (carry) {
        put("tasks", { ...get("tasks", carry.from), reason: L.CONTINUED });
        steps = carry.steps.map((s) => ({ ...s, done: false }));
      } else steps = (cfg.steps || []).map((s) => ({ t: s.t, min: Number(s.min) || 0, done: false }));
      const title = item.title;
      const est = carry ? steps.reduce((a, s) => a + (Number(s.min) || 0), 0) || Number(item.est) || 0 : Number(item.est) || 0;
      put("tasks", { id, date, title, est, actual: null, status: "", reason: "", optional: false, deep: planDeep(plan.id), projectId: plan.id, group: "", itemId,
        times: "", desc: L.withSteps("", steps), order: nextOrder(date) });
    }, "Added " + item.title);
    return id;
  }

  // ---------- 勾 ----------

  // 勾上一项 = 这一次做了（有步骤的一起勾满）；再点 = 没做
  function tickLine(id) {
    const t = get("tasks", id);
    if (!t) return;
    if (t.status === "done") return change(() => put("tasks", { ...t, status: "" }));
    const { steps, rest } = L.stepsOf(t.desc);
    change(() => put("tasks", { ...t, status: "done", reason: "", desc: steps.length ? L.withSteps(rest, steps.map((s) => ({ ...s, done: true }))) : t.desc }));
  }
  // 勾一步；勾满了这一项自己勾上，取消一步它也跟着取消
  function tickStep(id, k) {
    const t = get("tasks", id);
    if (!t) return;
    const { steps, rest } = L.stepsOf(t.desc);
    if (!steps[k]) return;
    steps[k] = { ...steps[k], done: !steps[k].done };
    const full = steps.every((s) => s.done);
    change(() => put("tasks", { ...t, desc: L.withSteps(rest, steps), status: full ? "done" : t.status === "done" ? "" : t.status }));
  }

  // 放回 Pool：勾了一半步骤、或记了时间的留着当记录（Delay），别的删掉
  function backToPool(id) {
    const t = get("tasks", id);
    if (!t || !t.itemId || t.status === "done") return false;
    const keep = L.hasTime(t) || L.stepsOf(t.desc).steps.some((s) => s.done);
    change(() => (keep ? put("tasks", { ...t, status: "delay", reason: L.BACK }) : dropTask(id)), "Back to the pool");
    return true;
  }

  // 那天这个计划的那一行空了（没记时间、没写字、没标状态、下面没项，也不是固定星期几自己出现的那次）：删掉
  function dropEmptyRow(planId, date) {
    const here = all("tasks").filter((t) => t.date === date && t.projectId === planId);
    const row = here.find((t) => L.isRow(t));
    if (!row || row.status || L.hasTime(row) || String(row.desc || "").trim() || L.isRoutine(row) || here.some((t) => t.itemId)) return;
    dropTask(row.id);
  }

  // 一项挪到别的天：那天的那一行跟着建好；原来那天的那一行空了就删
  function moveLine(id, date) {
    const t = get("tasks", id);
    if (!t || t.date === date) return;
    change(() => {
      put("tasks", { ...t, date, order: nextOrder(date) });
      if (t.projectId) { ensureRow(t.projectId, date); dropEmptyRow(t.projectId, t.date); }
    }, "Moved to " + fmtShort(date));
  }
  // 日历里整张拖到别的天：那天还没勾的几项一起挪（勾了的、记过的时间留在原来那天）
  function moveBlock(planId, from, to) {
    if (!from || !to || from === to) return;
    const lines = all("tasks").filter((t) => t.date === from && t.projectId === planId && t.itemId && !t.status);
    change(() => {
      for (const t of lines) put("tasks", { ...t, date: to, order: nextOrder(to) });
      ensureRow(planId, to);
      dropEmptyRow(planId, from);
    }, "Moved " + (get("projects", planId)?.name || "it") + " to " + fmtShort(to));
  }
  // 整张拖回 Pool：那天没勾的几项回去，那一行空了就删
  function blockToPool(planId, date) {
    const lines = all("tasks").filter((t) => t.date === date && t.projectId === planId && t.itemId && !t.status);
    change(() => { lines.forEach((t) => backToPool(t.id)); dropEmptyRow(planId, date); }, "Back to the pool");
  }

  // 过了那天：没勾的回 Pool、勾了一半的留记录、空着的那一行删掉（打开时、拉完表格、换天时各看一次）
  function settleLists() {
    const from = setting(FROM, "");
    const s = L.settle(ctx(), from);
    if (!s.done.length && !s.delay.length && !s.drop.length && !s.rows.length) return 0;
    change(() => {
      for (const id of s.done) { const t = get("tasks", id); if (t) put("tasks", { ...t, status: "done" }); }
      for (const id of s.delay) { const t = get("tasks", id); if (t) put("tasks", { ...t, status: "delay", reason: L.BACK }); }
      for (const id of [...s.drop, ...s.rows]) dropTask(id);
    });
    return s.drop.length + s.delay.length;
  }

  // ---------- 一行一条加进 Pool ----------
  // 「L5 跟读 · 20min · ×18」；缩进的是上一条的步骤。返回新加的项 id
  function addPoolLines(planId, section, text) {
    let plan = get("projects", planId);
    if (!plan) return [];
    const rows = [];
    for (const raw of String(text || "").split("\n")) {
      if (!raw.trim()) continue;
      const body = raw.trim().replace(/^[-*+•·|]\s+(\[[ xX]\]\s+)?/, "");
      const x = PT.parseLine(body);
      if (/^\s{2,}/.test(raw) && rows.length) rows[rows.length - 1].steps.push({ t: x.title, min: x.est || 0 });
      else rows.push({ ...x, steps: [] });
    }
    let order = all("items").filter((i) => i.projectId === planId).reduce((m, i) => Math.max(m, Number(i.order) || 0), 0);
    const ids = [];
    change(() => {
      for (const r of rows) {
        const id = newId();
        const est = r.est ?? (r.steps.reduce((a, s) => a + s.min, 0) || 0);
        put("items", { id, projectId: planId, module: section || "", title: r.title, est, origEst: null, order: ++order });
        plan = cfgPatch(plan, id, { n: r.n ?? 1, perWeek: r.perWeek || 0, steps: r.steps, note: r.note || "" });
        ids.push(id);
      }
      put("projects", plan);
    }, ids.length === 1 ? "Added to the pool" : "Added " + rows.length + " to the pool");
    return ids;
  }

  // ---------- 粘贴整份 / 写成文字 ----------

  // 计划 → plantext 的样子（Copy as text、粘回来时比对）
  function planShape(planId) {
    const p = get("projects", planId);
    if (!p) return null;
    const items = all("items").filter((i) => i.projectId === planId).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    const sections = [];
    for (const i of items) {
      const cfg = L.cfgOf(p, i.id), name = i.module || "";
      let s = sections.find((x) => x.name === name);
      if (!s) sections.push((s = { name, later: true, items: [] }));
      s.items.push({ id: i.id, title: i.title, est: Number(i.est) || 0, n: cfg.n, perWeek: cfg.perWeek, steps: cfg.steps.map((x) => ({ t: x.t, min: Number(x.min) || 0 })), note: cfg.note, code: "" });
      s.later = s.later && cfg.later;
    }
    return { name: p.name, start: p.start || "", end: p.deadline || "", notes: p.rule?.notes || "", sections };
  }
  const planText = (planId) => { const s = planShape(planId); return s ? PT.format(s) : ""; };

  // 粘贴：planId 空 = 新建（放进 group 这个项目，文字里没写计划名就用 name）；有 = 按名字 / 代号更新那个计划。
  // laterOf(分区名) = 预览里她勾的 Later（不给就按认出来的）。返回 { planId, gone: 新文字里没有的旧项 [{ id, title, used }] }
  function pastePlan(text, { planId = "", group = "", laterOf = null, name = "" } = {}) {
    const parsed = PT.parse(text);
    if (!parsed.sections.length && !parsed.name) return null;
    const flat = parsed.sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.name, later: laterOf ? Boolean(laterOf(s.name)) : s.later })));
    let id = planId, gone = [];
    change(() => {
      if (!id) {
        id = saveProject({ name: parsed.name || name || "New plan", group, kind: "regular", place: "pool", start: parsed.start, deadline: parsed.end, rule: { notes: parsed.notes, items: {} } });
      }
      let p = get("projects", id);
      p = { ...p, name: parsed.name || p.name, start: parsed.start || p.start || "", deadline: parsed.end || p.deadline || "", rule: { ...(p.rule || {}), notes: parsed.notes } };
      const old = all("items").filter((i) => i.projectId === id);
      const m = PT.match(flat, old.map((i) => ({ id: i.id, title: i.title })));
      let order = 0;
      const byNew = new Map(m.pairs.map(([n, o]) => [n, o.id]));
      for (const it of flat) {
        const prev = byNew.get(it);
        const itemId = prev || newId();
        const row = prev ? get("items", prev) : { id: itemId, projectId: id, origEst: null };
        put("items", { ...row, title: it.title, module: it.section, est: it.est, order: ++order });
        p = cfgPatch(p, itemId, { n: it.n, perWeek: it.perWeek, steps: it.steps, note: it.note, later: it.later });
      }
      put("projects", p);
      gone = m.gone.map((o) => ({ id: o.id, title: o.title, used: linesOf(o.id).length > 0 }));
    }, planId ? "Updated the plan" : "Created " + (parsed.name || "the plan"));
    return { planId: id, gone };
  }

  // ---------- 换成这套（打开时看一次，可以重复跑） ----------
  // 记下换的那天；旧的 Total 计划变成普通的计划（项留着，都是 Once）；以前「总时长」那一大块（和计划同名的项）、
  // 还有以前在计划上直接加任务时顺手建的项（分区 Added）拿掉，它们的任务变回计划自己的一条（她 2026-10-26 说没挑 Pool 的就该是计划本身，不拆成子项）
  // 以前每一次的名字后面带的 #k 拿掉（她 2026-10-27 说没用）
  function adoptLists() {
    const fix = [];
    for (const p of all("projects")) {
      const same = all("items").filter((i) => i.projectId === p.id && (i.module === "Added" || (p.kind === "total" && key(i.title) === key(p.name))));
      if (p.kind === "total" || same.length) fix.push({ p, same });
    }
    const numbered = all("tasks").filter((t) => { const i = t.itemId && get("items", t.itemId); return i && t.title !== i.title && L.OLD_NUM.test(t.title); });
    const first = !setting(FROM, "");
    if (!fix.length && !first && !numbered.length) return false;
    change(() => {
      if (first) put("settings", { id: FROM, key: FROM, value: today() });
      for (const t of numbered) put("tasks", { ...t, title: t.title.replace(L.OLD_NUM, "") });
      for (const { p, same } of fix) {
        let row = get("projects", p.id);
        if (row.kind === "total") row = { ...row, kind: "regular", place: "pool", rule: { ...(row.rule || {}), perWeek: Number(row.rule?.perWeek) || 0, min: Number(row.rule?.min) || 0 } };
        const items = { ...(row.rule?.items || {}) };
        for (const i of same) {
          for (const t of all("tasks")) if (t.itemId === i.id) put("tasks", { ...t, itemId: "" });
          drop("items", i.id);
          delete items[i.id];
        }
        if (row.rule) row = { ...row, rule: { ...row.rule, items } };
        put("projects", row);
      }
    });
    return fix.length > 0;
  }

  return { itemCfg, setItemCfg, setPlanNotes, setSectionLater, rowOf, ensureRow, placeItem, moveLine, moveBlock, blockToPool, tickLine, tickStep, backToPool, settleLists, addPoolLines, planShape, planText, pastePlan, adoptLists };
}
