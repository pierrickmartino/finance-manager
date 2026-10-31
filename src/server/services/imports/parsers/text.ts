import { UnreadableFileError } from './types';

/** Text decoding shared by the parsers. */

/** UTF-8 text (a BOM is dropped). Throws `UnreadableFileError` on invalid bytes. */
export function decodeUtf8(content: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    throw new UnreadableFileError('it is not UTF-8 text');
  }
}

/** XML's five predefined entities. */
export const XML_ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

export interface EntityOptions {
  /** Named entities by name (without `&` and `;`). */
  named?: Readonly<Record<string, string>>;
  /**
   * Strict (XML): an unknown entity or a bare `&` is an error. Lenient (OFX SGML): they are
   * left as they are.
   */
  isStrict?: boolean;
}

const MAX_CODE_POINT = 0x10ffff;

function characterReference(ref: string, match: string): string {
  const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
  if (!Number.isFinite(code) || code > MAX_CODE_POINT) {
    throw new UnreadableFileError(`it has an invalid character reference "${match}"`);
  }
  return String.fromCodePoint(code);
}

/** Decodes named entities and numeric character references (`&#233;`, `&#xE9;`). */
export function decodeEntities(
  text: string,
  { named = XML_ENTITIES, isStrict = true }: EntityOptions = {},
): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);|&/g, (match, ref: string | undefined) => {
    if (!ref) {
      if (isStrict) throw new UnreadableFileError('it has a stray "&"');
      return match;
    }
    if (ref.startsWith('#')) return characterReference(ref, match);
    const value = named[ref];
    if (value !== undefined) return value;
    if (isStrict) throw new UnreadableFileError(`it has an unknown entity "${match}"`);
    return match;
  });
}
