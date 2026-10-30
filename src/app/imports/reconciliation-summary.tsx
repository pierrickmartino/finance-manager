import type { Formatter } from '@/lib/format';
import type { BalanceCheck, Reconciliation } from '@/server/services/imports';

interface ReconciliationSummaryProps {
  reconciliation: Reconciliation;
  currency: string;
  fmt: Formatter;
}

function balanceWarning(
  check: BalanceCheck | null,
  label: string,
  money: (minor: number) => string,
): string | null {
  if (!check || check.differenceMinor === 0) return null;
  return `${label}: the file says ${money(check.statementMinor)}, the Account would hold ${money(check.computedMinor)} (difference ${money(check.differenceMinor)}).`;
}

/** The reconciliation result in words: what doesn't add up, and where. */
export function ReconciliationSummary({
  reconciliation,
  currency,
  fmt,
}: ReconciliationSummaryProps) {
  const money = (minor: number) => fmt.amount(minor, { currency });
  if (reconciliation.status === 'ok') {
    return (
      <p className="text-sm text-green-700 dark:text-green-400">
        Reconciled: the balances in the file add up.
      </p>
    );
  }
  const warnings = [
    balanceWarning(reconciliation.opening, 'Opening balance', money),
    balanceWarning(reconciliation.closing, 'Closing balance', money),
    ...reconciliation.runningBalanceBreaks.map((gap) => {
      const where = gap.previous
        ? `between ${gap.previous.bankReference ?? 'the entry'} (${fmt.date(gap.previous.bookingDate)}) and ${gap.bankReference ?? 'the entry'} (${fmt.date(gap.bookingDate)})`
        : `before ${gap.bankReference ?? 'the first entry'} (${fmt.date(gap.bookingDate)})`;
      return `Running balance breaks ${where}: expected ${money(gap.expectedMinor)}, the file says ${money(gap.statedMinor)} (difference ${money(gap.differenceMinor)}). An entry is probably missing there.`;
    }),
  ].filter((warning): warning is string => warning !== null);

  return (
    <div role="alert" className="flex flex-col gap-1 text-sm text-amber-700 dark:text-amber-400">
      <p className="font-medium">Reconciliation failed: the balances don&apos;t add up.</p>
      <ul className="list-disc pl-5">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}
