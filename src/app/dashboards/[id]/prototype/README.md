# PROTOTYPE: Dashboard redesign (throwaway)

**Question:** what should the Dashboard look like, taking inspiration from a reference
"finance overview" screenshot (teal hero band, bento cards, dot-matrix cash flow, insight card,
"where your money goes" meters, recent activity, hatched highlight bar)?

**Shape:** UI prototype, sub-shape A: variants render on the existing `/dashboards/[id]`
route, gated by `?variant=`, over the real Widget data the page already loads (plus the 12
latest Transactions for "recent activity"). Read-only. Off in production builds.

| Key | Name | Structure |
| --- | --- | --- |
| `A` | Story (current) | Today's Dashboard Story, the baseline. |
| `B` | Teal bento | The screenshot's structure and palette: teal hero band with greeting and pill tabs, three-column bento (net worth + sparkline, where your money goes, dot-matrix in/out, recent activity, insight card, monthly bars with hatched highlight). Teal colours are local to the file: adopting them means new tokens and an update to `docs/design-system.md` (today: ink + vermilion). |
| `C` | Cockpit | The screenshot's density in the app's own look: KPI strip (net worth, income, spending, savings rate, each with a sparkline and month-over-month delta), ONE focus chart switched by a segmented control, right rail with "what changed" insights and recent activity. |
| `D` | Month ledger | No cards: a month rail (mini diverging in/out bar + kept per month) drives a statement-like reading pane for the selected month (in, out, kept vs. average, where it went, latest transactions, where the money sits). |

**Run:** `pnpm dev`, open a Dashboard, add `?variant=B` (or use the floating bar / ← →).

**Files:** `./*` here, `src/components/prototype-switcher.tsx`, and the `PROTOTYPE` block
in `../page.tsx`. Delete all three when a direction is chosen; rewrite the winner properly.

Screenshots (1440px, sample household data): `./screenshots/variant-{A,B,C,D}.png`.
