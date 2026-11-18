// PROTOTYPE (Tremor redesign): Tremor Raw, re-themed onto the Midnight tokens. Throwaway.
/* eslint-disable */
// @ts-nocheck -- vendored prototype code (strict index access, Recharts 3 types)
/* eslint-disable @typescript-eslint/no-explicit-any */
// Tremor hasOnlyOneValueForKey [v0.1.0]

export function hasOnlyOneValueForKey(array: any[], keyToCheck: string): boolean {
  const val: any[] = [];

  for (const obj of array) {
    if (Object.prototype.hasOwnProperty.call(obj, keyToCheck)) {
      val.push(obj[keyToCheck]);
      if (val.length > 1) {
        return false;
      }
    }
  }

  return true;
}
