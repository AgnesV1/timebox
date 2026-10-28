# 苦昼短 · Design rules

For people and for design skills (frontend-design, Impeccable, ui-skills and the like): read this before changing the interface. Everything here already exists in the CSS, and each rule names where (selector / token).
It says the same as the comments at the top of `css/app.css` and `css/money.css`; when they disagree, the CSS is right and this file gets fixed.

## 1. Principles

- **Two looks that follow the clock**: by day (6:00–18:00) it's acid neon — white ground, thick black edges, hard offset shadows, fluorescent blocks of colour; at night it's cyberpunk — black ground, neon, things glow. The rule is `lookAt` in `js/day.js`, and the inline script at the top of `index.html` matches it (`[data-theme="light"]` / `[data-theme="dark"]`).
- **Lime is the only accent** (`--accent`). Where a second colour is needed, it's a project's oil-paint colour (charts, sidebar icons), not a new accent. The only exceptions, each asked for by name: the gold bar of a super rest day, the spending colours (section 5), and the paper shards / fireworks on Done.
- **As few frames as possible**: grouping goes from light to heavy — alignment → spacing → heading → hairline → tint → thin edge → thick edge + hard shadow — and each place uses the lightest level that still reads. Thick edge + hard shadow (at night a thin edge + inner glow) is only for three things: each page's main content card, things floating on top, and primary buttons. No frames inside frames.
- **Quiet**: in a list only the opened row carries buttons; secondary buttons and chips have no outline, just the faint `--tonal` fill; repeated rows of options become plain words. When unsure, choose the quieter option.
- **The sky shows through**: cards and the sidebar are translucent (`--card`), lightly frosted by day (`--frost`) and not blurred at night (star glints are only a pixel or two).
- **Animal prints mean status**: not done = zebra stripes, partly done = leopard, done = solid; at night optional tasks sit on a faint leopard print (`[data-theme="dark"] .row.opt::before`).

## 2. Colour and type

| token | day | night | used for |
|---|---|---|---|
| `--page` | `#F3F3EE` | `#07070B` | page background (`body`) |
| `--bg` | `#FFFFFF` | `#0C0C13` | solid ground of cards, dialogs, inputs; the whole page at phone width (the strip by the Dynamic Island takes its colour from it) |
| `--surface` / `--surface2` | `#F2F2EE` / `#E8E8E2` | `#15151F` / `#1E1E2B` | hover ground, the opened row, the active item in menus |
| `--ink` / `--muted` | `#0B0B0B` / `#74747C` | `#F4F4F8` / `#8A8AA2` | text / secondary text |
| `--line` | `#EBEBE6` | `#1C1C29` | hairlines between rows |
| `--edge` | `#0B0B0B` | `#2C2C3E` | colour of the thick edge (`--b`) |
| `--accent` / `--accent-ink` | `#C6FF00` / `#0B0B0B` | `#CCFF00` / `#0C0C13` | the one accent: selected, current, primary buttons, progress |
| `--hot` `--blue` `--warn` `--ok` | `#FF3EA5` `#2F5BFF` `#FF2E55` `#27B35A` | `#FF2BD6` `#00E5FF` `#FF4D6D` `#5CFF9D` | a little status: page titles (`--blue` by day), overdue red, done green |
| `--meter` | lime → pink → blue | lime → ice blue → pink | gradient progress bars |
| `--b` / `--b-soft` / `--b-ctl` | 1.5px ink / 1.5px `#E2E2DC` / 1px `#CDCDC6` | 1px `--edge` / 1px `#222232` / same as `--b` | thick edge (main cards, primary buttons) / soft edge (sidebar divider, inputs) / dropdowns |
| `--hard` / `--hard-lg` | `2px 2px 0` ink / `3px 3px 0` ink | inner glow / a ring of ice-blue light | hard shadow: main cards, primary buttons / dialogs and floating menus |
| `--glow` | none | `0 0 14px` lime | things lit at night (primary buttons, the selected segment) |
| `--card` / `--frost` | 50% white / `blur(4px) saturate(140%)` | 50% `--bg` / none | translucent cards and sidebar (the "translucent" section at the end of `app.css`) |
| `--tonal` | 6% ink | 8% white | faint fill of secondary buttons and chips |
| `--c-*` / `--k-*` | neon colours of charts and the dial / one step darker | same, brighter at night | charts split by project |
| `--r` / `--r-sm` | 14px / 10px | same | corner radii |

Project colours are oil paints: viridian `#3E8E6E`, ultramarine `#3F62B5`, cadmium orange `#E07A2B`, mauve `#8B62AE`, ivory `#E6DCC3`, burnt sienna `#9A5A36`, ochre `#D2A52E`, alizarin `#B5413F` (`PALETTE` in `js/groups.js`). Each sidebar section's icons take that section's oil colour (`.sblock a:not(.on) .ic { color: var(--tint) }`).

Type (shipped in `fonts/`, no CDN):
- `--display` = Unbounded: page and card titles (`.page-head h2` 20px/700, `.phead h1` 17px/700)
- `--body` = Space Grotesk: body text 14px (`body`)
- `--num` = Space Grotesk by day, **JetBrains Mono at night** (`.num`, `tabular-nums`)
- Interface text is English in sentence case (not Title Case); the owner's own content can be any language

Focus: `:focus-visible` is a 2px ink outline by day (lime is invisible on white) and lime at night.

## 3. Components

- **Page header**: computer `.page-head` (Unbounded 20px title, cobalt `--blue` by day, white with a slight glow at night); phone `.phead` (sticky, translucent and frosted, a 3px lime underline `.phead::after`, and a solid `--bg` strip over the top safe area).
- **Segmented control**: `.seg` (a `--tonal` pill, the selected segment `.seg button.on` lime); with `.seg-pill`, the selected block slides from the old segment to the new one (`js/motion.js`).
- **Buttons**: primary `.btn.primary` / `.btn.cta` = lime + `--b` + `--hard` (lime + `--glow` at night), one per area; secondary `.btn` = unoutlined `--tonal`; `.icon-btn` 32px transparent with a `--surface` hover; paging and Week / Month style `.nav` are plain text until hovered, `.nav.on` is lime.
- **Chips**: `.chip` (12px/600, `--tonal`, `.chip.on` lime; at night `.chip.on` is a faint lime fill + lime edge + glow). An emoji row to pick from (`.em-pick`) works like an emoji keyboard: no lines, the chosen cell lights up as a whole. On the phone the opened task row's Done / Delay / Drop are small pills (`body.phone .row.open .chip`: 26px, 12px text, with a larger invisible tap area).
- **Cards**: one per page for the main content (`.today-main`: `--b`, 16px radius, `--hard`), on `--card` + `--frost`; Stats sections are unoutlined, unshadowed translucent panels. Task rows inside a card (`.row`) have no fill; a selected `.row.picked` is pale lime, an opened `.row.open` a very faint ink.
- **Calendar cell bar** (`.load`): it measures each day against its box — the time actually logged on days already gone, what's planned from today on (the hours shown after the date, repeats included), every group counted; its length is that ÷ the box. Past the box (`.cell.over`) = the whole bar a steady `--warn`, no pulse. Past 7 hours but within the box it keeps its usual neon gradient and, every 5 seconds, breathes in a layer and out again (`.load.over7.blink i::after`): by day `--hot` (rose) with a 4px glow, at night `--warn` with the wide glow. With Sparkles off or reduced motion it just keeps a faint glow; a gold super rest day stays gold either way. A group's Counts as progress plays no part (that's for the quarter sheet). Provisional, 2026-10-28.
- **Plans** (2026-10-25): on Today a plan is one row (`.row.plan`, bold name, the left cell is the sum of its items' minutes in a smaller size) with its items under it as plain lines (`.ls-ln`: a 15px square tick box `.ls-cb` — ink with a lime tick by day, lime at night — the name, about how long in `--num` muted); steps indent under a hairline (`.ls-steps`). Nothing on Today offers to fill a plan from its pool (no prompt when no items were added — picking happens by dragging on the calendar). The row has Done / Delay / Drop like any task. On the calendar a plan's day is one sticky (`.ev.blk`). With the Pool open, today and later cells are `.cell.cal-plan` (2026-10-27): the sticky is `.blk-ls` — the bold name on its own line, then one item per line (`.li`: name, minutes right-aligned in muted `--num` as `.lm`) — other chips show their minutes (`.ev .m`, muted, right), and the date in the cell head is followed by that day's planned hours (`.cal-hrs`, ink, after a muted `·`). Past cells never change with the Pool and show no minutes. In week view a `.cal-plan` cell is narrow, so its commute toggle is hidden, its box chip (`.cap`) tightens and goes when the cell is under 110px (container query). With the Pool closed the sticky is the bold name only; hover (or a drag over the day) shows `.full`, the same paper floating above with the same item lines. The plan editor's pool is a list of hairline rows (`.ls-it`: name · minutes · times · extra, numbers in `--num`), uppercase section labels with a `Later` chip, and an opened item on a `--tonal` panel (`.ls-ex`) — no frames inside the dialog.
- **Tables**: `.mtable` (in settings), `.tsheet`, `.gtable`: 13px, hairlines between rows, no frame; number columns right-aligned.
- **Inputs**: `input, select, textarea` = `--b-soft` (dropdowns `--b-ctl`), `--r-sm`, solid `--bg`; focused, the edge turns ink by day and lime with a faint ring at night. Inputs on the phone are never under 16px (iPhone zooms into smaller ones).
- **Dialogs**: `#modal` puts a 32% ink layer and 3px frost behind; `.sheet` = `--b`, 16px radius, `--hard-lg`, usually 480px wide, `.sheet.wide` 720px. One at a time; Esc or clicking the background closes it; closing returns focus to the button that opened it, or to the page title if the page was redrawn and the button is gone (`js/ui/modal.js`).
- **Dropdown menus**: `.menu` (`js/ui/select.js`, replacing the system dropdown on the computer): solid `--bg`, `--b-ctl`, 12px radius, grows out of its button (`menu-in`). The "Put on… / Move to… / Add to…" menus of draggable things use it too (`openMenu`). On the phone the project picker uses `.menu.menu-touch`: the same menu sized for fingers (42px rows, 15px text) with a thick edge and hard shadow by day, opening below or above the chip without covering it.
- **Collapsed sidebar**: the current page has the lime pill behind its icon and a 3px lime bar against the sidebar's right edge (`body.side-min .snav a.on::after`), glowing at night.
- **Toasts**: `#toast`, with Undo; status text that sits in place stays unframed and doesn't pop a toast.
- **Projects rail**: the North star paragraph (`.ns-text`) is three lines tall (`max-height: calc(1.75em * 3 + 2px)`), scrolls inside, and fades out at the bottom while there's more below (`.ns-text.more`, set by `goalsAfterRender()` in `js/ui/goals.js`); while a link is being dragged (`.projects.lk-drag`) it opens to 34vh, and goals folded behind "+N more" (`.gl.fold`, normally `display: none`) show.
  While links show on hover (`.projects.lk-dim`), what's linked gets a lime highlighter — a goal's name only (`.gtx` inside `.gt`; both carry 2px padding cancelled by negative margins so nothing moves), a North star word as a whole (`.ns-g.lk-on`); at night it's the `.chip.on` treatment (faint lime fill, lime text, glow). The North star's plain words turn `--muted`. A linked word hidden by the three-line clamp is shown in a same-sized layer laid over the paragraph (`.ns-focus`, `focusNorth()` in `js/ui/links.js`): its sentence, else part of it, else the words alone (always the words alone when two or more are linked); linked folded goals show (`.gl.fold.lk-unfold`, "+N more" counts down).
  Past goals (`.gpast`) sit under the sections behind a hairline: a `Past` toggle with a chevron, the quarter dropdown and "N of M done"; small group headings (`.gpast h5`) and rows (`.gh`) a step quieter than `.gl` — no links, the grip only on unfinished ones.

## 4. Motion

- Curves: `--ease: cubic-bezier(.22, .9, .28, 1)`; springs are sampled into CSS `linear()` (the Kinetics approach, no animation library): `--spring` (stiffness 400, damping 32, about 0.4s, a hair of overshoot) and `--spring-pop` (stiffness 300, damping 20, about 0.57s, a visible bounce for toasts).
- Changing pages, marking a row: View Transitions (`::view-transition-group(*)` 0.3s `--ease`); on a full redraw rows each glide to their new place.
- Day ↔ night: the page fades over 2.1s, a dusk glow at the bottom edge takes 3s, the old sun or moon sets in 1.2s and the new one rises in 1.8s (the `html[data-vt="theme"]` section). The svg inside the ball spins; the button itself never does.
- Micro-motion only animates transform / opacity / colour (the "micro-motion" section of `app.css`): the sliding segment pill, numbers rolling digit by digit, the light running round the timer bar (`.dock.run::after`).
- **Reduced motion** (`@media (prefers-reduced-motion: reduce)`): no movement, spinning, bouncing or loops; fades and colour changes stay (so a change of state is still visible). **Sparkles off in Settings** (`html.fx-off`): decorative effects (running light, stars, paper shards and fireworks, link streaks) don't play.
- The link streaks on Projects (`js/ui/links.js`, `.lk-*`): lines fly out from the hovered end (0.46s `cubic-bezier(.16, 1, .3, 1)`, 40ms apart); a streak's length and period follow the line's length so long and short lines run at the same speed; at most `STREAKS` lines carry a streak at once; by day an ink streak with pink and blue copies off-register (screen print), at night the project's neon colour over a wide faint band as the glow (no filters). With reduced motion there are no streaks and the track is drawn solid.
- The phone's For … chain on the opened row (`.phone-day .chain.mq`, `marquees()` in `js/ui/today.js`): when it doesn't fit on one line it becomes a marquee — two copies in `.ch-track`, holding still for the first 12% of a loop, then sliding one copy's width at about 28px/s, edges faded with a mask; holding a finger on it pauses (`.hold`). With reduced motion it doesn't move and can be dragged sideways as before.
- The spending curtain's hem (`.mn-phone .mn-hem`): a few soft waves (a 110px wave tile used as a mask); a spring in `js/ui/island.js` writes only `--sway`, `--stretch` and `--shift` on that small layer, so scrolling makes the waves lean, rise and drift sideways before settling.

## 5. The spending set (`css/money.css`, classes prefixed `mn-` / `sp-`)

Same as the rest of 苦昼短: the type (Space Grotesk, JetBrains Mono for numbers), pill-shaped segmented controls and buttons, 32px icon buttons, as few frames as possible (no frames inside the board, only `--sp-line` hairlines and spacing), and only fades under reduced motion.

Different:
- **It ignores day and night**: the phone panel is always pure black (`.mn { background: #000 }`, like the Dynamic Island); the computer's Spending page is 50% translucent black + frost (`.mn.spend`), darkened further by day (`brightness(.58)`) so the text stays readable.
- **Its own colours** (asked for by name; "lime only" doesn't apply inside it): cobalt `--mn-blue #4C72D8` = normal, orange `--mn-orange #EE8A33` = over budget and only that (`M.isOver`: a day is over once the month's budget has run out by then; the chart's reading dot `[data-csp]` follows `c.over`; a negative balance or a higher-than-usual range dot stays blue), teal `--mn-green #4FB3A9` = income; primary buttons and selection `--mn-pri #2F52B8` with cream text `--mn-pri-ink #F6F0E2`; the budget is a pale sky-blue area `--mn-bud`, the House base teal `--mn-base`; text `--mn-ink #F2EEE6`, secondary `--mn-mute`.
- Floating layers are frosted glass (`.mn-cal`, also the currency menu `.mn-curm`: `rgba(28,28,36,.86)` + `blur(20px)`); chips and tiles are translucent white `--mn-fill` with a fine highlight along the top edge `--mn-hair`; the list fades into a progressive blur at its top and bottom edges (`.mn-pblur`).
- Only four type sizes: 22 / 15 / 13 / 11 (`.mn-h1`, body, `.mn-13`, `.mn-meta`). The exception is the number pad (`.mn-k`): keys 52px tall with 24px digits, asked for so they're easy to hit.
- **Budget left** reads `$1,512.34 · 69%` — the money left, then the share left (`.mn-kp` on the phone, `.sp-kp` on the computer, the `·` drawn by `::before`). The phone's card grows with it (cards are `flex: none` in a sideways scroller); on the computer the cell is a size container and the number shrinks with it (`clamp(14px, 9.5cqi, 24px)`), so the four cells keep one row height.
- **Stats pie** (`.piecard`): the card stretches to the height of the chart beside it and the pie and legend sit centred in it; a project's slice and legend row are clickable (`.slice.pick`, `.pie-li` — a plain-looking row with a `--surface` hover) and narrow the page to that project; `.pie-only` under the pie says what's shown, with Clear. A red `.dsc-dot` next to Adjust (`.st-due`) means last month's On the side is empty.
- The panel's footer row (`.mn-frow`): the Recommended chips scroll on the left, and a 44px round **+** (`.mn-fab`, `--mn-pri` with cream, like the pad's Add key) sits at the bottom right.
- The entry sheet (`.mn-sheet`) also rises on its own from Today's **Spend** key (`.add-spend`, phone): the panel gets `.entry`, which hides the curtain and its veil so only the sheet and its scrim show.
- The charts can show spending without House: tapping above the House area swaps the drawing (no House area; line and budget without House) and adds a note (`.mn-cnote` on the phone, `· without …` in the title and `.sp-back` in the legend on the computer); `.mn-chart.mn-tap` gives a pointer cursor where a click would switch.
- Motion: entering `--mn-enter: cubic-bezier(.16, 1, .3, 1)` (out fast, settle slowly, no overshoot), leaving `--mn-exit: cubic-bezier(.4, 0, 1, 1)`, small buttons `--mn-spring` (0.5% overshoot); durations: press 120ms, toggles and chips 280ms, panel in 420ms, out 260ms, numbers 450ms, bars 520ms.
- Numbers on the computer are monospace and right-aligned (`.sp-table td.r`, `.sp-kv`), the cents a size smaller and fainter (`.mn-dec`). A record in another currency shows its original amount with the converted one in small text underneath (`.mn-am small`, `.sp-conv`); the `CAD ⌄` buttons (`.mn-curb`, `.sp-curs`) pick the currency.

## 6. What design skills must leave alone

These may look like problems; they're on purpose:

- **Emoji kinds and marks**: Ideas' 🎭 ✈️ 🍽️ 🍹 🛰️, Restock's marks, the Chore key's 🍳 ☎️ 🗃️ 🪪 🏠, Reading's 🥰 🎉 💢 (`.em-pick`, `.idea-kinds`, `.chore-tags`). Don't swap them for icons or words.
- **Frosted, translucent cards** (`--card` + `--frost`): they let the sky, clouds and star glints show through; they aren't decoration.
- **Neon glow at night** (`--glow`, `[data-theme="dark"] .chip.on`, the glow of `.btn.primary`, the wide faint band under link streaks).
- **Monospace numbers at night** (`--num` = JetBrains Mono).
- **Gradient progress bars** (`--meter`).
- **Hand-written Chinese comments** in the code: they're conversational and explain why. Don't translate them into English or delete them.
- **Day and night follow the clock, not the OS colour scheme**, and so does `theme-color` (the strip at the very top of the phone must match the page).
- **Pulling the ledger down from the top of Today on the phone** relies on `touchmove` + `preventDefault` (`js/ui/island.js`); that is the feature.
- **Lime is the only accent**: don't add a second one; the spending colours stay inside `.mn`.
- The gold bar (super rest day) and the paper shards / fireworks on Done: exceptions asked for by name.
