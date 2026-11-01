# PROTOTYPE: Payees page redesign (throwaway)

**Question:** what should the Payees page look like, now that Categories became a clean
master / detail? Today every Payee row shows four inline forms (rename, merge, delete), the same
wall of inputs the old Categories page had.

**Shape:** three redesigns on the real `/payees` route with real data, switchable via `?variant=`
and the floating pink bar (← / → keys also cycle). Every form in A/B/C posts to a stub
(`stub-action.ts`) that answers "Prototype: not saved.", so nothing is written to the database.

| Key       | Name               | Idea                                                                                                                                                                                         |
| --------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `current` | Current            | Today's page, for comparison.                                                                                                                                                                |
| `A`       | Master / detail    | Mirrors Categories. Payees A-Z on the left with a filter (`?q=`) and counts; the selected Payee (`?payee=`) on the right with its 10 latest Transactions. Rename / merge / delete in "Edit Payee". |
| `B`       | Table + bulk merge | One dense sortable table: search, All / Used / Unused toggle, double-click to rename, checkboxes and a floating bar to merge the selection into one Payee or delete the unused ones.            |
| `C`       | Tidy-up            | Cleanup first: counters, "possible duplicates" cards (naive name match) with one-click merge, Payees ranked by use with usage bars, and unused Payees as deletable chips.                      |

## Run it

```sh
pnpm dev            # needs DATABASE_URL + TOTP_ENCRYPTION_KEY in .env.local
open "http://localhost:3000/payees?variant=A"
```

The variants and the bar are gated on `NODE_ENV !== 'production'` in `../page.tsx`.

## Cleanup

Once a variant wins, rebuild it properly in `../page.tsx` (with tests and the real actions).
Then delete this folder, `src/components/prototype/` and the `IS_PROTOTYPE` branch in the page.
