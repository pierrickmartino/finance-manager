# PROTOTYPE: Categories page redesign (throwaway)

**Question:** what should the Categories page look like? Today every Category row shows six
inline forms (rename, ↑↓, move, merge, delete), so the page is a wall of inputs and buttons.

**Shape:** three redesigns on the real `/categories` route with real data, switchable via
`?variant=` and the floating pink bar (← / → keys also cycle). Every form in A/B/C posts to a
stub (`stub-action.ts`) that answers "Prototype: not saved.", so nothing is written to the database.

| Key       | Name              | Idea                                                                                                                                                            |
| --------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `current` | Current           | Today's page, for comparison.                                                                                                                                   |
| `A`       | Master / detail   | Groups listed on the left, sorted by type. The selected group (`?group=`) is on the right as a clean list with usage bars; all actions are in a `⋯` menu per row. |
| `B`       | Tree table + bulk | One dense table: type tabs, a filter box, collapsible groups, double-click to rename, checkboxes plus a floating bulk bar (move / merge / delete).                |
| `C`       | Board by type     | Columns for Income / Expense / Capital, groups as cards, Categories as chips with counts. A chip opens a side sheet with every action.                           |

## Run it

```sh
pnpm dev            # needs DATABASE_URL + TOTP_ENCRYPTION_KEY in .env.local
open "http://localhost:3000/categories?variant=A"
```

The variants and the bar are gated on `NODE_ENV !== 'production'` in `../page.tsx`.

## Cleanup

Once a variant wins, rebuild it properly in `../page.tsx` (with tests and the real actions).
Then delete this folder, `src/components/prototype/` and the `IS_PROTOTYPE` branch in the page.
