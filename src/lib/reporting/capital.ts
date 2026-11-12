import type { WidgetQuery } from '@/server/services/reporting/query';

/**
 * Capital is excluded unless the query asks for it, directly or through its type filter. Pure,
 * so the reporting engine and what a Drill-down says of its filters agree on it.
 */
export function includesCapital(query: WidgetQuery): boolean {
  return query.includeCapital || (query.filters.categoryGroupTypes ?? []).includes('capital');
}
