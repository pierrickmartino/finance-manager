---
status: accepted (supersedes ADR-0009's "dots in and out for income vs. expense", and ADR-0020's "A bars flow keeps its dots")
---

# A bars flow is drawn as grouped bars, and Analytics gains one

A bars Widget whose two columns are its income and its expense, a bars flow, was drawn as a dot matrix: a pair of nine-dot columns per Interval (ADR-0009). It is now drawn as grouped bars: one Income bar and one Expense bar per Interval, side by side on one scale, income in `ramp-1` and expense in `ramp-4` as before, with a muted legend reading "Income" and "Expense". The mark replaces the dots everywhere, on the Dashboard Story as on Analytics, so the two pages keep reading alike. The user wanted the reference dashboard's "Revenue vs Expense" bars, and bars give amounts that can be compared by height, which nine dots could not.

Analytics gains a Card of income and expense per Interval of its Period, drawn as that mark. Its bars cover every Interval of the Period (or Card Period), not a fixed last six: the Period preset chooses the window. The partial first Interval and the "to date" last one are hatched, as the glossary sets them apart; the dots marked neither. Only the Income and Expense Category groups count, so Capital, Unclassified and Transfers are left out, and each bar opens the Drill-down of its Interval and Category group type.

## Considered Options

- **Keep the dots on Dashboards, grouped bars on Analytics only.** Rejected: two marks for the same Widget breaks "a section of Analytics is drawn as the card of the Widget that would show the same figures".
- **Grouped bars as a new visualisation option.** Rejected: a bars Widget with income and expense columns is already read as a flow; only its mark changes, as with ADR-0020's areas.
- **The last six Intervals, as the reference and `MonthBars` show.** Rejected: an Analytics Card is read wholly over its Period.

## Consequences

- Existing bars flow Widgets on Dashboards change look with no migration.
- `DotMatrix` goes away.
