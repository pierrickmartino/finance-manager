/**
 * Tailwind's screen breakpoints that client code reads too (a `matchMedia` gate, an E2E
 * viewport). The values are Tailwind's defaults, which `globals.css` doesn't override: change
 * them together with any `--breakpoint-*` added there.
 */
const BREAKPOINT_REM = { lg: 64, xl: 80 } as const;

export type Breakpoint = keyof typeof BREAKPOINT_REM;

/** The browser's default root font size, which Tailwind's rem breakpoints resolve against. */
const ROOT_FONT_PX = 16;

/** The media query matching from `breakpoint` up, as Tailwind's `lg:` / `xl:` variants do. */
export function minWidthQuery(breakpoint: Breakpoint): string {
  return `(min-width: ${BREAKPOINT_REM[breakpoint]}rem)`;
}

/** `breakpoint` in CSS pixels at the default root font size, e.g. for a test viewport. */
export function breakpointPx(breakpoint: Breakpoint): number {
  return BREAKPOINT_REM[breakpoint] * ROOT_FONT_PX;
}
