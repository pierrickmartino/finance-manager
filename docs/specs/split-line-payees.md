# Split line Payees

## Problem Statement

A Split lets me classify the parts of one bank entry under several Categories, but every Split line still reports under the Transaction's single Payee. A BCGE CAMT entry bundling a Migros, a Coop and a pharmacy payment shows all three under one Payee, so my Payee reports and filters misstate where the money went.

## Solution

A Split line that has a Category can name its own Payee. A line without one takes its Transaction's Payee. The Transaction keeps its own Payee, so imports, Rules and the transaction list behave as before, while Widgets, filters and the export see each line's Payee. When a bundled payment's counterparty name matches an existing Payee, the split form suggests it. See ADR-0006.

## User Stories

1. As the user, I want to set a Payee on a Split line, so that each part of a bundled entry is reported under the counterparty it was paid to.
2. As the user, I want a Split line with no Payee of its own to take its Transaction's Payee, so that I only set Payees on the lines that differ.
3. As the user, I want the split form to show the inherited Payee as a placeholder on a blank line, so that I see which Payee the line will report under.
4. As the user, I want a Payee I pick on a line to stay, even if it equals the Transaction's Payee, so that later changes to the Transaction's Payee don't move that line.
5. As the user, I want a blank line to follow its Transaction's Payee when I, a bulk edit or a Rule change it, so that Payee cleanup still reaches the lines.
6. As the user, I want a Transfer Split line to have no Payee, and linking a line to a Transfer to clear its Payee, so that Transfer lines carry no counterparty.
7. As the user, I want the split form pre-filled from CAMT bundled details to suggest each line's Payee when the payment's counterparty name matches an existing Payee, ignoring case and accents, so that I don't pick them by hand.
8. As the user, I want the pre-fill never to create a Payee from raw bank text, so that my Payee list stays clean.
9. As the user, I want Widget Payee axes and filters to use each line's own Payee, or else its Transaction's, so that Payee reports are correct.
10. As the user, I want a drill-down from a Payee cell to list the parent Transactions with a line in that cell, each once, so that drill-downs match how Categories behave.
11. As the user, I want the transaction list to keep showing a split Transaction under its own Payee, so that the list still matches my bank statement.
12. As the user, I want filtering the transaction list by a Payee to also find split Transactions with a line of that Payee, so that I find everything paid to it.
13. As the user, I want each Split line row of the CSV export to show its own Payee, or else its Transaction's, so that external analysis sees the detailed counterparty.
14. As the user, I want a Payee's usage count to be the number of distinct Transactions using it, directly or via a Split line, so that I know how much depends on it.
15. As the user, I want merging two Payees to move the lines that name the source too, in the same History Batch, so that the merge is complete and traceable.
16. As the user, I want the transaction page's Split lines table to show each line's Payee, with an inherited one muted, so that I see which Payee each line reports under.
17. As the user, I want deleting a Payee to be refused while a Split line still names it, so that no line loses its Payee silently.
18. As the user, I want Rules never to set a line's Payee, and Rule Payee conditions to match only the Transaction's own Payee, so that line Payees stay a manual choice.
19. As the user, I want removing a Split to discard its lines' Payees and keep the Transaction's, so that the Transaction returns to its whole classification.
20. As the user, I want setting, changing or clearing a line's Payee to be recorded in History, so that I can see what changed.

## Implementation Decisions

- **Model (ADR-0006).** A Split line has an optional Payee. The line's reported Payee is its own Payee, else its Transaction's. A line with a Transfer has no Payee.
- **Schema.** A nullable Payee reference on the Split line table, refusing the delete of a Payee still in use. A database check backs "a Transfer line has no Payee".
- **Transactions service.** `splitTransaction` accepts an optional Payee per line, validated as an existing Payee and refused on a Transfer line. Linking a line to a Transfer clears its Payee. `getTransaction` and `listTransactions` expose each line's own Payee. The list's Payee filter matches the Transaction's Payee or any line's.
- **Classification and bulk edit.** Setting a split Transaction's Payee changes only the Transaction's Payee.
- **Rules.** Unchanged: Rules read and set only the Transaction's Payee.
- **Payees service.** The usage count is the number of distinct Transactions using the Payee, directly or via a Split line. A merge moves those lines in the same Batch, recording one History entry per affected Transaction whose snapshot includes its lines' Payees. A delete is refused while any line names the Payee. The Payees page total is likewise a distinct count of Transactions using any Payee.
- **Reporting.** The report base takes the line's Payee, else the Transaction's, for the Payee axis and filter. Drill-down still lists distinct parent Transactions.
- **Export.** A Split line row's Payee is the line's own Payee, else its Transaction's.
- **Transaction page.** The Split lines table shows each line's Payee: its own, or its Transaction's shown muted as inherited. A Transfer line shows none.
- **Split form.** Each line has a Payee picker, blank by default, with the Transaction's Payee as its placeholder. The bundled pre-fill sets a line's Payee when its counterparty name equals an existing Payee's name, ignoring case and accents with whitespace normalised, as Rule text conditions already compare.
- **Docs.** The glossary's Split line entry names the optional Payee. ADR-0006 supersedes ADR-0004 for the lines' Payee.

## Testing Decisions

- As in the splits spec: test external behaviour through public service functions against the real test database, asserting what the user sees (lists, reports, export rows, History).
- **Seam:** `splitTransaction` with line Payees, observed through `getTransaction`, `listTransactions` with a Payee filter, `editClassification` and bulk edit, Rule application, `linkTransfer`, `runWidgetQuery` and drill-down with a Payee axis and filter, `exportTransactionsCsv`, `mergePayees`, `deletePayee`, the Payee list's counts and History reads.
- Unit tests for the pre-fill's Payee matching, following `split-lines.test.ts`.
- Extend the CAMT bundled end-to-end test, following `e2e/split-bundled.spec.ts`: the pre-filled lines suggest the matching Payees.

## Out of Scope

- Rules that set or match a Split line's Payee.
- Creating Payees from bundled counterparty names.
- A Payee on a Transfer Split line.
- Showing line Payees in the transaction list row.
