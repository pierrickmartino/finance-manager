---
status: accepted (its Period view and Period window superseded by ADR-0016: Analytics is read over a Span ending today)
---

# Analytics is a fixed page read through one Period view

Analytics replaces the user-built Dashboard as the landing page. It is one hand-built page with a set list of figures in a set layout and no Edit mode, and its only control is the Period view (Year, Quarter or Month). Every per-period figure reads the same Period window: the last 6 years, 8 quarters or 12 months, always ending with the current period, shown "to date". In practice the user wanted one page that answers the same questions at three grains, not a board to arrange. A fixed page lets each figure be shaped for its job, such as tables with Total and Average columns or a capped stacked bar, instead of being limited to what a generic Widget can express.

## Considered Options

- **Keep the Dashboard (ADR-0010) and add a page-level period switch that overrides every Widget's date range.** Rejected: each Widget would carry a saved date range that the page then ignores, and Edit mode would keep existing for a board the user doesn't want to arrange.
- **One Dashboard per grain.** Rejected: three boards to keep in sync, and switching grain would mean leaving the page.

## Consequences

- The Dashboard stays reachable for now. Once it is removed, Widgets, Standalone Widgets, Dashboards, the Dashboard Story and Edit mode go with it (ADR-0007, ADR-0009 and ADR-0010 become superseded), but not the Cards (see below).
- Every figure in the Period window includes the current partial period, set apart visibly. Averages and the spending insight use complete periods only, so a partial period never reads as a weak one.
- The Completeness check notice moves with the landing page and sits above Analytics (ADR-0008). Later removed: its problems are Attention items in the notifications bell (ADR-0019), and a notice on the page only repeated them.
- Analytics draws its sections with the Dashboard's own Cards (its overview row and its Widget cards), so removing the Dashboard later must keep the Cards for Analytics.
