import { z } from 'zod';

export const ACCOUNT_KINDS = ['current', 'savings', '3a', 'loan'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/** The Import formats an Account can be bound to (ADR-0003). */
export const IMPORT_FORMATS = ['camt053', 'ubs_csv', 'ofx'] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  current: 'Current',
  savings: 'Savings',
  '3a': '3a',
  loan: 'Loan',
};

export const IMPORT_FORMAT_LABELS: Record<ImportFormat, string> = {
  camt053: 'BCGE CAMT.053',
  ubs_csv: 'UBS CSV',
  ofx: 'Crédit Agricole OFX',
};

const MAX_NAME_LENGTH = 100;
const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const IBAN_CHECKSUM_MODULUS = 97n;
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

/** IBANs are stored without spaces, in upper case. */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

/** ISO 13616: the rearranged IBAN, read as a number with A=10 … Z=35, is 1 modulo 97. */
export function isValidIban(iban: string): boolean {
  if (!IBAN_PATTERN.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = [...rearranged].map((char) => parseInt(char, 36).toString()).join('');
  return BigInt(digits) % IBAN_CHECKSUM_MODULUS === 1n;
}

/** Optional text field: absent, null or blank all mean "none" (null). */
function blankToNull<S extends z.ZodType>(schema: S) {
  return z.preprocess(
    (value) =>
      value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value,
    schema.nullable(),
  );
}

export const accountInput = z.object({
  bankId: z.uuid({ error: 'Bank is required' }),
  name: z
    .string()
    .trim()
    .min(1, 'Account name is required')
    .max(MAX_NAME_LENGTH, `Account name must be at most ${MAX_NAME_LENGTH} characters`),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((code) => CURRENCIES.has(code), 'Unknown Currency'),
  iban: blankToNull(z.string().transform(normalizeIban).refine(isValidIban, 'IBAN is not valid')),
  kind: z.enum(ACCOUNT_KINDS, { error: 'Unknown Account kind' }),
  importFormat: blankToNull(z.enum(IMPORT_FORMATS, { error: 'Unknown Import format' })),
  openingBalanceMinor: z.int({
    error: 'Opening balance must be a whole number of minor units',
  }),
  openingDate: blankToNull(z.iso.date({ error: 'Opening date must be a date (YYYY-MM-DD)' })),
});

/**
 * What creating or editing an Account takes. Amounts are integer minor units (ADR-0002).
 * Blank or missing optional fields mean "none".
 */
export interface AccountInput {
  bankId: string;
  name: string;
  currency: string;
  iban?: string | null;
  kind: AccountKind;
  importFormat?: ImportFormat | '' | null;
  openingBalanceMinor: number;
  openingDate?: string | null;
}

export type ValidAccountInput = z.output<typeof accountInput>;
