---
status: accepted
---

# The Transaction detail carries its Transactions list in the URL

A Transaction detail opened from the Transactions list steps to the previous or next Transaction of that list (issue #142). For that it has to know the list, so the list's filters ride in the detail URL (`/transactions/123?unclassified=true&from=…`), read with the same `readTransactionSearch` as the list itself. This replaces ADR-0012's last-list URL remembered in memory: "← Transactions" now builds its link from the detail URL, returning to the list page that holds the current Transaction, with it selected. A detail URL with no filters shows no Previous and Next.

The list is live, not a snapshot: Previous and Next are the neighbours of the open Transaction in the list's fixed order (`booking_date DESC, entry_order DESC`, a total order since `entry_order` is unique), among the Transactions that match the filters now. So a Transaction that stops matching once classified, or a Transfer counterpart reached by its link, still has neighbours, and the count ("12 of 48") follows the edits.

## Considered Options

- **Keep the list in memory**, as ADR-0012's back link did. Rejected: a reload, a bookmark or a new tab loses navigation, and the app otherwise keeps all list state in the URL.
- **Freeze the list when detail opens.** Rejected: while working through Unclassified, Next would land on Transactions already classified elsewhere, and the count would no longer match the list.

## Consequences

- Detail URLs are longer and are bookmarked with their filters; dropping the filters later would break those bookmarks' navigation, not the page.
- Every link into the detail from the Transactions list (row, Transaction preview's "Open & classify", Transfer counterpart) must carry the current filters. Links from elsewhere (Drill-downs, Unclassified groups, Dashboard, Payee and Tag pages, Rules) stay bare until they get lists of their own.
- Deleting a Transaction returns to its list, with the neighbour selected, rather than to the bare `/transactions`.
