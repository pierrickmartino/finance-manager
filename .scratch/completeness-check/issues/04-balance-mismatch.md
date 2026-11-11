# 04: Balance mismatch

**Parent:** #92 · Spec: Completeness check (specs folder)

**What to build:** The Completeness check catches an Account whose Transactions no longer add up to the Bank's latest word. For example, a Manual transaction edited, an Import undone or an opening balance changed after a reconciled Import. The mismatch shows on the Account's row with its difference in the Account's own Currency, and it ranks above every other problem.

**Blocked by:** 02: Tracer bullet: the Completeness check notice with freshness

**Status:** done

- [ ] Every non-archived Account with at least one Transaction and at least one Statement balance is checked for mismatch, excluding Accounts with no Transactions (whose balance is their latest snapshot, so they can never mismatch) and including manual-only Accounts that have Transactions. Manual-only Accounts appear in the notice only when they have a mismatch, and never for Stale or Gap.
- [ ] The latest Statement balance is the later of the newest committed Import's closing balance (dated at its statement end) and the newest Balance snapshot.
- [ ] It is compared with the Account's computed native balance on that date, reusing the existing balance-on-date and Balance-snapshot check logic rather than recomputing balances.
- [ ] Any difference of one minor unit or more is a `mismatch` problem carrying the difference and the Statement balance date. An Account with no Statement balance has no mismatch problem.
- [ ] A mismatch ranks first among problems, and its row shows the difference formatted in the Account's Currency.
- [ ] Service tests (real database, public services only) cover: a reconciled Import with no mismatch; a mismatch after editing a Manual transaction; a Balance snapshot later than the last Import, both matching and not matching; a manual-only Account whose Balance snapshot drifts; an Account with only Balance snapshots and no Transactions excluded; and an archived Account excluded.
