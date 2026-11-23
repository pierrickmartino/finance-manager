import type { ReactNode } from 'react';
import { TITLE_ROW_CLASS } from './surface';

interface TitleRowProps {
  /** Drawn beside the title; without one, the title stands alone. */
  aside?: ReactNode;
  /** The title itself: a heading. */
  children: ReactNode;
}

/**
 * A title and what sits beside it (`TITLE_ROW_CLASS`), such as an Analytics Card's Period mark
 * and dropdown. With nothing beside it, just the title, so a plain card's markup is unchanged.
 */
export function TitleRow({ aside, children }: TitleRowProps) {
  if (!aside) return children;
  return (
    <div className={TITLE_ROW_CLASS}>
      {children}
      {aside}
    </div>
  );
}
