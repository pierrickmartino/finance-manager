import type { Formatter } from '@/lib/format';
import type { PeriodView } from '@/lib/analytics/period-view';
import type { IncomeVsExpense, IncomeVsExpenseRow } from '@/server/services/analytics';
import { PeriodTableView } from './period-table';
import { SectionCard, SectionEmpty } from './section';

export const INCOME_VS_EXPENSE = 'Income vs. expense';

const SUMMARY_ROWS: readonly IncomeVsExpenseRow[] = ['net', 'netInclCapital'];

interface IncomeVsExpenseSectionProps {
  table: Promise<IncomeVsExpense>;
  view: PeriodView;
  fmt: Formatter;
}

/** Analytics' Income vs. expense table, once its figures arrive. */
export async function IncomeVsExpenseSection({ table, view, fmt }: IncomeVsExpenseSectionProps) {
  const loaded = await table;
  return (
    <SectionCard name={INCOME_VS_EXPENSE} unconverted={{ count: loaded.unconvertedCount }}>
      {loaded.isEmpty ? (
        <SectionEmpty>
          Nothing to show yet: no income, expense or Capital in these periods.
        </SectionEmpty>
      ) : (
        <PeriodTableView
          label={INCOME_VS_EXPENSE}
          table={loaded}
          view={view}
          fmt={fmt}
          emphasised={SUMMARY_ROWS}
        />
      )}
    </SectionCard>
  );
}
