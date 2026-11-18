---
status: accepted
---

# Net worth over time uses the computed balance, not Statement balances

Each point of Net worth over time is the balance the app already computes for an Account on that date: its opening balance plus its Transactions up to the date, or for an Account without Transactions (such as a loan) its latest Balance snapshot on or before it, converted at that date's FX rate (ADR-0002). Statement balances are not used as anchors, even though Imports carry them. This keeps every point equal to what the Account page shows for the same date, and leaves Statement balances in their one role: the Completeness check compares them with the computed balance and flags any mismatch.

## Considered Options

- **Anchor on each Statement balance and roll Transactions from the nearest one.** Rejected: the line would disagree with the Account page wherever the data has a mismatch, and the mismatch would be hidden inside the chart instead of reported by the Completeness check.
- **Step or interpolate between Statement balances.** Rejected: it ignores the Transactions in between, and interpolation invents values.

## Consequences

- If an Account doesn't add up, every point before the mismatch is off by its amount until the data is fixed. The Completeness check reports this. The chart does not.
- A loan tracked only by Balance snapshots draws as steps, flat between snapshots.
