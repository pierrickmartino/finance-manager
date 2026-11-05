---
status: accepted
---

# A Split line can name its own Payee

A bundled bank entry often pays several counterparties at once, for example a BCGE CAMT entry covering a Migros, a Coop and a pharmacy payment. ADR-0004 kept the Payee on the Transaction, so every Split line was reported under one counterparty and Payee reports misstated where the money went. We decided that a Split line with a Category may name its own Payee, and that a line without one takes its Transaction's Payee. The Transaction keeps its Payee and its bank fields, so imports, Rules and the transaction list are unchanged. This supersedes ADR-0004's "Payee unchanged" for the lines only. A Transfer line has no Payee, because its other side is one of the user's own Accounts and it is left out of reports.

## Considered Options

- **Move the Payee to the lines, as Category moved.** Rejected: Rules set the Payee per Transaction, the list names a Transaction by its Payee, and the splits spec keeps a split Transaction's Payee editable. All three would break for a gain that the fallback already gives.
- **Lines with their own Payee and no fallback.** Rejected: an unset line would report under no Payee, and splitting would undo the Payee cleanup already done on the Transaction.

## Consequences

- A Payee picked on a line stays pinned, even when it equals the Transaction's Payee. A blank line follows the Transaction's Payee as it changes, including changes made by Rules.
- Rules never set a line's Payee, and Rule Payee conditions match the Transaction's own Payee only.
- Widget Payee axes and filters, and the CSV export, use each line's Payee, or else its Transaction's. A drill-down lists the parent Transactions, counted once per cell, as Categories already are.
- The transaction list still shows the Transaction's Payee, and its Payee filter matches the Transaction's Payee or any line's.
- A Payee's usage count covers Transactions and Split lines. A merge moves both in one Batch, and a delete is refused while any line still uses the Payee.
- Linking a line to a Transfer clears its Payee, along with its Category. Removing a Split discards its lines' Payees.
- The CAMT bundled pre-fill suggests a line's Payee only when the payment's counterparty name matches an existing Payee, ignoring case and accents. It never creates a Payee.
