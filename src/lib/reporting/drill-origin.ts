import { z } from 'zod';
import { analyticsHref, spanFromParams, spanToParams, type Span } from '@/lib/analytics/span';
import { swissToday } from '@/server/services/fx/dates';
import type { WidgetQueryInput } from '@/server/services/reporting/query';
import { DEFAULT_WIDGET_QUERY, queryToParams, type UrlParams } from './widget-params';

/**
 * Where a Drill-down was opened from, so it can link back there: a Dashboard (its Story), a
 * saved Widget, the Widget editor (with the query in the URL), the Recurring payments page (a
 * Recurring payment's charges), or Analytics over a Span. It travels in the URL as a type and an
 * id (`origin=dashboard&originId=<uuid>`) or a Span, its parameters prefixed `origin`
 * (`origin=analytics&originSpan=year-to-date`, or `originFrom=2024-03-01` for a custom one), never as a path, so a forged value can only ever
 * fall back to the editor (or to Analytics over the default Span).
 */
export type DrillOrigin =
  | { kind: 'dashboard'; id: string }
  | { kind: 'widget'; id: string }
  | { kind: 'editor' }
  | { kind: 'recurringPayment' }
  | { kind: 'analytics'; span: Span };

/** A Recurring payment's charges, opened from the Recurring payments page. */
export const RECURRING_PAYMENT: DrillOrigin = { kind: 'recurringPayment' };

/** The Widget editor, with the query: where a Drill-down links back to by default. */
export const EDITOR: DrillOrigin = { kind: 'editor' };
const UUID = z.uuid();

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

/** A Span parameter's name in an origin: `span` travels as `originSpan`. */
const originName = (name: string) => `origin${name[0]!.toUpperCase()}${name.slice(1)}`;

/** The `origin` and `originId` parameters of an origin; none for the editor. */
export function originToParams(origin: DrillOrigin): URLSearchParams {
  const params = new URLSearchParams();
  if (origin.kind === 'editor') return params;
  params.set('origin', origin.kind);
  if (origin.kind === 'recurringPayment') return params;
  if (origin.kind === 'analytics') {
    for (const [name, value] of spanToParams(origin.span)) params.set(originName(name), value);
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
    const span = spanFromParams({ span: params.originSpan, from: params.originFrom }, swissToday());
    return { kind, span };
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
      return { href: analyticsHref(origin.span), label: 'Back to Analytics' };
  }
}
