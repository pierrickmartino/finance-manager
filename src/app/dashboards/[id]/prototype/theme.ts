/**
 * PROTOTYPE (throwaway): the application's own light surface, shared by every variant so they
 * sit on the same background as the rest of the app (app-shell: bg-zinc-50, white cards with
 * zinc-200 borders, emerald accent). Light only: no variant reacts to the system dark mode.
 */
export const APP = {
  /** zinc-50, the app-shell page background. */
  bg: '#fafafa',
  /** Cards and panels. */
  surface: '#ffffff',
  /** zinc-200 */
  border: '#e4e4e7',
  /** zinc-100, for tracks and empty states. */
  track: '#f4f4f5',
  /** zinc-900 */
  ink: '#18181b',
  /** zinc-500 */
  muted: '#71717a',
  /** emerald-600, the app's accent (sidebar, logo). */
  accent: '#059669',
} as const;

/** The root of every variant: the app background, forced light. */
export const VARIANT_ROOT_STYLE = {
  background: APP.bg,
  color: APP.ink,
  colorScheme: 'light',
} as const;
