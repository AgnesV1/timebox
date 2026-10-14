// 规律计划（重复）
// 规则在计划的 rule 里（见 routines.js）。只有今天的那一次是 Tasks 里的任务（ID 以 rt: 开头），以后的只是预览。
// 加任务框的「重复」、任务编辑框里的「Repeat」都是新建一个 Regular + Auto 的计划。
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

import { addDays, fmtShort } from "../dates.js";
import * as E from "../engine.js";
import * as R from "../routines.js";

export default function (core) {
  const { all, get, put, drop, change, newId, today, byOrder, groupFor, colorFor, nextPlanOrder, nextOrder, started, dropTask, deleteTask, updateTask, timer, setTimer, moveMeet, moveIdea } = core;

  const routines = () => all("projects").filter(E.isRegular).sort(byOrder);
  const routineOf = (taskId) => { const x = R.parseRoutineTaskId(taskId); const p = x ? get("projects", x.rid) : null; return p && E.isRegular(p) ? p : null; };
  const seriesTasks = (rid) => all("tasks").filter((x) => x.id.startsWith("rt:" + rid + ":")).sort((a, b) => a.date.localeCompare(b.date));
  const origDate = (id) => R.parseRoutineTaskId(id)?.date || "";

  function setRule(p, patch) {
    const { id: _i, title: _t, ...rule } = R.ruleOf(get("projects", p.id) || p);
    put("projects", { ...(get("projects", p.id) || p), rule: { ...rule, ...patch } });
  }

  function newRegular(name, projectId, rule, direct = "") {
    const group = groupFor(projectId) || direct;
    return { id: newId(), name, group, kind: "regular", place: "auto", status: "active", deadline: "", start: "", early: 0, calib: null,
      rule: { days: [0, 0, 0, 0, 0, 0, 0], skip: [], ...rule }, color: get("projects", projectId)?.color || colorFor(group), order: nextPlanOrder() };
  }

  const repeatLabel = (end) => (end ? "Repeats until " + fmtShort(end) : "Repeats from now on");

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
      put("projects", { ...plan, ...("title" in fields ? { name: fields.title } : {}), rule });
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

  return { routines, routineOf, seriesTasks, addRepeating, repeatTask, replanSeries, editSeries, seriesScope, deleteSeries, setRule, setSeriesGroup };
}
