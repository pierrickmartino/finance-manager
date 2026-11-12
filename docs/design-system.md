# Design system

The app's look, "Midnight": ink and one amber accent on cool paper under a navy hero, Inter for everything read and operated, Inter Tight for display, and small corners. It is **light only**: every page keeps these colours whatever the system theme.

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
| `accent` | Amber fill: marks on the hero (the brand dot) and decorative marks. Too light on white (2:1) for text, controls or the focus ring. |
| `accent-ink` | Amber for text, links, the focus ring and controls such as an on toggle (the accent darkened to pass AA). |
| `accent-tint` | Selected navigation, highlighted rows. |
| `hero-deep`, `hero`, `hero-mid`, `hero-glow`, `hero-mist` | The app shell's hero: the navy band at the top of every signed-in page, drawn by the `bg-hero` utility. `hero` is also the text of a white button on it. Also the marks of the Dashboard's cards (see Rules), with `bg-insight` for its insight card and `bg-hatch` for the period a card points out. Use `bg-hero-*` for a flat navy fill: `bg-hero` is the gradient. |
| `on-hero` | Text, outlines and translucent fills on the hero (`text-on-hero/75`, `ring-on-hero/25`). |
| `positive`, `negative`, `warning`, `info` (+ `-tint`, `warning-rule`) | Meaning only: income and success, expense and errors, attention, neutral status. Never decoration. |

Type: `font-display` (Inter Tight) for page titles, section titles and headline amounts; the default sans (Inter) for everything else. Amounts that line up use `tabular-nums`.

Corners: the radius scale itself is small (`rounded-md` 6px, `rounded-lg`/`xl`/`2xl` 8px, `rounded-3xl` 10px). Buttons, pills and avatars use `rounded-lg`, badges `rounded-md`. Keep `rounded-full` for things that are round by nature: dots, toggles, progress tracks.

## Primitives (`surface.ts`)

| Primitive | Use for |
| --- | --- |
| `PAGE_TITLE_CLASS` | The page's one `h1`. |
| `SECTION_TITLE_CLASS` | Each section's `h2`, and the title of a detail panel. |
| `HEADLINE_AMOUNT_CLASS` | The number a page is about: an Account's balance, a Bank's total, the selected Transaction's amount. |
| `CARD_CLASS` | A separate object: a list, a detail panel, a Widget. Not every block. |
| `WARNING_NOTICE_CLASS` | A notice that asks for attention (`role="alert"`): stale FX rates, a Balance snapshot mismatch. Put it on the notice itself, never on rows inside it; mark problem rows with `text-warning`. |
| `TILE_CLASS` | A card of the Dashboard's grid (the overview row and each Widget). |
| `PILL_BUTTON_CLASS` | A pill-shaped action beside or on the Dashboard's tiles (Edit Dashboard). |
| `PRIMARY_BUTTON_CLASS` | The view's main action, one per view where possible. |
| `ACCENT_BUTTON_CLASS` | The main action of the Dashboard Story's own views: Done in Edit mode, Save in the Widget editor. |
| `SECONDARY_BUTTON_CLASS` / `SMALL_BUTTON_CLASS` | Every other action, and links styled as buttons; the small one in dense rows. |
| `GHOST_BUTTON_CLASS` | Quiet actions inside rows and toolbars. |
| `DANGER_BUTTON_CLASS` | Delete and remove: text only, so it never reads as the main action. |

Form fields come from `src/components/form.tsx` (`TextField`, `SubmitButton`, `FieldError`) and the list pages' `INPUT_CLASS` / `BUTTON_CLASS` in `src/components/named-list.tsx`.

## The app shell

Signed in, the app runs full width. A navy hero carries the brand, the most used pages as pills (every other page under More), a greeting with where you are, and the quick actions; the page sits on a `paper` panel that rises out of the hero's fade. Below `lg` the pills give way to a drawer. The hero's controls take their look from `src/components/app-shell/hero-styles.ts`.

## Rules

- **One accent.** Amber marks what is selected, focused or the point of a chart (as `accent-ink` wherever it sits on white). Status colours carry meaning and stay apart from it. The hero's navy is atmosphere, not a second accent: it never marks a state, and outside the app shell it appears only in the Dashboard's cards and the Completeness check's coverage tracks (below).
- **Display with restraint.** Inter Tight for titles and headline amounts only; labels, tables and controls stay in Inter.
- **Words in sentence case.** Labels and group names read as plain words, without letter-spaced capitals.
- **Charts.** Categorical series use `CHART_PALETTE` (`src/app/dashboards/chart-palette.ts`), a colour-blind-safe order; text and gridlines use `muted` and `rule`. The Dashboard's cards (`src/app/dashboards/[id]/overview/`) draw in the hero's navy, continuing the hero into the page (ADR-0009); A Donut Widget's card is a ring (`overview/ring.tsx`): its parts in the navy ramp, darkest for the largest, "Other" last in `rule-strong`, a part whose sign goes against the total (a refund among expenses) outlined in dashed `negative`, the total in the hole; the list beside it carries every value as text. Edit mode draws the same cards, each with a toolbar of `GHOST_BUTTON_CLASS` actions; where a dragged or resized card will land is `accent-tint` with a dashed `accent-ink` outline (the react-grid-layout overrides at the end of `globals.css`). The Widget editor's preview still draws chapters in ink with the accent (`src/app/dashboards/[id]/story/palette.ts`).
- **Completeness check.** The home Dashboard's Completeness check (`src/app/dashboards/[id]/completeness-notice.tsx`) is a `CARD_CLASS` card, not a `WARNING_NOTICE_CLASS` notice: each checked Account has a coverage track over the last 120 days, covered in `hero-mid`, a Gap in `warning`, the overdue run of a Stale Account in `warning-tint` inside `warning-rule`, a mismatch as a `warning` diamond. Attention shows in the `warning` headline and problem rows, and the card is still announced as an alert. The tracks are decorative (`aria-hidden`); each row's words say what its track shows.
- **Focus.** Every interactive element shows the global accent outline from `globals.css`; keep it visible.
