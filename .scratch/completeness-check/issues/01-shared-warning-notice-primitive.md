# 01: Shared warning-notice primitive

**Parent:** #92 · Spec: Completeness check (specs folder)

**What to build:** A prefactor so the Completeness check can reuse one warning style. The notice styling that the FX staleness notice and the Balance-snapshot mismatch notice each write inline (the `warning` text on a `warning-tint` background with a `warning-rule` border) becomes a single shared primitive among the surface primitives, as the design system asks. Both existing notices move onto it and look and behave exactly as before.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] One shared warning-notice primitive exists alongside the other surface primitives and uses only design-system tokens.
- [ ] The FX staleness notice uses it; no inline warning classes remain there.
- [ ] The Balance-snapshot mismatch notice (Accounts page and Account page) uses it; no inline warning classes remain there.
- [ ] Both notices keep their alert semantics and render identically.
- [ ] Existing unit and E2E tests stay green with no test changes beyond selectors that relied on class names, if any.
