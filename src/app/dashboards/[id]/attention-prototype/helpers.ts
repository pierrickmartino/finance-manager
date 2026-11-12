/* PROTOTYPE — throwaway. Words shared by the "Accounts need attention" variants. */

import type { Formatter } from '@/lib/format';
import type {
  CompletenessEntry,
  CompletenessProblem,
  CompletenessProblemKind,
} from '@/server/services/completeness';

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function accountName(entry: CompletenessEntry): string {
  return `${entry.account.bankName} · ${entry.account.name}`;
}

export function accountHref(entry: CompletenessEntry): string {
  return `/accounts/${entry.account.id}`;
}

export function problemRows(entries: CompletenessEntry[]): CompletenessEntry[] {
  return entries.filter((entry) => entry.problems.length > 0);
}

export function healthyRows(entries: CompletenessEntry[]): CompletenessEntry[] {
  return entries.filter((entry) => entry.problems.length === 0);
}

export function earliestDataEnd(entries: CompletenessEntry[]): string | null {
  const ends = entries.flatMap((entry) =>
    entry.isFreshnessChecked && entry.dataEnd ? [entry.dataEnd] : [],
  );
  return ends.length === 0 ? null : ends.reduce((a, b) => (a < b ? a : b));
}

/** A short name for a kind of problem. */
export const KIND_LABEL: Record<CompletenessProblemKind, string> = {
  mismatch: 'Mismatch',
  gap: 'Gap',
  stale: 'Stale',
  never_imported: 'No Import yet',
};

/** What to do about it, as the user would say it. */
export const NEXT_STEP: Record<CompletenessProblemKind, string> = {
  mismatch: 'Check the Balance snapshots',
  gap: 'Import the missing file',
  stale: 'Import the latest statement',
  never_imported: 'Import a first file',
};

/** The detail of one problem: amount, dates, age. */
export function problemDetail(
  problem: CompletenessProblem,
  entry: CompletenessEntry,
  fmt: Formatter,
): string {
  switch (problem.kind) {
    case 'mismatch':
      return `${fmt.amount(problem.differenceMinor, { currency: entry.account.currency })} off on ${fmt.date(problem.statementDate)}`;
    case 'gap':
      return problem.from === problem.to
        ? fmt.date(problem.from)
        : `${fmt.date(problem.from)} – ${fmt.date(problem.to)}`;
    case 'stale':
      return entry.dataEnd
        ? `Data ends ${fmt.date(entry.dataEnd)} · ${entry.daysSince} days ago`
        : 'No data';
    case 'never_imported':
      return 'Has an Import format, but nothing imported';
  }
}

/** Counts per kind, in severity order, leaving out kinds with none. */
export function kindCounts(
  entries: CompletenessEntry[],
): { kind: CompletenessProblemKind; count: number }[] {
  const order: CompletenessProblemKind[] = ['mismatch', 'gap', 'stale', 'never_imported'];
  return order
    .map((kind) => ({
      kind,
      count: entries.reduce(
        (sum, entry) => sum + entry.problems.filter((p) => p.kind === kind).length,
        0,
      ),
    }))
    .filter(({ count }) => count > 0);
}

export function allCurrentLine(entries: CompletenessEntry[], fmt: Formatter): string {
  const checked = entries.filter((entry) => entry.isFreshnessChecked);
  const earliest = earliestDataEnd(entries);
  const head = `${checked.length === 1 ? '' : 'All '}${checked.length} ${plural(checked.length, 'Account', 'Accounts')} current`;
  return earliest ? `${head} to ${fmt.date(earliest)}` : head;
}
