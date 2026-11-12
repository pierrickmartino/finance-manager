---
status: accepted
---

# A Dashboard is a free grid of sized cards

ADR-0007 made a Dashboard an ordered list of Widgets with no size, because the one-column Story never showed a size or a place. ADR-0009 then turned the view into a grid of cards, still placed in Widget order. Now that the view is a grid, a card's size and place are visible: a single number takes as much room as a twelve-month trend, and related Widgets can't be grouped side by side. Sizes and places are worth arranging again, so we decided that a Dashboard is a free grid: each Widget's card has its own place and size on a board of 12 columns and fixed-height rows, and Edit mode is that board, edited in place. This supersedes ADR-0007's "Widgets have no size / a Dashboard is an ordered list" and ADR-0009's "cards placed in Widget order", and resolves story 98 of the v1 spec (move and resize Widgets on a grid).

Each Widget's existing `layout` (`x`, `y`, `w`, `h`) is read literally as its column, row, width and height in cells. `y` no longer means an index in a list. Reading order (for narrow screens and screen readers) is derived: by `y`, then `x`. The overview row stays a fixed band above the board (ADR-0009), and the Completeness notice above the Story (ADR-0008).

## Considered Options

- **Ordered flow with sizes** (cards keep a list order and wrap, each with a width). Rejected: it can't keep a gap or put a card under another on purpose, and resizing one card reflows every card after it.
- **Separate layouts per screen size.** Rejected: one layout per Dashboard, read as one column on narrow screens, is enough and can't drift apart.

## Consequences

- Board geometry is one pure module (`src/lib/reporting/board.ts`) used by both the server and the editor: bounds and minimums, overlaps, the first free spot, push-down, one-cell moves and resizes, growing to a minimum, reading order.
- Each chapter kind has a default and a minimum size (a Number small, a trend wide), replacing the single default Widget size. The server refuses a layout that leaves the 12 columns, goes under a minimum, overlaps or misses a Widget.
- A card dropped or resized onto another pushes it, and anything under it, down. The board never compacts upward, so gaps are kept. Removing a Widget leaves its space empty.
- A new Widget goes in the first free spot at the bottom of the board; a duplicate next to or below its original.
- Layout changes are saved at once and stay out of History (spec 117 still holds).
- react-grid-layout comes back as a dependency for dragging and resizing in Edit mode only; the Dashboard Story draws the board with CSS grid.
- Existing Dashboards are migrated once from Story order to three cards across, in their current order.
