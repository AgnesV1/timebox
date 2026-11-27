// Obsidian 白板（.canvas）：读进来、画线、卡片上的字；生态圈的几种线和蓄水池；存进 Settings 时切段、导入生态圈时对上原来的目标
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../js/canvas.js";

// 她贴的那张图，照 Obsidian 存出来的样子（块的 id 是 16 位十六进制）
const ECO = {
  nodes: [
    { id: "a1b2c3d4e5f60001", type: "text", x: -400, y: -300, width: 260, height: 120, text: "2. 丰富体验\n即时回血口" },
    { id: "a1b2c3d4e5f60002", type: "text", x: 240, y: -300, width: 260, height: 120, text: "4. 增长\nLaser Beam", color: "5" },
    { id: "a1b2c3d4e5f60003", type: "text", x: -400, y: 160, width: 260, height: 120, text: "1. 人际关系\n情绪安全网" },
    { id: "a1b2c3d4e5f60004", type: "text", x: 240, y: 160, width: 260, height: 120, text: "3. 稳定生活\n体能进水口" },
    { id: "a1b2c3d4e5f60005", type: "text", x: -110, y: -100, width: 230, height: 180, text: "整体蓄水池\n78%\n定向高耗 · 整体平衡" },
    { id: "a1b2c3d4e5f60006", type: "text", x: 600, y: 400, width: 200, height: 60, text: "a note nobody links to" }
  ],
  edges: [
    { id: "e1", fromNode: "a1b2c3d4e5f60001", fromSide: "bottom", toNode: "a1b2c3d4e5f60005", toSide: "left", label: "进水 10%" },
    { id: "e2", fromNode: "a1b2c3d4e5f60005", toNode: "a1b2c3d4e5f60002", label: "主线 55%" },
    { id: "e3", fromNode: "a1b2c3d4e5f60003", toNode: "a1b2c3d4e5f60005", label: "保底 15%" },
    { id: "e4", fromNode: "a1b2c3d4e5f60004", toNode: "a1b2c3d4e5f60005", label: "进水 20%" },
    { id: "e5", fromNode: "a1b2c3d4e5f60001", toNode: "a1b2c3d4e5f60002" },
    { id: "e6", fromNode: "a1b2c3d4e5f60004", toNode: "a1b2c3d4e5f60002", color: "1" },
    { id: "bad", fromNode: "a1b2c3d4e5f60004", toNode: "missing" }
  ]
};

test("a canvas file is read and trimmed to what can be drawn; groups go to the bottom; broken edges are dropped", () => {
  const raw = JSON.stringify({ nodes: [{ id: "t", type: "text", x: 10.6, y: 0, width: 100, height: 50, text: "Hi", extra: 1, color: "4" },
    { id: "g", type: "group", x: 0, y: 0, width: 300, height: 200, label: "Group", background: "x.png" }, { id: "f", type: "file", x: 0, y: 300, width: 100, height: 100, file: "a/b.png" },
    { id: "u", type: "link", x: 0, y: 500, width: 100, height: 100, url: "https://example.com", color: "red" }],
  edges: [{ id: "e", fromNode: "t", toNode: "f", toEnd: "none", label: " " }, { id: "x", fromNode: "t", toNode: "nope" }] });
  const c = C.parseCanvas("﻿" + raw);
  assert.deepEqual(c.nodes.map((n) => n.id), ["g", "t", "f", "u"]);
  assert.deepEqual(c.nodes[1], { id: "t", type: "text", x: 11, y: 0, width: 100, height: 50, color: "4", text: "Hi" });
  assert.equal(c.nodes[3].color, undefined, "a colour that is neither a preset nor #hex is dropped");
  assert.deepEqual(c.edges, [{ id: "e", fromNode: "t", toNode: "f", toEnd: "none" }]);
  assert.throws(() => C.parseCanvas("not json"), /isn't an Obsidian canvas/);
  assert.throws(() => C.parseCanvas("{\"a\":1}"), /no nodes or edges/);
  assert.equal(C.nameOf("Vault/Maps/Life map.canvas"), "Life map");
});

test("edges leave from the side facing the other card, with an arrow at the end", () => {
  const a = { x: 0, y: 0, width: 100, height: 50 }, b = { x: 300, y: 10, width: 100, height: 50 }, below = { x: 0, y: 300, width: 100, height: 50 };
  assert.equal(C.sideToward(a, b), "right");
  assert.equal(C.sideToward(b, a), "left");
  assert.equal(C.sideToward(a, below), "bottom");
  const g = C.edgeGeo(a, b);
  assert.deepEqual([g.p0.x, g.p0.y, g.p3.x, g.p3.y], [100, 25, 300, 35]);
  assert.ok(Math.abs(g.a3) < 0.2, "the arrow at the end points right");
  assert.match(g.d, /^M100 25C/);
  const s = C.edgeGeo(a, b, { fromSide: "top", toSide: "top" });
  assert.ok(s.mid.y < 0, "both from the top: the curve bulges above");
  assert.match(C.arrowPath({ x: 10, y: 10 }, 0), /^M10 10L/);
  assert.equal(C.cssColor("3"), "var(--cv3)");
  assert.equal(C.cssColor("#ff0000"), "#ff0000");
});

test("card text: common Markdown, escaped, links only to safe places", () => {
  const h = C.md("# Title\n- [x] done **bold**\n- item with [[Note|alias]] and [[folder/Other]]\n  - nested\n1. first\n> quote\n<script>alert(1)</script>\n[x](javascript:alert(1)) [ok](https://a.b/?q=1&r=2) `a<b` ==hl==");
  assert.match(h, /<div class="md-h md-h1">Title<\/div>/);
  assert.match(h, /md-task done.*☑.*done <b>bold<\/b>/);
  assert.match(h, /<span class="md-wl">alias<\/span>.*<span class="md-wl">Other<\/span>/);
  assert.match(h, /--in:1/);
  assert.match(h, /&lt;script&gt;/);
  assert.doesNotMatch(h, /<script>/);
  assert.doesNotMatch(h, /javascript:/);
  assert.match(h, /href="https:\/\/a\.b\/\?q=1&amp;r=2"/);
  assert.match(h, /<code>a&lt;b<\/code>/);
  assert.match(h, /<mark>hl<\/mark>/);
  assert.equal(C.plain("## **Grow** [[x|y]]"), "Grow y");
});

test("ecosystem: the reservoir, its level, the kind and share of each flow, and which cards are goals", () => {
  const c = C.compact(ECO);
  const { pool, members, notes } = C.ecoParts(c);
  assert.equal(pool.id, "a1b2c3d4e5f60005");
  assert.deepEqual(C.partsOf(pool.text), { title: "整体蓄水池", sub: "定向高耗 · 整体平衡", level: 78 });
  assert.deepEqual(members.map((n) => C.goalText(n.text)), ["丰富体验", "增长", "人际关系", "稳定生活"], "the numbering is dropped from the goal's name");
  assert.deepEqual(notes.map((n) => n.id), ["a1b2c3d4e5f60006"], "a card with no lines is a note, not a goal");
  const kinds = c.edges.map((e) => C.flowOf(e));
  assert.deepEqual(kinds.map((k) => k.kind), ["inflow", "laser", "baseline", "inflow", "synergy", "leak"]);
  assert.deepEqual(kinds.map((k) => k.pct), [10, 55, 15, 20, null, null]);
  assert.deepEqual(C.flowOf({ label: "Overload leak 5%" }), { kind: "leak", pct: 5 });
  assert.deepEqual(C.flowOf({ label: "Laser beam" }), { kind: "laser", pct: null });
  assert.deepEqual(C.kindsIn(c), ["laser", "synergy", "inflow", "baseline", "leak"]);
  assert.ok(C.sameText("  Grow  Up", "grow up"));
});

test("store: a big board is split into parts under the cell limit and read back whole; re-importing the same file replaces it", async () => {
  console.warn = () => {};
  const store = await import("../js/store.js?boards");
  const { CHUNK } = await import("../js/store/boards.js");
  const big = { nodes: Array.from({ length: 400 }, (_, i) => ({ id: "n" + i, type: "text", x: i * 10, y: 0, width: 200, height: 80, text: "Card " + i + " — " + "x\"y".repeat(40) })), edges: [] };
  const canvas = C.compact(big);
  const { id } = store.importBoard({ file: "Big map.canvas", canvas });
  const parts = Math.ceil(JSON.stringify(canvas).length / CHUNK);
  assert.ok(parts > 1);
  for (let k = 0; k < parts; k++) assert.ok(JSON.stringify(store.setting("board:" + id + "#" + k)).length < 50000, "each part fits in one Sheet cell after quoting");
  const b = store.board(id);
  assert.equal(b.name, "Big map");
  assert.equal(b.canvas.nodes.length, 400);
  const again = store.importBoard({ file: "Big map.canvas", canvas: C.compact({ nodes: [{ id: "s", type: "text", x: 0, y: 0, width: 10, height: 10, text: "small" }] }) });
  assert.equal(again.id, id);
  assert.ok(again.replaced);
  assert.equal(store.boards().filter((x) => x.kind === "map").length, 1);
  assert.equal(store.board(id).canvas.nodes.length, 1);
  assert.equal(store.setting("board:" + id + "#1"), undefined, "parts the smaller version doesn't need are dropped");
  store.renameBoard(id, "Renamed");
  assert.equal(store.board(id).name, "Renamed");
  assert.ok(store.board(id).canvas, "renaming keeps the parts");
  store.deleteBoard(id);
  assert.equal(store.board(id), null);
  assert.equal(store.setting("board:" + id + "#0"), undefined);
});

test("store: importing an ecosystem turns its linked cards into top-level goals, keeps them on re-import and matches old ones by name", async () => {
  console.warn = () => {};
  const store = await import("../js/store.js?eco");
  const old = store.saveGoal({ text: "人际关系", tag: "", span: "north", due: "", done: "" });
  const child = store.saveGoal({ text: "See friends every two weeks", tag: "", span: "month", due: "2026-11", done: "", up: old });
  const first = store.importBoard({ kind: "eco", file: "破局侧重.canvas", canvas: C.compact(ECO) });
  const b = store.board(first.id);
  assert.equal(b.kind, "eco");
  assert.equal(b.name, "破局侧重");
  assert.equal(b.goals.a1b2c3d4e5f60003, old, "an existing top-level goal with the same name is reused, so what hangs under it stays");
  const north = () => store.goals().filter((g) => g.span === "north");
  assert.deepEqual(north().map((g) => g.text).sort(), ["丰富体验", "人际关系", "增长", "稳定生活"].sort());
  assert.equal(store.goals().find((g) => g.id === child).up, old);
  // 在 Obsidian 里改了字再导入：还是那条目标
  const edited = structuredClone(ECO);
  edited.nodes[1].text = "4. 事业增长\nLaser Beam";
  store.importBoard({ kind: "eco", file: "破局侧重.canvas", canvas: C.compact(edited) });
  assert.equal(store.boards().filter((x) => x.kind === "eco").length, 1);
  const grow = store.goals().find((g) => g.id === b.goals.a1b2c3d4e5f60002);
  assert.equal(grow.text, "事业增长", "renamed in place");
  assert.equal(north().length, 4);
  // 另一种侧重（Obsidian 里复制出来的，块的 id 一样）：用的是同一批目标
  const second = store.importBoard({ kind: "eco", file: "扎根侧重.canvas", canvas: C.compact(edited) });
  assert.deepEqual(store.board(second.id).goals, store.board(first.id).goals);
  assert.equal(north().length, 4);
  store.deleteBoard(second.id);
  assert.equal(north().length, 4, "removing a diagram keeps its goals");
});

// 打开时看哪里（2026-11-26：导进来字自动变小、看不清）
test("a board that fits without shrinking opens whole; a bigger one opens at 100% on its middle", () => {
  const small = C.openView(800, 500, 1200, 750);
  assert.equal(small.k, 1.25);   // 小的照旧放大到最多 125%
  const exact = C.openView(1200, 600, 1200, 750);
  assert.equal(exact.k, 1);
  const big = C.openView(1641, 503, 1200, 750);   // 一块横着很长的
  assert.deepEqual(big, { k: 1, tx: (1200 - 1641) / 2, ty: (750 - 503) / 2 });
  // 「整块放得下」照旧能缩得很小
  assert.ok(C.fitView(1641 * 10, 503, 1200, 750).k < 0.1);
  assert.ok(C.fitView(1e6, 1e6, 1200, 750).k >= 0.08);
});

test("cards taller here than in Obsidian grow, and the lines follow the new size", () => {
  const cv = { nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 100, height: 60 }, { id: "g", type: "group", x: -20, y: -20, width: 300, height: 200 }, { id: "b", type: "text", x: 0, y: 200, width: 100, height: 60 }], edges: [] };
  assert.equal(C.withHeights(cv, {}), cv);
  assert.equal(C.withHeights(cv, { a: 40 }), cv, "never shrinks");
  const g = C.withHeights(cv, { a: 92.4, g: 500 });
  assert.equal(g.nodes[0].height, 93);
  assert.equal(g.nodes[1].height, 200, "groups keep their size");
  assert.equal(g.nodes[2], cv.nodes[2]);
  assert.equal(C.anchor(g.nodes[0], "bottom").y, 93);
  assert.equal(cv.nodes[0].height, 60, "the stored board is untouched");
});
