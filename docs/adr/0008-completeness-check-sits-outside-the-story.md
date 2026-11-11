---
status: accepted
---

# The Completeness check sits above the Story, not in it

The home page is the first Dashboard's Story (ADR-0007), and the Completeness check has to appear there. We put it as a fixed notice above the Hero, only on the Dashboard that `/` opens, rather than as a new Widget source. A Widget is a saved query the user chooses, orders and copies; the Completeness check is a standing status of the data that the user should not be able to remove, move to the bottom or duplicate. The Story itself stays as ADR-0007 describes: one Hero, then one chapter per Widget.

## Considered Options

- **A Widget source (`import_health`).** Rejected: it bends the Widget concept (no filters, axes or measure) and could be deleted or buried.
- **The same notice on every Dashboard.** Rejected: repeated noise; the home Dashboard is where the user lands.
- **Only on `/accounts`.** Rejected: the user would have to go looking, which is the failure the check exists to prevent.
