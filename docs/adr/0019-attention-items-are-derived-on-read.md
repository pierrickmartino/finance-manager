---
status: accepted
---

# Attention items are derived on read; only what the bell last showed is stored

The notifications bell in the top bar lists Attention items: Stale FX rates, Completeness check problems, Unclassified Transactions, and Missed Recurring payments or Price increases. These are worked out from current data each time the app shell renders, using the same checks their own pages use. They are never stored as notification events. An item goes away by itself once its condition is fixed, so the bell cannot disagree with the pages, and the app needs no background job or write hook to raise or clear notifications (ADR-0002, ADR-0011). The only state stored is what the bell listed when it was last opened. An item is unread when it was not shown in its current form at that time, or when its subject has since got worse. Opening the bell marks everything read.

## Considered Options

- **Store notifications as events with read state.** Rejected. Something would have to raise them, either the daily FX cron, each Import, or each edit, and clear them, and they would duplicate conditions the pages already compute. A missed path would leave a notification wrong or stale.
- **Decide unread from the date each condition started.** Rejected. These dates are worked out from the data, and an Import can reveal a Gap dated months back, which would then never show as unread.

## Consequences

- Every page render runs the Completeness check, Recurring payment recognition, the Unclassified count and the FX status. This runs streamed behind Suspense so pages never wait on it. Caching is left for when a measurement asks for it.
- There is no per-item dismiss. A false-positive Recurring payment is still removed by its Dismissal.
- Each kind of item defines what "got worse" means for it, so that it becomes unread again.
