/**
 * One value a page remembers for the rest of the session's client-side navigations, read
 * through `useSyncExternalStore`: `get` is its snapshot, `subscribe` its change feed. It lives
 * in memory only, so a full page load starts again from the initial value.
 */
export interface RememberedValue<T> {
  /** The value last remembered, or the initial one. */
  get(): T;
  /** Remembers `value`; subscribers hear of it only when it differs from the current one. */
  remember(value: T): void;
  /** Calls `onChange` after each change; returns how to stop. */
  subscribe(onChange: () => void): () => void;
}

export function createRememberedValue<T>(initial: T): RememberedValue<T> {
  let current = initial;
  // Replaced, never edited: a notification walks the list as it was when the change happened.
  let listeners: readonly (() => void)[] = [];

  return {
    get: () => current,
    remember(value) {
      if (Object.is(value, current)) return;
      current = value;
      for (const listener of listeners) listener();
    },
    subscribe(onChange) {
      const listener = (): void => onChange();
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((other) => other !== listener);
      };
    },
  };
}
