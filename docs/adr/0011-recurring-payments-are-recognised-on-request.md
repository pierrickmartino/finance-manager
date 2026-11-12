---
status: accepted
---

# Recurring payments are recognised on request; only dismissals are stored

Recurring payments are worked out from the last 36 months of Transactions each time the page is opened, never stored as records of their own. The only thing stored is a dismissal, and it is anchored on the charges (Transactions or Split lines) the series held when it was dismissed: a recognised series is dismissed if it contains any of them. Stored series would go out of date whenever a Transaction is reclassified, re-split, imported, or its Payee merged. Recognising them on request means they always match the data, as reports already do (ADR-0002), and the app has no background job to keep them in step.

## Considered Options

- **Store recognised series and update them on every write.** Rejected: every write to Transactions, Split lines, Payees and Categories would have to keep them in step, and a missed path would leave the page wrong.
- **Key a dismissal on Payee, Currency, cadence and amount.** Rejected: amounts drift under the ±20% tolerance, and a Payee merge deletes the source Payee, so the dismissal would be lost or match the wrong series.

## Consequences

- If a Split is redone, its lines are replaced, so a dismissed series made of those lines can come back once. This is accepted.
- The thresholds (cadences, ±20% interval and amount, minimum charge counts) can change without migrating data. Only dismissals have to survive such a change.
