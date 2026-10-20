// 截图看样子：一条命令起本地网页（tools/serve.mjs）和假表格（tools/fake-sheet.mjs），用 Playwright 按下面 SHOTS 的清单截图，
// 手机 390×844、电脑 1440×900，白天、夜里各一套；截完打印图在哪、控制台报了什么错、手机上看得见的输入框有没有不到 16px 的（iPhone 一点就放大）。
//   node tools/look.mjs                     全部
//   node tools/look.mjs --only today,stats  只截名字里带这几个词的
//   node tools/look.mjs --worst             假表格里多造一份极端数据（很长的名字、一栏一堆目标、大金额……），见 tools/fake-sheet.mjs
//   node tools/look.mjs --out ./shots       图放哪（默认系统临时目录）
// 要先装 Playwright（npm i -g playwright，再 npx playwright install chromium）。Claude 的云端环境里已经装好了。
import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : ""; };
const has = (name) => process.argv.includes(name);
const WEB = Number(process.env.LOOK_PORT) || 8010, SHEET = Number(process.env.FAKE_PORT) || 8012;
const only = arg("--only").split(",").map((s) => s.trim()).filter(Boolean);
const out = path.resolve(arg("--out") || fs.mkdtempSync(path.join(os.tmpdir(), "look-")));
fs.mkdirSync(out, { recursive: true });

function playwright() {
  const require = createRequire(import.meta.url);
  try { return require("playwright"); } catch { /* 不在这个项目里：看全局装的 */ }
  try { return require(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright")); } catch { /* 也没有 */ }
  console.error("Playwright isn't installed. npm i -g playwright && npx playwright install chromium");
  process.exit(1);
}

const kids = [];
function start(file, args, env) {
  const p = spawn(process.execPath, [path.join(root, file), ...args], { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  p.stderr.on("data", (b) => process.stderr.write(b));
  kids.push(p);
  return p;
}
async function up(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("didn't come up: " + url);
}
const stop = () => kids.forEach((p) => p.kill());
process.on("exit", stop);

// ---------- 截哪些 ----------
// device: phone / desk；hash: 打开哪一页；act(page)：截之前做点什么（悬停、点开、拉下来）。截不到的（还没这个界面）跳过，最后列出来
const tap = (sel) => async (page) => { await page.locator(sel).first().click(); await page.waitForTimeout(500); };
const hover = (sel) => async (page) => { await page.locator(sel).first().hover(); await page.waitForTimeout(700); };
// 手机：从今天页顶上往下拉（island.js 也认鼠标），拉过线松手
async function pullLedger(page) {
  await page.mouse.move(195, 140);
  await page.mouse.down();
  for (let y = 150; y <= 330; y += 15) { await page.mouse.move(195, y); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(1400);
}
const SHOTS = [
  { device: "phone", name: "today", hash: "today" },
  { device: "phone", name: "today-open", hash: "today", act: tap(".row .task") },
  { device: "phone", name: "ledger", hash: "today", act: pullLedger },
  { device: "phone", name: "ledger-chart", hash: "today", act: async (page) => { await pullLedger(page); await tap('.mn-phone [data-act="chart"]')(page); await page.waitForTimeout(600); } },
  { device: "phone", name: "ledger-cats", hash: "today", act: async (page) => { await pullLedger(page); await tap('.mn-phone [data-act="set"]')(page); await tap('.mn-phone [data-sub="cats"]')(page); } },
  { device: "desk", name: "today", hash: "today" },
  { device: "desk", name: "today-hover", hash: "today", act: hover(".today-main .row:not(.open) .task") },
  { device: "desk", name: "calendar", hash: "calendar" },
  { device: "desk", name: "projects", hash: "projects" },
  { device: "desk", name: "projects-hover", hash: "projects", act: hover(".goals .gl .gt") },
  { device: "desk", name: "stats", hash: "stats" },
  { device: "desk", name: "spending", hash: "spending" },
  { device: "desk", name: "spending-drawer", hash: "spending", act: tap(".mn-desk [data-act=drawer]") },
  { device: "desk", name: "settings", hash: "settings" }
];
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
};

// 大金额、很长的分类名：记账的数据只在这台设备上（不走假表格），直接用页面里的 spend.js 记进去
async function seedWorstSpending(page) {
  await page.evaluate(async () => {
    const SP = await import("/js/spend.js"), T = (await import("/js/store.js")).today();
    const cats = SP.cats();
    if (!cats.some((c) => c.name.length > 20)) SP.setCats([...cats, { name: "Professional development & certification fees", kind: "out", hidden: false, role: "" }]);
    SP.addMany([
      { d: T, v: -12345678, c: "House", n: "rent + deposit + the whole year of insurance paid at once" },
      { d: T, v: -2315, c: "Food", n: "午饭 lunch with a very long note that keeps going" },
      { d: T, v: -88000, c: "Professional development & certification fees", n: "" },
      { d: T, v: 1250000, c: "Salary", n: "" }
    ]);
  });
}

async function main() {
  const worst = has("--worst");
  start("tools/fake-sheet.mjs", [], { FAKE_PORT: String(SHEET), FAKE_WORST: worst ? "1" : "" });
  start("tools/serve.mjs", [".", String(WEB)]);
  await up("http://127.0.0.1:" + SHEET + "/exec");
  await up("http://127.0.0.1:" + WEB + "/index.html");
  const { chromium } = playwright();
  const browser = await chromium.launch();
  const shots = SHOTS.filter((s) => !only.length || only.some((w) => (s.device + "-" + s.name).includes(w)));
  const made = [], skipped = [], errors = [], small = [];
  for (const theme of ["light", "dark"]) {
    for (const device of ["phone", "desk"]) {
      const mine = shots.filter((s) => s.device === device);
      if (!mine.length) continue;
      const ctx = await browser.newContext(DEVICES[device]);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(device + "/" + theme + ": " + e.message));
      page.on("console", (m) => { if (m.type() === "error") errors.push(device + "/" + theme + ": " + m.text()); });
      // 连上假表格、整表拉一遍，再定白天 / 夜里（themeHold = 点过日月），重开一次让第一笔就画对
      await page.goto("http://127.0.0.1:" + WEB + "/index.html#today");
      await page.evaluate(async ({ url, theme }) => {
        const store = await import("/js/store.js"), sync = await import("/js/sync.js");
        store.setLocal({ url, secret: "CHANGE_ME", serverVersion: 0, themeHold: { v: theme, until: Date.now() + 6 * 3600e3 } });
        await sync.sync({ full: true });
      }, { url: "http://127.0.0.1:" + SHEET + "/exec", theme });
      if (worst) await seedWorstSpending(page);
      for (const s of mine) {
        await page.goto("http://127.0.0.1:" + WEB + "/index.html#" + s.hash);
        await page.reload();
        await page.waitForTimeout(1200);
        try { if (s.act) await s.act(page); }
        catch (e) { skipped.push(device + "-" + s.name + " (" + String(e.message).split("\n")[0] + ")"); continue; }
        const file = path.join(out, device + "-" + theme + "-" + s.name + ".png");
        await page.screenshot({ path: file });
        made.push(file);
        if (device === "phone") {
          const tiny = await page.evaluate(() => [...document.querySelectorAll("input, textarea, select")]
            .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && !["checkbox", "radio", "range", "color"].includes(el.type))
            .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
            .map((el) => (el.className || el.tagName.toLowerCase()) + (el.placeholder ? " “" + el.placeholder + "”" : "")));
          tiny.forEach((x) => small.push(s.name + ": " + x));
        }
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(made.join("\n"));
  if (skipped.length) console.log("\nSkipped:\n  " + [...new Set(skipped)].join("\n  "));
  if (small.length) console.log("\nInputs under 16px on the phone (iPhone zooms in when they get focus):\n  " + [...new Set(small)].join("\n  "));
  if (errors.length) console.log("\nConsole errors:\n  " + [...new Set(errors)].join("\n  "));
  stop();
}

main().catch((e) => { console.error(e); stop(); process.exit(1); });
