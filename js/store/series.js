// 规律计划（重复）
// 规则在计划的 rule 里（见 routines.js）。只有今天的那一次是 Tasks 里的任务（ID 以 rt: 开头），以后的只是预览。
// 加任务框的「重复」、任务编辑框里的「Repeat」都是新建一个 Regular + Auto 的计划。
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

import { addDays, fmtShort, WEEKDAYS } from "../dates.js";
import * as E from "../engine.js";
import * as R from "../routines.js";
import * as L from "../lists.js";

export default function (core) {
  const { all, get, put, drop, change, newId, today, byOrder, groupFor, colorFor, nextPlanOrder, nextOrder, started, dropTask, deleteTask, updateTask, timer, setTimer, moveMeet, moveIdea } = core;

  const routines = () => all("projects").filter(E.isRegular).sort(byOrder);
  // 还在按星期几重复的才算（2026-11-22 起以前固定星期几的都改成每周几次了，它们以前那几次的 rt: 任务就是普通的那一行，不再当重复）
  const routineOf = (taskId) => { const x = R.parseRoutineTaskId(taskId); const p = x ? get("projects", x.rid) : null; return p && E.isRegular(p) && E.isAuto(p) ? p : null; };
  const seriesTasks = (rid) => all("tasks").filter((x) => x.id.startsWith("rt:" + rid + ":")).sort((a, b) => a.date.localeCompare(b.date));
  const origDate = (id) => R.parseRoutineTaskId(id)?.date || "";

  function setRule(p, patch) {
    const { id: _i, title: _t, ...rule } = R.ruleOf(get("projects", p.id) || p);
    put("projects", { ...(get("projects", p.id) || p), rule: { ...rule, ...patch } });
  }

  function newRegular(name, projectId, rule, direct = "") {
    const group = groupFor(projectId) || direct;
    return { id: newId(), name, group, kind: "regular", place: "auto", status: "active", deadline: "", start: "", early: 0, calib: null,
      rule: { days: [0, 0, 0, 0, 0, 0, 0], skip: [], set: true, ...rule }, color: get("projects", projectId)?.color || colorFor(group), order: nextPlanOrder() };
  }

  const repeatLabel = (end) => (end ? "Repeats until " + fmtShort(end) : "Repeats from now on");

  // 这个重复是不是一张计划（停掉以后还是拖着用的计划）：日历 Pool 拖 ↻ 设的（rule.plan），或者 Pool 里有东西的。
  // 不是的就是循环小事（加任务时选 Repeat 建的），停掉就没了
  const isPlanLike = (p) => Boolean(p?.rule?.plan) || all("items").some((i) => i.projectId === p?.id);
  // 变回拖着用的计划：去掉星期几、起止、开关
  const toPool = (p) => { const { days: _d, start: _s, end: _e, off: _o, skip: _k, ...rest } = p.rule || {}; return { ...p, place: "pool", rule: rest }; };
  // 从今天起已经落成、还没开始的那几次（规则变了以后不该出现的那些从这里挑）
  const ahead = (pid) => seriesTasks(pid).filter((x) => !started(x) && origDate(x.id) >= today());
  const daysText = (on) => [1, 2, 3, 4, 5, 6, 0].filter((d) => on.includes(d)).map((d) => WEEKDAYS[d]).join(" · ");

  // 以前按固定星期几自己出现的（Gym 这种，她 2026-11-22 夜说的：「很少能固定周几去，周末安排不确定，也会拖延」）改成每周大概几次、自己拖：
  // 每周几次 = 原来一周有几天，默认分钟 = 原来那几天的分钟；已经写了的照旧。状态（在用 / 归档）一律不动——
  // 上一版把「过了最后一天」的顺手归档了，可她那几个计划设过结束日、之后一直在 Pool 里拖着用，归档以后卡片和 Pool 里都没了（她 11-22 夜报的，放回来见 store.js 的 repairWeekly）。
  // 只改以前建的：日历 Pool 拖 ↻ 临时设的（rule.plan）、之后加任务时选 Repeat 新建的（rule.set）都不动。今天已经排上的那一行留着
  function adoptWeekly() {
    const list = all("projects").filter((p) => E.isAuto(p) && !p.rule?.plan && !p.rule?.set);
    if (!list.length) return false;
    change(() => {
      for (const p of list) {
        const on = R.ruleOf(p).days.map(Number).filter((v) => v > 0);
        const { days: _d, start: _s, end: _e, skip: _k, off: _o, ...rest } = p.rule || {};
        put("projects", { ...p, place: "pool", rule: { ...rest, perWeek: Number(rest.perWeek) > 0 ? Number(rest.perWeek) : on.length, min: Number(rest.min) > 0 ? Number(rest.min) : on[0] || 0 } });
      }
    }, "", { quiet: true });
    return true;
  }

  // 日历 Pool 里拖 ↻ 设的重复（她 2026-11-22 要的，像闹钟）：每周哪几天 on（0 = 周日 … 6 = 周六），从 start 到 end（她自己挑，必填）。
  // 存法沿用固定星期几（place auto + rule.days / start / end）。原来是拖着用的计划就记 rule.plan：它还是一张计划卡片，停掉以后变回拖着用的。
  // 那几天各多久：已经在重复的照原来的分钟，不然用计划的默认分钟，都没有就 60。已经落成、还没开始、新规则里没有的那几次删掉
  function setPlanRepeat(pid, { on, start, end }) {
    const p = get("projects", pid);
    if (!p || !Array.isArray(on) || !on.length || !start || !end) return false;
    const min = L.planMin(p) || 60, plan = Boolean(p.rule?.plan) || !E.isAuto(p);
    const rule = { ...(p.rule || {}), days: [0, 1, 2, 3, 4, 5, 6].map((d) => (on.includes(d) ? min : 0)), start, end: R.clampEnd(start, end), off: false, skip: p.rule?.skip || [], ...(plan ? { plan: true } : {}) };
    const next = R.ruleOf({ ...p, rule });
    change(() => {
      put("projects", { ...p, place: "auto", rule });
      ahead(pid).forEach((x) => { if (!R.dueOn(next, origDate(x.id))) dropTask(x.id); });
    }, (p.name || "Plan") + " every " + daysText(on) + " until " + fmtShort(rule.end));
    return true;
  }

  // 闹钟那个开关：关了先不出现（规则留着），已经落成、还没开始的那几次拿掉；开了从今天起照规则接着来
  function toggleRepeat(pid, on) {
    const p = get("projects", pid);
    if (!p || !E.isAuto(p) || Boolean(p.rule?.off) === !on) return;
    change(() => {
      put("projects", { ...p, rule: { ...(p.rule || {}), off: !on } });
      if (!on) ahead(pid).forEach((x) => dropTask(x.id));
    }, on ? (p.name || "Repeat") + " is back on" : (p.name || "Repeat") + " paused");
  }

  // 不要这个重复了：从今天起还没开始的那几次拿掉。计划变回拖着用的；循环小事到昨天为止（一次都没有过的整个删掉，做过的标 Dropped）
  function stopRepeat(pid) {
    const p = get("projects", pid);
    if (!p || !E.isAuto(p)) return;
    change(() => {
      ahead(pid).forEach((x) => dropTask(x.id));
      if (isPlanLike(p)) return put("projects", toPool(p));
      const end = addDays(today(), -1), r = R.ruleOf(p);
      if (!r.start || end >= r.start) return setRule(p, { end });
      if (all("tasks").some((x) => x.projectId === pid)) put("projects", { ...p, status: "dropped" });
      else drop("projects", pid);
    }, "Stopped repeating " + (p.name || ""));
  }

  // 加任务时直接设重复：days 是一周七天的分钟数，end 是最后一天（空 = 一直）。返回第一次的 ID（那天要做的话）
  function addRepeating(fields, days, end) {
    const start = fields.date || today();
    const p = newRegular(fields.title, fields.projectId, { days, start, end: R.clampEnd(start, end), optional: Boolean(fields.optional), deep: Boolean(fields.deep) }, fields.group);
    let first = "";
    change(() => {
      put("projects", p);
      const est = R.dueOn(R.ruleOf(p), start);
      if (est) {
        first = R.routineTaskId(p.id, start);
        put("tasks", { id: first, date: start, title: p.name, est, actual: null, status: "", reason: "", optional: Boolean(fields.optional), deep: Boolean(fields.deep),
          projectId: p.id, itemId: "", times: "", desc: "", order: nextOrder(start) });
      }
    }, repeatLabel(p.rule.end));
    return first;
  }

  // 已有的普通任务改成重复的：它自己变成第一次（换成 rt: 的 ID，计时记录跟着走）。返回它的新 ID
  function repeatTask(id, days, end) {
    const t = get("tasks", id);
    if (!t) return id;
    const p = newRegular(t.title, t.projectId, { days, start: t.date, end: R.clampEnd(t.date, end), optional: Boolean(t.optional), deep: Boolean(t.deep) }, t.group);
    const nid = R.routineTaskId(p.id, t.date);
    change(() => {
      put("projects", p);
      put("tasks", { ...t, id: nid, projectId: p.id, itemId: "" });
      if (timer()?.taskId === id) setTimer({ ...timer(), taskId: nid });
      moveMeet(id, nid, t.date);
      moveIdea(id, nid);
      drop("tasks", id);
    }, repeatLabel(p.rule.end));
    return nid;
  }

  // 改重复（从这一次起）：规则换成新的；已经落成、还没开始的那几次跟着变（新规则里没有的删掉）
  function replanSeries(id, days, end) {
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

  const SERIES_FIELDS = ["title", "est", "optional", "deep"];

  // 改名字、分钟、可选、深度：只改这一次 / 这次和以后 / 全部（做过的不动，除了这一次自己）
  function editSeries(id, patch, scope) {
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
      if ("deep" in fields) rule.deep = Boolean(fields.deep);
      if ("est" in fields) rule.days = (rule.days || []).map((v) => (Number(v) > 0 ? Number(fields.est) || 0 : 0));
      // 计划的重复（日历 Pool 拖 ↻ 设的）：改那一行的名字不改计划的名字
      put("projects", { ...plan, ...("title" in fields && !isPlanLike(plan) ? { name: fields.title } : {}), rule });
    }, null, { quiet: patch.title !== undefined });
  }

  // 删的时候会删掉哪几个已经落成的：only = 只这一次；following / earlier / all 只删还没开始的（这一次也一样）
  function seriesScope(id, scope) {
    const t = get("tasks", id), x = R.parseRoutineTaskId(id);
    if (!t) return [];
    if (scope === "this" || !x) return [t];
    return seriesTasks(x.rid).filter((s) => !started(s) &&
      (scope === "all" || (scope === "following" ? origDate(s.id) >= x.date : origDate(s.id) <= x.date)));
  }

  // following = 从这次起不再重复；earlier = 这次和以前的不要了（从下一次开始）；all = 整个计划不要了
  // （做过的还在的话计划留着、标成 Dropped，统计里还认得出名字）
  function deleteSeries(id, scope) {
    const t = get("tasks", id), p = routineOf(id);
    if (!t || !p || scope === "this") return deleteTask(id);
    const od = origDate(id), gone = seriesScope(id, scope);
    change(() => {
      gone.forEach((x) => dropTask(x.id));
      if (scope === "following") setRule(p, { end: addDays(od, -1) });
      else if (scope === "earlier") setRule(p, { start: addDays(od, 1) });
      const r = R.ruleOf(get("projects", p.id));
      if (scope !== "all" && !(r.start && r.end && r.end < r.start)) return;
      // 是一张计划的（Pool 里有东西、或者日历 Pool 拖 ↻ 设的）：不删计划，变回拖着用的
      if (isPlanLike(p)) return put("projects", toPool(get("projects", p.id)));
      // 一次都不剩了：做过的还在就留着计划（标 Dropped），不然整个删掉
      if (all("tasks").some((x) => x.projectId === p.id)) put("projects", { ...get("projects", p.id), status: "dropped" });
      else drop("projects", p.id);
    }, scope === "all" ? "Deleted repeat" : "Stopped repeating");
  }

  // 整个循环挪到别的大类（循环小事直接算在大类上，见 engine.js 的 isRepeat）：计划的 group 换掉，颜色跟着新的大类走
  function setSeriesGroup(id, group) {
    const p = routineOf(id), to = String(group || "").trim();
    if (!p || (p.group || "") === to) return;
    change(() => put("projects", { ...p, group: to, color: colorFor(to) }), to ? "Moved to " + to : "Taken out of its project");
  }

  return { routines, routineOf, seriesTasks, addRepeating, repeatTask, replanSeries, editSeries, seriesScope, deleteSeries, setRule, setSeriesGroup, setPlanRepeat, toggleRepeat, stopRepeat, isPlanLike, adoptWeekly };
}
