# Splits divide a Transaction's classification, not the Transaction

Bank exports often aggregate several purchases, or principal and interest, into one entry, and the user needs to classify the parts separately. We decided that a Split divides one Transaction's amount into Split lines, each with its own Category, Tags and note, that sum exactly to it, while the Transaction itself stays one movement on one Account with its bank fields, Fingerprint and Payee unchanged. This reverses the v1 "no splits" rule and lifts the cost named in ADR-0001, without moving to double-entry.

## Considered Options

- **Replace the Transaction with child Transactions.** Rejected: imported bank fields are immutable, re-imports recognise Transactions by Fingerprint, and reconciliation against Statement balances relies on one Transaction per bank entry (ADR-0003). Children would break all three.

## Consequences

- Reports, Widgets and the CSV export count Split lines, not the parent; the transaction list shows the parent once.
- Every Split line needs a Category, so a split Transaction is never Unclassified; lines may differ in sign and use any Category group type, including Capital (loan principal).
- A Transaction is either part of a Transfer or split, never both.
- Splitting is a manual classification: Rules never create Splits and never override a split Transaction's Category. Removing a Split returns the Transaction to Unclassified.
