# 苦昼短 UI 待办（给本地 AI 用）

2026-10-20 整理。这份是写给在你自己电脑上跑的 Claude Code（或别的编程 AI）看的。用法：一次交给它一条，比如「照 TODO.md 第 3 条做」，它就按条目里写的做。
每一条都写了这几样：要做什么、为什么、相关文件、步骤、做完的标准、怎么验证。做完一条，在标题前面打 ✅，写上日期和提交号。
第 0 条每次都要先做。第 7 条是 2026-10 那一轮（流光线、记账网页版、Projects 右栏、阅读右框、手机帷幕）推迟下来的事。

## 0. 每条开始前：准备好、记住规矩
**准备**
- Node 20 以上。Playwright 要自己装（云端是预装的，本地没有）：`npm i -g playwright && npx playwright install chromium`
- 拉最新的 main，从它开一个新分支再改
- 看效果：
  - `node tools/look.mjs` 一条命令起本地网页和假表格，按清单截图：手机 390×844、电脑 1440×900、窄电脑 1000×760，白天、夜里各一套
  - `--only 名字` 只截名字里带这几个词的；`--worst` 换成极端数据（很长的名字、一栏一堆目标、大金额）；`--out 目录` 指定图放哪
  - 截完会打印图在哪、控制台有没有报错、手机上有没有小于 16px 的输入框。**每张图都要打开看**，不能只看打印出来的结果
- 测试：`node --test test/*.test.mjs`，提交前必须全过
- 手动点一点：`node tools/serve.mjs .`（http://127.0.0.1:8000）配 `node tools/fake-sheet.mjs`（假的 Google 表格，用法写在文件开头）

**规矩**
- 界面上的字用英文，代码注释用中文，提交说明用英文
- 新加的 JS 文件要写进 `sw.js` 的 `SHELL`（`test/sw.test.mjs` 会查）；改了网页用到的文件，`sw.js` 的 `CACHE` 版本号加一，不然手机上一直是旧的
- `Code.gs` 里的 `SECRET = 'CHANGE_ME'` 不要改
- North star 那一栏在仓库主人心里另有一个名字，只存在主人自己的表格里。仓库里（代码、文档、提交说明）一律写 North star
- 设计上以 `css/app.css` 开头那段注释、`css/money.css` 开头那段注释为准（做完第 2 条以后以 DESIGN.md 为准）。别的设计 skill 说的和它冲突时，听它的

## 1. 真机检查（要人来做，AI 负责准备和记录）
**为什么**：截图只看得到样子，手感、流畅不流畅、iPhone 会不会把页面放大，只有真机上才知道。

**步骤**
1. 最省事的是用上线后的网址（GitHub Pages）试。要在合并前试的话：
   - 给 `tools/serve.mjs` 加一个 `HOST` 环境变量，默认还是 `127.0.0.1`
   - 用 `HOST=0.0.0.0 node tools/serve.mjs .` 起网页，手机和电脑连同一个 Wi-Fi，手机打开 `http://电脑的IP:8000`
   - 局域网的 http 不是安全来源，service worker 不会生效，这不影响检查
2. 把下面的清单抄进一个检查记录，一项项问仓库主人，结果写回这一条。

**iPhone 清单**
- 今天页滚在最顶上，从屏幕上面那一截往下拉记账：
  - 拉大约 90px 才开；往下甩一下也开；拉着往回推就取消
  - 水滴落下，接着面板像幕布一样落下，停在屏幕约 94% 高（落下时有一点回弹）
- 面板开着：
  - 上下滑流水时，下摆的褶子会跟着摆一下再停稳；滑得越快摆得越大，但不会晃得让人晕
  - 点底下露出的那一小条今天页，幕布拉起来收回去
- 点这些输入框，页面不该放大：Why?、Details、记账的备注 / 搜索 / 分类改名
- 系统设置里打开「减弱动态效果」：不摆、不弹，只淡入淡出

**Mac 清单**
- 备餐页的 Big buys：触控板左右划能开关，浏览器不会当成「后退」
- Spending 页：按 N 展开记一笔那一行，按 / 跳到搜索
- Projects 页：鼠标停在计划卡上，流光线流得顺不顺
  - 打开 Chrome 的 Performance 面板录 5 秒，悬停的那几秒里每帧的 Paint 应该在 4ms 以内
  - 超了就把同时带流光的线数从 24 往下调（`js/ui/links.js` 里的 `STREAKS`）
- 阅读页：右边的框拖顺序、Alt+↑↓ 挪顺序都好用

**做完的标准**：清单每一项都有结论（好 / 不好 + 一句话）。不好的，各开一条新待办写在第 7 条里。

## 2. 把设计规则写成 DESIGN.md
**为什么**：以后用别的设计 skill（frontend-design、Impeccable 这些）时，它们会先读需求方给定的设计方向。没有这份文件，它们会按自己的口味把苦昼短的风格「改正」掉，比如把 emoji 类目、霓虹发光、磨砂卡片当成问题。

**来源**
- `css/app.css` 开头的注释：白天「白昼酸」、夜里「夜店」，强调色只有青柠，框能少就少，动物纹表示状态
- `css/app.css` 里的 token（:root 和 `[data-theme="dark"]` 两段），以及 2157 行附近「半透明 50% + 轻磨砂」那段
- `css/money.css` 开头：记账自己的颜色、玻璃、渐进模糊、动效曲线和时长、四档字号
- 记账电脑版（`.mn.spend`）的规则：50% 透明黑的底、一块板里不套框、数字等宽靠右
- 流光线的规则：`js/ui/links.js` 开头的注释、`css/app.css` 里的 `.lk-*`

**步骤**：在仓库根目录写 `DESIGN.md`，分这几节：
1. 原则（五六句话）
2. 颜色和字（token 表：名字、白天的值、夜里的值、用在哪）
3. 组件（页头、分段开关、按钮、卡片、表格、弹层，各写一行「长什么样、什么时候用」）
4. 动效（曲线、时长、弹簧，系统要求减少动态时怎么办）
5. 记账这一套（它和苦昼短哪里一样、哪里不一样）
6. 「设计 skill 不许改的东西」：emoji 类目、磨砂卡片、夜里的霓虹发光、夜里的等宽数字、渐变进度条、手写的中文注释

**做完的标准**：每条规则都能对到一处 CSS（写上选择器）；不写 CSS 里没有的东西。

## 3. 把查细节的几个 skill 放进仓库
**为什么**：这几个 skill 不管风格，只查代码本身看不出来的问题：手机上的手感、极端数据、动效性能，再加一个截图看效果的步骤。

**步骤**
1. `.gitignore` 第 6 行的 `.claude/` 改成 `.claude/*`，下一行加 `!.claude/skills/`。不改的话，放进去的 skill 提交不上去。
2. 从 https://github.com/emilkowalski/skills 拷 `skills/mobile-native`、`skills/break-ui`、`skills/animation-performance` 到 `.claude/skills/` 下，同名目录。每个目录里放一份它的 LICENSE（MIT）。
3. 从 https://github.com/vercel-labs/web-interface-guidelines 拷 `AGENTS.md`（规则清单），放成 `.claude/skills/web-interface-guidelines/SKILL.md`，开头补上 skill 的 frontmatter（name、description）。
   - 删掉这几类规则：React / hydration 相关的；「标题用 Title Case」（苦昼短一直用句首大写）
   - 连同 LICENSE（MIT）
4. 新写 `.claude/skills/look/SKILL.md`，把 `tools/look.mjs` 包成一个 skill：
   - 什么时候用：改了界面以后
   - 怎么跑：参数和第 0 条一样
   - 截哪几张：照 `tools/look.mjs` 里的 `SHOTS`
   - 看图时查什么：左边缘和基线对齐、同一行一样高、长名字有省略、夜里的发光没有糊成一片、手机输入框不小于 16px
5. 这几个 skill 里和苦昼短冲突的地方，在各自的 SKILL.md 最上面加一句「以 DESIGN.md 为准」。冲突的例子：
   - mobile-native 说不要 `touchmove` + `preventDefault`，可下拉记账就靠它
   - mobile-native 说按系统深浅色配 `theme-color`，可苦昼短的日夜跟着钟点走

**做完的标准**：`git status` 里看得到 `.claude/skills/` 下的新文件；在本地 Claude Code 里输入 `/look` 能跑出截图。

## 4. 拖拽要有不用拖的做法（WCAG 2.2 的 2.5.7）
**为什么**：拖拽是唯一做法的地方，触控板不好使、手抖、用键盘的时候就做不了。WCAG 2.2 要求每个拖拽都有一个单击就能完成的替代做法，最好键盘也能做。

**先查一遍现状**：每一处拖拽，看已经有没有别的做法。有的就在这里记一句，没有的就补。
| 拖拽 | 代码 | 现在有没有别的做法 |
|---|---|---|
| 日历里的任务拖到别的日子 / 钟点 | `js/ui/dnd.js`、`js/ui/calendar.js` | 点开任务的编辑框能改日期（要确认有没有改钟点的地方） |
| 任务池的条目、规律计划拖到日历 | `js/ui/dnd.js`、`js/ui/calendar.js` 119–131 行 | 可能没有 |
| 备餐：Box 拖到某天、复制一天、食材拖进 Box | `js/ui/dnd.js` 开头的注释、`js/ui/meals.js` | 要查 |
| 四象限便签拖到别的格 | `js/ui/quads.js` 333 行 | 没有 |
| 手机今天页：按住分钟数上下拖排顺序 | `js/ui/today.js` 514 行 | 没有 |
| Projects 的连线（拖小圆圈） | `js/ui/links.js` | 有：计划编辑框的 Serves、改目标时的 Part of |
| 阅读页右框排顺序 | `js/ui/reading.js` | 有：Alt+↑↓ |

**补的做法**（照苦昼短已有的样子做，别加新的弹层种类）：
- 能拿起来的东西可以用 Tab 选中。按 Enter 出一个小菜单（`js/ui/select.js` 那种）：
  - 任务池的条目：「Put on…」，挑日子和钟点
  - 便签：「Move to」，挑四个象限
  - 手机排顺序：上移 / 下移
- 菜单里的每一项用鼠标单击也能选，这就满足了「单击能完成」。

**做完的标准**：表里每一行的「现在有没有别的做法」都变成「有」；只用键盘能走完每一种操作。

## 5. 弹窗开着时页面重画了，关掉后焦点回不到原来的按钮
**为什么**：`js/ui/modal.js` 打开时记下了点开它的那个元素（`opener`）。弹窗开着的时候页面整页重画（比如同步拉下来新数据），那个元素就被换掉了。关掉以后 `back.isConnected` 是 false，焦点掉到 `body` 上；用键盘的人得从页面最上面重新 Tab。

**步骤**
1. `openModal` 时，除了元素本身，再记一个能重新找到它的描述：它的 `data-act`，加上最近的 `data-id` / `data-project` / `data-goal` / `data-idea`，拼成一个选择器。
2. `closeModal` 时：原来的元素还在页面上就用它；不在了就用这个选择器重新找；都找不到，就把焦点放到 `#main` 的第一个标题上（加 `tabindex="-1"`）。
3. 写一个测试，或者用 Playwright 写一段：打开任务编辑框 → 触发一次重画 → Esc 关掉 → 看 `document.activeElement` 是不是那一行的按钮。

**做完的标准**：上面那段 Playwright 脚本通过；`node --test` 全过。

## 6. 可选：用设计 skill 做一次体检
都不用装进仓库，在本地临时用一次就行，报告写进 `design/`（这个目录不进仓库）：
- Impeccable 的 `audit` 和 `harden`：https://github.com/pbakaus/impeccable 。它的自动检测钩子别开，emoji、玻璃那几条会一直报
- ibelick 的 `improve-ui`（对照 DESIGN.md 找偏差）、`fixing-accessibility`：https://github.com/ibelick/ui-skills
- 报告里说的每一条，先对照 DESIGN.md 看是不是「故意的」，是的就跳过；剩下的再开成新的待办

## 7. 2026-10 那一轮推迟的事
那一轮做了：Projects 右栏（North star 那段字、Goals | Ideas）、斜穿的流光线、记账电脑版的网页排法、阅读页右边「Rest of 今年」、手机记账的帷幕。
下面几条是做的时候看到、但没在那一轮做的。每条都小，可以一条一个提交。

**7a. 用键盘停在目标、计划卡上，也画流光线**
- 为什么：现在只有鼠标停着才画线（`js/ui/links.js` 的 `onMove`），只用键盘的人看不到「这件事是为了什么」。
- 步骤：
  - 监听 `focusin`：焦点落在 `NODE` 里的元素上（目标那一行的 `.gt`、`.ns-g`、计划卡、项目的头）时，和悬停一样调 `open(key, el)`
  - `focusout` 到页面外、或按 Esc 时 `close()`
  - 键盘打开的线不出拖的把手（拖本来就要鼠标）
- 做完的标准：只用 Tab 走到一条目标上，线飞出来、流光在跑；Esc 收起；鼠标悬停的行为不变。

**7b. README 里目标板那一句已经过时**
- `README.md` 59–60 行还写着「最上面是目标板……和之后五年」。目标板现在在右栏，年份是明年起四年再加 North star。
- 上一轮说好这一句不动，所以新的样子写在了它后面。先问仓库主人要不要改；要改的话，只改这一句，别写进 North star 那一栏在主人心里的名字。

**7c. 截图工具：悬停的截图偶尔截不到线**
- 现象：页面刚重画、换页的过渡还在跑的时候，Playwright 的第一次 `hover` 可能不算数，截出来没有线（`tools/look.mjs` 的 `hover`）。
- 改法：`hover` 里先把鼠标移到别处、再移回来；或者等 `.lk-svg .lk` 出现（最多 3 秒）再开始计时截图。
- 做完的标准：`node tools/look.mjs --only projects-hover` 连跑五次，每次都截到线。

**7d. 记账电脑版：在设定里改类别的 base / not in budget**
- 现在只能在记账表格里改（设定弹窗的 Categories 只显示）。
- 在 `js/ui/spending.js` 的 `setBody()` 的 Categories 表里加一列下拉（— / base / not in budget），改了调 `SP.setCats`。改之前先看 `js/spend.js` 里 role 是怎么同步到表格的。
- 做完的标准：改了以后图表的底座、Budget used 跟着变；同步到表格以后再拉下来，值不变。

**7e. Projects 右栏：把目标拖到别的一段改期限**
- 现在要点月份那个按钮才能改期限。想要的是：把一条目标从 This quarter 拖到 Next quarter（或者某一年）就改成那一段的默认期限（`G.columns()` 里每段的 `due`）。
- 注意：
  - 拖目标本身已经用来连线（拖小圆圈）。改期限要拖那一行左边，别和连线的小圆圈冲突
  - 照第 4 条，也要有不用拖的做法（现在的月份下拉就是）
- 做完的标准：拖过去以后那一行出现在新的一段，期限是那一段的默认值，能撤销。

**7f. 量一下流光线的开销，必要时调小**
- `js/ui/links.js` 里 `STREAKS = 24`（最多 24 条线带流光）是估的。照第 1 条在 Mac 上录 Performance：悬停一条连了很多线的目标时，每帧的 Paint 要在 4ms 以内。
- 超了就把 `STREAKS` 调小，或者让流光只在离鼠标近的那几条线上跑。
