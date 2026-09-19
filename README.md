# Timebox

每天排一组任务块，只有顺序和预估时长，没有固定时钟时间。计划在电脑上的 Google Sheet 里排，
手机上打开页面一件件做、标完成情况，没做完的写原因。数据存在 Google Sheet，Mac 和手机共用一份。
表格和页面都用英文，你自己写的 Description / Reason 当然可以是中文。

## 一、先搭 Google 这一端

1. 新建一个 Google Sheet（名字随意，不用手动建表头）
2. 扩展程序 → Apps Script，删掉默认内容，粘贴 `Code.gs` 全文
3. 把第 4 行的 `CHANGE_ME` 改成你自己的口令（只在 Apps Script 编辑器里改，别改仓库里的文件）
4. 编辑器顶部的函数下拉选 `setup` → 运行 → 按提示授权
5. 右上角 部署 → 新建部署 → 类型选「网页应用」
   - 执行身份：**我**
   - 谁有权访问：**任何人**
6. 复制生成的 `…/exec` 网址

`setup` 每次都可以再运行，它会：建好 `Tasks` / `Day capacity` / `Projects` / `Groups` 四页；
把中文老表改名、表头翻成英文；**删掉「审核」这一列**（里面有想留的内容请先复制出来）；
补上缺的列；把 `Description` 挪到最后一列；刷新下拉；重算一次 Projects。

「任何人」是必须的：浏览器发过去的是匿名请求，带不上你的 Google 登录态。
口令就是替代品——对不上的请求会被直接挡掉。

> 每次改完 `Code.gs`，要重新「部署 → 管理部署 → 编辑 → 版本选新建」才生效，
> 否则跑的还是旧代码。这是最常见的坑。

## 二、再搭网页这一端

把这个文件夹推到 GitHub 仓库，Settings → Pages → Source 选 main 分支根目录。
一两分钟后 `https://<用户名>.github.io/<仓库名>/` 就能打开。

代码是公开的，**但数据不在代码里**——数据全在你的 Sheet，别人打开这个网址
只会看到一个空白应用。唯一要注意的是别把口令写进仓库里的任何文件（它只存在
你浏览器的 localStorage 里）。

## 三、装到手机

Safari 打开网址 → 分享 → 添加到主屏幕。第一次打开后点右上角 Settings，
填 Apps Script 网址和口令。Mac 上也填一次，两边就对上了。

## 四、每天怎么用：`Tasks` 页

电脑上一件事一行；手机上打开或刷新页面，就能看到当天的任务。

| 列 | 怎么填 | 手机上 |
|---|---|---|
| `Date` | `2026-09-19`。同一天的几行用复制粘贴（拖右下角会逐行 +1） | 按日期显示 |
| `Task` | 必填。和 `Projects` 里某个名字完全一致时，这件事的时间会计入那个 Project | 显示 |
| `Est min` | 数字，不填按 30 | 显示 |
| `Actual min` | 可不填；手机上标 Done / Partial 后在任务名右边填 | 填了的话「min done」按实际算 |
| `Order` | 数字，小的先做，可以同号。**当天最大的那个数 = 可选**（当天只有一种数字时不算） | 按它排序；可选的淡紫底 + Optional 标记 |
| `Category` | 下拉：Main / Work / Fun / Chore（老表的中文值也认） | 左侧色条：Main 绿、Work 蓝、Fun 橙、Chore 棕（没填是灰色） |
| `Status` | 手机上标完自动写一个词：`Done` / `Partial` / `Later` / `Drop`；空 = 还没标 | 显示成选中的按钮 |
| `Done order` | 手机自动记第几件做完，不用管 | 不显示 |
| `Reason` | 没做完的原因，手机上标了 Partial / Later / Drop 之后直接写 | 显示成输入框 |
| `Description` | 长段说明，**永远是最后一列** | 点任务名展开，手机上也能补充 |

- 列可以挪位置、中间也能插自己的列，只要表头文字不改（`Description` 会被 `setup` 挪回最后）
- 手机上按住左边的分钟数上下拖，调整顺序。拖过的那天以这台设备上的顺序为准；没拖过的按 `Order` 排
- 手机上新加的任务没有 `Order`，排在最后；手机上不能删任务，要删去表里删整行
- 每天可用的时长填在 `Day capacity` 页：`Date | Available min`，一天一行；没填的日子用页面 Settings 里的默认值

## 五、总任务：`Projects` 页

| 列 | 怎么填 |
|---|---|
| `Project` | 总任务名，例如 `Module #4`。每日任务里 `Task` 和它**完全一致**（首尾空格忽略、区分大小写）就计入 |
| `Group` | 大类，下拉选项来自 `Groups` 页 |
| `Planned min` | 预期总时长（分钟） |
| `Status` | 下拉：Active / Done / Dropped |
| `Spent min` | **自动算**：所有同名任务的时间之和 |
| `Progress` | **自动算**：`Spent / Planned`，按百分比显示 |

- 一件任务算多少分钟，和页面顶部的「min done」一致：填了 `Actual min` 按实际算；
  没填的 `Done` 按 `Est min` 算；`Partial` / `Later` / `Drop` 不算
- 手机每次同步后自动重算；也可以在 Apps Script 里手动运行 `recount_`
- `Groups` 页预置了 Work 1 / Work 2 / Main - English / Main - French / Main - Fitness / Fun，随便改名增删，
  改完 Projects 的下拉跟着变

## 同步是怎么工作的

- 任何改动后 **3 秒**自动写一次（合并连续操作，不然点四下发四次请求）
- 页面被切走或关掉时用 `sendBeacon` 补发一次
- 打开页面或切换日期时从表里读回，**以表为准**
- 但如果本地有还没传上去的改动（断网时改的），则以本地为准，先推上去
- 手机只回写 `Status`、`Done order`，以及在手机上改过的 `Reason` / `Description` / `Actual min`，写在原来那行；
  `Date` / `Task` / `Est min` / `Order` / `Category` 手机不会改。手机上新加的任务追加到表的末尾
- 行靠「`Date` + `Task`」对上，所以**手机已经打开过的任务别在表里改名**，否则会被当成两件不同的任务

单人使用这套「最后写入者赢」够用了。要避免的唯一场景是：Mac 上改完立刻
断网关页面，然后手机上改同一天——这时两边都认为自己是对的。

## 积累之后看什么

一两个月后，值得看的是：`Est min` 求和的日均值（一天到底装得下多少）、`Reason` 里原因的分布
（是估时的问题还是被打断的问题）、按 `Category` 看完成率，以及 `Projects` 里 `Spent` 和 `Planned` 的差距。
