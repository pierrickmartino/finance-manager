import Link from 'next/link';
import type { ReactNode } from 'react';
import { balanceFilterLists, type BalanceFilterChoices } from '@/lib/reporting/query-filters';
import {
  AXIS_LABELS,
  isTimeAxis,
  TIME_AXES,
  type WidgetQueryInput,
  type WidgetSource,
} from '@/server/services/reporting';
import { AutoSubmitForm } from './auto-submit-form';
import { PANEL_INPUT, PanelRow, PanelSection } from './editor-panel';
import { FiltersSection, HiddenFields, PeriodSection } from './query-form';

const SOURCE_LABELS: Record<WidgetSource, string> = {
  query: 'Transactions',
  account_balances: 'Account balances',
};

/**
 * What a new Widget shows, as two links (each starting from its own defaults): a query over
 * the Transactions, or the Account balances.
 */
export function SourcePicker({
  value,
  hrefs,
}: {
  value: WidgetSource;
  hrefs: Record<WidgetSource, string>;
}) {
  return (
    <PanelSection title="Source">
      <nav aria-label="Widget source" className="grid grid-cols-2 gap-1.5">
        {(Object.keys(SOURCE_LABELS) as WidgetSource[]).map((source) => (
          <Link
            key={source}
            href={hrefs[source]}
            aria-current={source === value ? 'page' : undefined}
            className="rounded-md border border-rule-strong bg-surface px-2 py-1.5 text-center text-sm hover:border-faint aria-[current=page]:border-ink aria-[current=page]:ring-2 aria-[current=page]:ring-ink"
          >
            {SOURCE_LABELS[source]}
          </Link>
        ))}
      </nav>
    </PanelSection>
  );
}

interface BalancesFormProps {
  query: WidgetQueryInput;
  /** The Accounts the filters offer. */
  accounts: BalanceFilterChoices;
  hidden: Record<string, string>;
  /** The dates the preview covers: what "Fixed dates" starts from when switched to. */
  shownRange?: { from: string; to: string };
  children?: ReactNode;
}

/**
 * The Account balances Widget's settings: a time axis (none for the balances on one date, or
 * month, quarter or year for Net worth over time), the date range the axis covers, and the
 * filters choosing which Accounts count (no classification filter means anything for a balance).
 */
export function BalancesForm({ query, accounts, hidden, shownRange, children }: BalancesFormProps) {
  const axis = isTimeAxis(query.rows) ? query.rows : '';
  return (
    <AutoSubmitForm action="/widgets/new" label="Widget query">
      <HiddenFields fields={hidden} />
      {children}
      <PanelSection title="Data">
        <PanelRow label="Time axis">
          <select name="rows" defaultValue={axis} className={PANEL_INPUT}>
            <option value="">None: balances today</option>
            {TIME_AXES.map((unit) => (
              <option key={unit} value={unit}>
                {AXIS_LABELS[unit]}
              </option>
            ))}
          </select>
        </PanelRow>
      </PanelSection>
      <PeriodSection query={query} shownRange={shownRange} />
      <FiltersSection filterLists={balanceFilterLists(query.filters ?? {}, accounts)} />
      <noscript>
        <div className="p-4">
          <button type="submit" className="text-sm underline">
            Update preview
          </button>
        </div>
      </noscript>
    </AutoSubmitForm>
  );
}
