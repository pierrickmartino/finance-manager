import { describe, expect, test } from 'vitest';
import { greetingFor } from './greeting';

const at = (hour: number, minute = 0) => new Date(2026, 10, 11, hour, minute);

describe('greetingFor', () => {
  test('says good morning from midnight until noon', () => {
    expect(greetingFor(at(0))).toBe('Good morning');
    expect(greetingFor(at(11, 59))).toBe('Good morning');
  });

  test('says good afternoon from noon until six', () => {
    expect(greetingFor(at(12))).toBe('Good afternoon');
    expect(greetingFor(at(17, 59))).toBe('Good afternoon');
  });

  test('says good evening from six', () => {
    expect(greetingFor(at(18))).toBe('Good evening');
    expect(greetingFor(at(23, 59))).toBe('Good evening');
  });
});
