import { z } from 'zod';

/** The Base currency (ADR-0002). Its rate is always 1 and is never stored. */
export const BASE_CURRENCY = 'CHF';
/** ECB reference rates are quoted per EUR. */
export const ECB_QUOTE_CURRENCY = 'EUR';
/** The name of the ECB source in `fx_fetch_status`. */
export const ECB_SOURCE_NAME = 'ecb';

export const isoDate = z.iso.date({ error: 'Dates must be ISO dates (YYYY-MM-DD)' });
export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { error: 'Currency must be a three-letter ISO code' });
