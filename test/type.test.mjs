// 字的两条规矩（2026-11-23，照 hallmark 的底线收的），新加样式时别又写回去：
// 1. 小标签不用全大写、不拉字距：正常大小写，比正文小一档，600。
// 2. app.css 的正文字号只用 11 / 12.5 / 14 / 16 / 18 / 20 这六档。
//    不算正文的照旧：emoji 和符号按钮、图表里的小刻度（SVG 里带 fill 的）、年视图格子里的数字、22px 起的大数字。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const css = (f) => fs.readFileSync(path.join(root, "css", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const SCALE = [11, 12.5, 14, 16, 18, 20];
const GLYPH = [".em-pick > .chip", ".vibe", ".fmark", ".fname-row .fmark", ".gem {", ".pj-rail .idea-add .idea-kinds > .chip", ".yl-x", ".dk-x", "body.phone .tm-x", "body.phone .wchip button", ".gstar", ".offday-t", ".gplus {", ".st-q {", ".ls-cb {", ".yr-d {", ".yr-wd", ".hhead i", ".typ-lab", ".sun .hours text"];

test("labels are never in tracked capitals", () => {
  for (const f of ["app.css", "money.css"]) {
    const hits = css(f).split("\n").filter((l) => /text-transform:\s*uppercase|font-variant(-caps)?:\s*(all-)?small-caps/.test(l));
    assert.deepEqual(hits, [], f + ": write the label in sentence case instead");
  }
});

test("app.css sets text in six sizes only", () => {
  const off = [];
  for (const line of css("app.css").split("\n")) {
    const t = line.trim();
    if (GLYPH.some((g) => t.startsWith(g)) || /\bfill:/.test(line)) continue;
    const sizes = [...line.matchAll(/font-size:\s*([0-9.]+)px|font:[^;{}]*?\s([0-9.]+)px(?:\/[0-9.]+(?:px)?)?\s/g)].map((m) => Number(m[1] ?? m[2]));
    for (const n of sizes) if (n < 22 && !SCALE.includes(n)) off.push(n + "px  " + t.slice(0, 70));
  }
  assert.deepEqual(off, [], "pick the nearest of " + SCALE.join(" / ") + "px");
});
