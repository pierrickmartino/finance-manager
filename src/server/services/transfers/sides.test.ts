import { describe, expect, it } from 'vitest';
import { parseSideOptionValue, sideOptionValue, splitLineSide, transactionSide } from './sides';

const ID = '00000000-0000-4000-8000-000000000001';

describe('reading a link option picked in the Transfer picker', () => {
  it('reads back the side a picker option names', () => {
    expect(parseSideOptionValue(sideOptionValue(splitLineSide(ID)))).toEqual(splitLineSide(ID));
    expect(parseSideOptionValue(sideOptionValue(transactionSide(ID)))).toEqual(transactionSide(ID));
  });

  it('refuses a side of an unknown kind', () => {
    expect(() => parseSideOptionValue(`payment:${ID}`)).toThrow(
      expect.objectContaining({
        code: 'validation',
        message: 'A side is a Transaction or a Split line',
      }),
    );
  });

  it.each(['', 'transaction', 'transaction:', `:${ID}`, `transaction:${ID}:extra`])(
    'asks for the other side when the value %j names none',
    (value) => {
      expect(() => parseSideOptionValue(value)).toThrow('Choose the other side of the Transfer');
    },
  );
});
