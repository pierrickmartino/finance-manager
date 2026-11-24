import { z } from 'zod';
import {
  analyticsHref,
  cardPeriodsFromParams,
  PINNABLE_SECTIONS,
  periodFromParams,
  periodToParams,
  type AnalyticsPage,
} from '@/lib/analytics/period';
import type { WidgetQueryInput } from '@/server/services/reporting/query';
import { DEFAULT_WIDGET_QUERY, queryToParams, type UrlParams } from './widget-params';

/**
 * Where a Drill-down was opened from, so it can link back there: a Dashboard (its Story), a
 * saved Widget, the Widget editor (with the query in the URL), the Recurring payments page (a
 * Recurring payment's charges), or Analytics over a Period with its Cards' pins. It travels in the
 * URL as a type and an id (`origin=dashboard&originId=<uuid>`) or a Period and its pins, their
 * parameters prefixed `origin` (`origin=analytics&originPeriod=year-to-date`;
 * `originSpendingByCategory=rolling-90-days` for a pin),
 * never as a path, so a forged value can only ever fall back to the editor (or to Analytics over
 * the default Period).
 */
export type DrillOrigin =
  | { kind: 'dashboard'; id: string }
  | { kind: 'widget'; id: string }
  | { kind: 'editor' }
  | { kind: 'recurringPayment' }
  /** Analytics: its page's Period and its Card Periods (GLOSSARY). */
  | { kind: 'analytics'; page: AnalyticsPage };

/** A Recurring payment's charges, opened from the Recurring payments page. */
export const RECURRING_PAYMENT: DrillOrigin = { kind: 'recurringPayment' };

/** The Widget editor, with the query: where a Drill-down links back to by default. */
export const EDITOR: DrillOrigin = { kind: 'editor' };
const UUID = z.uuid();

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

/**
 * An Analytics parameter's name in an origin: `period` travels as `originPeriod`, and a pin's
 * `spending-by-category` as `originSpendingByCategory`.
 */
const originName = (name: string) =>
  `origin${name.replace(/(?:^|-)(\w)/g, (_, letter: string) => letter.toUpperCase())}`;

/** The Analytics parameters an origin carries, each by its own name, read from their `origin` twins. */
function analyticsParams(params: UrlParams): Record<string, string | string[] | undefined> {
  return Object.fromEntries(
    ['period', ...PINNABLE_SECTIONS].map((name) => [name, params[originName(name)]]),
  );
}

/** Analytics as an origin: its page's Period and every Card's pin. */
export function analyticsDrillOrigin(page: AnalyticsPage): DrillOrigin {
  return { kind: 'analytics', page };
}

/** The `origin` and `originId` parameters of an origin; none for the editor. */
export function originToParams(origin: DrillOrigin): URLSearchParams {
  const params = new URLSearchParams();
  if (origin.kind === 'editor') return params;
  params.set('origin', origin.kind);
  if (origin.kind === 'recurringPayment') return params;
  if (origin.kind === 'analytics') {
    for (const [name, value] of periodToParams(origin.page)) {
      params.set(originName(name), value);
    }
    return params;
  }
  params.set('originId', origin.id);
  return params;
}

/** Reads an origin back; an unknown type or a malformed id is the editor. */
export function originFromParams(params: UrlParams): DrillOrigin {
  const kind = first(params.origin);
  const id = first(params.originId);
  if (kind === 'recurringPayment') return RECURRING_PAYMENT;
  if (kind === 'analytics') {
    const analytics = analyticsParams(params);
    return analyticsDrillOrigin({
      period: periodFromParams(analytics),
      cardPeriods: cardPeriodsFromParams(analytics),
    });
  }
  if ((kind !== 'dashboard' && kind !== 'widget') || !UUID.safeParse(id).success) return EDITOR;
  return { kind, id };
}

export interface BackLink {
  href: string;
  label: string;
}

/**
 * The Drill-down's way back to where it was opened from. The editor's link carries the Widget
 * query, the default one when none is given.
 */
export function backLink(
  origin: DrillOrigin,
  query: WidgetQueryInput = DEFAULT_WIDGET_QUERY,
): BackLink {
  switch (origin.kind) {
    case 'dashboard':
      return { href: `/dashboards/${origin.id}`, label: 'Back to the Dashboard' };
    case 'widget':
      return { href: `/widgets/${origin.id}`, label: 'Back to the Widget' };
    case 'editor':
      return { href: `/widgets/new?${queryToParams(query)}`, label: 'Back to the editor' };
    case 'recurringPayment':
      return { href: '/recurring-payments', label: 'Back to Recurring payments' };
    case 'analytics':
      return { href: analyticsHref(origin.page), label: 'Back to Analytics' };
  }
}
