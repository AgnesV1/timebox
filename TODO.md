# 苦昼短 UI to-do (for a coding agent)

Written 2026-10-20 for Claude Code (or another coding agent) running on the owner's computer. Use: hand it one item at a time, e.g. "do item 3 of TODO.md".
Each item says what to do, why, which files, the steps, what "done" means and how to check it. When an item is done, put ✅ before its title with the date and commit hash.
Item 0 comes first every time. Item 7 collects what the 2026-10 round (streaming links, the web-style Spending page, the Projects rail, the Reading rail, the phone curtain) left for later.

## 0. Before every item: set up and remember the rules
**Set up**
- Node 20 or newer. Install Playwright yourself (it's preinstalled in the cloud, not locally): `npm i -g playwright && npx playwright install chromium`. `tools/look.mjs` prefers this global copy over any other found higher up the folder tree
- Pull the latest main and branch from it before changing anything
- To see the result:
  - `node tools/look.mjs` starts the local page and the fake Sheet and screenshots the list: phone 390×844, computer 1440×900, narrow computer 1000×760, day and night
  - `--only <words>` takes only shots whose names contain those words; `--worst` switches to extreme data (very long names, a column full of goals, huge amounts); `--out <dir>` says where the pictures go; `LOOK_PORT` / `FAKE_PORT` if 8010 / 8012 are taken
  - It prints where the pictures are, any console errors, and phone inputs under 16px. **Open every picture**; the printed summary isn't enough
- Tests: `node --test test/*.test.mjs`, all passing before any commit
- Clicking around by hand: `node tools/serve.mjs .` (http://127.0.0.1:8000) with `node tools/fake-sheet.mjs` (a fake Google Sheet; usage at the top of the file)

**Rules**
- Interface text in English, code comments in Chinese, commit messages and docs in English
- New JS files go into `SHELL` in `sw.js` (`test/sw.test.mjs` checks); when files the page uses change, bump `CACHE` in `sw.js` — since 2026-10-24 the page's files are served from that versioned cache without asking the network, so **without a bump no device ever gets the change**
- Never change `SECRET = 'CHANGE_ME'` in `Code.gs`
- The North star column has another name in the owner's mind that lives only in the owner's own Sheet. In the repository (code, docs, commit messages) it is always North star
- Design follows `DESIGN.md` (and the comments at the top of `css/app.css` and `css/money.css`). Where another design skill disagrees, `DESIGN.md` wins

## 1. Real-device check (a person does it; the agent prepares and records)
> 2026-10-20: `tools/serve.mjs` reads `HOST` (`dc2bb54`). The checklist hasn't been asked yet — go through it on the devices after this round is live.

**Why**: screenshots only show how things look. How they feel, whether they're smooth, whether the iPhone zooms the page — only a real device tells.

**Steps**
1. Easiest is the live URL (GitHub Pages) after deploying. To test before merging:
   - `HOST=0.0.0.0 node tools/serve.mjs .`, phone and computer on the same Wi-Fi, open `http://<computer's IP>:8000` on the phone
   - Plain http on the LAN isn't a secure origin, so the service worker won't run; that doesn't matter for this check
2. Copy the checklist below into a record, ask the owner item by item, and write the results back here.

**iPhone checklist**
- On Today scrolled to the top, pull down from the top part of the screen to open the ledger:
  - It opens after about 90px; a quick flick down opens it too; pushing back up while pulling cancels
  - The drop falls, then the panel falls like a curtain and stops at about 94% of the screen (with a small bounce)
- With the panel open:
  - Scrolling the list makes the soft waves of the hem lean, rise and drift sideways, then settle; faster scrolling moves them more, never enough to feel dizzy
  - Tapping the strip of Today still showing below pulls the curtain back up
  - The `CAD ⌄` next to the totals switches the currency; adding a record in RMB shows `−¥…` with the converted amount underneath
- Tapping these inputs never zooms the page: Why?, Details, the ledger's note / search / category rename / rate fields
- Today's opened row: Done / Delay / Drop are small but easy to hit; pressing the minutes on the left and dragging reorders; a long For … chain scrolls smoothly and stops while held
- Spend (bottom right of the add-task box): the sheet rises from the bottom, the number pad is easy to hit, Add closes it and the island shows today's total; tapping the dimmed page closes it
- Ledger charts: tapping above House shows the rest on its own, tapping again comes back
- Adding a task: the project chip opens a dropdown below it that doesn't jump when the keyboard closes; the chosen project shows on the chip
- With Reduce Motion on in Settings: no swaying, no bouncing, only fades

**Mac checklist**
- Meals → Big buys: a trackpad swipe left / right opens and closes it, and the browser doesn't treat it as Back
- Spending: N opens the add row, Enter saves and closes it; / jumps to search
- Projects: hovering a plan card, are the streaks smooth?
  - Record 5 seconds in Chrome's Performance panel; while hovering, each frame's Paint should stay under 4ms
  - If it's over, lower the number of lines that carry a streak at once from 24 (`STREAKS` in `js/ui/links.js`)
- Reading: dragging in the right box and Alt+↑↓ reorder fine

**Done when**: every item has a verdict (fine / not fine + one sentence). Each "not fine" becomes a new item under 7.

## 2. ✅ Write the design rules into DESIGN.md
> 2026-10-20 `dc2bb54` (in English since `30764c2`): `DESIGN.md` at the repository root with all six sections; every rule names its selector / token.

**Why**: design skills (frontend-design, Impeccable and others) read the given design direction first. Without this file they "correct" 苦昼短's style to their own taste — treating the emoji kinds, neon glow and frosted cards as problems.

**Sources**
- The comment at the top of `css/app.css`: acid neon by day, cyberpunk by night, lime as the only accent, as few frames as possible, animal prints for status
- The tokens in `css/app.css` (the `:root` and `[data-theme="dark"]` blocks), and the "translucent 50% + light frost" section near line 2157
- The top of `css/money.css`: spending's own colours, glass, progressive blur, motion curves and durations, four type sizes
- The rules of the computer's Spending page (`.mn.spend`): 50% translucent black, no frames inside the board, monospace numbers aligned right
- The link streaks: the comment at the top of `js/ui/links.js`, and `.lk-*` in `css/app.css`

**Steps**: write `DESIGN.md` at the repository root with these sections:
1. Principles (five or six sentences)
2. Colour and type (a token table: name, day value, night value, where it's used)
3. Components (header, segmented control, buttons, cards, tables, dialogs — one line each: what it looks like, when to use it)
4. Motion (curves, durations, springs, what happens under reduced motion)
5. The spending set (where it matches 苦昼短 and where it doesn't)
6. "What design skills must leave alone": emoji kinds, frosted cards, neon glow at night, monospace numbers at night, gradient progress bars, the hand-written Chinese comments

**Done when**: every rule maps to a place in the CSS (with its selector); nothing that isn't in the CSS.

## 3. ✅ Put the detail-checking skills into the repository
> 2026-10-20: `.gitignore` and `.claude/skills/look/SKILL.md` in `dc2bb54`; the four skills from other authors in `30764c2`, each with its MIT licence and a "DESIGN.md wins" note at the top.

**Why**: these skills don't care about style; they check what the code alone doesn't show: how it feels on a phone, extreme data, animation performance, plus a step that screenshots the result.

**Steps**
1. In `.gitignore`, change `.claude/` to `.claude/*` and add `!.claude/skills/` on the next line. Otherwise the skills can't be committed.
2. Copy `skills/mobile-native`, `skills/break-ui` and `skills/animation-performance` from https://github.com/emilkowalski/skills into `.claude/skills/` under the same names, with its LICENSE (MIT) in each folder.
3. Copy `AGENTS.md` (the rule list) from https://github.com/vercel-labs/web-interface-guidelines as `.claude/skills/web-interface-guidelines/SKILL.md`, adding skill frontmatter (name, description) at the top.
   - Remove these kinds of rules: anything React / hydration; "titles in Title Case" (苦昼短 always uses sentence case)
   - Include its LICENSE (MIT)
4. Write `.claude/skills/look/SKILL.md`, wrapping `tools/look.mjs` as a skill:
   - When to use it: after changing the interface
   - How to run it: the same options as item 0
   - Which shots: `SHOTS` in `tools/look.mjs`
   - What to check in the pictures: left edges and baselines aligned, equal heights within a row, long names truncated with an ellipsis, night glow not smeared, phone inputs at least 16px
5. At the top of each of these SKILL.md files, where it conflicts with 苦昼短, add a line saying `DESIGN.md` wins. Examples of conflicts:
   - mobile-native says never use `touchmove` + `preventDefault`, but pulling the ledger down depends on it
   - mobile-native says to set `theme-color` per colour scheme, but 苦昼短's day and night follow the clock

**Done when**: `git status` shows the new files under `.claude/skills/`; typing `/look` in a local Claude Code session produces screenshots.

## 4. ✅ Every drag has a way that needs no drag (WCAG 2.2, 2.5.7)
> 2026-10-20 `3b2203a` (the look of the phone's ↑ ↓ in `4c08f35` and `6089f70`). Every row of the table below now says "yes".
> 2026-10-21: the owner asked for the phone's ↑ ↓ to go — on the phone, dragging the minutes is the way to reorder; the computer keeps ↑ ↓ and Alt+↑↓.

**Why**: where dragging is the only way, a trackpad, an unsteady hand or a keyboard can't do it. WCAG 2.2 asks for a single-click alternative to every drag, ideally keyboard-operable too.

| Drag | Code | Other way now |
|---|---|---|
| Calendar task to another day / time | `js/ui/dnd.js`, `js/ui/calendar.js` | Yes: the editor's Date (the calendar only plans by day, there are no times); dragging back to the pool = the editor's new "Back to the pool" |
| Pool items and Regular plans onto the calendar | `js/ui/dnd.js`, `js/ui/calendar.js` lines 119–131 | Yes: click, or Tab to it and press Enter, for a "Put on…" menu of every day shown |
| Meals: a Box onto a day, copying a day, a grocery into a Box | the comment at the top of `js/ui/dnd.js`, `js/ui/meals.js` | Yes: click a Box for "Put on…" (each day + each rough-plan week), and a day's editor could always add Boxes; copying a day = "Same as another day" in that day's editor; click a grocery for "Add to…" (each Box + A new box), and the Box editor could always add groceries |
| Matrix notes to another box | `js/ui/quads.js` line 333 | Yes: open a note; the new move button next to ✓ picks one of the other three boxes |
| Phone Today: press and drag the minutes to reorder | `js/ui/today.js` (the `[data-drag-row]` pointerdown handler) | Computer: ↑ ↓ on the right of the opened row and Alt+↑↓. Phone: dragging only, by the owner's choice (2026-10-21) |
| Projects links (dragging the small circle) | `js/ui/links.js` | Yes: Serves in the plan editor, Part of when editing a goal |
| Reading's right box order | `js/ui/reading.js` | Yes: Alt+↑↓ |

**What was added** (in 苦昼短's existing style, no new kind of popup):
- Things that can be picked up can be reached with Tab. Enter opens a small menu (the `js/ui/select.js` kind, `openMenu`):
  - Pool items: "Put on…", pick the day
  - Notes: "Move to", pick a box
  - Reordering: up / down
- Every item in the menu can be clicked, which satisfies "a single click can do it".

**Done when**: every row in the table says "yes"; every operation can be finished with the keyboard alone.

## 5. ✅ A redraw while a dialog is open loses the button focus returns to
> 2026-10-20 `3b2203a`: checked in the built-in browser with the same steps (after a redraw focus returns to the same row's ⋯; if the row is gone it lands on the page title). `test/modal.test.mjs` tests the selector; `node --test` passes.

**Why**: `js/ui/modal.js` remembers the element that opened it (`opener`). If the page is redrawn while the dialog is open (say a sync pulls new data), that element is replaced. On close, `back.isConnected` is false and focus falls to `body`; a keyboard user has to Tab from the top of the page again.

**Steps**
1. In `openModal`, besides the element, remember a description that can find it again: its `data-act`, plus the nearest `data-id` / `data-project` / `data-goal` / `data-idea`, as a selector.
2. In `closeModal`: use the original element if it's still on the page; otherwise find it with the selector; if neither works, focus the first heading in `#main` (with `tabindex="-1"`).
3. Write a test, or a Playwright snippet: open a task editor → trigger a redraw → Esc → check that `document.activeElement` is that row's button.

**Done when**: that snippet passes; `node --test` passes.

## 6. Optional: a check-up with design skills
None of these go into the repository; use them once locally and write the reports into `design/` (not committed):
- Impeccable's `audit` and `harden`: https://github.com/pbakaus/impeccable. Don't turn on its automatic detection hook; the emoji and glass rules would fire all the time
- ibelick's `improve-ui` (compares against DESIGN.md) and `fixing-accessibility`: https://github.com/ibelick/ui-skills
- For each point in a report, first check DESIGN.md for whether it's on purpose and skip it if so; make new items for the rest

## 7. Left over from the 2026-10 round
That round did: the Projects rail (the North star paragraph, Goals | Ideas), the diagonal streaming links, the web-style Spending page on the computer, Reading's "Rest of this year" on the right, and the phone's ledger curtain.
These are things noticed then but not done in that round. Each is small, one commit each.

**7a. ✅ Draw the streaming links when the keyboard stops on a goal or plan card** (2026-10-20 `3b2203a`)
- Why: links only drew while the mouse rested there (`onMove` in `js/ui/links.js`), so keyboard-only users never saw what a thing is for.
- Steps:
  - Listen to `focusin`: when focus lands inside a `NODE` element (a goal row's `.gt`, `.ns-g`, a plan card, a project header), call `open(key, el)` as hover does
  - `close()` when focus leaves the page or on Esc
  - Keyboard-opened links show no drag handle (dragging needs a mouse anyway)
- Done when: Tab alone onto a goal flies its links out with streaks running; Esc closes them; mouse hover behaves as before.

**7b. ✅ The README sentence about the goal board was out of date** (2026-10-20 `30764c2`, rewritten while the README moved to English: the goals rail on the right, the sections it has now, and the grip that moves a goal to another section)
- `README.md` lines 59–60 still said "the goal board is at the top … and the following five years". The board is in the right rail now, with years from next year for four years plus the North star.

**7c. ✅ The screenshot tool sometimes missed the links on hover** (2026-10-20 `dc2bb54`: moves the mouse away and back, then waits up to 3 seconds for `.lk-svg .lk`. Checked with Playwright: `--only desk-projects-hover` five runs in a row, all six hover shots had their links every time)
- Symptom: right after a redraw, while a page transition is still running, Playwright's first `hover` may not register and the shot has no links (`hover` in `tools/look.mjs`).
- Done when: `node tools/look.mjs --only projects-hover` five runs in a row, links every time.

**7d. ✅ Computer Spending: set a category's base / not in budget in settings** (2026-10-20 `444e39e`: synced to the fake Sheet and pulled back whole, the value stays)
- Previously only the spending Sheet could change it (the settings dialog's Categories only showed it).
- Done when: changing it moves the chart's base and Budget used; after syncing to the Sheet and pulling back, the value stays.

**7e. ✅ Projects rail: drag a goal to another section to change its due date** (2026-10-20 `3b2203a`: drag the small grip that appears on the far left of a row on hover; clicking it picks a section too)
- Previously only the month button changed the due date. Dragging a goal from This quarter to Next quarter (or a year) now sets that section's default due date (`due` of each section in `G.columns()`), with undo.

**7f. ✅ Measure the cost of the streaming links** (2026-10-20, Playwright + a Chrome trace in headless Chromium at 1440×900, hovering a goal with 31 links by day and 53 at night, 24 of them streaking: main-thread Paint per event max 0.46ms, p95 0.18ms, about 0.2ms per frame, ~56–60fps — well under 4ms, so `STREAKS` stays 24. Raster work at night was heavy in headless software rendering (≈0.58s of raster time per second across raster threads), so still look at night mode on the real Mac (item 1))

**7g. There are two exchange-rate tables**
- Big buys keeps its rates in `meal-prefs` `rates` (CAD / RMB only); spending keeps them in the Settings row `spend-fx` (seven currencies, can fetch the ECB rate). If wanted, merge them: Big buys reads `spend-fx` too and the old table is moved over once. Ask the owner first whether the two should be the same.
