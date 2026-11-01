# Split Transactions

## Problem Statement

My bank exports aggregate several purchases into one entry: a BCGE CAMT entry bundling a day's card payments, a supermarket receipt covering groceries and household goods, a loan repayment mixing principal and interest. Each becomes one Transaction with one Category, so my reports put the whole amount under a single Category and misstate my spending. I can't fix it by editing the Transaction, because its bank fields are immutable, and I don't want to break re-imports or the balance check.

## Solution

I can Split any Transaction: divide its amount into Split lines that sum exactly to it, each with its own Category, Tags and note. The Transaction stays one Transaction (same amount, date, Fingerprint, Payee and Account balance), so imports and reconciliation are unaffected, but reports, Widgets and the export count each Split line under its own Category. When a CAMT bundled entry already lists its payments with amounts, the split form starts pre-filled with one line per payment. See ADR-0004.

## User Stories

1. As the user, I want to split a Transaction into several Split lines, so that one aggregated bank entry is classified under several Categories.
2. As the user, I want each Split line to carry an amount and a Category, so that each part of the spending is reported where it belongs.
3. As the user, I want to add Tags to a single Split line, so that only that part counts under a Tag such as "Renovation".
4. As the user, I want to add a note to a Split line, so that I remember what that part was.
5. As the user, I want the split to be refused unless the lines sum exactly to the Transaction's amount, so that no money disappears or appears in reports.
6. As the user, I want to see the remaining unallocated amount while editing lines, so that I can make them balance before saving.
7. As the user, I want every Split line to require a Category, so that a split Transaction is never partly unclassified.
8. As the user, I want Split lines to be allowed to have different signs, so that a payment containing a voucher refund nets correctly.
9. As the user, I want Split lines to use Categories of any Category group type, including Capital, so that I can split a loan repayment into principal (Capital) and interest (Expense).
10. As the user, I want to split an imported Transaction without changing its bank fields, so that re-imports still recognise it by its Fingerprint.
11. As the user, I want to split a Manual transaction too, so that hand-entered aggregated amounts can be classified in the same way.
12. As the user, I want the split form to start with one line per bundled payment when the bank's bundled details all have amounts summing to the Transaction's amount, so that I only have to pick Categories.
13. As the user, I want each pre-filled line's note to hold the bundled payment's counterparty name, so that I know which payment the line is.
14. As the user, I want the split form to start with a single line for the full amount when no usable bundled details exist, so that I can divide it myself.
15. As the user, I want to edit an existing Split's lines, so that I can correct a mistake.
16. As the user, I want to remove a Split, so that the Transaction goes back to Unclassified and can be classified as a whole again.
17. As the user, I want a split Transaction to never appear as Unclassified, so that my classification progress reflects reality.
18. As the user, I want the transaction list to show a split Transaction once at its full amount, with its Category shown as "Split (n)", so that the list still matches my bank statement.
19. As the user, I want filtering the transaction list by a Category to include split Transactions with a line in that Category, so that I find everything I spent there.
20. As the user, I want such a filtered row to also show the matching Split line's amount, so that I see how much of it belongs to that Category.
21. As the user, I want reports and Widgets to sum Split line amounts by their Categories, so that my income and expense totals are correct.
22. As the user, I want a Split line to count under its own Tags plus the Transaction's Tags in reports, so that a "Vacation 2024" Transaction tag still covers every line.
23. As the user, I want the CSV export to write one row per Split line, repeating the Transaction's fields with the line's amount, Category, Tags and note, so that external analysis sees the detailed classification.
24. As the user, I want each exported Split line row to carry the Transaction's id, so that I can group the rows back together.
25. As the user, I want the sum of the exported amounts to still equal the Account's movements, so that the export reconciles.
26. As the user, I want editing the Category of a split Transaction, directly or by bulk edit, to be refused with a message telling me to edit or remove the Split, so that the Split is never silently discarded.
27. As the user, I want to keep editing a split Transaction's Payee, Tags and notes, so that the rest of its classification stays editable.
28. As the user, I want Rules never to create Splits, so that splitting stays a deliberate manual act.
29. As the user, I want Rules never to change a split Transaction's Category, including when applied to existing Transactions, so that my manual Split always wins.
30. As the user, I want Rules to still set a split Transaction's Payee, so that payee cleanup keeps working.
31. As the user, I want confirming a Transfer or Transfer candidate involving a split Transaction to be refused, with a message to remove the Split first, so that a Transaction is never both a Transfer and split.
32. As the user, I want a Transaction that is part of a Transfer to not be splittable, so that Transfers stay whole.
33. As the user, I want creating, editing or removing a Split to be recorded as History entries in one Batch, so that I can see what changed and when.
34. As the user, I want undoing an Import to remove its Transactions together with their Splits in the same History Batch, so that the undo is complete and traceable.
35. As the user, I want deleting an imported or Manual transaction to delete its Split, so that no orphaned lines remain in reports.
36. As the user, I want Split line amounts to be in the Transaction's Currency and converted to the Base currency in reports like any amount, so that cross-currency reporting stays consistent.

## Implementation Decisions

- **Model (ADR-0004).** A Split divides classification only. A Transaction with a Split has no Category of its own; its Split lines hold the Categories. The Transaction's Payee, Tags and notes stay on the Transaction.
- **Schema.** A new Split line table: id, Transaction reference (deleted with its Transaction), signed amount in minor units of the Transaction's Currency (ADR-0002), Category (required), note, and an ordering position. A Split line Tag table mirrors the Transaction Tag table. A Transaction is split when it has Split lines; there is no separate flag. A split Transaction's own Category is null.
- **Invariants, enforced in the service and backed by the database where practical:** at least two lines; every line has a Category; lines sum exactly to the Transaction's amount; a Transaction in a Transfer has no lines.
- **Transactions service.** New public operations `splitTransaction(ctx, transactionId, lines)` (creates or replaces the whole set of lines) and `removeSplit(ctx, transactionId)`, both validated with the service's existing input parsing and raising the existing validation and not-found errors. Each writes one History Batch, with the manual edit as actor.
- **Reads.** `getTransaction` and `listTransactions` expose the Split lines. The Category filter matches a Transaction whose own Category or any Split line's Category matches, and the list item exposes the matching lines' amount. The Unclassified definition and the unclassified groups and progress exclude split Transactions.
- **Classification editing.** `editClassification` and bulk edit refuse a Category change on a split Transaction with a validation error; Payee, Tags and notes remain editable.
- **Rules.** Rule application, at import and on existing Transactions, never sets the Category of a split Transaction and never creates Split lines. A Split counts as a manual classification for the Category field.
- **Transfers.** Linking a Transfer, and Transfer decisions at Import commit, refuse a split Transaction with a validation error. `splitTransaction` refuses a Transaction in a Transfer.
- **Reporting.** The reporting engine treats each Split line as a reportable row in place of its Transaction: the line's amount, the line's Category (and its group type), the Transaction's Account, date, Payee and Currency, and the union of the line's and the Transaction's Tags. Base currency conversion happens at query time as today. Drill-down from a Widget lists the parent Transactions.
- **Export.** The CSV export writes one row per Split line for a split Transaction, with the line's amount, Category, Tags and note, plus a new column holding the Transaction's id, filled on every row.
- **Import undo and deletion.** Undoing an Import and deleting a Transaction remove its Split lines, recorded in the same History Batch.
- **Split form.** On the transaction page, a split action opens a form of editable lines with a live remaining amount. It pre-fills one line per bundled detail (amount, counterparty name as note, no Category) when every bundled detail has an amount and they sum exactly to the Transaction's amount; otherwise one line for the full amount.
- **Docs.** The glossary defines Split and Split line; the v1 spec's "no splits" rule is superseded by ADR-0004.

## Testing Decisions

- Good tests exercise external behaviour through public service functions against a real test database, asserting what a user would see (lists, reports, export rows, History), never internal tables or helpers.
- **Single seam:** the transactions service's `splitTransaction` and `removeSplit`, observed through existing public functions: `getTransaction`, `listTransactions`, unclassified groups and progress, `editClassification`, bulk edit, Rule application on existing Transactions and at import, `linkTransfer`, Import commit with Transfer decisions, `runWidgetQuery`, `exportTransactionsCsv`, `undoImport`, `deleteImportedTransaction`, and History reads.
- Prior art: `transactions.test.ts`, `classification.test.ts`, `bulk-edit.test.ts`, `rules-existing.test.ts`, `transfers.test.ts`, `reporting.test.ts`, `export.test.ts`, `imports.test.ts` (undo) and `history.test.ts`, using the shared test database setup and Transaction seeding support.
- One Playwright end-to-end test, following `e2e/transactions.spec.ts` and the CAMT import spec: import a CAMT fixture with a bundled entry, open it, see the pre-filled lines, pick Categories, save, and see "Split (n)" in the list.
- The existing reporting and export performance tests must still pass with split Transactions present in the seed data.

## Out of Scope

- Rules that create Splits (e.g. fixed interest plus remaining principal).
- Splitting a Transaction across Transfers, or a Transaction that is both a Transfer and split.
- Splitting into separate Transactions, or changing an imported Transaction's bank fields.
- A Payee per Split line.
- Partially classified Splits or unallocated remainders.
- Itemised credit card Accounts.

## Further Notes

- Decided in a design session recorded in ADR-0004 and the glossary entries for Split, Split line and Unclassified.
- The bundled details pre-fill applies to BCGE CAMT.053 entries today; UBS CSV and OFX have no bundled details.
