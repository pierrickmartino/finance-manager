/**
 * Where an opened Transaction morphs from or to (ADR-0012): its row below `xl`, the Transaction
 * preview's header from `xl` up, and the Transaction detail's header.
 */
export type MorphPart = 'row' | 'preview' | 'detail';

/**
 * Whether `part` is the element the Transaction morphs with, given whether the Transaction
 * preview shows (`isWide`, from `xl` up) or `null` while the width isn't known yet
 * (server-rendering and hydrating). Only one source is named per width, so a name is never
 * mounted twice; until the width is known neither source is, so hydration only adds a name.
 */
export function isMorphing(part: MorphPart, isWide: boolean | null): boolean {
  if (part === 'detail') return true;
  if (isWide === null) return false;
  return part === 'preview' ? isWide : !isWide;
}
