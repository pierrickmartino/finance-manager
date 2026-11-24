---
status: accepted (partly supersedes ADR-0016: a start date is no longer typed in)
---

# Analytics Periods are chosen by preset only

Analytics' Period control is now one dropdown of the Period presets. The Custom choice, the From date field and the Show button are gone: picking a preset reads Analytics over it at once, as a Card's Period already did (ADR-0018). The user found the presets cover what they read, and the typed date was a second control that the Card Periods could not follow anyway, since they only take presets.

## Considered Options

- **Keep the typed start date.** Rejected: unused, and a page Period no Card could pin to.
- **Keep reading `?from=` links as custom Periods.** Rejected: the control would have to show a Period it can no longer choose.

## Consequences

- The URL carries only `?period=<preset>`. A former `?from=YYYY-MM-DD` link redirects to the default Period (Last 12 months), keeping any Card pins; a Drill-down's former `originFrom` leads back there too.
- Without JavaScript the control can no longer be submitted, as with the Card Periods' dropdowns.
- A custom Period stays in the model for internal readings (the spending insight reads its months over one), never chosen on the page.
