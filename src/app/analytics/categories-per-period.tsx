import type { Formatter } from '@/lib/format';
import type { PeriodView } from '@/lib/analytics/period-view';
import type { CategoriesPerPeriod, PeriodTable } from '@/server/services/analytics';
import { PeriodTableView } from './period-table';
import { SectionCard } from './section';

export const CATEGORIES_PER_PERIOD = 'Categories per period';

interface CategoriesPerPeriodSectionProps {
  table: Promise<CategoriesPerPeriod>;
  view: PeriodView;
  fmt: Formatter;
  className?: string;
}

/** The section's groups as one table: each group's subtotal row, then its Categories nested. */
function flattened(loaded: CategoriesPerPeriod) {
  const table: PeriodTable = {
    periods: loaded.periods,
    rows: loaded.groups.flatMap((group) => [group.subtotal, ...group.categories]),
    isEmpty: loaded.isEmpty,
    unconvertedCount: loaded.unconvertedCount,
  };
  const subtotals = loaded.groups.map((group) => group.subtotal.key);
  const categories = loaded.groups.flatMap((group) => group.categories.map((row) => row.key));
  return { table, subtotals, categories };
}

/** Analytics' Categories per period table, once its figures arrive. */
export async function CategoriesPerPeriodSection({
  table,
  view,
  fmt,
  className,
}: CategoriesPerPeriodSectionProps) {
  const loaded = await table;
  const { table: rows, subtotals, categories } = flattened(loaded);
  return (
    <SectionCard name={CATEGORIES_PER_PERIOD} className={className}>
      {loaded.isEmpty ? (
        <p className="py-8 text-sm text-muted">
          Nothing to show yet: no classified Transaction in these periods.
        </p>
      ) : (
        <PeriodTableView
          label={CATEGORIES_PER_PERIOD}
          table={rows}
          view={view}
          fmt={fmt}
          emphasised={subtotals}
          indented={categories}
        />
      )}
    </SectionCard>
  );
}
