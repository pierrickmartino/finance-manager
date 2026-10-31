# PROTOTYPE: app-shell redesign (throwaway)

**Question:** what should the general layout (the signed-in app shell) look like for a modern
look and feel?

**Shape:** four shells around the _real_ pages and data, switchable on any route via `?variant=`
and a floating pink bar at the bottom (← / → keys also cycle). Only the shell changes; every
page renders unchanged inside it.

| Key       | Name                     | Idea                                                                                                                  |
| --------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `current` | Current                  | Today's flat 12-link header, for comparison.                                                                          |
| `A`       | Grouped sidebar          | Persistent left sidebar, links grouped Overview / Money / Organize / System, sticky breadcrumb bar, tinted canvas.    |
| `B`       | Top bar + ⌘K             | No sidebar. 4 primary tabs + grouped "More" mega-menu + ⌘K command palette; a hero band names the page.               |
| `C`       | Icon rail + panel        | Dark icon rail picks a section; a second panel lists its pages with descriptions; page floats as an inset sheet.      |

## Run it

```sh
pnpm dev            # needs DATABASE_URL + TOTP_ENCRYPTION_KEY in .env.local
open http://localhost:3000/transactions?variant=B
```

The choice is kept in the `fm_prototype_shell` cookie so it survives in-app navigation.
The shell is gated on `NODE_ENV !== 'production'` in `src/app/layout.tsx`: `next build` / E2E
runs still get today's header.

## Things the prototype surfaced

- **B duplicates the page title**: the hero band and each page's own `<h1>` both say
  "Transactions". Adopting B means pages drop their `<h1>` (or the shell drops the hero).
- **Mobile is unsolved in all three**: A hides the sidebar below `md` and leaves no nav at all, B's
  tabs overflow, and C's panel disappears below `lg`. Whichever wins needs a drawer or bottom bar.
- Pages hard-code `max-w-5xl`-style spacing and zinc borders; a new shell will want shared page
  primitives (page header, card) so pages match it.

## Cleanup

Once a variant wins: rebuild it properly in `src/app/layout.tsx` (with tests), delete this folder
and the `PrototypeShell` branch in the layout. The full set of variants stays on the prototype
branch as the primary source.
