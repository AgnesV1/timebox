// 今天页的四象限便签（js/quads.js 算、js/ui/quads.js 画）：只存在这台电脑上（localStorage 单独一个键），不进表格、不同步。
// 打开就一直在那里：过了一天也不变，打过勾的也留着（划掉的样子），自己删才没。
// 页面那边先把样子挪好再来存，这里只管记下来，不叫整页重画；删掉的撤销也由页面那边弹。
// 以前（2026-10-18 上线那一版）存在 Settings 里一张一行 quad:<id>：第一次打开搬过来，表格里那几行删掉。

import * as Q from "../quads.js";
import { readLocal, writeLocal } from "../dom.js";

const KEY = "kuzhouduan-quads";

export default function (core) {
  const { entries, drop, change, newId } = core;

  const BLANK = { text: "", q: "do", order: 0, done: false };
  const shortId = () => newId().replace(/-/g, "").slice(0, 10);
  let list = (readLocal(KEY, []) || []).filter((n) => n && n.id);
  const save = () => writeLocal(KEY, list);

  const quads = () => list;
  const quadOf = (id) => list.find((n) => n.id === id) || null;
  const quadBoard = () => Q.board(list);
  const set = (n) => { list = list.some((x) => x.id === n.id) ? list.map((x) => (x.id === n.id ? n : x)) : [...list, n]; };

  // 排进 q 这一格、在 before 前面；row = 这一张现在的样子（新写的那张还不在里面）
  function placeRow(row, q, before) {
    for (const u of Q.place(quadBoard()[q], row.id, before)) {
      if (u.id === row.id) set({ ...row, q, order: u.order });
      else { const n = quadOf(u.id); if (n) set({ ...n, order: u.order }); }
    }
    save();
  }

  // 新写一张，放在这一格最后 → id（没字就不写，返回空）
  function addQuad(q, text) {
    const t = Q.clean(text);
    if (!t) return "";
    const id = shortId();
    placeRow({ ...BLANK, id, text: t }, Q.qOf(q), "");
    return id;
  }

  // 拖到 q 这一格、排在 before 前面（空 = 最后）
  function moveQuad(id, q, before = "") {
    const n = quadOf(id);
    if (n) placeRow(n, Q.qOf(q), before);
  }

  function editQuad(id, text) {
    const n = quadOf(id), t = Q.clean(text);
    if (n && t && t !== n.text) { set({ ...n, text: t }); save(); }
  }

  function doneQuad(id, on) {
    const n = quadOf(id);
    if (n) { set({ ...n, done: Boolean(on) }); save(); }
  }

  // 删 → 删掉的那张（撤销时原样放回去）
  function deleteQuad(id) {
    const n = quadOf(id);
    if (!n) return null;
    list = list.filter((x) => x.id !== id);
    save();
    return n;
  }
  function restoreQuad(n) {
    if (!n?.id || quadOf(n.id)) return;
    list = [...list, n];
    save();
  }

  // 表格里还留着的旧便签（Settings 的 quad:<id>）：搬到本机，表格里删掉（打开页面、从表格拉回来以后各看一次）
  function adoptQuads() {
    const old = [];
    for (const [key, r] of entries("settings")) {
      const m = /^quad:(.+)$/.exec(key);
      if (m && r.value && typeof r.value === "object") old.push({ ...BLANK, ...r.value, id: m[1], done: Boolean(r.value.done) });
    }
    if (!old.length) return false;
    old.forEach((n) => { if (!quadOf(n.id)) list = [...list, n]; });
    save();
    change(() => old.forEach((n) => drop("settings", "quad:" + n.id)));   // 不 quiet：搬过来要重画一次
    return true;
  }

  return { quads, quadOf, quadBoard, addQuad, moveQuad, editQuad, doneQuad, deleteQuad, restoreQuad, adoptQuads };
}
