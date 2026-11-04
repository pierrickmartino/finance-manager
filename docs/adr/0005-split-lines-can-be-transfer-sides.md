---
status: accepted
---

# A Split line can be a side of a Transfer

A bank entry sometimes mixes a movement to one of the user's own Accounts with real spending, for example a −1,500 debit of which −1,000 went to the user's savings and −500 paid rent. ADR-0004 made a Transaction either split or part of a Transfer, never both, so that part of the entry could only be misclassified as an expense. We decided that each side of a Transfer is either a whole Transaction or one Split line, so a part of a bank entry can be a Transfer while the Transaction stays one movement on one Account. This supersedes that one consequence of ADR-0004. A whole Transaction that is a Transfer side still can't be split, because its whole amount is the Transfer.

## Considered Options

- **Keep "split or Transfer, never both" and record the transfer part under a Capital Category.** Rejected: the money would never be linked to its other side, and the other side, a whole Transaction, would have to be misclassified too.
- **Allow only Split line ↔ whole Transaction.** Rejected: refusing Split line ↔ Split line, where both bank entries are aggregates, is an arbitrary edge that is no easier to state.

## Consequences

- A Split line has either a Category or a Transfer, never both. Linking a line clears its Category, and Rules never touch it.
- The pairing checks don't change. The two sides are different, on different Accounts (a line takes its Transaction's Account) and of opposite signs, and amounts aren't checked. Several lines of one Split can each be in their own Transfer.
- Transfer candidates are only ever whole Transactions. Split lines are made by hand after Import, so a Split-line Transfer is always linked manually.
- Removing a Split, or dropping a line that is a Transfer side, is refused until the Transfer is unlinked. Deleting a Transaction still unlinks its Transfers automatically.
- When a line's Transfer is unlinked, by hand, by deleting the other side or by undoing its Import, the line is left with neither a Category nor a Transfer. Its Transaction is then Unclassified until the line gets a Category or a new Transfer, so a split Transaction can be Unclassified, which ADR-0004 ruled out.
- Reports, Widgets and the CSV export leave out Transfer Split lines, just as they leave out Transfers. The other lines of the same Split still count.
