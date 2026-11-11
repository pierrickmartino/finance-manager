# 02: Tracer bullet: the Completeness check notice with freshness

**Parent:** #92 · Spec: Completeness check (specs folder) · ADR-0008

**What to build:** The first end-to-end slice of the Completeness check. When I open the home Dashboard, a notice above the Hero tells me how current each imported Account is and flags any that is Stale or has no Import yet. Each problem links to the Account's page. It sits outside the Dashboard Story (ADR-0008) and appears only on the Dashboard the home page opens.

A new Completeness check service with a single entry point, `checkCompleteness(ctx, { today })`, computes the result on each request without stored state. It returns one entry per checked Account: identity, Currency, data end date (or none), days since, and a list of problems. Problems are a tagged union carrying a severity order, so later tickets add `gap` and `mismatch` without reshaping it. This ticket ships `stale` and `never_imported`.

**Blocked by:** 01: Shared warning-notice primitive

**Status:** ready-for-agent

- [ ] Checked Accounts are the non-archived Accounts with an Import format; manual-only and archived Accounts are not listed.
- [ ] The data end date is the last day the latest committed Import covers: its statement end, else its latest Transaction date. Undone Imports are ignored.
- [ ] Days since are counted from the data end date to the `today` the caller passes; the service never reads the clock.
- [ ] An Account is Stale when its data ends more than 40 days before `today` (a named constant; 40 days is not Stale, 41 is).
- [ ] An Account with an Import format and no committed Import has a "No Import yet" problem.
- [ ] With no problems, the notice is one neutral line, "All N Accounts current to ⟨date⟩", using the earliest data end date; the per-Account list is collapsed but can be expanded.
- [ ] With problems, the line reads "N Accounts need attention" in the `warning` token, the list is open, and the notice has alert semantics.
- [ ] One row per Account shows its data end date, days since and all its problems. Problem rows come first, ordered by worst problem, and use the shared warning primitive. Healthy rows follow in Accounts-list order, in neutral ink.
- [ ] Each row links to that Account's page.
- [ ] The notice is server-rendered, uses a native disclosure element (no client script), and fits phone width.
- [ ] It appears only on the Dashboard the home page redirects to, and other Dashboards are unchanged.
- [ ] Service tests run against the real test database through public services only (Accounts, Imports from fixture files, undo), covering: the data end date with and without a statement period, an undone latest Import, 40 vs 41 days, never imported, and archived and manual-only exclusion.
- [ ] One E2E test seeded through services checks the all-fine line and an open notice with a problem row that links to the Account page.
