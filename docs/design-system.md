# Design system

The app's look comes from the Dashboard Story: ink and one vermilion accent on paper, a serif for display, a sans for everything read and operated. It is **light only**: every page keeps these colours whatever the system theme.

Two files hold it, and a page takes its look from them:

- `src/app/globals.css`: the **tokens** (the `@theme` block), so every colour and the display font are Tailwind utilities (`bg-paper`, `text-ink`, `border-rule`, `font-display`…). Values live there only.
- `src/components/surface.ts`: the **primitives**, class names that say what an element is (a page title, a primary button, a card).

Style with tokens and primitives, so a change to the look is a one-place edit. When a page needs something neither covers, add a token or primitive first, then use it.

## Tokens

| Token | Role |
| --- | --- |
| `paper` | Page background: the panel each page sits on. |
| `surface` | Cards, inputs, menus: anything that sits on the page. |
| `sunken` | Hover, selected rows, tracks, quiet fills. |
| `rule` / `rule-strong` | Dividers and card borders / control borders. |
| `ink` | Text, primary buttons. `ink-hover` is the primary button's hover. |
| `ink-soft` | Tertiary headings and quiet controls. |
| `muted` | Secondary text: labels, hints, metadata. The lightest colour for words. |
| `faint` | Placeholders, disabled and decorative marks only (too light for words). |
| `accent` | Vermilion fills: marks in charts, underlines, the focus ring, large display numbers. |
| `accent-ink` | Vermilion for text and links (the accent darkened to pass AA). |
| `accent-tint` | Selected navigation, highlighted rows. |
| `hero-deep`, `hero`, `hero-mid`, `hero-glow`, `hero-mist` | The app shell's hero: the deep-teal band at the top of every signed-in page, drawn by the `bg-hero` utility. `hero` is also the text of a white button on it. Also the marks of the Dashboard's cards (see Rules), with `bg-insight` for its insight card and `bg-hatch` for the period a card points out. Use `bg-hero-*` for a flat teal fill: `bg-hero` is the gradient. |
| `on-hero` | Text, outlines and translucent fills on the hero (`text-on-hero/75`, `ring-on-hero/25`). |
| `canvas` | Behind the app's rounded frame. |
| `positive`, `negative`, `warning`, `info` (+ `-tint`, `warning-rule`) | Meaning only: income and success, expense and errors, attention, neutral status. Never decoration. |

Type: `font-display` (a serif) for page titles, section titles and headline amounts; the default sans for everything else. Amounts that line up use `tabular-nums`.

## Primitives (`surface.ts`)

| Primitive | Use for |
| --- | --- |
| `PAGE_TITLE_CLASS` | The page's one `h1`. |
| `SECTION_TITLE_CLASS` | Each section's `h2`, and the title of a detail panel. |
| `HEADLINE_AMOUNT_CLASS` | The number a page is about: an Account's balance, a Bank's total, the selected Transaction's amount. |
| `CARD_CLASS` | A separate object: a list, a detail panel, a Widget. Not every block. |
| `WARNING_NOTICE_CLASS` | A notice that asks for attention (`role="alert"`): stale FX rates, a Balance snapshot mismatch, the Completeness check when an Account needs attention. Put it on the notice itself, never on rows inside it; mark problem rows with `text-warning`. |
| `TILE_CLASS` | A card of the Dashboard's grid (the overview row and each Widget). |
| `PILL_BUTTON_CLASS` | A rounded action beside or on the Dashboard's tiles (Edit Dashboard). |
| `PRIMARY_BUTTON_CLASS` | The view's main action, one per view where possible. |
| `ACCENT_BUTTON_CLASS` | The main action of the Dashboard Story's own views: Done in Edit mode, Save in the Widget editor. |
| `SECONDARY_BUTTON_CLASS` / `SMALL_BUTTON_CLASS` | Every other action, and links styled as buttons; the small one in dense rows. |
| `GHOST_BUTTON_CLASS` | Quiet actions inside rows and toolbars. |
| `DANGER_BUTTON_CLASS` | Delete and remove: text only, so it never reads as the main action. |

Form fields come from `src/components/form.tsx` (`TextField`, `SubmitButton`, `FieldError`) and the list pages' `INPUT_CLASS` / `BUTTON_CLASS` in `src/components/named-list.tsx`.

## The app shell

Signed in, the app sits in a rounded frame on the `canvas`. A deep-teal hero carries the brand, the most used pages as pills (every other page under More), a greeting with where you are, and the quick actions; the page sits on a `paper` panel that rises out of the hero's fade. Below `lg` the pills give way to a drawer. The hero's controls take their look from `src/components/app-shell/hero-styles.ts`.

## Rules

- **One accent.** Vermilion marks what is selected, focused or the point of a chart. Status colours carry meaning and stay apart from it. The hero's teal is atmosphere, not a second accent: it never marks a state, and outside the app shell it appears only in the Dashboard's cards (below).
- **Serif with restraint.** Titles and headline amounts only; labels, tables and controls stay in the sans.
- **Words in sentence case.** Labels and group names read as plain words, without letter-spaced capitals.
- **Charts.** Categorical series use `CHART_PALETTE` (`src/app/dashboards/chart-palette.ts`), a colour-blind-safe order; text and gridlines use `muted` and `rule`. The Dashboard's cards (`src/app/dashboards/[id]/overview/`) draw in the hero's teal, continuing the hero into the page (ADR-0009); Edit mode and the Widget editor's preview still draw chapters in ink with the accent (`src/app/dashboards/[id]/story/palette.ts`).
- **Focus.** Every interactive element shows the global accent outline from `globals.css`; keep it visible.
