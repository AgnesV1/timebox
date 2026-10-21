---
name: look
description: Screenshot 苦昼短 on a phone and a computer, day and night, against the fake sheet, then check every picture. Use after changing anything the user can see (CSS, page markup, the spending panel, the Projects links).
---

# look: screenshot the interface after a change

`DESIGN.md` is the reference: if a screenshot disagrees with it, the change broke something; if `DESIGN.md` says nothing about it, don't "correct" it to your own taste.

## When to use it

After changing the interface (`css/`, `js/ui/`, `index.html`), before committing. Not needed for pure calculation (`js/*.js` without UI), tests or docs.

## How to run it

Playwright has to be installed first (it already is in Claude's cloud environment):

```bash
npm i -g playwright && npx playwright install chromium
```

Then:

```bash
node tools/look.mjs
```

It starts its own page server (`tools/serve.mjs`, port 8010) and fake Sheet (`tools/fake-sheet.mjs`, port 8012), connects them, loads fake data (tasks, goals, five months of spending) and takes the shots in its list. Options:

- `--only <words>`: only shots whose names contain one of the comma-separated words, e.g. `--only today,spending` or `--only phone-dark`
- `--worst`: extreme data instead (very long names, a column full of goals, huge amounts)
- `--out <dir>`: where the pictures go (the system temp folder by default)
- `LOOK_PORT=8020 FAKE_PORT=8022 node tools/look.mjs` if those ports are busy (for example a preview server is already on 8010)

It prefers the global Playwright (the one whose browser `npx playwright install` downloaded) over any other copy found higher up the folder tree.

## Which shots

The `SHOTS` list in `tools/look.mjs`: devices `phone` (390×844), `desk` (1440×900) and `small` (a narrow computer, 1000×760), each in day and night.
Roughly: Today (an opened row, hover, the project dropdown), pulling the ledger down on the phone (halfway, past the line, falling, open, scrolling, adding, charts, categories), the calendar, Projects (hovering a goal / plan / the North star, dragging a link, editing and adding goals, Ideas, the plan editor), Stats, Spending (add, added, edit, filter, search, year, settings), Reading, Settings, and the collapsed sidebar (last, because collapsing is remembered for the rest of the run).

## What to check in the pictures

When it finishes it prints where the pictures are, any console errors, and phone inputs under 16px. **Open every picture**; the printed summary isn't enough:

- Left edges and baselines line up; things in the same row have the same height
- Long names end in an ellipsis instead of breaking the row or pushing the numbers on the right out of view
- Glow at night doesn't smear into a haze; by day the thick edges and hard shadows are only on main cards, floating layers and primary buttons
- Lime is the only accent (inside the spending panel it's cobalt / orange / teal, see section 5 of `DESIGN.md`)
- Phone inputs are at least 16px and buttons are easy to tap
- No console errors

## Known quirks

Right after a redraw, while a page transition is still running, the first hover sometimes doesn't register. `hover` now moves the mouse away and back first and waits up to 3 seconds for the links to appear. If a hover shot still has no lines, run `--only projects-hover` again on its own.
