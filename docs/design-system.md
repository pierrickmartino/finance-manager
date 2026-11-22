# Design system

The app's look, "Midnight": ink and one amber accent on cool paper under a navy band, Inter for everything read and operated, Inter Tight for display, and small corners. It is **light only**: every page keeps these colours whatever the system theme.

Two files hold it, and a page takes its look from them:

- `src/app/globals.css`: the **tokens** (the `@theme` block), so every colour, both fonts and the corner radii are Tailwind utilities (`bg-paper`, `text-ink`, `border-rule`, `font-display`, `rounded-xl`…). Values live there only; the font files are loaded with `next/font` in `src/app/layout.tsx`.
- `src/components/surface.ts`: the **primitives**, class names that say what an element is (a page title, a primary button, a card).

Style with tokens and primitives, so a change to the look is a one-place edit. When a page needs something neither covers, add a token or primitive first, then use it.

## Tokens

| Token | Role |
| --- | --- |
| `paper` | Page background: the panel each page sits on. |
| `surface` | Cards, inputs, menus: anything that sits on the page. |
| `sunken` | Hover, selected rows, tracks, quiet fills; also behind the page panel. |
| `rule` / `rule-strong` | Dividers and card borders / control borders. |
| `ink` | Text, primary buttons. `ink-hover` is the primary button's hover. |
| `ink-soft` | Tertiary headings and quiet controls. |
| `muted` | Secondary text: labels, hints, metadata. The lightest colour for words. |
| `faint` | Placeholders, disabled and decorative marks only (too light for words). |
| `accent` | Amber fill: marks on the band (the brand dot) and decorative marks. Too light on white (2:1) for text, controls or the focus ring. |
| `accent-ink` | Amber for text, links, the focus ring and controls such as an on toggle (the accent darkened to pass AA). |
| `accent-tint` | Selected navigation, highlighted rows. |
| `ramp-1` … `ramp-5` | The ramp: five steps of navy, darkest (`ramp-1`) first. The app shell's band, the navy at the top of every signed-in page behind the bar, drawn by the `bg-band` utility; `ramp-2` is also the text of a white button on the bar. Also the marks of the Dashboard's and Analytics' cards, the heatmap, the Net worth bands and the sparklines (see Rules), with `bg-insight` for the insight card and `bg-hatch` for the period a card points out. `bg-ramp-*` is a flat step; `bg-band` is the gradient. |
| `on-ramp` | Text, outlines and translucent fills on the ramp: the bar's controls, the insight card, the dark heatmap shades (`text-on-ramp/75`, `ring-on-ramp/25`). |
| `on-ink` | Text on an `ink` fill: a selected list item (Categories, Rules, Tags, Payees) and the current Dashboard tab. A button on `ink` takes `PRIMARY_BUTTON_CLASS` instead. |
| `positive`, `negative`, `warning`, `info` (+ `-tint`, `warning-rule`) | Meaning only: income and success, expense and errors, attention, neutral status. Never decoration. `warning` is terracotta, a red-orange kept well apart from the amber accent so attention never reads as a link or a selection. |

Type: `font-display` (Inter Tight) for page titles, section titles and headline amounts; the default sans (Inter) for everything else. Amounts that line up use `tabular-nums`.

Corners: the radius scale itself is small (`rounded-md` 6px, `rounded-lg`/`xl`/`2xl` 8px, `rounded-3xl` 10px). Buttons, pills and avatars use `rounded-lg`, badges `rounded-md`. Keep `rounded-full` for things that are round by nature: dots, toggles, progress tracks.

Motion: route navigations animate with View Transitions (ADR-0012). `--motion-duration-nav` (250ms) and `--motion-ease-nav` (`cubic-bezier(0.16, 1, 0.3, 1)`) are plain CSS variables on `:root` in `globals.css`, not utilities, and are the defaults of every `::view-transition-group/old/new(*)`. A page names the elements that move with React's `<ViewTransition>`; an override of the duration or easing uses these tokens. Under reduced motion every view transition is instant: one global rule sets `animation: none` on its pseudo-elements (checked by `e2e/view-transitions.spec.ts`). Any other animation or transform transition carries `motion-safe:` or `motion-reduce:animate-none` / `motion-reduce:transition-none` in the same class string; colour and opacity transitions are exempt.

## Primitives (`surface.ts`)

| Primitive | Use for |
| --- | --- |
| `PAGE_TITLE_CLASS` | The page's one `h1`. |
| `SECTION_TITLE_CLASS` | Each section's `h2`, and the title of a detail panel. |
| `HEADLINE_AMOUNT_CLASS` | The number a page is about: an Account's balance, a Bank's total, the selected Transaction's amount. |
| `TILE_AMOUNT_CLASS` | The amount of one of a row of figure tiles (Analytics' Key figures): `HEADLINE_AMOUNT_CLASS` from `sm` up, a step smaller on phones, wrapping after its Currency rather than being cut. |
| `CARD_CLASS` | A separate object: a list, a detail panel, a Widget. Not every block. |
| `WARNING_NOTICE_CLASS` | A notice that asks for attention (`role="alert"`): stale FX rates, a Balance snapshot mismatch. Put it on the notice itself, never on rows inside it; mark problem rows with `text-warning`. |
| `INFO_NOTICE_CLASS` | A quiet notice about the view's own state that asks for nothing. Not an alert; attention takes `WARNING_NOTICE_CLASS`. |
| `DOCK_CLASS` / `DOCK_BUTTON_CLASS` | A dark toolbar floating over the bottom of the screen while something is selected (the Transactions list's Bulk edit dock), and its actions. Ink, so it reads as a tool above the page; its focus ring is `accent`, as `accent-ink` fails on ink. |
| `POPOVER_CLASS` | A picker or menu floating over the page, opened from the dock or a toolbar. |
| `BADGE_CLASS[tone]` | A short label beside a row's name: `warning` asks for attention (Missed, a price increase), `info` is neutral status (New, "Not yet imported"), `neutral` a plain fact. `rounded-md`, never decoration. |
| `TILE_CLASS` | A card of the Dashboard's grid (the overview row and each Widget). |
| `CHOICE_TILE_CLASS` | One tile of a row of exclusive choices: the Widget editor's source links and visualisation radios. The chosen tile is ringed in `ink`, by `aria-current="page"` on a link or the checked radio inside a `<label>`. |
| `PLACEHOLDER_CLASS` | A quiet block standing in for content still loading: a Dashboard card's chart or line of text while its query runs. Pulses gently, and holds still under reduced motion (`motion-safe:animate-pulse`); its container carries `aria-busy`. |
| `PILL_BUTTON_CLASS` | A pill-shaped action beside or on the Dashboard's tiles (Edit Dashboard). |
| `PRIMARY_BUTTON_CLASS` | The view's main action, one per view where possible. |
| `ACCENT_BUTTON_CLASS` | The main action of the Dashboard Story's own views: Done in Edit mode, Save in the Widget editor. |
| `SECONDARY_BUTTON_CLASS` / `SMALL_BUTTON_CLASS` | Every other action, and links styled as buttons; the small one in dense rows. |
| `GHOST_BUTTON_CLASS` | Quiet actions inside rows and toolbars. |
| `STEP_LINK_CLASS` / `STEP_LINK_DISABLED_CLASS` | Quiet step links of a toolbar (Previous / Next on a Transaction detail); the disabled one, faint and not a link, at an end. |
| `KEY_HINT_CLASS` | A keyboard shortcut's key cap beside its control (`j`, `k`). Decorative: the control names its shortcut in `aria-keyshortcuts`. |
| `LINK_BUTTON_CLASS` | A button that reads as a link within a sentence or notice ("Select all 120 matching this filter"). |
| `DANGER_BUTTON_CLASS` | Delete and remove: text only, so it never reads as the main action. |

Form fields come from `src/components/form.tsx` (`TextField`, `SubmitButton`, `FieldError`, and `FIELD_LABEL_CLASS` for a `<label>` that wraps its own control) and the list pages' `INPUT_CLASS` / `BUTTON_CLASS` in `src/components/named-list.tsx`.

## The app shell

Signed in, the app runs full width and dense. One slim navy bar (48px) carries the brand, the most used pages as pills (every other page under More), the quick actions, settings and sign out; there is no greeting or breadcrumb, as the page's own title says where you are. The page sits on a `paper` panel that rises out of the navy just below the bar, close to the screen's edges. Below `lg` the pills give way to a drawer. The bar's controls take their look from `src/components/app-shell/bar-styles.ts`. Titles stay compact for the same reason (`PAGE_TITLE_CLASS` 24px, `SECTION_TITLE_CLASS` 18px, `HEADLINE_AMOUNT_CLASS` 30px): the page's content, not its heading, comes first.

## Rules

- **One accent.** Amber marks what is selected, focused or the point of a chart (as `accent-ink` wherever it sits on white). Status colours carry meaning and stay apart from it. The ramp's navy is atmosphere, not a second accent: it never marks a state, and outside the app shell it appears only in the Dashboard's cards and the Completeness check's coverage tracks (below).
- **Display with restraint.** Inter Tight for titles and headline amounts only; labels, tables and controls stay in Inter.
- **Words in sentence case.** Labels and group names read as plain words, without letter-spaced capitals.
- **Charts.** Categorical series use `CHART_PALETTE` (`src/app/dashboards/chart-palette.ts`), a colour-blind-safe order; text and gridlines use `muted` and `rule`. Other categorical colours read from it too, never copied hex values: a Transaction detail's Split lines and their allocation bar take `lineColor` (`src/app/transactions/[id]/allocation-bar.tsx`), so a palette change reaches them. The Dashboard's cards (`src/app/dashboards/(dashboard)/[id]/overview/`) draw in the ramp's navy, continuing the band into the page (ADR-0009), and draw every section of Analytics too, so the two pages read alike; a trend card's latest bar is hatched, the running period's when its range reaches today. A table Widget's card is a heatmap (`HeatmapGrid` in `marks.tsx`): six stepped shades of `ramp-3` mixed into `surface` (`HEAT_LEVELS` in `src/lib/reporting/heatmap.ts`), stepped so ink text passes AA on the light four and `on-ramp` on the dark two; the running period is outlined dashed in `ramp-1`. Rows that form a tree (Analytics' Categories per period) keep their order instead of ranking by size: a quiet heading per Category group type with its total, each group a `sunken` band of plain bold subtotals, its Categories indented under a `rule-strong` tree line and shaded against the largest Category cell of their own type (`toTreeHeatmap`), each named in full ("Income › Salary") for assistive technology. A Donut Widget's card is a ring (`overview/ring.tsx`): its parts in the navy ramp, darkest for the largest, "Other" last in `rule-strong`, a part whose sign goes against the total (a refund among expenses) outlined in dashed `negative`, the total in the hole; the list beside it carries every value as text. A Net worth card (`overview/net-worth-mark.tsx`) stacks a band per Account kind, current in `ramp-3`, savings in `ramp-4` and 3a in `ramp-5` above zero, loans in `negative-tint` below it and drawn as steps, under the Net worth line in `ramp-1`; its facts carry each kind's share as text. Each capital movement on it is a small diamond in `accent` outlined in `accent-ink`, placed along the line at its date: the point of the chart, so the one accent; each opens its Transaction, and the card's "Capital movements" count opens their Transactions list. The latest point's value label hangs inside the plot (ending at its dot on the right half). The overview's "Your net worth today" carries a sparkline beside its amount (under it below `sm`; `overview/headline-trend.tsx`): the last 24 months of Net worth in `ramp-1`, filled in `ramp-5`, scaled to its own low and high, the latest point a dot, no bands, no Capital markers and no peak. Under it, chips on `sunken` give the change over 1M, 1Y and 2Y (since the month-end 1, 12 and 24 months before today, a chip left out when the line does not reach that far back), in `positive` with ↗ or `negative` with ↘, each opening the Accounts as of that month-end. On Analytics the line runs over the Span instead (its start, each period end, today; the start labelled with the Span's first day) and one "Span" chip in their place gives the change since the start of that day, opening the Accounts as of the day before. Edit mode draws the same cards, each with a toolbar of `GHOST_BUTTON_CLASS` actions; where a dragged or resized card will land is `accent-tint` with a dashed `accent-ink` outline (the react-grid-layout overrides at the end of `globals.css`).
- **Key figures.** Analytics opens with four `TILE_CLASS` tiles (`src/app/analytics/key-figures.tsx`): Net worth, Income, Expense and Profit, in one row from `lg` up and 2×2 below, never one column. Each tile is its label, a `muted` caption saying when it stands ("Today", or the Span: its preset's name, "Rolling 90 days", or "1 Jan 2024 – today" for a custom Span or a preset cut to the first Transaction), its amount in `TILE_AMOUNT_CLASS` (in `negative` below zero) opening what is behind it, then its change line, its sparkline at the tile's foot, and the unconverted note in `warning` when its own figure leaves something out. The change line (`key-figure-change.tsx`) reads "↗ +CHF 500 · +25.0% vs 1–22 Oct": the arrow and signs of the overview's chips, in `positive` when the change is good for the figure and `negative` when bad (more Expense is never green), `muted` and → when unchanged, the dates in `muted`; the whole line is one link, said in words for assistive technology. The sparkline draws as the overview's (`SparklineSvg` and `SparklineDot` in `src/components/sparkline-mark.tsx`, shared with `headline-trend.tsx`): `ramp-1` line, `ramp-5` fill, scaled to its own low and high; a partial current period is a dashed last segment ending in a hollow dot, a complete one a solid dot, and a first period cut short at the Span's start (ADR-0016) a dashed first segment. It is decorative (`aria-hidden`): the tile says its values as text.
- **Completeness check.** The Completeness check above Analytics (`src/app/analytics/completeness/completeness-notice.tsx`) is a `CARD_CLASS` card, not a `WARNING_NOTICE_CLASS` notice: each checked Account has a coverage track over the last 120 days, covered in `ramp-3`, a Gap in `warning`, the overdue run of a Stale Account in `warning-tint` inside `warning-rule`, a mismatch as a `warning` diamond. Attention shows in the `warning` headline and problem rows, and the card is still announced as an alert. The tracks are decorative (`aria-hidden`); each row's words say what its track shows.
- **Focus.** Every interactive element shows the global accent outline from `globals.css`; keep it visible.
