import { describe, expect, test, vi } from 'vitest';
import { createSharedSubscription } from './shared-subscription';

/** A source that counts its listeners and can fire a change at them. */
function fakeSource() {
  let notify: (() => void) | null = null;
  const source = {
    starts: 0,
    stops: 0,
    listen: (onChange: () => void) => {
      source.starts += 1;
      notify = onChange;
      return () => {
        source.stops += 1;
        notify = null;
      };
    },
    fire: () => notify?.(),
  };
  return source;
}

describe('createSharedSubscription', () => {
  test('listens to its source once, however many subscribe', () => {
    const source = fakeSource();
    const shared = createSharedSubscription(source.listen);

    shared.subscribe(() => undefined);
    shared.subscribe(() => undefined);

    expect(source.starts).toBe(1);
  });

  test('tells every subscriber of a change in the same call', () => {
    const source = fakeSource();
    const shared = createSharedSubscription(source.listen);
    const calls: string[] = [];
    shared.subscribe(() => calls.push('row'));
    shared.subscribe(() => calls.push('preview'));

    source.fire();

    expect(calls).toEqual(['row', 'preview']);
  });

  test('stops listening once the last subscriber leaves, and starts again for the next', () => {
    const source = fakeSource();
    const shared = createSharedSubscription(source.listen);
    const leaveOne = shared.subscribe(() => undefined);
    const leaveOther = shared.subscribe(() => undefined);

    leaveOne();
    expect(source.stops).toBe(0);
    leaveOther();
    leaveOther();
    expect(source.stops).toBe(1);

    const onChange = vi.fn();
    shared.subscribe(onChange);
    source.fire();
    expect(source.starts).toBe(2);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
