/**
 * Where an opened Transaction morphs from or to (ADR-0012): its row below `xl`, the Transaction
 * preview's header from `xl` up, the Transaction detail's header, and the header of the
 * detail's loading skeleton.
 */
export type MorphPart = 'row' | 'preview' | 'detail' | 'loading';

/**
 * Whether `part` is the element the Transaction morphs with, given whether the Transaction
 * preview shows (`isWide`, from `xl` up) or `null` while the width isn't known yet
 * (server-rendering and hydrating), and, for the loading skeleton, whether another Transaction
 * detail was on screen when it started loading (`fromDetail`: a step through the Transactions
 * list, or a Transfer's counterpart). Only one source is named per width, so a name is never
 * mounted twice; until the width is known neither source is, so hydration only adds a name.
 *
 * The loading skeleton is named so the row or the preview morphs into it straight away. Reached
 * from another Transaction detail it is not: moving between Transactions has no animation
 * (spec #152), and a named skeleton would pair with the page's header when the page replaces it,
 * and morph.
 */
export function isMorphing(part: MorphPart, isWide: boolean | null, fromDetail = false): boolean {
  if (part === 'detail') return true;
  if (part === 'loading') return !fromDetail;
  if (isWide === null) return false;
  return part === 'preview' ? isWide : !isWide;
}
