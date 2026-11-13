---
status: accepted
---

# Navigation motion via View Transitions; reduced motion disables it

Moving between related pages (a Dashboard's Story and its Edit mode, the Transactions list and a Transaction's page) animates with the browser's View Transitions, driven by React's `<ViewTransition>`. App Router navigations are React Transitions, so a page only has to name the elements that move; the browser draws the morph and the crossfade. Every view transition takes the two navigation motion tokens in `src/app/globals.css`, `--motion-duration-nav` (250ms) and `--motion-ease-nav` (`cubic-bezier(0.16, 1, 0.3, 1)`, the ease-out the Dashboard Story's charts already use), set on all `::view-transition-group/old/new(*)` pseudo-elements. Under `prefers-reduced-motion: reduce` one global rule sets `animation: none !important` on those pseudo-elements, so the swap is instant and no element's own transition can bring motion back.

The spec asked to turn on `experimental.viewTransition` in `next.config.ts`. Next.js 16.4.3 has no such key: it fails the typecheck, and view transitions run in the App Router with no configuration. Nothing is added to the config.

## Considered Options

- **Animate pages with the motion library**, as the Story's chapters do. Rejected: its shared-element animations need the old and new page mounted together, which a route navigation doesn't do, and every page would need its own exit and enter code.
- **Shorten the animations under reduced motion** (`animation-duration: 0s`), as Next's guide does. Rejected: `animation: none` is simpler to check, since no animation exists at all, and leaves nothing to tune.
- **A reduced-motion rule per animated element.** Rejected: a new element could forget it. One rule over `(*)` covers every name, present and future.

## Consequences

- An element given its own view-transition animation inherits the tokens unless it overrides them, and is still silenced by the reduced-motion rule.
- The E2E specs check motion with `viewTransitionAnimationsDuring` (`e2e/support/view-transitions.ts`), which lists the view-transition animations that ran during a step. Under reduced motion the browser still creates the pseudo-elements briefly, so specs assert on animations, not on the pseudo-elements.
- Browsers without View Transitions navigate as before, with no animation.
