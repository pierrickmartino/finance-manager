# Design system

The app's look comes from the Dashboard Story: ink and one vermilion accent on paper, a serif for display, a sans for everything read and operated. It is **light only**: every page keeps these colours whatever the system theme.

Two files hold it, and a page takes its look from them:

- `src/app/globals.css`: the **tokens** (the `@theme` block), so every colour and the display font are Tailwind utilities (`bg-paper`, `text-ink`, `border-rule`, `font-display`…). Values live there only.
- `src/components/surface.ts`: the **primitives**, class names that say what an element is (a page title, a primary button, a card).

Style with tokens and primitives, so a change to the look is a one-place edit. When a page needs something neither covers, add a token or primitive first, then use it.

## Tokens

| Token | Role |
| --- | --- |
| `paper` | Page background (the app shell). |
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
| `positive`, `negative`, `warning`, `info` (+ `-tint`, `warning-rule`) | Meaning only: income and success, expense and errors, attention, neutral status. Never decoration. |

Type: `font-display` (a serif) for page titles, section titles and headline amounts; the default sans for everything else. Amounts that line up use `tabular-nums`.

## Primitives (`surface.ts`)

| Primitive | Use for |
| --- | --- |
| `PAGE_TITLE_CLASS` | The page's one `h1`. |
| `SECTION_TITLE_CLASS` | Each section's `h2`, and the title of a detail panel. |
| `HEADLINE_AMOUNT_CLASS` | The number a page is about: an Account's balance, a Bank's total, the selected Transaction's amount. |
| `CARD_CLASS` | A separate object: a list, a detail panel, a Widget. Not every block. |
| `PRIMARY_BUTTON_CLASS` | The view's main action, one per view where possible. |
| `SECONDARY_BUTTON_CLASS` / `SMALL_BUTTON_CLASS` | Every other action, and links styled as buttons; the small one in dense rows. |
| `GHOST_BUTTON_CLASS` | Quiet actions inside rows and toolbars. |
| `DANGER_BUTTON_CLASS` | Delete and remove: text only, so it never reads as the main action. |

Form fields come from `src/components/form.tsx` (`TextField`, `SubmitButton`, `FieldError`) and the list pages' `INPUT_CLASS` / `BUTTON_CLASS` in `src/components/named-list.tsx`.

## Rules

- **One accent.** Vermilion marks what is selected, focused or the point of a chart. Status colours carry meaning and stay apart from it.
- **Serif with restraint.** Titles and headline amounts only; labels, tables and controls stay in the sans.
- **Words in sentence case.** Labels and group names read as plain words, without letter-spaced capitals.
- **Charts.** Categorical series use `CHART_PALETTE` (`src/app/dashboards/chart-palette.ts`), a colour-blind-safe order; text and gridlines use `muted` and `rule`. The Dashboard Story draws in ink with the accent (`src/app/dashboards/[id]/story/palette.ts`).
- **Focus.** Every interactive element shows the global accent outline from `globals.css`; keep it visible.
