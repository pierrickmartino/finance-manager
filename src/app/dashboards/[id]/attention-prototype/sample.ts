/*
 * PROTOTYPE — throwaway. Made-up Completeness check entries so every variant can be judged with
 * every kind of problem on screen, whatever the local database holds. `?sample=attention` for a
 * mix of problems, `?sample=ok` for the all-current state, `?sample=real` for the real check.
 */

import type { CompletenessEntry } from '@/server/services/completeness';
import { addDays, daysBetween } from '@/server/services/fx/dates';

export type SampleMode = 'attention' | 'ok' | 'real';

function account(id: string, bankName: string, name: string, currency = 'CHF') {
  return { id: `00000000-0000-4000-8000-00000000000${id}`, bankName, name, currency };
}

function healthy(
  today: string,
  id: string,
  bank: string,
  name: string,
  ago: number,
): CompletenessEntry {
  return {
    account: account(id, bank, name),
    dataEnd: addDays(today, -ago),
    daysSince: ago,
    isFreshnessChecked: true,
    problems: [],
  };
}

export function sampleEntries(mode: SampleMode, today: string): CompletenessEntry[] {
  const healthyRows = [
    healthy(today, '5', 'ZKB', 'Joint account', 4),
    healthy(today, '6', 'UBS', 'Credit card', 9),
    healthy(today, '7', 'PostFinance', 'Private account', 6),
  ];
  if (mode === 'ok') return healthyRows;
  const staleEnd = addDays(today, -58);
  return [
    {
      account: account('1', 'Cash', 'Wallet'),
      dataEnd: null,
      daysSince: null,
      isFreshnessChecked: false,
      problems: [{ kind: 'mismatch', differenceMinor: 2_000, statementDate: addDays(today, -1) }],
    },
    {
      account: account('2', 'UBS', 'Current account'),
      dataEnd: addDays(today, -3),
      daysSince: 3,
      isFreshnessChecked: true,
      problems: [
        { kind: 'mismatch', differenceMinor: -1_250, statementDate: addDays(today, -3) },
        { kind: 'gap', from: addDays(today, -78), to: addDays(today, -48) },
      ],
    },
    {
      account: account('3', 'PostFinance', 'Savings'),
      dataEnd: staleEnd,
      daysSince: daysBetween(staleEnd, today),
      isFreshnessChecked: true,
      problems: [{ kind: 'stale' }],
    },
    {
      account: account('4', 'Revolut', 'EUR pocket', 'EUR'),
      dataEnd: null,
      daysSince: null,
      isFreshnessChecked: true,
      problems: [{ kind: 'never_imported' }],
    },
    ...healthyRows,
  ];
}
