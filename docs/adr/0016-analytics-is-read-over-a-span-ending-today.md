---
status: accepted (supersedes ADR-0015's Period view and Period window; its "only control" partly superseded by ADR-0018: some Cards can be pinned to their own Period)
---

# Analytics is read over a Span ending today

> **Renamed since:** the Span is now called the **Period**, its months, quarters and years its **Intervals**, the Span preset the **Period preset** and the Comparison span the **Comparison period** (GLOSSARY). Its URL is `?period=<preset>`; former `?span=` links redirect. The text below keeps the words used when it was decided.

Analytics' only control is now a Span: a start date, chosen from ten Span presets (Rolling 30, 60 and 90 days, Quarter to date, Year to date, Rolling 12 months, This year and last 1 to 4) or typed in, and always today as its end. The grain follows from the Span's length (months up to 13 months, quarters up to 24, years beyond), so there is no grain to choose and no combination that reads badly. The user wanted to see stretches the fixed "last 12 months / 8 quarters / 6 years" windows didn't cover, but every figure on the page is still a "how is it going up to now" figure: ending every Span today keeps Net worth, the Account balances and the "to date" period meaningful, and keeps one control on the page.

## Considered Options

- **Step the fixed windows back in time (previous / next).** Rejected: the user asked for stretches of their own choosing, not past copies of the same three windows.
- **A free from–to date range, as in the reference dashboard.** Rejected: a Span ending in the past would make "Net worth today", the Account balances and the to-date period contradict the rest of the page, and each section would need its own meaning for an arbitrary stretch.
- **A Span plus a separate grain switch.** Rejected: two controls, and pairs such as "Rolling 30 days by Year" that answer nothing.
- **Day and week grains for short Spans.** Rejected: an engine change for Spans so short their per-period figures say little. Last 7 days, This week and Month to date were left out of the presets for the same reason; a typed start date may still be that close.

## Consequences

- A Span's first period is cut at its start date, so its periods always add up to its totals and match their Drill-downs. Both partial ends are set apart, and averages use complete periods only, showing none when there are none.
- The spending insight no longer follows the control: it always judges the last complete month.
- The Key figures' Income, Expense and Profit cover the whole Span; Net worth stays today. Account balances and the most recent Transactions do not follow the Span.
- The URL carries `?span=<preset>` (a preset Span moves forward each day) or `?from=YYYY-MM-DD` (fixed). Former `?period=` links redirect: month to Rolling 12 months, quarter to This year and last 1, year to This year and last 4.
