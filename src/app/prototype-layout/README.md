# PROTOTYPE: layout and Dashboard redesign (throwaway)

**Question:** keeping today's structure (teal-style hero with pills, greeting and quick actions; the Dashboard's card grid), what should it look like full width, with less rounding, another font and other colours?

Three close variations, switched with `?variant=` (or the pink bar at the bottom, or ← / →). `current` is today's design, kept in the cycle for comparison. All three variants share one layout: the frame and grey canvas are gone, so the hero and the paper panel run edge to edge.

| Key | Name | Hero / marks | Accent | Font | Corners |
| --- | --- | --- | --- | --- | --- |
| `A` | Midnight | Navy | Amber | Inter, Inter Tight titles | 6–10px |
| `B` | Graphite | Charcoal | Lime | Geist, Geist Mono figures | 4–6px |
| `C` | Forest | Deep green | Copper | Manrope, Newsreader titles | 2–3px |

Run: `pnpm dev`, sign in, open `/?variant=A` (or `B`, `C`). The chosen variant is remembered for the browser tab (sessionStorage), so every page can be seen in it.

How it works: the app shell drops its frame when a variant is on, and the variant's root re-points the design tokens (`variants.css`): colours, `--font-*`, `--radius-*`, and a pill radius for `rounded-full`. Pages and the Dashboard are unchanged. Off in production builds.

Touch points outside this folder (marked PROTOTYPE): `src/components/app-shell/app-shell.tsx`, `src/app/page.tsx` (keeps `?variant=` through the redirect), `src/components/prototype-switcher.tsx`.

Once a direction wins: put its tokens into `globals.css`, make the shell full width, replace `rounded-full` pills with the chosen radius in `hero-styles.ts` / `surface.ts`, update `docs/design-system.md`, then drop this folder, the switcher and the touch points from main.
