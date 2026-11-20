import type { PeriodView } from '@/lib/analytics/period-view';
import type { ServiceContext } from '../context';
import { swissToday } from '../fx/dates';
import { incomeVsExpense, type IncomeVsExpense } from './income-vs-expense';
import { netCashFlow, type NetCashFlow } from './net-cash-flow';
import { periodWindow, type AnalyticsPeriod } from './window';

/**
 * The Analytics reporting service (GLOSSARY: Analytics, ADR-0015): the page's only data source.
 * Given a Period view, it returns the Period window and one promise per section, each started
 * at once so the page can stream every section in behind its own placeholder.
 *
 * Each section is its own module here (`./<section>.ts`) built on the reporting engine, with
 * its own test file (`./<section>.test.ts`). Adding a section is that module, a field in
 * `AnalyticsSections` and a line in `loadAnalytics`.
 */

/** Each section's promise, by name. */
export interface AnalyticsSections {
  incomeVsExpense: Promise<IncomeVsExpense>;
  netCashFlow: Promise<NetCashFlow>;
}

export interface AnalyticsView {
  view: PeriodView;
  /** Today's Swiss date, the one every section reads at. */
  today: string;
  window: AnalyticsPeriod[];
  sections: AnalyticsSections;
}

/**
 * Starts every section of Analytics at a Period view. The sections' promises are not awaited
 * here: the page awaits each where it shows it.
 */
export function loadAnalytics(ctx: ServiceContext, view: PeriodView): AnalyticsView {
  const today = swissToday();
  const window = periodWindow(view, today);
  return {
    view,
    today,
    window,
    sections: {
      incomeVsExpense: incomeVsExpense(ctx, view, window),
      netCashFlow: netCashFlow(ctx, view, window),
    },
  };
}

export type { AnalyticsPeriod } from './window';
export type { DrillRef, Figure, FigureRow, PeriodTable } from './figures';
export type { IncomeVsExpense, IncomeVsExpenseRow } from './income-vs-expense';
export type { NetCashFlow, NetCashFlowPoint } from './net-cash-flow';
