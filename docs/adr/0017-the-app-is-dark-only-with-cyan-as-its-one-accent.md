---
status: accepted (reverses the "light only" rule of docs/design-system.md)
---

# The app is dark only, with cyan as its one accent

The app takes the reference dashboard's look: a deep navy page lit by a faint fixed blue/violet glow, glass containers, and neon hues. It is dark only, whatever the system theme, so every token keeps a single value and a change to the look is still a one-place edit. Cyan replaces amber as the one accent: it alone marks what is selected or focused and the point of a chart, and the One-accent rule stands. The navy ramp that drew the Dashboard's and Analytics' cards becomes a sky blue → blue → violet ramp, still atmosphere that never marks a state, and kept clearly apart from the cyan accent so a ramp mark never passes for one.

## Considered Options

- **Keep "Midnight", light only, and take only layout and chart ideas from the reference.** Rejected: the user wants the reference's look, not just its parts.
- **Light and dark, following the system or a toggle.** Rejected: every token, the heatmap ramp, the Net worth bands and every contrast check would exist twice, and so would every future token.
- **A dark Analytics inside a light app.** Rejected: leaving Analytics for a light Transactions list would jar, and the token set would split in two.
- **Neon as a second accent beside amber.** Rejected: "this is selected" would blur into "this is a chart colour". Amber is retired as an accent, though it may still appear as a categorical series.

## Consequences

- Categorical series keep a separate palette, checked by colour-blindness simulation. Cyan, teal, blue and violet are hard to tell apart for some deficiencies, so warm hues fill out the order.
- The heatmap stays a single-hue stepped ramp with no gradient, retuned so its text passes AA. Gradients belong to fills only, never to text or thin lines.
- `positive` moves to a yellower green so it never reads as teal.
- The paper panel and the hero band go away: the page is the navy, the 48px bar sits on it, and the `hero-*` tokens are renamed for the jobs they now do.
- Glass (a translucent fill, a luminous border) is for containers only: cards, tiles, popovers, the dock and notices. Inputs, rows, badges and buttons stay solid. Only the Dashboard's and Analytics' tiles add a soft inner glow from the ramp, so they still stand out. Under reduced transparency, or without `backdrop-filter`, containers turn opaque and the page glow is dropped.
- The primary button inverts to a near-white fill with navy text. The cyan accent button stays reserved for the Dashboard Story's own main action, and the Bulk edit dock becomes glass ringed in cyan.
- The change ships in three steps: the dark tokens, accent and AA re-checks first (#189), then the neon ramp and categorical palette (#191), then glass and the page glow (#190).
