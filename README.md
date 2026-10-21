# 苦昼短

A timebox that works backwards from the deadline and only asks you to do today's share well. On the computer you plan (a calendar plus a task pool you drag from) and can plan meals the way a meal kit does;
on the phone you see today, time things, mark them done, add things you want to read or watch, and check the next shopping list at the store. The data lives in your own Google Sheet, shared by the Mac and the phone.
The interface is in English; your own task names, reasons and notes can be in any language.

Design rules (colours, type, components, motion, and what design tools must leave alone) are in [`DESIGN.md`](DESIGN.md).

## How it works out "how much today"

1. Two levels: **projects** (big aims like French or Work 1) contain **plans**. A plan has two choices:
   - Kind: **Total** = so many hours by a date (B2 exam, 20h, by October 30); **Regular** = recurring (Gym Mon/Wed/Fri 40 minutes, Yoga twice a week)
   - Place: **Auto** = shows up in each day's list by itself; **Pool** = goes into the task pool and you drag it onto a day
2. A Total plan can be split into items, each with estimated minutes. An item marked Done counts as finished; otherwise it counts the time logged against it (capped at the estimate). A plan with only a total duration is one big item
3. The remaining minutes are spread over the usable time of each day before the target date (each day's capacity; 0 = a rest day). That day's fixed Regular (Auto) work takes its share first
4. With several Total plans at once, the load is balanced in 15-minute blocks so no day gets crowded. The Auto share appears in today's list each morning;
   anything left undone isn't carried over as a task — the remainder is spread over the following days
5. Only today's share / today's occurrence is written to the Sheet; future days show as faint previews in the calendar and the phone's date strip
6. The first time you open the app each day, today's amount is recorded as the **line** — finishing tasks during the day doesn't lower it
7. The next day settles up: if you did less yesterday, the difference is spread over the following days (Yesterday ran … short); if you did more, the following days get lighter
8. When you finish something you enter the actual minutes; once a module has two samples that differ a lot from the estimate, it suggests re-estimating the remaining items
9. The real pace of the last two weeks projects a finish date and gives the plan a health label: On pace / Cutting it close / … late

## 1. The Google Sheet side

**Already using an older Timebox** (your Sheet already has a Tasks tab):

1. To be safe: Sheet → File → Make a copy (`setup` also makes a backup, but one more doesn't hurt)
2. Extensions → Apps Script, delete what's there, paste the whole new `Code.gs`
3. On line 4, change `CHANGE_ME` back to **your own secret** (only in the Apps Script editor — never in the repository file)
4. Save → pick `setup` in the function menu at the top → Run. It will:
   - copy Tasks / Projects / Day capacity into "Backup … date" tabs
   - upgrade in place: add ID and other helper columns (hidden automatically), turn statuses into one word,
     attach daily tasks to the project with the same name, and create one item per project (estimate = the old Planned min)
   - create the Items / Log / Settings / Deleted tabs
   - tidy up (checked on every run; running it twice changes nothing): the Time tab's timer records move into the Tasks `Times` column, Day capacity moves into Settings,
     old repeat rules become Regular plans in Projects (future occurrences you never touched are removed),
     the Category / Done order / Planned / Spent / Progress columns and the Groups tab are removed;
     moved tabs are renamed "Old …" and hidden, and Notes, Backup, Log, Settings and Deleted are hidden too (right-click the tab bar to show them).
     Once you've checked the data is all there, you can delete Old / Backup / Notes yourself
5. Deploy → Manage deployments → Edit → Version: New version → Deploy. The URL stays the same, so the phone and computer don't need it again.
   When the Sheet and the page disagree on the version (say the page was updated but `Code.gs` wasn't), the page says "Update Code.gs in your Sheet first" and keeps your changes on the device until then — nothing is lost

**First time**: make an empty Sheet, do steps 2–4 above, then Deploy → New deployment → Web app,
execute as "Me", access "Anyone", and copy the `…/exec` URL it gives you.

> After every change to `Code.gs`, you have to do Deploy → Manage deployments → Edit → New version, or the old code keeps running.

## 2. The web page side

Push to a GitHub repository, then Settings → Pages → the main branch's root, and `https://<user>.github.io/<repo>/` opens it.
The code is public, but no data is in it; the Apps Script URL and secret are stored only in your browser.

- A device that used the old version picks up its URL and secret automatically
- A new device: on the computer, enter the Apps Script URL and secret in Settings; a new phone asks for them the first time and never again
- Phone: open in Safari → Share → Add to Home Screen. Once installed it opens without a connection too

## 3. Day to day

**Computer**
- `Projects`: goals live in the **right-hand column** (it sticks to the top as you scroll). From top to bottom:
  - **North star**: a paragraph that always stays at the top. Put `[ ]` around words (or select some and click **Frame as goal**) and each framed phrase is a North star goal;
    click the paragraph to edit, ⌘↵ or clicking outside saves. Rewording inside a frame keeps the same goal (its parent and links stay); removing the frame deletes that goal (undo in the toast).
  - **Goals | Ideas**: Goals are stacked by time: This month, This quarter, Next quarter, This year, Next year, then three more years (in 2026 that's 2028, 2029, 2030; they move with the date).
    Each goal has a tag, the month you mean to finish it, and once ticked, the month you actually did — both can be clicked and changed. Sections roll forward with the date, and unfinished overdue goals roll into the current one;
    inside a section goals are ordered by their tag's project order (Build first, untagged last). A small grip shows on the left of a goal when you hover it: drag it to another section to give the goal that section's default due date (or click the grip to pick a section; undo in the toast).
    Ideas is the idea pool described below; switching to it keeps the North star paragraph in view.
  **Goals, projects and plans can be linked** to say what each thing is for: rest the mouse on a goal, a framed phrase in the North star, a project name or a plan card
  (or Tab onto it with the keyboard), and the related links fly out one by one (a direct curve between the two ends — crossing text is fine, they only show while you're there).
  A **streak** of light keeps running along each line towards "what it's for" (plan → goal → parent goal → … → North star), and the dot at that end bounces when it arrives. By day it's ink with pink and blue printed slightly off-register; at night it's the project's neon colour.
  Drag the small circle that appears onto another goal, plan or project to link them; the × in the middle of a line unlinks.
  Goal onto goal = make it the parent (one parent per goal). Without dragging: Part of when editing a goal's text, Serves in the plan editor.
  A plan with no goal of its own counts its project's goals. On Today, an opened task shows what it's for under its title: For plan → goal → parent → …
  Below, each project tracks something different (the Watch column in Settings → Projects changes it): **Build** tracks plan progress (bar, health, timeline);
  **Fitness** checks whether the last 7 days reached 3 hours, **Leisure** whether the last 7 days of Relax stayed within the weekly range (5–20 hours by default) —
  each is one line, red when short, with a count on the Projects item in the sidebar; **Work / Chores** track nothing and just list their plans.
  The page is split by project: Build / Work / Friends / Leisure / Fitness / Chores are always there, always in that order (Rename changes the name or colour or merges into another project; an empty one can be removed).
  When the projects area is wide enough it splits into two columns: Build and Work on the left, the rest on the right; narrower, it's one column.
  **Tasks can belong straight to a project** without a plan: when adding a task, each project is an option of its own in the menu, with its plans under it.
  Switching the right column to **Ideas** shows the **idea pool** — places to go, things to eat, events — one line each, no duration and mostly no deadline.
  Add them in the box at the top (paste several lines = several ideas) and pick a kind: 🎭 shows and exhibitions (live music too), ✈️ trips, 🍽️ eating out, 🍹 bars, 🛰️ anything else (outdoors, markets — the rarer things); a few have a date (On a day / By a day).
  The emoji row at the top filters by kind. When you add a task under Leisure or Friends,
  the unplanned ideas show under the title box; click one to fill it in. Once the task exists, the idea is struck through with its day, and it follows the task from then on:
  task Done = you went, and the idea leaves the pool (un-Done within a week brings it back; after that it's deleted); Delay / Drop or deleting the task = back to the pool. Ideas can also go straight onto a day with Plan.
  Unplanned ideas due within 7 days get a line on the right of Today; every dated, upcoming, unplanned idea is listed in the calendar's Pool under Ideas — just text, it never turns into a task by itself.
  Hover a line and click `+` to put it on that day (Leisure; ✈️ counts 8 hours, 🛰️ 4, 🎭 🍽️ 🍹 3, unsorted 1; "by" ideas go on the last day, then drag as usual).
  Plan in the idea pool uses the same defaults. Which projects can pick ideas: the Ideas column in Settings → Projects.
  On the phone: with the `Idea` switch on in the add-task row, Add saves to the pool instead (it lands in Unsorted; sort it on the computer); the light bulb in the top bar opens the look-up page (search names and notes, read only). All of it is stored in the Settings tab, one row each (`idea:…`).
  The sections hold plans. Click "New plan" or a project's "+ Plan", choose Total / Regular and Auto / Pool;
  for Total enter a deadline and either a total duration or items (one per line to add many, or Numbered to generate "Unit 1…10"),
  for Regular enter minutes per weekday (Auto) or times per week and minutes each (Pool); Rename renames the project and its plans with it
- **Repeat shortcuts**: in the add-task box, pick "↻ Every day / Weekdays / Every <weekday>" and "for good / for 1 week …", then Add —
  that creates a Regular + Auto plan; a task's ⋯ → Repeat does the same and lets each weekday have its own minutes.
  These small repeating things count straight towards their project: Projects shows them as one line under the project header (click to edit or stop) rather than a card; the task's label is the project name;
  the Project field in the editor moves the whole repeat to another project.
- **Last 14 days**: projects that track hours or Relax (Fitness, Leisure) have a row of 14 squares in their header, one per day — filled = done that day, outlined = planned but not done; the gap marks the last 7 days on the right.
- **Archive**: every plan card has Archive at the top right; archived cards fold into "N archived" at the right of the project header, where you can open and Restore them (the same thing as Status in the editor).
  For a repeating task, the top of the editor offers This one / This & following / All; renaming or changing minutes applies to those days;
  "Change…" changes the repeat from that day on. Deleting offers Only this / This & following / This & earlier / All;
  days already done or timed stay as a record. Missed automatic tasks don't count as "left behind"
- `Calendar`: clicking a date opens that day on Today. Every day always shows its whole schedule (names wrap in full); cells have a minimum width and the calendar scrolls sideways when the window is narrow. The task pool is on the right: drag an item onto a day to plan it,
  or click it (or Tab to it and press Enter) to pick the day from a "Put on…" menu. Pool-placed Regular plans are under "This week" with how many are left this week; each drag places one.
  Calendar tasks can be dragged to other days, or back to the pool to unschedule them (in the task editor: Back to the pool). In the faint previews of future days, a Regular occurrence can be dragged away or opened; a Total plan's projected share is view-only.
  The number at the top right of a cell is that day's usable time; click it to change
- `Today`: today's list on the left; on the right the line, yesterday's bill, and what's overdue.
  At the bottom centre of the screen (above the timer bar) is a translucent half-disc, the day's **dial**: the outer ring is 6→18h, the inner ring 18→6h, with 6 on the left, 9 at the top and 12 on the right;
  the base is grey (time with nothing done stays grey), and the leftmost ring has a thin cut across its ends; "now" is a hand from the centre.
  Tasks are blocks in the neon version of their project colour. At night the base is mirrored chrome and tasks glow; by day the whole dial is screen-printed —
  two flat grey rings, each with a pink and a cyan copy slightly off-register underneath, tasks as flat colour with an offset navy copy, and grain over everything.
  Every night from 11pm to 8am counts as rest: frosted and darkened, with fine lines (commute days add the two trips).
  Each timed segment with start and end times is drawn in its plan's colour, a running timer is drawn up to now, and a commute day's fixed hours are grey hatching.
  Drag it up (swipe up on the phone) and it rises like the sun, segments lighting up one by one from 6am; past a third it stays in the middle of the screen, where you can tap a segment to see what it was;
  tap outside, drag down or press Esc to let it set. A single tap also raises / lowers it
- **Commute days**: click the small car icon at the top right of a calendar cell to mark a commute day (the icon fills in); click again to unmark. Commute days have fixed blocks 23–8 (sleep / getting ready / leaving),
  8–9 (commute / eating) and 17–18:30 (commute), shown grey on the dial and in Stats' weekly heat map; the day's usable time doesn't change
- **The work layer** (computer calendar only; all of these are just marks — they don't change capacity or planning):
  - Paydays (every second Wednesday from 2026-08-12, moved earlier when it falls on a holiday) get a small `$` after the date.
  - Days off and public holidays get a tiny 💤 next to the date. Holidays are Ontario's 9 statutory holidays plus Civic Holiday, worked out each year by rule; one falling on a weekend moves to the next working day.
    On a weekday, hovering shows a faint 💤 — click to mark the day off, click again to undo; click an automatic holiday to remove it if you work that day. Weekends aren't marked.
  - Super rest days: click the progress bar at the top of a cell and the whole bar turns gold (with a slow glint); click again to undo.

**Timing (same on computer and phone)**: tap a task on Today to select it, press **Start** in the bar at the bottom, and **Stop** when you're done;
after stopping, the bar offers Done / Delay right away. Only one runs at a time; selecting another task while one runs shows "Switch to …" in the bar.
The timer syncs through the Sheet — start on the phone, stop on the computer; anything under a minute isn't kept.
No timer is fine too: after Done, enter under the task how long it took and when it ended, then Log (the estimate and the current time are filled in); if there's already a record, or for Delay, "+ time" adds another segment.

**Time and status are separate**: time spent is only what was recorded (the timer and segments you logged) — that's what today's done, the line, the dial, Stats' time and the quarter sheet use;
a task marked Done with nothing recorded counts no time. There are only three statuses — Done (finished), Delay (not finished, put off; it's only a note, it doesn't move anything — make a new task if you'll do more) and Drop (not doing it) —
used only for: how the calendar draws it (Done greyed and struck through, Delay struck through, Drop greyed), Stats' completion rate and Delay / Drop reasons, and plan progress (a Done item counts as finished).
The old Partial and Later both count as Delay; running setup with this `Code.gs` first backs up Tasks and then changes them to Delay;
old Done tasks with no time get one segment equal to their estimate (no clock times), so past numbers stay the same.
Each segment is written in the task's `Times` cell ("09:10-09:40 30m; 20m"), and Actual min is their sum; time on a task with no status yet already counts towards today.
Forgot the timer: type "Reading 14:00-15:10" in the add-task box (at least one time with a colon) and it's logged as a finished task; for another day, add it on that day in the calendar.
Started or stopped late: while timing, click "Since 09:10" in the bar to set the real start; the ⏱ next to Stop stops at a given time; for a recorded segment, open the task and click its times to change them.

**Chore key (same on computer and phone)**: a small round key at the top right of today's list starts timing housework; press again to stop. While timing, five emoji sort the segment —
🍳 cooking, ☎️ email / calls / messages, 🗃️ paperwork / filing, 🪪 IDs and other must-dos, 🏠 housework and tidying; tap again to clear; none = unsorted.
A day's housework is one Chores task (one more segment per press) and stays out of the normal list; segments are grouped by emoji into one line of chips ("🍳 40m ×3 · 8m = 48m"), and opening it shows each segment.

**Deep work (◆ Deep)**: tasks that need full focus can be marked Deep — ◆ Deep when adding a task, the ◆ next to Start in the bar (also while timing), or the editor on the computer.
Tick "Deep work by default" in a plan's editor and all its tasks (including automatic and past ones) count as deep; each task can still be changed.
Today's deep time is on the small label just under the dial; Stats has a Deep section, plus the thin outer ring of the pie and the last row of the timesheet.
To set yourself a target: Stats, under the pie → Adjust → Deep goal (hours per working day).

- `Stats`: pick a period (week / month / Season / year / Custom; it opens on Month each time), optionally only some projects or plans (tick several; none = everything, split by project), or only deep work. Two tabs:
  - **Time** (where the time went): a thin strip at the top — time on Build, how much of it deep, up or down from the previous period, and the overall total on the right; then daily bars (roughly how much was deep, with a soft electric-blue tide), a **24-hour pie**,
    an **hours-of-the-week heat map** (weekday × 24 hours from 6am; a cell's colour is the project that mostly filled that hour — its own colour above 70%,
    otherwise a blend of the top two; hovering a weekday on the left shows that weekday's average day split by project; "Week by week" expands each week),
    and a **timesheet** (project × day, grouped by week or month when long; the small triangle before a project opens its plans).
    The bars default to Build and the heat map to everything; both switch at the top right. Daily bars are lime (the total); charts split by project use each project's colour.
    Projects are always ordered Build, Work, Friends, Leisure, Fitness, Chores (on Projects, in menus, the pie and the timesheet).
    The pie is a percentage of each 24-hour day: sleep 7h and eating, cooking, dishes and showering 3h (daily) are counted but not drawn or listed, and the rest fills the circle;
    a default 2h of housework each weekend goes into Chores (Adjust changes these numbers). The pie uses the dial's neon colours.
    **On the side** (also in Adjust): one total per month — shows, novels and podcasts while working out or commuting. You can fill the previous two months, plus the current month in its last three days.
    It's spread over each day of that month and shows on the pie as a streak of light sweeping down from the middle of Untracked; it takes no time (it overlapped other things anyway).
  - **Plan** (how the plans went): how much got done, how many days held the line, how good the estimates were, planned vs actual per day and per project, reasons for unfinished work, and each plan's planned vs actual

**Reading (computer and phone)**: the first time you open Reading (or Settings → Reading on the computer), paste the link to your reading log Sheet once; it's saved as you paste. The Sheet doesn't need to be public — it's opened with your own Google account.
The `Reading` page (the book icon at the top right on the phone) has two boxes at the top right:
- **Want**: things you want to read or watch. Enter a title, a type (the Sheet's tabs: Book, TV…), a vibe (🎉 fun / 😊 growth / 👀 curious) and a note,
  and Add puts it on the Sheet's **Want** tab (created if missing, with the headers Name / Type / Vibe / Note / Priority).
  **Priority** is how much you want it (a priority, not a deadline): `Soon` = within a year or two, `5 years` = within five years, or nothing. You can set it when adding;
  when your typing finds something already in Want, two small buttons beside it set or clear it. It's written to Want's Priority column, which you can also edit and sort in the Sheet
  (older Want tabs without the column get it added at the end the first time it's needed). With an empty title, the Finished box lists the Soon ones first.
- **Finished**: things you finished. Pick the tab, the sub-type (only when that tab's sub-type cells have a dropdown — Book's book / English…, Game's played / completed),
  year and month, whether it was worth it (🥰 growth / 🎉 fun / 💢 regret, optional), a note, and Log writes it on that tab: under the last dated row,
  with the month written the way that tab already writes it. Something from Want is one click away, and logging it removes it from Want (its note comes along);
  a name already at the bottom of the tab without a date gets its date filled in where it is. Values missing from a dropdown (say the new year isn't in the Year options yet) are never forced:
  the page says what's missing and logs it once you've added it in the Sheet. The etc tab isn't logged from here.

On the computer, the Reading page also has a **Rest of 2026** box on the far right (it follows the year): what you mean to read for the rest of this year. Clicking the field at the bottom lists Want first (Soon on top),
typing lists matches, clicking one adds it; Enter adds what you typed. Drag the handle on the left, or press Alt+↑ / ↓ on a row, to reorder; × removes (with undo).
Anything the reading log marks as finished this year under the same name is struck through with its month; unfinished ones from last year carry over, marked "from 2025". The list lives in 苦昼短's Settings and syncs.

Apart from these cells, nothing in the Sheet is changed or deleted.
Typing a title searches **every tab** (each tab's header row is the row that says Name, one entry per row below) and shows the tab, year and month, and emoji of matches;
an identical name (ignoring case, spaces and title quotes) isn't added again. The Sheet is read again every time Reading opens, so edits made in the Sheet are found.
You don't have to log here every time (computer): adding a task under Leisure lists Want under the title box too; when a task is marked Done and its name is in Want,
the row asks **Finished it?** — tap 🥰 / 🎉 / 💢 (or ✓ for no rating), then the sub-type for tabs like Book and Game, and it's logged on its tab with the task's month;
`Not yet` = not finished; that task won't ask again.
Offline, entries wait on the device and go out once you're back online.

**Meals**: in the spirit of meal kits like HelloFresh — no grams, no calorie numbers. Three tabs on the computer:
- `Groceries`: things you buy often — which store (Longo's / Farm Boy / Dodo / T&T / Eataly / Loblaws by default, or type your own), the price per purchase,
  **how many days one purchase lasts** (7 if empty), **energy level** (Low vegetables and fruit / Mid normal / High fried, fatty or sweet), and deals.
  Staples (oil, salt) stay off the shopping list. Deals run in rounds: weekly flyers are Every week, something on sale about monthly is Every 4 weeks,
  plus the date one round starts; rounds you haven't checked yet show on the Plan tab (the number next to Meals in the sidebar), and No deal or On sale… (sale price and end date) marks them as checked.
- `Boxes`: a Box = one meal = a few things, with amounts in words ("1 cup", "a handful"). A box's level is set automatically:
  its heaviest item, one level lower if more than half is Low (staples don't count); or pick it by hand. Next to it, roughly what a day's worth costs (each item's price ÷ days it lasts, added up).
  Drag a grocery from the shelf onto a box to add it, or click the grocery for an "Add to…" menu of boxes.
- `Plan`: at the top, the **next shopping list** by store: what this week's days need ÷ how many days a purchase lasts = how many times to buy, at the sale price if the shop day is during a deal;
  tick what you bought, Have it for what's still at home (no cost), and add anything else by hand; Mark shopped counts everything unticked as bought. Ticks are remembered —
  a bag of rice that lasts 30 days won't show up again for the next few weeks. Below: this round's unchecked deals and the Boxes to drag;
  this week and next by day (from Friday, this week disappears and planning starts from next week). Drag a Box onto a day, click a Box chip for a "Put on…" menu, or click a day to choose;
  drag a planned day onto another day to copy it (or open the day: Same as another day); mark a day Not cooking.
  Each week has a small Low / Mid / High bar, red when High goes over the limit. The four weeks after that are four boxes holding only "which Box × how many"; when one becomes next week, Fill empty days spreads them over breakfast, lunch and dinner on the empty days.
  The gear at the top right: shop day (like a cutoff: the last one on or before the week starts), most High boxes per week, weekly budget (blank = no comparison).
  At the bottom, **To try**: dishes you had out and want to make yourself (name + note), as For meal prep (to become a Box) or Try once.
  Write them right there (paste several lines = several dishes; "dish — note" is split), or open a finished Leisure / Friends task on Today and add a few with `+ What I had`,
  which records where and when. `Make a box` = create a Box with the same name (the note goes into How to make it) and remove it from the list; for Try once, `Tried` when you've tried it. Computer only.
- `Restock`: non-food things to replace or refill on a schedule (vitamins, toothbrush heads, a phone) — price, how often (short form in the Every column: 3m, 2y, 3d, 1w), next date; Replaced moves it one cycle on;
  each has a mark: 🏠 household, 💅 clothes and skincare, 🩺 health, 💻 tech, 🎁 gifts, 🪐 other (unmarked = 🪐); the row at the top filters by mark, and Coming up follows the filter;
  Coming up at the very top lists what the next three months will cost, by month. Further down, **Buy once** is for one-off buys (a dress, a lamp): price and an optional date
  (with a date it counts in that month of Coming up, and after the date it's Overdue); Bought moves it into Bought (n) at the very bottom, and Put back brings it back.
  The right-hand column, **Big buys**, shows what each expensive thing (camera, computer, headphones) costs per day. Each has an emoji kind on the left (📷 camera, 💻 computers and tablets, 📱 phone, 🎧 headphones, 🔊 speakers, ⌚ watch, 💅 beauty treatments, 🪐 other; pasted English names like Camera work too); the highest cost per day is on top (RMB and CAD compared at the rate). Enter the currency it was paid in (RMB / CAD), the price and the purchase date,
  and a retired date when you stop using it (days are counted up to then, and it moves into Retired (n) at the bottom). The page shows one currency (CAD by default): the tiny `$` next to the title switches to `¥` and lets you type the rate (`1 CAD = 5 RMB`); another currency is one more line in `GEAR_CURS` in `js/meals.js`;
  the cost per day is shown in that currency with one decimal; anything still in use costing under $0.5 / ¥2 a day in its own currency is marked replace.
  The emoji gets a colour behind it: bright green if bought within 12 months, pale green within three years, nothing earlier. Restock dates don't show the weekday.
  `Paste` takes a whole block from a spreadsheet (with headers: Name, Category, Currency, Price, Purchase, Retired; no Currency = RMB), updating rows with the same name.
  Like everything else it's stored in the Settings tab (`meal-gear:…`), shared by phone and computer.
  The arrow left of the title (or swiping right on the panel with a trackpad or finger) folds the column away to the right, leaving a strip of emoji; the arrow or a swipe left brings it back. Folded or not is remembered on that device.
- Phone: the 🛒 in the top bar (number = items left to buy) opens the next shopping list with only the things to buy (no prices or notes), to tick off in the store. Everything else about meals is computer only.
  The first time, Start with examples shows what it looks like (a few Toronto stores, rough CAD prices); one click on the Groceries tab removes them.

**Phone**: see tasks, time them, mark results, add tasks, add to the reading log. The top row is the five days before and after today; tap a day to see it.
Only the opened row has Done / Delay / Drop (other rows just show their status on the right), plus ↑ ↓ on the right to move it up or down; after Done you enter how long and when it ended, Delay and Drop ask for a reason;
press and drag the minutes on the left to reorder; add tasks at the bottom of the list ("Gym 40" — a trailing number is minutes). The project is a small chip; tapping it opens a dropdown of projects with their plans. Planning and settings happen on the computer.

**Spending (phone and computer)**: records are kept on the device; paste a spending Sheet link in Settings on the computer and it syncs with that Sheet, and both sides can add and edit.
- Phone: pull down from the top of Today (with the page scrolled to the top) — a drop grows under the Dynamic Island; at about 90px the neck snaps and the "+" turns blue, and letting go drops the panel like a curtain
  (with a small bounce at the bottom). It stops at about 94% of the screen with a hem of a few soft waves along its lower edge; scrolling the list makes the waves drift and sway before settling. Tap the strip of Today still showing below (or the hem),
  or push the small bar at the bottom up, and the curtain rises again (if you added anything, the island shows today's total for a moment).
  Inside: Year / Month / Day, a draggable bar timeline, category chips, the list (tap to edit, swipe left to delete), suggestions, and Add a new transaction (a number pad that also takes `12.5+8`).
  The chart icon at the top raises the charts to half height (the period and timeline stay visible); drag up for full height, down to close.
- Computer: Spending is one large translucent black board laid out like a web page: the period and sync status at the top, with Month / Year, ‹ Now ›, search (`/`), the currency to show totals in, the gear and `+ Add` (N) on the right;
  a row of five numbers below (Spent, Income, Balance, Budget used, Budget left, with a thin line for the range of the previous six months); then the chart and the transaction table on the left (a month is grouped by day; a year and search results by month),
  and By category on the right (click one to show only that category). `+ Add` opens a row under the header to type straight in (Tab between fields, Enter saves and closes the row, Esc or clicking outside an empty row closes it; N again for the next one). Click a row in the table to edit it in place; hovering shows Edit / × (both can be undone).
- **Currencies**: each record keeps the currency it was paid in (CAD, RMB, USD, EUR, GBP, JPY, HKD). Pick it next to the amount; new records keep using that currency until you change it (per device).
  Totals, charts, categories and the budget are shown in one currency — CAD by default, switchable per device (the `CAD ⌄` next to the totals). Rows show the original amount with the converted one underneath.
  Rates are in Settings → Currency (`1 CAD = …`): type them, or Use today's rates to fetch the European Central Bank's (via frankfurter.dev, only when you ask, or once when you first pick a currency with no rate). A currency with no rate yet uses a rough one, marked "rough". Budgets are set in CAD.
- Settings: the gear on the phone, a 苦昼短 dialog on the computer — Budget (from a month on, per month), Categories (add, rename, hide; unused ones can be deleted; on the computer also base / not in budget), Currency, Export (.md), Import a month. Big numbers show the cents a size smaller.

**Quarter sheet**: paste your quarter Sheet's link in Settings → Quarter sheet (one tab per quarter, named `2026 Q4`). From the day you paste it, two cells are filled every day (earlier days are left alone):
`progress` = hours actually spent that day on projects that count towards progress × 10, `focus` = that day's ◆ Deep hours ÷ 10 (rounded to whole hours).
The columns that can't be worked out (scores you give yourself each day) are set up under Daily scores on the same card: one line per column, `header as in the Sheet · what it means · usual range · steps "number + a few words"`,
for example `gym · moving · 3–15 · 3 stayed in · 5 usual · 8 walk out`. From the day those lines are written, the right side of Today on the computer has a box each day: each column shows its name and a number field (you can type in it),
with the steps below — clicking a step fills in its number; a note field at the bottom. Once every column is filled it folds into a one-line summary; Edit opens it again. It writes the columns with the same names and the `note` column on that day's row.
Past days in the calendar that aren't fully scored have a red dot by the date.
No other cells are touched.
Which projects count towards progress, and which count as growth (all / only Deep; the rest is Relax), are ticked in Settings → Projects;
if last week's growth or Relax time was too little or too much, the right side of Today says so (the four thresholds are there too).

**Storage**: Settings → Storage shows how much this device holds and, at the recent rate, how long it will last; Today warns two weeks before it might fill up.
Then use Archive: tasks before January 1 of last year move to the Sheet's Archive tab (still viewable there), freeing room on the device.

**Today's progress bar**: one segment per task, recorded time only — solid = recorded, zebra stripes = still to do; tasks marked Done / Delay / Drop keep only the recorded part.
Optional tasks carry an Optional label; at night they also sit on a faint leopard print.

**Day / night**: the small ball at the top left (next to the date on the phone) is the sun by day and the moon at night; click to switch. Normally it follows the clock: day from 6am, night from 6pm local time; a click holds until the next six o'clock, then it follows the clock again.

**Small things that sometimes pass over the background**: a plane every three to five minutes — a dot with two contrails high up by day, a blinking red-eye flight at night; every ten minutes or so, something seasonal drifts down by day (new leaves in March–April, carnations May–August, maple leaves September–November, snowflakes December–February; with wind, one or two spin) and a meteor shower falls at night; every six to ten minutes a wide, low tide rolls in from the bottom right and back out, glowing at night. They each keep their own schedule, so they can overlap. On the phone there's only the tide. Turning off Sparkles in Settings → Look stops all of them.
Cards, the sidebar and the bars are translucent (lightly frosted by day), so the sky, clouds, star glints and these things show through; the phone shows the whole sky too.

**What's where in the Sheet**: Tasks / Projects / Items and a few more tabs are visible (plus Archive once you've archived). Tasks' `Group` column = the project a task belongs to
(it can belong straight to a project with `Project` left empty). Each row of Projects is a plan: `Group` = the project,
`Project` = the plan's name, `Kind` / `Place` as above, and a Regular plan's rule in the hidden `Rule` column;
automatic task IDs start with `rt:` (Regular) or `au:` (a Total plan's share for today);
timer records are in Tasks' `Times` column, deep work in `Deep` (ticked = yes, editable in the Sheet);
the running timer, per-day capacity changes, commute days, the reading Sheet link, the pie defaults and the deep goal (`life`) are in the (hidden) Settings tab.
The project list (names, colours, progress / growth) is `groups` in Settings; goals are one row each, `goal:<id>` (`up` is the parent goal, `by` the projects `g:name` / plans `p:id` serving it),
the North star paragraph is `north-star`, Reading's rest-of-year list is one row each `read-plan:<id>`, the weekly thresholds `weekly`, the quarter Sheet link `quarter`, the daily score columns `scores` (each day's scores one row each, `score:<date>`),
and the spending exchange rates `spend-fx`.
Meals are in Settings too, one row each: `meal-ing:` groceries, `meal-box:` meals, `meal-week:<first day of the week>` what's planned / bought that week, `meal-prefs` settings (`meal-pack:` is the old Day pack, expanded into Boxes when read).
Spending has its own Sheet: Transactions (Date, Kind, Category, Note, Amount, Currency — blank means CAD — plus hidden ID / Updated / Synced), Budgets, Categories and a hidden Deleted tab.

## How syncing works

- Every record has an ID and a modified time; when two devices change the same record, the later change wins
- Changes are pushed 2.5 seconds after you make them, again when you leave the page, and everything syncs again when you come back, reconnect, or every 2 minutes
- Everything is saved on the device first, so it works offline and goes out once you're back online
- The Sheet is for looking and analysing, not planning: edits made directly in the Sheet only reach the device after
  "Reload everything from the Sheet" in Settings

## Development

Plain JavaScript (ES modules), no build step, no npm. Local preview:

```bash
python3 -m http.server 8000
```

then open http://localhost:8000. All tests (the planning engine, stats, repeats, meals, spending, and `Code.gs` against a fake Sheet):

```bash
node --test test/*.test.mjs
```

To try syncing against a fake Sheet: `node tools/fake-sheet.mjs` starts one at http://127.0.0.1:8002/exec
(secret `CHANGE_ME`; it first upgrades an old-style Sheet with the main branch's `Code.gs` and creates some previous-version data, then runs setup with the current `Code.gs` —
just like a real upgrade from the previous version; it also has a fake reading Sheet (several tabs, header rows at different heights), link `https://docs.google.com/spreadsheets/d/FAKE-READING-0000000000000000/edit`). `python3 tools/serve.py .` (or `node tools/serve.mjs .`) serves the page without caching (port 8000);
`HOST=0.0.0.0 node tools/serve.mjs .` makes it reachable from a phone on the same Wi-Fi at `http://<your computer's IP>:8000` (the service worker doesn't run over plain http on the LAN, which doesn't matter for looking).

Screenshots: `node tools/look.mjs` starts the page and the fake Sheet itself and uses Playwright to capture the usual pages (phone 390×844, computer 1440×900, narrow computer 1000×760, day and night),
then lists console errors and phone inputs under 16px (iPhone zooms in on those). `--only today,spending` takes only shots whose names contain those words; `--worst` adds extreme data
(very long names, a column full of goals, huge amounts); `--out <dir>` says where the pictures go. Install Playwright first (`npm i -g playwright`, then `npx playwright install chromium`); the global install is preferred over any other copy found higher up the folder tree.

Skills for coding agents are in `.claude/skills/`: `look` (the screenshot pass above), and, from other authors under MIT with their licences alongside, `mobile-native`, `break-ui`, `animation-performance` and `web-interface-guidelines`. Where any of them disagrees with `DESIGN.md`, `DESIGN.md` wins.

Fonts (Unbounded, Space Grotesk, JetBrains Mono) are in `fonts/` under the SIL Open Font License, with the licence in the same folder.
