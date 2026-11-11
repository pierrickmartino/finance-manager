# Completeness check

Issue #92.

## Problem Statement

Every Import is reconciled when I preview it, but nothing tells me later that my data has gone wrong. I can forget a month's file, leave an Account weeks behind, or break a reconciled balance by editing a Manual transaction or undoing an Import. Reports are only as good as their data, so a missing file goes unnoticed and quietly misstates everything else.

## Solution

A Completeness check runs every time the home Dashboard loads and shows its result as a compact notice above the Hero (ADR-0008). For each imported Account it shows when the data ends and how many days ago that was. It flags an Account that is Stale, has a Gap, or no longer adds up to its latest Statement balance. When all is well the notice is a single neutral line. Problems use the `warning` token and link to the Account they concern.

## User Stories

1. As the user, I want the home Dashboard to show a Completeness check above its Hero, so that I see whether my data is trustworthy before I read any report.
2. As the user, I want the Completeness check to appear only on the Dashboard that `/` opens, so that other Dashboards stay uncluttered.
3. As the user, I want each checked Account's data end date and the days since then, so that I know how current it is.
4. As the user, I want the data end date to be the last day covered by the Account's latest committed Import, not the day I uploaded it, so that uploading an old file doesn't look current.
5. As the user, I want an Import whose file states no statement period to count as covering its first to last Transaction date, so that every Import has a coverage.
6. As the user, I want undone Imports ignored, so that coverage reflects only data that is really there.
7. As the user, I want an Account flagged Stale when its data ends more than 40 days ago, so that I'm told when a statement is overdue.
8. As the user, I want an Account with an Import format but no Import yet flagged "No Import yet", so that a newly added Account isn't forgotten.
9. As the user, I want a Gap flagged when days between two of an Account's committed Imports are covered by no Import, so that I know a file is missing.
10. As the user, I want a Gap that contains at least one Manual transaction on that Account not flagged, so that a period I filled by hand doesn't nag me.
11. As the user, I want Gaps checked across the Account's whole history, from its first committed Import, so that old holes that distort old reports are found.
12. As the user, I want each Account's latest Statement balance, whether a committed Import's closing balance or a Balance snapshot (whichever is later), compared to the computed balance on that date, so that later edits that break reconciliation are caught.
13. As the user, I want any difference of one minor unit or more to count as a mismatch, shown in the Account's own Currency, so that balances reconcile to the cent.
14. As the user, I want manual-only Accounts and snapshot-only loans left out of the Stale and Gap checks but still checked against their Balance snapshots, so that I'm only warned about what applies.
15. As the user, I want archived Accounts left out, so that closed Accounts don't raise warnings.
16. As the user, I want a single neutral summary line when everything is fine, reading "All N Accounts current to ⟨date⟩" with the earliest data end date among checked Accounts, so that I'm reassured without clutter.
17. As the user, I want the summary to read "N Accounts need attention" in the `warning` token when any problem exists, so that problems stand out.
18. As the user, I want the per-Account list collapsed when everything is fine and open when there is a problem, so that I see problems without a click.
19. As the user, I want one row per Account listing all its problems, ordered by worst problem first (mismatch, then Gap, then Stale or No Import yet), so that the most damaging issue is on top.
20. As the user, I want each row to link to that Account's detail page, so that I can fix the problem from its Imports and Balance snapshots.

## Implementation Decisions

- **Placement (ADR-0008).** A server-rendered notice above the Hero in `src/app/dashboards/[id]`, rendered only for the Dashboard that `src/app/page.tsx` redirects to. It is not a Widget and has no Widget source.
- **Computation.** A new `completeness` service in `src/server/services/` computes the result on each request from `account`, `import`, `transaction` and `balance_snapshot`, without stored state. It returns, per checked Account: data end date, days since, and a list of problems (`mismatch` with the difference in minor units, `gap` with its from/to dates, `stale`, `never_imported`).
- **Scope.** Freshness and Gaps: non-archived Accounts with an `import_format`. Mismatch: every non-archived Account that has a Statement balance.
- **Coverage.** An Import covers `statement_from`..`statement_to`; a missing bound falls back to its earliest or latest Transaction date. Undone Imports (`undone_at` set) are excluded. Overlapping coverage is fine.
- **Gap.** A run of one or more days, after the first committed Import and before the latest coverage end, covered by no Import, and containing no Manual transaction of that Account.
- **Stale.** The data end date is more than `STALE_AFTER_DAYS = 40` days before today.
- **Mismatch.** The latest Statement balance is the later of the newest committed Import's `closing_balance_minor` (dated `statement_to`) and the newest Balance snapshot. It is compared with the Account's computed native balance on that date, reusing the existing balance-on-date logic in `src/server/services/accounts/balances.ts` and the snapshot check in `src/server/services/balance-snapshots`. Any non-zero difference is a mismatch.
- **UI.** A native `<details>` element, open when any problem exists. Problem rows and the problem summary use the `warning` token. The all-fine summary uses neutral ink. Dates and amounts are shown in the Account's Currency.
- **Design system.** Add `WARNING_NOTICE_CLASS` to `src/components/surface.ts` for the shared `border-warning-rule bg-warning-tint text-warning` notice, and move `RateStatusNotice` and `SnapshotMismatches` onto it.

## Testing Decisions

- Unit-test the pure coverage and Gap logic: contiguous Imports, overlap, a one-day Gap, a Gap filled by a Manual transaction, an Import without a period, an undone Import in the middle.
- Unit-test Stale at 40 and 41 days, and "No Import yet".
- Integration-test the service against the database: a mismatch caused by editing a Manual transaction after a reconciled Import; a Balance snapshot later than the last Import; manual-only and archived Accounts excluded.
- An E2E test on the home page: the all-fine summary, and an open notice with a linked problem row.

## Out of Scope

- Configurable or per-Account Stale thresholds.
- Acknowledging or dismissing a Gap.
- Re-checking every historical Statement balance (only the latest per Account is compared).
- Showing the Completeness check on other Dashboards or on `/accounts`.
- Notifications outside the app.
