/**
 * Classification rules shared by the server and client code (no server imports here).
 */

/** Longest note on a Transaction or a Split line, in characters. */
export const MAX_NOTES_LENGTH = 2000;

/** A Category as History, messages and pages show it: `Group › Category`. */
export function categoryLabel(category: { groupName: string; name: string }): string {
  return `${category.groupName} › ${category.name}`;
}
