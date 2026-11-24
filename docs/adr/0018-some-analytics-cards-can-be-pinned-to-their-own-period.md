---
status: accepted (partly supersedes ADR-0016: the page's Period is no longer its only control)
---

# Some Analytics Cards can be pinned to their own Period

Net worth, Net cash flow, Spending by category, Profit and loss, Income vs expense (since ADR-0020 the day-by-day areas; the heatmap is Profit per interval), Profit per interval and Categories per interval each get a Card Period: a dropdown of the Period presets plus "Same as page". They follow the page's Period until a preset is picked, and a pick is a pin: the Card keeps it when the page's Period changes, even if the two were equal, until it is set back to "Same as page". A pinned Card is read wholly over its Card Period (its Intervals, its partial ends, its Drill-downs and, for Profit and loss, its Comparison period) and names its preset in its header, set apart with the accent. The user wanted to read, say, categories over a year while the page reads the last 90 days, as the reference dashboard's per-card dropdowns allow, without losing ADR-0016's one stretch by default.

## Considered Options

- **Decline, keeping one Period (ADR-0016).** Rejected: the user wanted two stretches side by side without leaving the page.
- **A selector on every Card.** Rejected: the Key figures, the most recent Transactions and the Account balances are "today" or headline figures that the page's Period already defines, and the spending insight always judges the last complete month, so a selector there would mean something new.
- **Independent Cards, each with its own default and no page Period to follow.** Rejected: the page would no longer read as one stretch by default.
- **Presets plus a typed start date on each Card.** Rejected: too large for a card header; an unusual stretch is still reachable through the page's Period.

## Consequences

- Pins live in the URL only, one parameter per Card holding a preset name, beside `?period=` or `?from=`. A bare visit to Analytics always reads as one stretch, and the way back from a Drill-down keeps every pin.
- A pinned Card no longer shares the page's loaded figures (Key figures' trend and comparison), so it is loaded on its own.
