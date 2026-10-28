// 截图看样子：一条命令起本地网页（tools/serve.mjs）和假表格（tools/fake-sheet.mjs），用 Playwright 按下面 SHOTS 的清单截图，
// 手机 390×844、电脑 1440×900（再加一个拉窄的 1000×760），白天、夜里各一套；截完打印图在哪、控制台报了什么错、手机上看得见的输入框有没有不到 16px 的（iPhone 一点就放大）。
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

// 先用全局装的（npx playwright install 下载的浏览器跟的是它的版本）；没有再找项目里 / 上面几层目录里的
// （上层目录里别的工具带的 Playwright 版本可能对不上已经下载的浏览器）
function playwright() {
  const require = createRequire(import.meta.url);
  try { return require(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright")); } catch { /* 没有全局装 */ }
  try { return require("playwright"); } catch { /* 也没有 */ }
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
// 悬停：页面刚重画、换页的过渡还在跑时，第一次 hover 可能不算数（截出来没有线）。先把鼠标挪开再挪回来；
// Projects 页的连线要等 .lk-svg 里真的有线了（最多 3 秒）才开始算 wait，没等到也照截
const hover = (sel, wait = 700) => async (page) => {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(60);
  await page.locator(sel).first().hover();
  if (await page.locator(".projects").count()) {
    try { await page.waitForSelector(".lk-svg .lk", { timeout: 3000 }); }
    catch { await page.mouse.move(2, 2); await page.locator(sel).first().hover(); }
  }
  await page.waitForTimeout(wait);
};
// Projects 页：悬停 from，从冒出来的小圆圈拖到 to 上面（不松手，截的是拖着的样子）
const dragLink = (from, to) => async (page) => {
  await page.locator(from).first().hover();
  await page.waitForTimeout(500);
  const h = await page.locator(".lk-h.on").boundingBox(), t = await page.locator(to).first().boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(h.x + (t.x + t.width / 2 - h.x) * i / 12, h.y + (t.y + t.height / 2 - h.y) * i / 12); await page.waitForTimeout(16); }
  await page.waitForTimeout(300);
};
// 记账的图：点一下 House 那块上面（图的中间、上面四分之一处）= 只看 House 以外
async function tapChartAbove(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.25);
  await page.waitForTimeout(500);
}
// 手机：从今天页顶上往下拉（island.js 也认鼠标），拉过线松手
async function pullLedger(page) {
  await page.mouse.move(195, 140);
  await page.mouse.down();
  for (let y = 150; y <= 330; y += 15) { await page.mouse.move(195, y); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(1400);
}
// 拉到一半停住（不松手）截拉的样子；release = 松手后等 wait 毫秒再截（截落下来那一下）
const pullTo = (dy, release = false, wait = 0) => async (page) => {
  await page.mouse.move(195, 140);
  await page.mouse.down();
  for (let y = 150; y <= 140 + dy; y += 10) { await page.mouse.move(195, y); await page.waitForTimeout(16); }
  await page.waitForTimeout(250);
  if (release) { await page.mouse.up(); await page.waitForTimeout(wait); }
};
const SHOTS = [
  { device: "phone", name: "today", hash: "today" },
  { device: "phone", name: "today-open", hash: "today", act: tap(".row .task") },
  // 加任务那一排点「项目」小签：从它那里长出来的下拉
  { device: "phone", name: "today-pick", hash: "today", act: async (page) => { await page.locator('.dayview form[data-add] input[name="title"]').first().click(); await page.waitForTimeout(300); await tap(".dayview form[data-add] .pj-pick")(page); } },
  { device: "phone", name: "pull-short", hash: "today", act: pullTo(50) },
  { device: "phone", name: "pull-armed", hash: "today", act: pullTo(115) },
  { device: "phone", name: "pull-falling", hash: "today", act: pullTo(115, true, 150) },
  { device: "phone", name: "ledger", hash: "today", act: pullLedger },
  { device: "phone", name: "ledger-open", hash: "today", act: async (page) => { await pullTo(115, true, 330)(page); } },
  { device: "phone", name: "ledger-scroll", hash: "today", act: async (page) => { await pullLedger(page); const b = await page.locator(".mn-phone .mn-list").boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + 60); for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 140); await page.waitForTimeout(16); } await page.waitForTimeout(70); } },
  // 记一笔：今天页加任务那一块右下角的 Spend（记账面板里已经没有那个按钮了），升起来的就是记账里那张
  { device: "phone", name: "today-spend", hash: "today", act: async (page) => { await tap(".dayview .add-spend")(page); await page.waitForTimeout(300); } },
  { device: "phone", name: "ledger-add", hash: "today", act: async (page) => { await tap(".dayview .add-spend")(page); for (const k of ["1", "2", ".", "5", "+", "8"]) await tap('.mn-phone [data-k="' + k + '"]')(page); } },
  { device: "phone", name: "ledger-past", hash: "today", act: async (page) => { await pullLedger(page); await tap('.mn-phone [data-act="prev"]')(page); await page.waitForTimeout(700); await tap('.mn-phone [data-act="prev"]')(page); await page.waitForTimeout(900); } },
  { device: "phone", name: "ledger-day", hash: "today", act: async (page) => { await pullLedger(page); await tap('.mn-phone [data-seg="mode"] [data-v="day"]')(page); await page.waitForTimeout(700); await tap('.mn-phone [data-act="prev"]')(page); await page.waitForTimeout(900); } },
  { device: "phone", name: "ledger-chart", hash: "today", act: async (page) => { await pullLedger(page); await tap('.mn-phone [data-act="chart"]')(page); await page.waitForTimeout(600); } },
  { device: "phone", name: "ledger-chart-rest", hash: "today", act: async (page) => { await pullLedger(page); await tap('.mn-phone [data-act="chart"]')(page); await page.waitForTimeout(600); await tapChartAbove(page, ".mn-phone .mn-chart"); } },
  { device: "phone", name: "ledger-chart-year", hash: "today", act: async (page) => { await pullLedger(page); await tap('.mn-phone [data-act="chart"]')(page); await page.waitForTimeout(600); await tap('.mn-phone [data-seg="cmode"] [data-v="year"]')(page); await page.waitForTimeout(900); } },
  { device: "phone", name: "ledger-chart-year-rest", hash: "today", act: async (page) => { await pullLedger(page); await tap('.mn-phone [data-act="chart"]')(page); await page.waitForTimeout(600); await tap('.mn-phone [data-seg="cmode"] [data-v="year"]')(page); await page.waitForTimeout(900); await tapChartAbove(page, ".mn-phone .mn-chart"); } },
  { device: "phone", name: "ledger-cats", hash: "today", act: async (page) => { await pullLedger(page); await tap('.mn-phone [data-act="set"]')(page); await tap('.mn-phone [data-sub="cats"]')(page); } },
  { device: "desk", name: "today", hash: "today" },
  { device: "desk", name: "today-hover", hash: "today", act: hover(".today-main .row:not(.open) .task") },
  { device: "desk", name: "today-open", hash: "today", act: tap('.today-main .row.plan[data-plan="seed-b2"] .task') },
  { device: "desk", name: "calendar", hash: "calendar" },
  { device: "desk", name: "calendar-month", hash: "calendar", act: tap('.calendar [data-act="cal-mode"][data-mode="month"]') },
  // Pool 关着：计划那一张只写名字、日期后面不写小时，停上去展开成一行一项（开着的样子就是上面两张）。关着的状态留在这台设备上，后面没有日历的图了
  { device: "desk", name: "calendar-closed", hash: "calendar", act: async (page) => { await page.evaluate(async () => (await import("/js/store.js")).setLocal({ pool: false, calMode: "week" })); await page.waitForTimeout(600); } },
  { device: "desk", name: "calendar-closed-hover", hash: "calendar", act: hover(".calendar .ev.blk", 500) },
  { device: "desk", name: "calendar-month-closed", hash: "calendar", act: async (page) => { await page.evaluate(async () => (await import("/js/store.js")).setLocal({ pool: false, calMode: "month" })); await page.waitForTimeout(600); } },
  { device: "desk", name: "projects", hash: "projects" },
  { device: "desk", name: "projects-hover", hash: "projects", act: hover('.goals .gl[data-goal="t1"] .gt', 1600) },
  { device: "desk", name: "projects-hover-plan", hash: "projects", act: hover('.pcard[data-project="seed-b2"] .ls-l', 1600) },
  { device: "desk", name: "projects-drag", hash: "projects", act: dragLink('.goals .gl[data-goal="q2"] .gt', '.pcard[data-project="seed-port"] .ls-l') },
  // 计划的编辑框：Pool 按分区列，点一项展开
  { device: "desk", name: "projects-plan", hash: "projects", act: async (page) => { await tap('.pcard[data-project="seed-b2"] .pname')(page); await page.waitForTimeout(300); await tap(".project-editor .ls-it")(page); } },
  { device: "desk", name: "projects-edit-goal", hash: "projects", act: tap('.goals .gl[data-goal="q1"] .gt') },
  { device: "desk", name: "projects-add-goal", hash: "projects", act: async (page) => { await hover('.goals [data-col="next"] h4', 300)(page); await tap('.goals [data-col="next"] .gplus')(page); await page.keyboard.type("Run 10k #Fitness"); } },
  { device: "desk", name: "projects-hover-north", hash: "projects", act: hover('.goals .ns-g[data-goal="n2"]', 1600) },
  { device: "desk", name: "projects-north-edit", hash: "projects", act: async (page) => { await tap('.goals .ns-g[data-goal="n2"]')(page); await page.keyboard.press("Control+End"); await page.keyboard.type(" Write every week.", { delay: 5 }); await page.keyboard.down("Shift"); for (let i = 0; i < 17; i++) await page.keyboard.press("ArrowLeft"); await page.keyboard.up("Shift"); await page.waitForTimeout(200); } },
  { device: "desk", name: "projects-ideas", hash: "projects", act: tap('.goals [data-act="rail-tab"][data-v="ideas"]') },
  // 往期：最底下那一行点开（上个月、上一季过期的目标都在这里）。上一张切到了 Ideas（记在这台设备上），先切回 Goals
  { device: "desk", name: "projects-past", hash: "projects", act: async (page) => { await tap('.goals [data-act="rail-tab"][data-v="goals"]')(page); await page.locator('.goals [data-act="past-toggle"]').first().scrollIntoViewIfNeeded(); await tap('.goals [data-act="past-toggle"]')(page); await page.locator(".goals .gpast").first().scrollIntoViewIfNeeded(); await page.waitForTimeout(200); } },
  { device: "desk", name: "plan-editor", hash: "projects", act: tap('.pcard[data-project="seed-b2"] .pname') },
  { device: "desk", name: "stats", hash: "stats" },
  // 点饼图里 Build 那一片（图例那一行也一样）：整页只看 Build、按计划拆开，饼图底下出 Clear
  { device: "desk", name: "stats-pick", hash: "stats", act: tap(".stats .pie-li") },
  { device: "desk", name: "spending", hash: "spending" },
  { device: "desk", name: "spending-add", hash: "spending", act: async (page) => { await page.keyboard.press("n"); await page.waitForTimeout(300); await page.keyboard.type("12.5+8"); await page.keyboard.press("Tab"); } },
  { device: "desk", name: "spending-edit", hash: "spending", act: tap(".spend .sp-row:nth-child(3)") },
  { device: "desk", name: "spending-filter", hash: "spending", act: async (page) => { await tap(".spend .sp-cat:nth-child(2)")(page); await page.mouse.move(5, 5); await page.waitForTimeout(200); } },
  { device: "desk", name: "spending-search", hash: "spending", act: async (page) => { await page.keyboard.press("/"); await page.keyboard.type("coffee"); await page.waitForTimeout(300); } },
  { device: "desk", name: "spending-year", hash: "spending", act: async (page) => { await tap('.spend [data-seg="mode"] [data-v="year"]')(page); await page.waitForTimeout(900); } },
  // 点 House 上面那块：只看 House 以外（月、年各一张）
  { device: "desk", name: "spending-rest", hash: "spending", act: async (page) => { await page.waitForTimeout(400); await tapChartAbove(page, ".spend .mn-chart"); await page.mouse.move(5, 5); } },
  { device: "desk", name: "spending-year-rest", hash: "spending", act: async (page) => { await tap('.spend [data-seg="mode"] [data-v="year"]')(page); await page.waitForTimeout(900); await tapChartAbove(page, ".spend .mn-chart"); await page.mouse.move(5, 5); } },
  { device: "desk", name: "spending-set", hash: "spending", act: async (page) => { await tap('.spend [data-act="set"]')(page); await tap('#modal [data-sact="tab"][data-v="cats"]')(page); } },
  { device: "desk", name: "reading", hash: "reading", act: seedReading },
  { device: "desk", name: "reading-add", hash: "reading", act: async (page) => { await seedReading(page); await page.locator(".yl-in").click(); await page.waitForTimeout(300); } },
  { device: "desk", name: "settings", hash: "settings" },
  // 记一笔、回车：那一行收起来（提示条在底下）
  { device: "desk", name: "spending-added", hash: "spending", act: async (page) => { await page.keyboard.press("n"); await page.waitForTimeout(300); await page.keyboard.type("12.5"); await page.keyboard.press("Enter"); await page.waitForTimeout(600); } },
  // 侧栏收起来：当前页右边那道青柠竖条。放在电脑这一组最后（收起来是记在这台设备上的，后面的图都会跟着收起）
  { device: "desk", name: "sidebar-min", hash: "projects", act: async (page) => { await page.evaluate(async () => (await import("/js/store.js")).setLocal({ sideMin: true })); await page.waitForTimeout(600); } },
  { device: "small", name: "projects", hash: "projects" },
  { device: "small", name: "spending", hash: "spending" },
  { device: "small", name: "spending-add", hash: "spending", act: async (page) => { await page.keyboard.press("n"); await page.waitForTimeout(300); await page.keyboard.type("12.5"); } }
];
// 阅读页：连上假的阅读表格，右边「Rest of 今年」放四条（其中一条在假表格里已经记过看完，会被划掉；一条是去年加的）
async function seedReading(page) {
  await page.evaluate(async () => {
    const store = await import("/js/store.js"), sync = await import("/js/sync.js"), y = Number(store.today().slice(0, 4));
    if (!store.setting("reading")?.url) store.setSetting("reading", { url: "https://docs.google.com/spreadsheets/d/FAKE-READING-0000000000000000/edit" });
    if (!store.readPlan().length) {
      store.addReadPlan({ title: "Dune", tab: "Book" }, y);
      store.addReadPlan({ title: "The Last Days Of Socrates", tab: "Book" }, y);
      store.addReadPlan({ title: "Klara and the Sun", tab: "Book" }, y - 1);
      store.addReadPlan({ title: "A very long title of a book that will not fit on one line in this narrow column" }, y);
    }
    await sync.sync();
  });
  await page.reload();
  await page.waitForTimeout(1500);
}
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  small: { viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 }   // 窗口拉窄的电脑：看窄的排法
};

// 记账：最近五个月像样的一份（每天吃饭、隔三岔五的交通咖啡、月初房租、半个月一次工资），加一个预算——记账的数据只在这台设备上（不走假表格），
// 直接用页面里的 spend.js 记进去。用固定的种子，每次截出来一样
async function seedSpending(page) {
  await page.evaluate(async () => {
    const SP = await import("/js/spend.js"), T = (await import("/js/store.js")).today();
    const [y, m, d] = T.split("-").map(Number), day = (k) => new Date(Date.UTC(y, m - 1, d - k)).toISOString().slice(0, 10);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const rows = [];
    for (let k = 150; k >= 0; k--) {
      const date = day(k), dd = Number(date.slice(8));
      if (dd === 1) rows.push({ d: date, v: -145000, c: "House", n: "rent" });
      if (dd === 1 || dd === 15) rows.push({ d: date, v: 240000, c: "Salary", n: "" });
      rows.push({ d: date, v: -Math.round(800 + rnd() * 2400), c: "Food", n: ["lunch", "groceries", "dinner", "", "bakery"][Math.floor(rnd() * 5)] });
      if (rnd() < 0.5) rows.push({ d: date, v: -330, c: "Traffic", n: "presto" });
      if (rnd() < 0.3) rows.push({ d: date, v: -Math.round(450 + rnd() * 300), c: "Drink", n: "coffee" });
      if (rnd() < 0.08) rows.push({ d: date, v: -Math.round(2000 + rnd() * 6000), c: "Entertainment", n: "" });
      if (rnd() < 0.04) rows.push({ d: date, v: -Math.round(3000 + rnd() * 9000), c: "Clothes", n: "" });
      if (rnd() < 0.03) rows.push({ d: date, v: -Math.round(1500 + rnd() * 4000), c: "Health", n: "pharmacy" });
      if (rnd() < 0.03) rows.push({ d: date, v: Math.round(5000 + rnd() * 20000), c: "Extra", n: "" });
    }
    // 提前记下的（日期还没到，upcoming）：三天后的一张票、下个月一号的房租——柱子照常画
    rows.push({ d: day(-3), v: -6800, c: "Entertainment", n: "concert" }, { d: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), v: -145000, c: "House", n: "rent" });
    SP.addMany(rows);
    SP.setBudgets([{ from: day(150).slice(0, 7), v: 358000 }]);
  });
}

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
    for (const device of ["phone", "desk", "small"]) {
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
      await seedSpending(page);
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
