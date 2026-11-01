// PROTOTYPE — shared plumbing for the Unclassified page variants. Throwaway; not for main.
import type { Formatter } from '@/lib/format';
import type { ActionResult } from '@/server/actions';
import type { CategoryGroup } from '@/server/services/categories';
import type { TransactionPage } from '@/server/services/transactions';
import type { BulkEditResult } from '@/server/services/transactions/bulk-edit';
import type {
  ClassificationProgress,
  UnclassifiedGroupPage,
} from '@/server/services/transactions/unclassified';

export type BulkAction = (
  previous: ActionResult<BulkEditResult> | null,
  formData: FormData,
) => Promise<ActionResult<BulkEditResult>>;

/** The group a variant shows in full: its members and what the bulk edit needs. */
export interface OpenGroupData {
  key: string;
  description: string;
  members: TransactionPage;
  categoryGroups: CategoryGroup[];
  payeeNames: string[];
  action: BulkAction;
}

export interface VariantProps {
  variant: string;
  progress: ClassificationProgress;
  groupPage: UnclassifiedGroupPage;
  /** The group named by `?group=` (or the variant's default pick). */
  openKey: string | undefined;
  open: OpenGroupData | null;
  fmt: Formatter;
}

/** /unclassified links that keep the variant. */
export function protoHref(variant: string, params: { page?: number; group?: string } = {}): string {
  const search = new URLSearchParams({ variant });
  if (params.page && params.page > 1) search.set('page', String(params.page));
  if (params.group !== undefined) search.set('group', params.group);
  return `/unclassified?${search.toString()}`;
}

export const label = (description: string) => description || '(no description)';

/** Sum of the shown members' amounts, per currency. */
export function totals(open: OpenGroupData, fmt: Formatter): string {
  const byCurrency = new Map<string, number>();
  for (const t of open.members.transactions) {
    byCurrency.set(t.currency, (byCurrency.get(t.currency) ?? 0) + t.amountMinor);
  }
  return [...byCurrency].map(([currency, minor]) => fmt.amount(minor, { currency })).join(' + ');
}

/** Oldest and newest booking dates among the shown members. */
export function dateRange(open: OpenGroupData, fmt: Formatter): string {
  const dates = open.members.transactions.map((t) => t.bookingDate).sort();
  if (dates.length === 0) return '—';
  const first = fmt.date(dates[0]!);
  const last = fmt.date(dates[dates.length - 1]!);
  return first === last ? first : `${first} – ${last}`;
}

/** Distinct values, most frequent first. */
export function distinct(values: (string | null)[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([value]) => value);
}

/** Transactions to classify before the share Unclassified meets the target. */
export function toGo(progress: ClassificationProgress): number {
  return Math.max(0, progress.unclassified - Math.floor(progress.target * progress.total));
}
