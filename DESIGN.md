# 苦昼短 · 设计规则

给人看，也给设计 skill（frontend-design、Impeccable、ui-skills 之类）看：动界面之前先读这一份。这里写的都是 CSS 里已经有的，每条后面是它在哪（选择器 / token）。
这一份和 `css/app.css`、`css/money.css` 开头的注释说的是一回事；三处对不上时以 CSS 为准，再回来改这里。

## 1. 原则

- **两种样子，跟着钟点换**：白天（6–18 点）是「白昼酸」——白底、黑粗描边、硬投影、荧光色块；夜里是「夜店」——黑底霓虹、会发光。对外说「白天酸性霓虹、夜里赛博朋克」。规则在 `js/day.js` 的 `lookAt`，`index.html` 开头那段内联脚本和它一致（`[data-theme="light"]` / `[data-theme="dark"]`）。
- **强调色只有青柠一个**（`--accent`）。要第二种颜色的地方用项目的油画色（图表、侧栏图标），不是新的强调色。例外只有三处，都是她点名的：超级休息日的金条、记账那一套颜色（第 5 节）、Done 时的纸片 / 烟花。
- **框能少就少**：分组从轻到重是 对齐 → 留白 → 标题 → 细线 → 底色 → 细边 → 粗边 + 硬投影，用最轻还看得清的那一级。粗边 + 硬投影（夜里细边 + 内发光）只给三样：每页主内容的卡片、浮在上面的、主按钮。框里不套框。
- **安静**：列表里只有展开的那一行带按钮；次按钮、小签不描边，铺淡底 `--tonal`；成排重复的做成字。拿不准就给安静的那个。
- **透得出天**：卡片、侧栏是半透明的（`--card`），白天轻轻磨砂（`--frost`），夜里不糊（星芒只有一两个像素）。
- **动物纹表示状态**：没做的块 = 斑马纹，部分完成 = 豹纹，做完 = 纯色；夜里 Optional 任务垫一层淡豹纹（`[data-theme="dark"] .row.opt::before`）。

## 2. 颜色和字

| token | 白天 | 夜里 | 用在哪 |
|---|---|---|---|
| `--page` | `#F3F3EE` | `#07070B` | 整页底色（`body`） |
| `--bg` | `#FFFFFF` | `#0C0C13` | 卡片、弹层、输入框的实底；手机宽度下整页底色（灵动岛那一条照它取色） |
| `--surface` / `--surface2` | `#F2F2EE` / `#E8E8E2` | `#15151F` / `#1E1E2B` | 悬停底、展开的那一行、菜单里当前那一项 |
| `--ink` / `--muted` | `#0B0B0B` / `#74747C` | `#F4F4F8` / `#8A8AA2` | 字 / 次要的字 |
| `--line` | `#EBEBE6` | `#1C1C29` | 行与行之间的细线 |
| `--edge` | `#0B0B0B` | `#2C2C3E` | 粗边的颜色（`--b`） |
| `--accent` / `--accent-ink` | `#C6FF00` / `#0B0B0B` | `#CCFF00` / `#0C0C13` | 唯一的强调色：选中、当前、主按钮、进度 |
| `--hot` `--blue` `--warn` `--ok` | `#FF3EA5` `#2F5BFF` `#FF2E55` `#27B35A` | `#FF2BD6` `#00E5FF` `#FF4D6D` `#5CFF9D` | 少量状态：页标题（白天 `--blue`）、过期红、做完绿 |
| `--meter` | 青柠 → 粉 → 蓝 | 青柠 → 冰蓝 → 粉 | 渐变进度条 |
| `--b` / `--b-soft` / `--b-ctl` | 1.5px 墨 / 1.5px `#E2E2DC` / 1px `#CDCDC6` | 1px `--edge` / 1px `#222232` / 同 `--b` | 粗边（主卡片、主按钮）/ 软边（侧栏分隔、输入框）/ 下拉框 |
| `--hard` / `--hard-lg` | `2px 2px 0` 墨 / `3px 3px 0` 墨 | 内发光 / 一圈冰蓝的光 | 硬投影：主卡片、主按钮 / 弹层 |
| `--glow` | 无 | `0 0 14px` 青柠 | 夜里亮着的东西（主按钮、选中的分段） |
| `--card` / `--frost` | 50% 白 / `blur(4px) saturate(140%)` | 50% `--bg` / 无 | 半透明卡片、侧栏（`app.css` 末尾「半透明」那一段） |
| `--tonal` | 6% 墨 | 8% 白 | 次按钮、小签的淡底 |
| `--c-*` / `--k-*` | 图表、圆盘的霓虹色 / 深一档 | 同左（夜里更亮） | 按项目拆开的图 |
| `--r` / `--r-sm` | 14px / 10px | 同 | 圆角 |

项目（大类）的颜色是油画颜料：绿 viridian `#3E8E6E`、蓝 ultramarine `#3F62B5`、橘 cadmium `#E07A2B`、紫 mauve `#8B62AE`、象牙 `#E6DCC3`、棕 burnt sienna `#9A5A36`、赭黄 `#D2A52E`、茜红 `#B5413F`（`js/groups.js` 的 `PALETTE`）。侧栏每一段的图标按这一段的油画色上色（`.sblock a:not(.on) .ic { color: var(--tint) }`）。

字（`fonts/` 里自带，不走 CDN）：
- `--display` = Unbounded：页标题、卡片标题（`.page-head h2` 20px/700、`.phead h1` 17px/700）
- `--body` = Space Grotesk：正文 14px（`body`）
- `--num` = 白天 Space Grotesk、**夜里 JetBrains Mono**（`.num`，等宽数字 `tabular-nums`）
- 界面上的字全是英文，句首大写（不是 Title Case）；她自己写的内容什么语言都行

焦点：`:focus-visible` 白天墨色 2px（青柠在白底上看不见），夜里青柠。

## 3. 组件

- **页头**：电脑 `.page-head`（标题 Unbounded 20px，白天钴蓝 `--blue`，夜里白字带一点光）；手机 `.phead`（贴顶、半透明磨砂，底下一道 3px 青柠 `.phead::after`，顶上安全区那一截是实心 `--bg`）。
- **分段开关**：`.seg`（`--tonal` 药丸底，选中那段 `.seg button.on` 青柠）；有 `.seg-pill` 的，选中的底块从旧的滑到新的（`js/motion.js`）。
- **按钮**：主按钮 `.btn.primary` / `.btn.cta` = 青柠 + `--b` + `--hard`（夜里青柠 + `--glow`），一块区域只放一个；次按钮 `.btn` = 不描边的 `--tonal`；`.icon-btn` 32px 透明，悬停 `--surface`；翻页、Week / Month 这种 `.nav` 平时只有字，`.nav.on` 青柠。
- **小签**：`.chip`（12px/600、`--tonal`，`.chip.on` 青柠；夜里 `.chip.on` 是淡青柠底 + 青柠边 + 光）。emoji 一排挑一个的（`.em-pick`）像表情键盘：不画线，选中那格整块亮。
- **卡片**：每页主内容一张（`.today-main`：`--b`、16px 圆角、`--hard`），铺 `--card` + `--frost`；Stats 各块是不描边不投影的半透明软板。卡里的任务行（`.row`）不上底色，选中 `.row.picked` 是淡青柠，展开 `.row.open` 是一层很淡的墨。
- **表格**：`.mtable`（设定里的）、`.tsheet`、`.gtable`：13px、细线分行，不套框；数字列靠右。
- **输入框**：`input, select, textarea` = `--b-soft`（下拉框 `--b-ctl`）、`--r-sm`、实底 `--bg`；聚焦白天边变墨色，夜里青柠边 + 一圈淡光。手机上输入框不小于 16px（不然 iPhone 一点就放大）。
- **弹层**：`#modal` 背后压一层 32% 的墨 + 3px 磨砂；`.sheet` = `--b`、16px 圆角、`--hard-lg`，一般 480px 宽，`.sheet.wide` 720px。一次只开一个；Esc / 点背景关；关了焦点回到点开它的那个按钮（`js/ui/modal.js`）。
- **下拉菜单**：`.menu`（`js/ui/select.js`，电脑上代替系统的下拉）：`--bg` 实底、`--b-ctl`、12px 圆角、从按钮那里长出来（`menu-in`）。能拖的东西点一下出的「Put on… / Move to…」也是它（`openMenu`）。
- **提示条**：`#toast`，带 Undo；不套框的状态字放在原处，不弹提示。

## 4. 动效

- 曲线：`--ease: cubic-bezier(.22, .9, .28, 1)`；弹簧用 CSS `linear()` 采样（Kinetics 的做法，不用动画库）：`--spring`（劲 400、阻尼 32，约 0.4s，冲过头一点点）、`--spring-pop`（劲 300、阻尼 20，约 0.57s，提示条这种弹得明显一点）。
- 换页、标完一行：View Transitions（`::view-transition-group(*)` 0.3s `--ease`），整页重画时行各自挪过去。
- 换白天夜里：整页淡 2.1s，底边霞光 3s，旧的日月 1.2s 落下去、新的 1.8s 升上来（`html[data-vt="theme"]` 那一段）。日月里面的 svg 在转，按钮本身不转。
- 微动效只动 transform / opacity / 颜色（`app.css`「微动效」那一段）：分段滑块、数字逐位滚、计时浮条边上绕光（`.dock.run::after`）。
- **系统要求减少动态**（`@media (prefers-reduced-motion: reduce)`）：不挪、不转、不弹、不循环，淡入淡出和颜色变化留着（状态变了还看得出来）。**Settings 里关了 Sparkles**（`html.fx-off`）：装饰性的（绕光、星星、纸片烟花、流光）都不放。
- 连线的流光（Projects 页，`js/ui/links.js`、`.lk-*`）：线从悬停的那头飞出去（0.46s `cubic-bezier(.16, 1, .3, 1)`，每条隔 40ms），流光一圈的长短按线长算，长线短线一样快；同时最多 `STREAKS` 条带流光；白天墨色一截 + 粉蓝两截错开（丝网印套色），夜里项目的霓虹色 + 底下一条宽的淡的当光（不用滤镜）。减少动态时不跑流光、轨迹画成实线。

## 5. 记账这一套（`css/money.css`，类名都是 `mn-` / `sp-`）

和苦昼短一样的：字（Space Grotesk、数字 JetBrains Mono）、药丸形的分段开关和按钮、32px 图标按钮、框能少就少（一块板里不套框，只用细线 `--sp-line` 和留白分开）、减少动态时只淡入淡出。

不一样的：
- **不跟日夜走**：手机面板永远纯黑（`.mn { background: #000 }`，像灵动岛）；电脑 Spending 页是 50% 透明的黑 + 磨砂（`.mn.spend`），白天背后再压暗（`brightness(.58)`），字才看得清。
- **自己一套颜色**（她点名的，「只青柠」在这块破例）：钴蓝 `--mn-blue #4C72D8` = 正常、橙 `--mn-orange #EE8A33` = 超了、青绿 `--mn-green #4FB3A9` = 收入；主按钮和选中 `--mn-pri #2F52B8` 配奶白字 `--mn-pri-ink #F6F0E2`；预算是浅天蓝底 `--mn-bud`，House 底座青绿 `--mn-base`；字 `--mn-ink #F2EEE6`、次要 `--mn-mute`。
- 浮起来的层是磨砂玻璃（`.mn-cal`：`rgba(28,28,36,.86)` + `blur(20px)`），小签、方块是半透明白 `--mn-fill` + 顶边一道细高光 `--mn-hair`；流水上下沿渐进模糊（`.mn-pblur`）。
- 字只用四档：22 / 15 / 13 / 11（`.mn-h1`、正文、`.mn-13`、`.mn-meta`）。
- 动效：进场 `--mn-enter: cubic-bezier(.16, 1, .3, 1)`（快出来、慢慢停稳、不冲过头），出场 `--mn-exit: cubic-bezier(.4, 0, 1, 1)`，小按钮 `--mn-spring`（只冲过头 0.5%）；时长：按下 120ms、开关 / 小签 280ms、面板进来 420ms、出去 260ms、数字 450ms、柱子 520ms。
- 电脑上的数字：等宽、靠右（`.sp-table td.r`、`.sp-kv`），小数那两位小一号淡一点（`.mn-dec`）。

## 6. 设计 skill 不许改的东西

这些看着像「问题」，其实是故意的：

- **emoji 类目和记号**：Ideas 的 🎭 ✈️ 🍽️ 🍹 🛰️、Restock 的记号、Chore 键的 🍳 ☎️ 🗃️ 🪪 🏠、阅读的 🥰 🎉 💢（`.em-pick`、`.idea-kinds`、`.chore-tags`）。别换成图标或文字。
- **磨砂、半透明的卡片**（`--card` + `--frost`）：是为了透出底下的天、云、星芒，不是装饰。
- **夜里的霓虹发光**（`--glow`、`[data-theme="dark"] .chip.on`、`.btn.primary` 的光、连线底下那条宽的淡的）。
- **夜里的等宽数字**（`--num` = JetBrains Mono）。
- **渐变进度条**（`--meter`）。
- **手写的中文注释**：代码里的注释是中文、口语，解释「为什么」。别翻成英文、别删。
- **日夜跟着钟点走，不跟系统深浅色**；`theme-color` 也跟着这个走（手机最顶上那一条要和背景同色）。
- **手机今天页顶上往下拉记账**靠 `touchmove` + `preventDefault`（`js/ui/island.js`），这是功能本身。
- **强调色只有青柠**：别再加第二个强调色；记账那一套颜色只在 `.mn` 里面。
- 金条（超级休息日）、Done 的纸片 / 烟花：她点名要的例外。
