/**
 * The Dashboard Story's colours, as values for chart props (Recharts needs colours, not
 * classes). They mirror the design tokens in globals.css: paper, ink, muted, rule. The accent is
 * the amber deepened for marks and large text (3.9:1 on white, also under white text): the
 * token's own fill is too light for either.
 */
export const STORY = {
  paper: '#f7f8fa',
  ink: '#141a2b',
  muted: '#66708a',
  rule: '#e1e5ec',
  accent: '#b86f00',
} as const;

/** Series tones, in order: ink first, then the accent, then greys. */
export const STORY_TONES = [STORY.ink, STORY.accent, '#a1a9b8', '#cdd3dd', '#46506a'] as const;
