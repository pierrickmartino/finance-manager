---
status: accepted (amends ADR-0018: the heatmap it calls "Income vs expense" is now "Profit per interval")
---

# Income vs. expense always reads by day, as running totals

Analytics' Income vs. expense Card is drawn as two overlapping areas, the Income and the Expense Category groups (Capital and Unclassified left out, so the gap is Profit), and it is always split into days, whatever the Period's length, each point being the running total from the Period's first day. Every other per-Interval Card keeps the month, quarter or year its Period's length gives, so an Interval is the same for the whole Card, no longer for the whole Period. The user wanted the reference dashboard's smooth "income vs expenses" areas over the days of the Period; per-day amounts are mostly zero with a salary spike, and running totals end on the Period's income, expense and Profit, which the Card states.

To keep a section drawn as the card of the Widget showing the same figures, the reporting engine gains a `day` time axis, open to any Widget and not capped, and any line Widget read as a flow is drawn as two areas: by day as running totals, by month, quarter or year as each Interval's amounts. A bars flow keeps its dots. The heatmap formerly called Income vs. expense is renamed Profit per interval and keeps its Card Period; the new Card takes the `income-vs-expense` id and has one too.

## Considered Options

- **All money in vs all money out, gap = Net cash flow.** Rejected: needs new terms and splits Capital and Unclassified by sign; the Profit and loss and Profit per interval still show them.
- **A new `area` visualisation.** Rejected: a line or bars Widget with income and expense columns was already read as a flow; only the line flow's mark changes.
- **Days for short Periods only (up to 92 days).** Rejected: the user wanted the daily reading on every Period.
- **Days page-wide.** Rejected: heatmaps and Categories per interval are unreadable with hundreds of columns.
- **Per-day amounts.** Rejected: spiky and mostly zero.
- **A cap on by-day Widget ranges.** Rejected by the user.

## Consequences

- A hovered day opens the Drill-down from the Period's (or Card Period's) first day through that day, so the list sums to the point.
- A pinned `income-vs-expense` URL from before now pins the area Card, not the heatmap.
- No Comparison period is drawn on the Card; the Profit and loss compares.
