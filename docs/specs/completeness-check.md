# Completeness check

Issue #92.

## Problem Statement

Every Import is reconciled when I preview it, but nothing tells me later that my data has gone wrong. I can forget a month's bank file, let an Account fall weeks behind, or break a balance that once reconciled by editing a Manual transaction, undoing an Import or changing an opening balance. Reports are only as good as their data, so a missing file goes unnoticed and quietly misstates every Widget built on it.

## Solution

A Completeness check runs whenever I open the home Dashboard and shows its result as a compact notice above the Hero (ADR-0008). For each imported Account it shows the day its data ends and how many days ago that was. It flags an Account that is Stale, has a Gap, or no longer adds up to its latest Statement balance. When everything is fine, the notice is a single neutral line. When anything is wrong, it opens on its own, uses the `warning` token, and links each problem to the Account it concerns.

## User Stories

### Where it appears

1. As the user, I want the home Dashboard to show a Completeness check above its Hero, so that I see whether my data can be trusted before I read any report.
2. As the user, I want the Completeness check only on the Dashboard that the home page opens, so that my other Dashboards stay uncluttered.
3. As the user, I want the Completeness check to stay outside the Dashboard Story, so that I cannot delete, reorder or copy it like a Widget.
4. As the user, I want the Completeness check to reflect my data as it is when the page loads, so that a fix I just made shows up on my next visit.

### Freshness

5. As the user, I want to see, for each checked Account, the day its data ends and how many days ago that is, so that I know how current it is.
6. As the user, I want an Account's data to end on the last day its latest committed Import covers, not on the day I uploaded it, so that uploading an old file does not make the Account look current.
7. As the user, I want an Import whose file states no statement period to count as covering its first to last Transaction date, and an Import with no statement period and no Transactions to cover nothing and be ignored, so that coverage is never invented.
8. As the user, I want undone Imports ignored, so that coverage counts only data that is really there.
9. As the user, I want an Account flagged Stale when its data ends more than 40 days ago, so that I'm told a statement is overdue while allowing for the usual delay after month end.
10. As the user, I want an Account that has an Import format but no Import yet flagged "No Import yet", so that a newly added Account isn't forgotten.

### Gaps

11. As the user, I want a Gap flagged whenever days between two of an Account's committed Imports are covered by no Import, so that I learn a file is missing.
12. As the user, I want even a one-day Gap flagged, so that a statement period that is off by one is caught.
13. As the user, I want overlapping Imports not flagged, so that importing the same period twice causes no warning.
14. As the user, I want a Gap that contains at least one Manual transaction on that Account not flagged, so that a period I deliberately filled by hand stops warning me.
15. As the user, I want each Gap shown with its first and last day, so that I know which file to fetch from the Bank.
16. As the user, I want Gaps checked across the Account's whole history from its first committed Import, so that old Gaps that distort old reports are found.
17. As the user, I want undoing an Import that sat between two others to turn its period into a Gap, so that undoing never hides missing data.

### Balance mismatch

18. As the user, I want each Account's latest Statement balance compared with its computed balance on that date, so that edits made after an Import that break the reconciliation are caught.
19. As the user, I want the latest Statement balance to be a committed Import's closing balance or a Balance snapshot, whichever is dated later (the Import's closing balance when both fall on the same date), so that the most recent word from the Bank is what counts.
20. As the user, I want any difference of one minor unit or more counted as a mismatch, so that balances reconcile to the cent.
21. As the user, I want a mismatch shown with its difference in the Account's own Currency, so that I can match it against my bank statement.
22. As the user, I want an Account with no Statement balance at all to have no mismatch problem, so that I'm not warned about a check that cannot run.

### Which Accounts

23. As the user, I want archived Accounts left out entirely, so that closed Accounts never raise warnings.
24. As the user, I want manual-only Accounts left out of the Stale and Gap checks, so that Accounts with no bank export never count as overdue.
25. As the user, I want manual-only Accounts that have Transactions still checked against their Balance snapshots, so that a hand-kept balance that drifts is caught.
26. As the user, I want Accounts with no Transactions (such as a loan tracked only by Balance snapshots) left out of the Completeness check, so that an Account whose balance is its latest snapshot is never reported as out of reconciliation.

### Presentation

27. As the user, I want a single neutral line when everything is fine, reading "All N Accounts current to ⟨date⟩" ("1 Account current to ⟨date⟩" for a single Account), so that I'm reassured without clutter.
28. As the user, I want the date in that line to be the earliest data end among checked Accounts, so that it tells me how current my reports really are.
29. As the user, I want the line to read "N Accounts need attention" in the `warning` token when any problem exists, so that problems stand out.
30. As the user, I want the per-Account list collapsed when everything is fine and open when anything is wrong, so that I see problems without a click.
31. As the user, I want to expand the list even when everything is fine, so that I can see every Account's data end date.
32. As the user, I want one row per Account listing all its problems, so that an Account with several problems isn't repeated.
33. As the user, I want rows with problems ordered by worst problem first (mismatch, then Gap, then Stale or No Import yet), so that the most damaging problem is on top.
34. As the user, I want only problem rows in the `warning` token, so that healthy Accounts read as healthy.
35. As the user, I want each row to link to that Account's page, so that I can start the fix from its Imports and Balance snapshots.
36. As the user, I want the notice to work at phone width and without client-side scripting, so that it loads instantly anywhere.
37. As the user, I want the notice announced to assistive technology as an alert when problems exist, so that I don't miss it if I can't see the colour.
38. As the user, I want every warning notice in the app to look the same, so that I recognise one at a glance.

## Implementation Decisions

- **Placement (ADR-0008).** A server-rendered notice above the Hero, rendered only on the Dashboard the home route redirects to. It is not a Widget, has no Widget source, and leaves the Dashboard Story of ADR-0007 unchanged.
- **New Completeness check service.** It is a deep module with one entry point, `checkCompleteness(ctx, { today })`. It returns one entry per checked Account: the Account's identity and Currency, the data end date (or none), days since, and a list of problems. Problems are a tagged union: `mismatch` (difference in minor units and the Statement balance date), `gap` (first and last day), `stale`, `never_imported`. The caller passes `today`; the service never reads the clock.
- **No stored state.** The service computes everything on each request from Accounts, Imports, Transactions and Balance snapshots. There are no schema changes.
- **Scope.** Freshness and Gaps cover non-archived Accounts that have an Import format. The mismatch check covers every non-archived Account that has at least one Transaction and at least one Statement balance.
- **Coverage.** An Import covers its statement period. A missing start or end falls back to that Import's earliest or latest Transaction date; an Import with neither a statement end nor any Transactions covers nothing. Undone Imports cover nothing. An Account whose committed Imports cover nothing has no data end and is Stale, not "No Import yet". Overlaps are allowed.
- **Gap.** A run of one or more days that no Import covers, after the first committed Import's coverage starts and before the latest coverage ends, and that contains no Manual transaction on that Account.
- **Stale.** The data end date is more than 40 days before `today`. The 40 is a named constant, not configurable.
- **Mismatch.** Compare the later of the newest committed Import's closing balance (dated at its statement end) and the newest Balance snapshot with the Account's computed native balance on that date. Reuse the existing balance-on-date and snapshot-check logic; do not reimplement balance computation. Any non-zero difference is a mismatch.
- **Ordering.** Problems within a row and rows within the list are ordered by severity: mismatch, Gap, Stale or never imported. Healthy Accounts come after them, ordered as the Accounts list orders them.
- **UI.** A native disclosure element, open when any problem exists, with alert semantics in that case. Amounts are formatted in the Account's Currency and dates in the app's usual date format.
- **Design system.** Add a shared warning-notice primitive to the surface primitives for the existing `warning` / `warning-tint` / `warning-rule` notice styling. Move the FX staleness notice and the Balance-snapshot mismatch notice onto it in the same change. Style the neutral state with existing ink tokens.
- **Glossary.** Completeness check, Gap and Stale are now defined in the glossary; use those words in code and UI.

## Testing Decisions

- **One seam: `checkCompleteness`.** Every rule (coverage, Gaps, Stale, never imported, mismatch, scope, ordering) is tested through this one function against the real test database. There are no unit tests of internal helpers, so the internals can be restructured freely.
- **Test external behaviour only.** Arrange state through public services alone: create Banks and Accounts, commit Imports from parser fixture files, create Manual transactions, record Balance snapshots, undo Imports, archive Accounts. Assert only on the returned entries. `today` is passed in, so day counts and the 40/41-day boundary are deterministic without a fake clock.
- **Cases to cover:** contiguous Imports; overlap; a one-day Gap; a Gap filled by a Manual transaction; an Import with no statement period; an undone Import between two others; Stale at 40 vs 41 days; never imported; a mismatch caused by editing a Manual transaction after a reconciled Import; a Balance snapshot later than the last Import; manual-only and archived Accounts excluded where they should be; an Account with only Balance snapshots and no Transactions excluded; severity ordering.
- **Prior art:** the Balance snapshot service tests (real database via the shared test-database setup, state built through services) and the Account balance tests.
- **One thin E2E** on the home Dashboard, seeded through services like the FX balances E2E. It checks the neutral all-fine line, then an open notice with a problem row that links to the Account page. It does not re-test the rules.
- **No component tests for the notice.** The move to the shared warning primitive is covered by the existing tests of the two notices.

## Out of Scope

- Configurable or per-Account Stale thresholds.
- Acknowledging, snoozing or dismissing a Gap or any other problem.
- Re-checking every historical Statement balance; only the latest per Account is compared.
- An "empty months" heuristic for Accounts that are normally active.
- Showing the Completeness check on other Dashboards or on the Accounts page.
- Notifications outside the app (email, push).
- Storing or caching check results.

## Further Notes

- Decided in a grilling session on #92. ADR-0008 records the placement trade-off; the glossary records the new terms.
