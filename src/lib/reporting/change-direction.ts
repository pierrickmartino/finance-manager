/** How a change says its direction: its arrow, sign, tone and the word that says it. */
export interface ChangeDirectionMarks {
  arrow: string;
  sign: string;
  /** Up in `positive`, down in `negative`, for a figure where more is better. */
  tone: string;
  word: 'up' | 'down' | 'unchanged';
}

/** A change's direction by its sign: up, down, or unchanged at zero. */
export function directionOf(change: number): ChangeDirectionMarks {
  if (change > 0) return { arrow: '↗', sign: '+', tone: 'text-positive', word: 'up' };
  if (change < 0) return { arrow: '↘', sign: '−', tone: 'text-negative', word: 'down' };
  return { arrow: '→', sign: '', tone: 'text-muted', word: 'unchanged' };
}
