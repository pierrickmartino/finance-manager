---
status: accepted (its "one column" view superseded by ADR-0009; "Widgets have no size, a Dashboard is an ordered list" superseded by ADR-0010)
---

# A Dashboard is one column of chapters, edited in place

The Dashboard Story reads a Dashboard top to bottom, one chapter per Widget, and ignores where a Widget sat on the grid or how big it was. Edit mode still showed the former drag-and-drop grid, so what the user arranged (positions and sizes on 12 columns) was not what they read. We decided that a Dashboard is an ordered list: Edit mode is the Story itself, drawn still, with each chapter's actions above it and a place to add a chapter between every two. The order is kept in each Widget's existing `layout`: the nth Widget has `y` n and `x` 0. Its `w` and `h` stay stored but nothing reads them. This supersedes story 98 of the v1 spec (move and resize Widgets on a grid).

## Considered Options

- **Keep the grid and restyle it.** Rejected: it would still ask for sizes and side-by-side placement that the Story never shows.
- **A new `position` column.** Rejected: `layout.y` already orders the Widgets, so a migration would add nothing.

## Consequences

- A Widget is moved with its up and down arrows (keyboard and phone too), or dragged by its handle on wide screens. Every move saves the whole order at once, without History (spec 117 still holds).
- A new Widget, the Account balances or a copy of an existing Widget can be inserted at any place; a duplicate goes right after its original. Inserting shifts the Widgets after it.
- A Dashboard still holding a grid layout is read in grid order (top to bottom, left to right) and is rewritten to Story order on its first change. (Removed with ADR-0010: a one-time migration moved every Dashboard onto the grid, three across, and no "old format" path is left.)
- The Widget editor previews a Widget as its chapter, with the raw table under a Data tab. The visualisation picker keeps its five choices and says what each becomes in the Story.
- react-grid-layout is no longer a dependency.
