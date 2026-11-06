/**
 * The Dashboard Story's colours, as values for chart props (Recharts needs colours, not
 * classes). They mirror the design tokens in globals.css: paper, ink, muted, rule, accent.
 */
export const STORY = {
  paper: '#fafafa',
  ink: '#18181b',
  muted: '#71717a',
  rule: '#e4e4e7',
  accent: '#ff4f1f',
} as const;

/** Series tones, in order: ink first, then the accent, then greys. */
export const STORY_TONES = [STORY.ink, STORY.accent, '#a1a1aa', '#d4d4d8', '#52525b'] as const;
