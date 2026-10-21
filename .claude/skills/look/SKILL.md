---
name: look
description: Screenshot 苦昼短 on a phone and a computer, day and night, against the fake sheet, then check every picture. Use after changing anything the user can see (CSS, page markup, the spending panel, the Projects links).
---

# look：改完界面截图看一遍

以 `DESIGN.md` 为准：截图里看到和它说的不一样，是改坏了；它没写的，别按自己的口味「改正」。

## 什么时候用

改了界面以后（`css/`、`js/ui/`、`index.html`）、提交之前。只改了算数（`js/*.js` 里的纯计算）、测试、文档的不用。

## 怎么跑

要先装 Playwright（云端环境里已经有）：

```bash
npm i -g playwright && npx playwright install chromium
```

然后：

```bash
node tools/look.mjs
```

它自己起本地网页（`tools/serve.mjs`，8010）和假表格（`tools/fake-sheet.mjs`，8012），连上、灌一份假数据（任务、目标、五个月的记账），再按清单截图。参数：

- `--only 名字`：只截名字里带这几个词的，逗号隔开，比如 `--only today,spending`、`--only phone-dark`
- `--worst`：换成极端数据（很长的名字、一栏一堆目标、大金额）
- `--out 目录`：图放哪（默认系统临时目录）

## 截哪几张

照 `tools/look.mjs` 里的 `SHOTS`：设备 `phone`（390×844）、`desk`（1440×900）、`small`（拉窄的电脑 1000×760），白天、夜里各一套。
大致是：今天页（展开一行、悬停）、手机往下拉记账（拉一半、过线、落下、打开、滑流水、记一笔、图表、类别）、日历、Projects（悬停目标 / 计划 / North star、拖连线、改目标、加目标、Ideas、计划编辑框）、Stats、Spending（记一笔、改、筛选、搜索、年、设定）、阅读、设定。

## 看图时查什么

跑完它会打印图在哪、控制台有没有报错、手机上有没有小于 16px 的输入框。**每张图都要打开看**，不能只看打印出来的结果：

- 左边缘、基线对齐：同一列的字左边对齐，同一行的东西一样高
- 长名字有省略号，没有把一行撑破、没有挤掉右边的数字
- 夜里的发光没有糊成一片；白天的硬投影、粗边只在主卡片、浮层、主按钮上
- 强调色只有青柠（记账那块是钴蓝 / 橙 / 青绿，见 `DESIGN.md` 第 5 节）
- 手机上的输入框不小于 16px，按钮好按
- 控制台没有报错

## 已知的毛病

页面刚重画、换页的过渡还在跑的时候，第一次悬停偶尔不算数；`hover` 已经会先把鼠标挪开再挪回来，并等连线出来（最多 3 秒）。还截不到线的话，单独再跑一次 `--only projects-hover`。
