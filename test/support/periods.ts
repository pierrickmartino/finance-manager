import { presetPeriod } from '@/lib/analytics/period';

/**
 * A Period preset read by each grain, for the Analytics service's tests: the presets the former
 * Month, Quarter and Year views redirect to (ADR-0016). On the tests' usual today, 20 March 2025:
 * Rolling 12 months is 21 Mar 2024 to today by month (the first month cut short), This year and
 * last 1 is 2024 and 2025 by quarter, and This year and last 4 is 2021 to 2025 by year.
 */
export const MONTHLY = presetPeriod('rolling-12-months');
export const QUARTERLY = presetPeriod('this-year-and-last-1');
export const YEARLY = presetPeriod('this-year-and-last-4');
