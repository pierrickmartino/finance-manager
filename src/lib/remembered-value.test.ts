import { describe, expect, test, vi } from 'vitest';
import { createRememberedValue } from './remembered-value';

describe('createRememberedValue', () => {
  test('reads its initial value until one is remembered', () => {
    const list = createRememberedValue('/transactions');

    expect(list.get()).toBe('/transactions');
  });

  test('reads the value last remembered', () => {
    const list = createRememberedValue('/transactions');

    list.remember('/transactions?q=coffee');
    list.remember('/transactions?q=rent&page=2');

    expect(list.get()).toBe('/transactions?q=rent&page=2');
  });

  test('tells each subscriber when the value changes', () => {
    const list = createRememberedValue('/transactions');
    const first = vi.fn();
    const second = vi.fn();
    list.subscribe(first);
    list.subscribe(second);

    list.remember('/transactions?q=coffee');

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  test('stays quiet when the same value is remembered again', () => {
    const list = createRememberedValue('/transactions');
    const onChange = vi.fn();
    list.subscribe(onChange);

    list.remember('/transactions');

    expect(onChange).not.toHaveBeenCalled();
  });

  test('stops telling a subscriber once it unsubscribes', () => {
    const list = createRememberedValue('/transactions');
    const onChange = vi.fn();
    const unsubscribe = list.subscribe(onChange);

    unsubscribe();
    unsubscribe();
    list.remember('/transactions?q=coffee');

    expect(onChange).not.toHaveBeenCalled();
  });

  test('tells every subscriber even when one unsubscribes while being told', () => {
    const list = createRememberedValue('/transactions');
    const later = vi.fn();
    const unsubscribeFirst = list.subscribe(() => unsubscribeFirst());
    list.subscribe(later);

    list.remember('/transactions?q=coffee');

    expect(later).toHaveBeenCalledTimes(1);
  });

  test('two values are remembered apart', () => {
    const one = createRememberedValue('/a');
    const other = createRememberedValue('/b');

    one.remember('/a?x=1');

    expect(other.get()).toBe('/b');
  });
});
