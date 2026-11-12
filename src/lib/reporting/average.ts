/**
 * Integer division rounded half away from zero, like the CHF conversion: how every average of
 * minor units is rounded, in the engine and in the Story, so a Drill-down reproduces it.
 */
export function divideRounded(amount: number, by: number): number {
  const quotient = Math.round(Math.abs(amount) / by);
  return amount < 0 ? -quotient : quotient;
}
