/** Starts listening to a source of changes; returns how to stop. */
export type ChangeSource = (onChange: () => void) => () => void;

export interface SharedSubscription {
  /** A `useSyncExternalStore` subscribe: calls `onChange` after each change; returns how to stop. */
  subscribe(onChange: () => void): () => void;
}

/**
 * One listener on `source`, shared by every subscriber, for the source (a media query, say)
 * whose readers must all switch together. Each change reaches every subscriber within the same
 * call, so React re-renders them in one pass; a listener of their own each would let React
 * render between them, and for a moment some would read the new value and some the old.
 * Listens only while someone subscribes.
 */
export function createSharedSubscription(source: ChangeSource): SharedSubscription {
  // Replaced, never edited: a change walks the list as it was when the change happened.
  let listeners: readonly (() => void)[] = [];
  let stop: (() => void) | null = null;

  const notifyAll = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    subscribe(onChange) {
      const listener = (): void => onChange();
      listeners = [...listeners, listener];
      stop ??= source(notifyAll);
      return () => {
        listeners = listeners.filter((other) => other !== listener);
        if (listeners.length === 0 && stop) {
          stop();
          stop = null;
        }
      };
    },
  };
}
