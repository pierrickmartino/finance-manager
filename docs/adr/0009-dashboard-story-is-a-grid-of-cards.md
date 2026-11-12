---
status: accepted (its "cards placed in Widget order" superseded by ADR-0010)
---

# The Dashboard Story is a grid of cards, in Widget order

ADR-0007 made a Dashboard one column of chapters under a Hero. We redesigned the view after a bento-style finance dashboard (prototyped as three variants behind `?variant=`, commit `e6dd959`; the bento one won). A Dashboard now reads as a grid: an overview row, then one card per Widget. What ADR-0007 decided about order still holds: a Dashboard is an ordered list of Widgets, kept in `layout.y`, and the grid places the cards in that order, left to right and top to bottom. Only "one column" is superseded, and only in the view.

The overview row is not made of Widgets, as the Completeness check is not (ADR-0008): the headline amount (net worth from an Account balances Widget, else the first Widget's total, as the Hero chose it), an insight sentence comparing the latest full month's spending with the months before (from an income-vs-expense Widget, when there is one), and the most recent Transactions.

## Considered Options

- **Fixed slots filled by what each Widget holds** (as the prototype did). Rejected: the order chosen in Edit mode would stop meaning anything for the Widgets that got a slot, which is the mismatch ADR-0007 removed.
- **The grid only on the home Dashboard.** Rejected: two looks for one concept.

## Consequences

- Each Widget's card picks its mark from its chapter kind: dots in and out for income vs. expense, bars per period for a trend or other bars (the latest full period hatched), a ticked list for a ranking or a share, one number for a number. The sentences are still the chapter's (`chapterStory`).
- Edit mode stays one still column of chapters, with its move, insert and edit actions; its order is the grid's reading order.
- The cards draw in the hero's teal; the design system now allows that teal in the Dashboard's cards (docs/design-system.md). Since the "Midnight" restyle the hero is navy, and the cards follow it.
