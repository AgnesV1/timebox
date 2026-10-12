// 离线清单（sw.js 的 SHELL）是手写的：新加的模块忘了写进去，没网时那一页就是白的。这里对一遍：
// 页面用到的每个文件都在清单里，清单里的每一项磁盘上都有。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const shell = JSON.parse(/const SHELL = (\[[\s\S]*?\]);/.exec(src)[1]);
const ls = (dir, ext) => (fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(ext)).map((f) => dir + "/" + f) : []);

test("every module, the stylesheet and the fonts are in the offline list", () => {
  const need = [...ls("js", ".js"), ...ls("js/ui", ".js"), ...ls("js/store", ".js"), ...ls("css", ".css"), ...ls("fonts", ".woff2")];
  assert.ok(need.length > 30);
  assert.deepEqual(need.filter((f) => !shell.includes(f)), []);
});

test("everything in the offline list exists", () => {
  assert.deepEqual(shell.filter((f) => f !== "./" && !fs.existsSync(path.join(root, f))), []);
});
