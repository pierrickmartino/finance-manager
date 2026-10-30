import { expect, test } from 'vitest';
import { isValidIban } from '../src/index.ts';

test('accepts IBANs with a correct mod-97 check, with or without spaces', () => {
  expect(isValidIban('CH9300762011623852957')).toBe(true);
  expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
});

test('rejects IBANs with a wrong check digit or shape', () => {
  expect(isValidIban('CH9400762011623852957')).toBe(false);
  expect(isValidIban('CH93')).toBe(false);
});
