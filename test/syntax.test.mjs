// 页面用的每个模块都能被解析（界面模块在 node 里跑不起来，至少保证没有语法错，免得上线后整页空白）
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = ["js", "js/ui"].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith(".js")).map((f) => path.join(d, f)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kzd-syntax-"));

test("every page module parses", () => {
  assert.ok(files.length > 10);
  for (const f of files) {
    const copy = path.join(tmp, f.replace(/[\\/]/g, "_") + ".mjs");
    fs.copyFileSync(path.join(root, f), copy);
    try { execFileSync(process.execPath, ["--check", copy], { stdio: "pipe" }); }
    catch (e) { assert.fail(f + ": " + String(e.stderr).split("\n").find((l) => l.includes("Error")) ); }
  }
});
