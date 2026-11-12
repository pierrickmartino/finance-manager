import { z } from 'zod';
import type { WidgetQueryInput } from '@/server/services/reporting/query';
import { queryToParams, type UrlParams } from './widget-params';

/**
 * Where a Drill-down was opened from, so it can link back there: a Dashboard (its Story), a
 * saved Widget, or the Widget editor (with the query in the URL). It travels in the URL as a
 * type and an id (`from=dashboard&fromId=<uuid>`), never as a path, so a forged value can only
 * ever fall back to the editor.
 */
export type DrillOrigin =
  { kind: 'dashboard'; id: string } | { kind: 'widget'; id: string } | { kind: 'editor' };

const EDITOR: DrillOrigin = { kind: 'editor' };
const UUID = z.uuid();

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

/** The `from` and `fromId` parameters of an origin; none for the editor. */
export function originToParams(origin: DrillOrigin): URLSearchParams {
  const params = new URLSearchParams();
  if (origin.kind === 'editor') return params;
  params.set('from', origin.kind);
  params.set('fromId', origin.id);
  return params;
}

/** Reads an origin back; an unknown type or a malformed id is the editor. */
export function originFromParams(params: UrlParams): DrillOrigin {
  const kind = first(params.from);
  const id = first(params.fromId);
  if ((kind !== 'dashboard' && kind !== 'widget') || !UUID.safeParse(id).success) return EDITOR;
  return { kind, id };
}

export interface BackLink {
  href: string;
  label: string;
}

/** The Drill-down's way back to where it was opened from. */
export function backLink(origin: DrillOrigin, query: WidgetQueryInput): BackLink {
  switch (origin.kind) {
    case 'dashboard':
      return { href: `/dashboards/${origin.id}`, label: 'Back to the Dashboard' };
    case 'widget':
      return { href: `/widgets/${origin.id}`, label: 'Back to the Widget' };
    case 'editor':
      return { href: `/widgets/new?${queryToParams(query)}`, label: 'Back to the editor' };
  }
}
