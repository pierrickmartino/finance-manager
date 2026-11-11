# 03: Gaps

**Parent:** #92 · Spec: Completeness check (specs folder)

**What to build:** The Completeness check flags every Gap on an imported Account, so I learn that a bank file is missing and which period to fetch. A Gap appears on the Account's row with its first and last day, ranked above Stale.

**Blocked by:** 02: Tracer bullet: the Completeness check notice with freshness

**Status:** done

- [ ] A Gap is a run of one or more days, after the first committed Import's coverage starts and before the latest coverage ends, that no committed Import covers.
- [ ] An Import's coverage is its statement period; a missing start or end falls back to that Import's earliest or latest Transaction date.
- [ ] Undone Imports cover nothing, so undoing an Import between two others leaves its period as a Gap.
- [ ] Overlapping Imports produce no Gap.
- [ ] A span containing at least one Manual transaction on that Account is not a Gap.
- [ ] Gaps are checked across the Account's whole history; an Account can have several.
- [ ] The `gap` problem carries its first and last day and ranks after mismatch and before Stale and No Import yet; any Gap makes the Account count as needing attention.
- [ ] Each Gap shows on the Account's row with its dates.
- [ ] Service tests (real database, public services only) cover: contiguous Imports, overlap, a one-day Gap, a Gap filled by a Manual transaction, an Import with no statement period, an undone Import between two others, and several Gaps on one Account.
