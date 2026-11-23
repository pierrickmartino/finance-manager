import type { Formatter } from '@/lib/format';
import type { CompletenessAttentionItem } from '@/server/services/attention';

/** "a", "a and b", "a, b and c". */
function listInWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/**
 * A failing Account's line: its name, then each of its problems, worst first, as the Completeness
 * check names them ("UBS current is Stale: data ends 12.10.2025", "Cler savings has 2 Gaps").
 * Its Gaps make one clause, where the first one stands.
 */
export function completenessLine(item: CompletenessAttentionItem, fmt: Formatter): string {
  const gaps = item.problems.filter((problem) => problem.kind === 'gap').length;
  const firstGap = item.problems.findIndex((problem) => problem.kind === 'gap');
  const clauses = item.problems.flatMap((problem, index): string[] => {
    switch (problem.kind) {
      case 'mismatch': {
        const difference = fmt.amount(problem.differenceMinor, { currency: item.currency });
        return [`has a mismatch of ${difference} on ${fmt.date(problem.statementDate)}`];
      }
      case 'gap':
        return index === firstGap ? [`has ${gaps} ${gaps === 1 ? 'Gap' : 'Gaps'}`] : [];
      case 'stale':
        return [
          `is Stale: ${item.dataEnd ? `data ends ${fmt.date(item.dataEnd)}` : 'no data yet'}`,
        ];
      case 'never_imported':
        return ['has no Import yet'];
    }
  });
  return `${item.accountName} ${listInWords(clauses)}`;
}
