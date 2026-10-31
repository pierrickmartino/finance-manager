# Single-sided Transactions, not double-entry

A Transaction is one signed movement on one Account; a Transfer is two Transactions linked together. We rejected a double-entry journal (entries with balanced postings) because the app only tracks and reports, and double-entry would make importing, classifying and editing much heavier for a single user. The cost is that some flows can't be modelled cleanly: FX spreads on cross-currency Transfers vanish, and loan repayments can't be split into principal and interest without split transactions.
