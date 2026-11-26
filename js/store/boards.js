// 白板（Obsidian 的 .canvas，见 js/canvas.js）：Mindmap 页的那几块（kind: "map"），和 Projects 页最下面的生态圈（kind: "eco"，一种侧重一块，上面一排切换）。
// 存在 Settings 页里：board:<id> = { name, kind, file, order, at, v, parts, goals? }；白板本身转成一段字，切成几段存在 board:<id>#0、#1……= { v, s }。
//   为什么切：表格一格最多五万个字，一块大的思维导图放不下（一段 18000 个字，存进格子时引号要再转义一次，最多翻一倍也放得下）。
//   v 是这一次导入的记号：几段的 v 都和 board:<id> 对上了才拼起来，同步到一半（新的头、旧的身子）的时候先当没有，不会拼出半张。
// 生态圈的 goals = { 块的 id: 目标 id }：连着线的那几块就是最上面一层的目标（span: north，原来 North star 里框出来的那几条也是这一层）。
//   导入时先按块的 id 对（Obsidian 里改了字、挪了位置、复制成另一种侧重，块的 id 都不变），再按字对原来的那几条，都对不上才新建；
//   所以在 Obsidian 里改完重新导入，目标还是原来那条，上下级、为它服务的计划都在。白板删掉，目标留着。
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销），再加上目标（goals）。

import * as C from "../canvas.js";

export const CHUNK = 18000;

export default function (core) {
  const { entries, put, drop, change, memo, newId, goals } = core;
  const META = /^board:([^#]+)$/, PART = /^board:([^#]+)#(\d+)$/;
  const parsed = new Map();   // v → 拼好、读好的白板（同一次导入只读一次，别的东西改了不用重新解析一大段）

  const boards = () => memo("boards", () => {
    const metas = new Map(), parts = new Map();
    for (const [key, r] of entries("settings")) {
      if (!r?.value || typeof r.value !== "object") continue;
      let m;
      if ((m = META.exec(key))) metas.set(m[1], r.value);
      else if ((m = PART.exec(key))) { if (!parts.has(m[1])) parts.set(m[1], []); parts.get(m[1])[Number(m[2])] = r.value; }
    }
    const out = [];
    for (const [id, v] of metas) {
      const n = Number(v.parts) || 0, list = (parts.get(id) || []).slice(0, n);
      let canvas = null;
      if (n && list.length === n && list.every((p) => p && p.v === v.v && typeof p.s === "string")) {
        canvas = parsed.get(v.v) || null;
        if (!canvas) {
          try { canvas = C.compact(JSON.parse(list.map((p) => p.s).join(""))); parsed.set(v.v, canvas); } catch { canvas = null; }
        }
      }
      out.push({ id, name: String(v.name || "Untitled"), kind: v.kind === "eco" ? "eco" : "map", file: String(v.file || ""), order: Number(v.order) || 0, at: Number(v.at) || 0,
        goals: v.goals && typeof v.goals === "object" ? v.goals : {}, canvas, size: n });
    }
    return out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  });

  const board = (id) => boards().find((b) => b.id === id) || null;
  const metaOf = (id) => entries("settings").find(([k]) => k === "board:" + id)?.[1]?.value || null;

  // 写一块（在调用方的 change 里）：头一行 + 几段身子；原来比现在多出来的那几段删掉
  function write(id, meta, canvas) {
    const s = JSON.stringify(canvas), n = Math.max(1, Math.ceil(s.length / CHUNK)), v = newId().replace(/-/g, "").slice(0, 10);
    put("settings", { id: "board:" + id, key: "board:" + id, value: { ...meta, v, parts: n, at: Date.now() } });
    for (let k = 0; k < n; k++) put("settings", { id: "board:" + id + "#" + k, key: "board:" + id + "#" + k, value: { v, s: s.slice(k * CHUNK, (k + 1) * CHUNK) } });
    for (const [key] of entries("settings")) {
      const m = PART.exec(key);
      if (m && m[1] === id && Number(m[2]) >= n) drop("settings", key);
    }
  }

  // 导入一块。给了 id（点了 Replace）就换那一块；没给的，同名的（同一个文件再导一次）换掉原来那块，位置不变。返回 { id, replaced }
  function importBoard({ id: into, name, file, canvas, kind = "map" }) {
    const keep = into ? board(into) : null;
    const nm = String(name || keep?.name || C.nameOf(file)).trim() || "Untitled";
    const same = keep || boards().find((b) => b.kind === kind && (b.name === nm || (file && b.file === file)));
    const id = same?.id || newId().replace(/-/g, "").slice(0, 10);
    const order = same?.order || Date.now();
    if (kind === "eco") {
      change(() => write(id, { name: nm, kind, file: String(file || ""), order, goals: linkEco(canvas) }, canvas), same ? "Updated " + nm : "Added " + nm);
    } else {
      change(() => write(id, { name: nm, kind, file: String(file || ""), order }, canvas), same ? "Updated " + nm : "Added " + nm);
    }
    return { id, replaced: Boolean(same) };
  }

  // 生态圈连着线的那几块 → 最上面一层的目标（在调用方的 change 里建 / 改）。返回 { 块的 id: 目标 id }
  function linkEco(canvas) {
    const all = goals(), byId = new Map(all.map((g) => [g.id, g]));
    const north = all.filter((g) => g.span === "north");
    const known = {};
    for (const b of boards()) if (b.kind === "eco") Object.assign(known, b.goals);
    const map = {}, used = new Set();
    let i = 0;
    for (const n of C.ecoParts(canvas).members) {
      const text = C.goalText(n.text);
      let g = byId.get(known[n.id]);
      if (g && (used.has(g.id) || g.span !== "north")) g = null;
      if (!g) g = north.find((x) => !used.has(x.id) && C.sameText(x.text, text)) || null;
      if (!g) {
        const id = newId().replace(/-/g, "").slice(0, 10), value = { text, tag: "", span: "north", due: "", done: "", order: Date.now() + i++, up: "", by: [] };
        put("settings", { id: "goal:" + id, key: "goal:" + id, value });
        g = { ...value, id };
      } else if (g.text !== text) {
        const { id, ...value } = g;
        put("settings", { id: "goal:" + id, key: "goal:" + id, value: { ...value, text } });
      }
      used.add(g.id);
      map[n.id] = g.id;
    }
    return map;
  }

  function renameBoard(id, name) {
    const v = metaOf(id), nm = String(name || "").trim();
    if (!v || !nm || nm === v.name) return;
    change(() => put("settings", { id: "board:" + id, key: "board:" + id, value: { ...v, name: nm } }));
  }

  // 删一块：头和身子一起（提示条能撤销）。生态圈的目标留着
  function deleteBoard(id) {
    const v = metaOf(id);
    if (!v) return;
    change(() => {
      for (const [key] of entries("settings")) { const m = PART.exec(key); if (m && m[1] === id) drop("settings", key); }
      drop("settings", "board:" + id);
    }, "Removed " + (v.name || "board"));
  }

  return { boards, board, importBoard, renameBoard, deleteBoard };
}
