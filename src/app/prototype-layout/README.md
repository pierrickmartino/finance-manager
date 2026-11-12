# PROTOTYPE: layout and Dashboard redesign (throwaway)

**Question:** what should the main layout and the Dashboard look like with full width, less rounding, a different font and different colours?

Three variants on the existing routes, switched with `?variant=` (or the pink bar at the bottom, or ← / →). `current` is today's design, kept in the cycle for comparison.

| Key | Name | Shell | Dashboard | Type | Colour | Corners |
| --- | --- | --- | --- | --- | --- | --- |
| `A` | Ledger | Fixed left sidebar with every page, slim sticky header | KPI strip, insight bar, hairline grid of Widgets, activity as a table | IBM Plex Sans + Plex Mono for numbers | Slate and cobalt | 2–4px |
| `B` | Command | One graphite bar, tabs underlined in the accent | Big net-worth number with sparkline, dark insight panel, Widget cards plus a timeline rail | Inter Tight + Inter | Warm off-white, graphite, violet | 3–8px |
| `C` | Broadsheet | Newspaper masthead, date line, every page in a double-ruled band | Insight as the lead headline, net worth in a side column, Widgets as ruled columns, "In brief" | Fraunces + Newsreader + Inter | Cream, forest green, ochre | Square |

Run: `pnpm dev`, sign in, open `/?variant=A` (or `B`, `C`). Links in the variant shells keep the variant, so every page can be seen in it: other pages keep their own layout but take the variant's tokens (colour, type, radius).

How it works: each variant's root re-points the design tokens (`variants.css`), so `bg-paper`, `rounded-xl`, `font-display` and the chart marks follow; the shells (`shells.tsx`) and Dashboards (`dashboards.tsx`) are separate structures over the same data. The switcher and variants are off in production builds.

Touch points outside this folder (all marked PROTOTYPE): `src/components/app-shell/app-shell.tsx`, `src/app/page.tsx`, `src/app/dashboards/[id]/page.tsx`, `src/app/dashboards/tabs.tsx`, `src/components/prototype-switcher.tsx`, and `CardBody` exported from `widget-card.tsx`.

Once a direction wins: fold it into `globals.css` / `surface.ts` / the app shell properly (and update `docs/design-system.md`), then drop this folder, the switcher and the touch points from main.
