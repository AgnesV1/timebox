// 今天页的四象限便签（js/quads.js 算、js/ui/quads.js 画）：存在 Settings 页里，一张一行 quad:<id> = { text, q, order, done }。
// 页面那边先把样子挪好（拖进格子、打勾、新写一张）再来存，所以这里的改动都不重画整页（quiet）；
// 删掉的那一下给「撤销」，撤销回来照常重画。
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

import * as Q from "../quads.js";

export default function (core) {
  const { entries, put, drop, change, memo, newId, today } = core;

  const QUAD_RE = /^quad:(.+)$/;
  const keyOf = (id) => "quad:" + id;
  const BLANK = { text: "", q: "do", order: 0, done: "" };
  const shortId = () => newId().replace(/-/g, "").slice(0, 10);
  const QUIET = { quiet: true };

  const quads = () => memo("quads", () => {
    const out = [];
    for (const [key, r] of entries("settings")) {
      const m = QUAD_RE.exec(key);
      if (m && r.value && typeof r.value === "object") out.push({ ...BLANK, ...r.value, id: m[1] });
    }
    return out;
  });
  const quadOf = (id) => quads().find((n) => n.id === id) || null;
  const quadBoard = () => Q.board(quads(), today());

  function putQuad(n) {
    put("settings", { id: keyOf(n.id), key: keyOf(n.id), value: { text: n.text, q: n.q, order: n.order, done: n.done } });
  }

  // 排进 q 这一格、在 before 前面；row = 这一张现在的样子（新写的那张还不在表里）
  function placeRow(row, q, before) {
    for (const u of Q.place(quadBoard()[q], row.id, before)) {
      if (u.id === row.id) putQuad({ ...row, q, order: u.order });
      else { const n = quadOf(u.id); if (n) putQuad({ ...n, order: u.order }); }
    }
  }

  // 新写一张，放在这一格最后 → id（没字就不写，返回空）
  function addQuad(q, text) {
    const t = Q.clean(text);
    if (!t) return "";
    const id = shortId();
    change(() => placeRow({ ...BLANK, id, text: t }, Q.qOf(q), ""), "", QUIET);
    return id;
  }

  // 拖到 q 这一格、排在 before 前面（空 = 最后）
  function moveQuad(id, q, before = "") {
    const n = quadOf(id);
    if (n) change(() => placeRow(n, Q.qOf(q), before), "", QUIET);
  }

  function editQuad(id, text) {
    const n = quadOf(id), t = Q.clean(text);
    if (n && t && t !== n.text) change(() => putQuad({ ...n, text: t }), "", QUIET);
  }

  // 打勾 / 取消：记下是哪天打的，第二天起就不显示了
  function doneQuad(id, on) {
    const n = quadOf(id);
    if (n) change(() => putQuad({ ...n, done: on ? today() : "" }), "", QUIET);
  }

  function deleteQuad(id) {
    if (quadOf(id)) change(() => drop("settings", keyOf(id)), "Note removed", QUIET);
  }

  // 打勾满一天的删掉（打开页面、从表格拉回来以后各清一次）
  function settleQuads() {
    const gone = Q.stale(quads(), today());
    if (gone.length) change(() => gone.forEach((n) => drop("settings", keyOf(n.id))), "", QUIET);
  }

  return { quads, quadOf, quadBoard, addQuad, moveQuad, editQuad, doneQuad, deleteQuad, settleQuads };
}
