/**
 * Text normalisation shared by Fingerprints and text matching (Rules, search):
 * lower case, accents stripped, whitespace collapsed and trimmed.
 */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
