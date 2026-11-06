/**
 * The Dashboard Story's colours: ink and one vermilion accent on the app's own background
 * (zinc-50). Light only, by choice: the Story keeps these colours whatever the system theme.
 */
export const STORY = {
  /** zinc-50, the app-shell background. */
  paper: '#fafafa',
  /** zinc-900 */
  ink: '#18181b',
  /** zinc-500 */
  muted: '#71717a',
  /** zinc-200 */
  rule: '#e4e4e7',
  accent: '#ff4f1f',
} as const;

/** Series tones, in order: ink first, then the accent, then greys. */
export const STORY_TONES = [STORY.ink, STORY.accent, '#a1a1aa', '#d4d4d8', '#52525b'] as const;
