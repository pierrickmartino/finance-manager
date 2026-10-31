import { createHmac } from 'node:crypto';

/**
 * Deterministic substitutes for personal data.
 *
 * Every fake is derived from HMAC(seed, value), so the same input always maps to the
 * same fake for a given seed: within a file, across files anonymised with the same seed,
 * and across reruns. Fakes keep the length and character classes of the original
 * (digits stay digits, case is kept, accented letters stay accented), which keeps
 * fixed-width fields, truncations and encodings realistic.
 */

const CONSONANTS = 'bcdfghjklmnprstvz';
const VOWELS = 'aeiou';
/** Accented letters that exist in both UTF-8 and Windows-1252, in both cases. */
const ACCENTED = 'éèàüöçâêôî';

/** Bank-identifying BBAN prefix kept as is, per country (not personal data). */
const IBAN_BANK_CODE_LENGTH: Readonly<Record<string, number>> = { CH: 5, LI: 5, FR: 5, DE: 8, AT: 5 };
const DEFAULT_BANK_CODE_LENGTH = 4;
const IBAN_CANDIDATE = /(?<![\p{L}\p{N}])[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}(?![\p{L}\p{N}])/gu;
const WORD = /[\p{L}\p{N}]+/gu;

/** Labels inside free text (e.g. UBS `Description3`) that structure the field; kept verbatim. */
export const TEXT_LABELS: readonly string[] = [
  'Motif du paiement',
  'No de compte',
  'No de transaction',
  'No de carte',
  'Référence QR',
  'Référence',
  'Coûts',
  'Communication',
  'Montant',
  'Taux de change',
  'IBAN',
];

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const LABEL = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${[...TEXT_LABELS]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')})(?=\\s*:)`,
  'gu',
);

export function isValidIban(candidate: string): boolean {
  const iban = candidate.replace(/ /g, '');
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  return ibanRemainder(iban.slice(4) + iban.slice(0, 4)) === 1;
}

function ibanRemainder(rearranged: string): number {
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  return remainder;
}

function withCheckDigits(country: string, bban: string): string {
  const check = 98 - ibanRemainder(`${bban}${country}00`);
  return `${country}${String(check).padStart(2, '0')}${bban}`;
}

export class Faker {
  readonly #seed: string;

  constructor(seed: string) {
    if (seed === '') throw new Error('A non-empty seed is required');
    this.#seed = seed;
  }

  /** A stream of pseudo-random bytes derived from the seed and a key. */
  #bytes(key: string, length: number): Uint8Array {
    const chunks: Buffer[] = [];
    for (let counter = 0; chunks.length * 32 < length; counter += 1) {
      chunks.push(createHmac('sha256', this.#seed).update(`${counter}\u0000${key}`).digest());
    }
    return Buffer.concat(chunks).subarray(0, length);
  }

  /** Replaces a word or reference, keeping length, case, digits and accents. */
  token(original: string): string {
    const chars = Array.from(original);
    const bytes = this.#bytes(`token\u0000${original.toLowerCase()}`, chars.length + 1);
    const startWithVowel = (bytes[chars.length]! & 1) === 1;
    return chars
      .map((ch, i) => {
        const b = bytes[i]!;
        let fake: string;
        if (/\p{N}/u.test(ch)) fake = String(b % 10);
        else if (/[a-z]/i.test(ch)) {
          const vowel = (i % 2 === 0) === startWithVowel;
          fake = vowel ? VOWELS[b % VOWELS.length]! : CONSONANTS[b % CONSONANTS.length]!;
        } else if (/\p{L}/u.test(ch)) fake = ACCENTED[b % ACCENTED.length]!;
        else return ch;
        return ch !== ch.toLowerCase() ? fake.toUpperCase() : fake;
      })
      .join('');
  }

  /** Replaces an IBAN with another valid IBAN of the same country, bank and layout. */
  iban(original: string): string {
    const compact = original.replace(/ /g, '').toUpperCase();
    const country = compact.slice(0, 2);
    const bban = compact.slice(4);
    const keep = Math.min(IBAN_BANK_CODE_LENGTH[country] ?? DEFAULT_BANK_CODE_LENGTH, bban.length - 1);
    const bytes = this.#bytes(`iban\u0000${compact}`, bban.length);
    const fakeBban =
      bban.slice(0, keep) +
      Array.from(bban.slice(keep), (ch, i) => {
        const b = bytes[i]!;
        return /\d/.test(ch) ? String(b % 10) : String.fromCharCode(65 + (b % 26));
      }).join('');
    const fake = withCheckDigits(country, fakeBban);
    return reinsertSpaces(original, fake);
  }

  /**
   * Replaces free text (names, addresses, payment text): IBANs become fake IBANs,
   * known labels stay, every other word or number becomes a fake token.
   */
  text(original: string): string {
    const kept: Array<[number, number, string]> = [];
    for (const m of original.matchAll(IBAN_CANDIDATE)) {
      if (isValidIban(m[0])) kept.push([m.index, m.index + m[0].length, this.iban(m[0])]);
    }
    for (const m of original.matchAll(LABEL)) {
      if (!kept.some(([s, e]) => m.index < e && m.index + m[0].length > s)) {
        kept.push([m.index, m.index + m[0].length, m[0]]);
      }
    }
    kept.sort((a, b) => a[0] - b[0]);

    let out = '';
    let cursor = 0;
    for (const [start, end, replacement] of kept) {
      out += this.#words(original.slice(cursor, start)) + replacement;
      cursor = end;
    }
    return out + this.#words(original.slice(cursor));
  }

  #words(text: string): string {
    return text.replace(WORD, (word) => this.token(word));
  }
}

function reinsertSpaces(layout: string, compact: string): string {
  let out = '';
  let j = 0;
  for (const ch of layout) {
    if (ch === ' ') out += ' ';
    else out += compact[j++] ?? '';
  }
  return out + compact.slice(j);
}
