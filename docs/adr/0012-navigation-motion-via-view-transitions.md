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
- The E2E specs check motion with `viewTransitionAnimationsDuring` (`e2e/support/view-transitions.ts`), which lists the view-transition animations that ran during a step, and `viewTransitionMotionDuring`, the ones that last longer than 0ms: React adds instant housekeeping animations to every view transition it starts, even under reduced motion. Under reduced motion the browser still creates the pseudo-elements briefly, so specs assert on animations, not on the pseudo-elements.
- Browsers without View Transitions navigate as before, with no animation.
- The browser's back and forward buttons never animate: React renders a history traversal synchronously, outside a Transition. A page that should animate on the way back gives the user a link for it, as the Transaction detail's "← Transactions" returns to the list it was opened from.
- So "← Transactions" no longer always goes to the plain list: it returns to the list URL the user last looked at (its search, page and selection), remembered in memory for the session's client-side navigations (`src/app/transactions/back-to-list.tsx`). A full page load starts again from `/transactions`.
- Moving between a Dashboard's Story and its Edit mode shows no skeleton: the Dashboard's `loading.tsx` sits above `[id]`, so the old page stays on screen until the other is ready and the board crossfades between them. The trade-off is a moment with no feedback after the click when the other page is slow. Opening another Dashboard does show the skeleton, and never crossfades: the Dashboard's view-transition names carry its id, so two Dashboards share none.
- A tap on a row or "Open & classify" before the Transactions list has hydrated opens the Transaction without the morph: until the page knows its width, neither the row nor the preview carries the Transaction's name (`isMorphing` in `src/lib/transaction-morph.ts`), so the navigation falls back to an instant swap.
