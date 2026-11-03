/**
 * PROTOTYPE (widget editor redesign): the query controls as bare inputs, so each variant can
 * lay them out its own way. Same parameter names as `query-form.tsx`, so the URL and the
 * reporting service are unchanged. Throwaway.
 */
import type { ReactNode } from 'react';
import type { ActionResult } from '@/server/actions';
import { CATEGORY_GROUP_TYPE_LABELS, CATEGORY_GROUP_TYPES } from '@/server/services/categories';
import {
  AXIS_LABELS,
  MEASURE_LABELS,
  MEASURES,
  REPORT_AXES,
  TIME_AXES,
  VISUALISATION_LABELS,
  VISUALISATIONS,
  type ReportTable,
  type Visualisation,
  type Widget,
  type WidgetQueryInput,
} from '@/server/services/reporting';
import type { QueryFormLists } from '../../query-form';

export const UNIT_LABELS = { month: 'Months', quarter: 'Quarters', year: 'Years' } as const;

/** Everything a variant gets from the page; the page keeps all the data loading. */
export interface VariantProps {
  query: WidgetQueryInput;
  lists: QueryFormLists;
  visualisation: Visualisation;
  report: ReportTable | null;
  error: string | null;
  widget: Widget | null;
  /** Hidden GET fields to keep: the Widget or Dashboard, and the prototype variant. */
  hidden: Record<string, string>;
  backHref: string;
  backLabel: string;
  /** The rendered preview (server component), or null when there is no report. */
  preview: ReactNode;
  /** Server action that saves the Widget. */
  saveAction: (
    previous: ActionResult<unknown> | null,
    form: FormData,
  ) => Promise<ActionResult<unknown>>;
  /** Initial step for the guided variant (from `?step=`). */
  step: number;
}

export function HiddenFields({ hidden }: { hidden: Record<string, string> }) {
  return Object.entries(hidden).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

/** The hidden fields the save action reads, besides the name. */
export function SaveHidden({ props }: { props: VariantProps }) {
  const { report, visualisation, widget, hidden } = props;
  if (!report) return null;
  return (
    <>
      <input type="hidden" name="query" value={JSON.stringify(report.query)} />
      <input type="hidden" name="visualisation" value={visualisation} />
      {widget && <input type="hidden" name="widgetId" value={widget.id} />}
      {!widget && hidden.dashboard && (
        <input type="hidden" name="dashboardId" value={hidden.dashboard} />
      )}
    </>
  );
}

export function RangeSelect({ query, className }: { query: WidgetQueryInput; className: string }) {
  return (
    <select
      name="range"
      aria-label="Range"
      defaultValue={query.dateRange.kind}
      className={className}
    >
      <option value="last">last complete</option>
      <option value="yearToDate">year to date</option>
      <option value="fixed">fixed dates</option>
    </select>
  );
}

export function CountInput({ query, className }: { query: WidgetQueryInput; className: string }) {
  const range = query.dateRange;
  return (
    <input
      name="count"
      type="number"
      min={1}
      aria-label="Number of periods"
      defaultValue={range.kind === 'last' ? range.count : 12}
      className={className}
    />
  );
}

export function UnitSelect({ query, className }: { query: WidgetQueryInput; className: string }) {
  const range = query.dateRange;
  return (
    <select
      name="unit"
      aria-label="Period"
      defaultValue={range.kind === 'last' ? range.unit : 'month'}
      className={className}
    >
      {TIME_AXES.map((unit) => (
        <option key={unit} value={unit}>
          {UNIT_LABELS[unit].toLowerCase()}
        </option>
      ))}
    </select>
  );
}

export function CurrentCheckbox({ query }: { query: WidgetQueryInput }) {
  const range = query.dateRange;
  return (
    <input
      type="checkbox"
      name="current"
      value="1"
      defaultChecked={range.kind !== 'fixed' && range.includeCurrent === true}
    />
  );
}

export function DateInput({
  query,
  side,
  className,
}: {
  query: WidgetQueryInput;
  side: 'from' | 'to';
  className: string;
}) {
  const range = query.dateRange;
  return (
    <input
      name={side}
      type="date"
      aria-label={side === 'from' ? 'From' : 'To'}
      defaultValue={range.kind === 'fixed' ? range[side] : ''}
      className={className}
    />
  );
}

export function AxisSelect({
  query,
  side,
  className,
  noneLabel = 'None',
}: {
  query: WidgetQueryInput;
  side: 'rows' | 'columns';
  className: string;
  noneLabel?: string;
}) {
  return (
    <select
      name={side}
      aria-label={side === 'rows' ? 'Rows' : 'Columns'}
      defaultValue={query[side] ?? ''}
      className={className}
    >
      <option value="">{noneLabel}</option>
      {REPORT_AXES.map((axis) => (
        <option key={axis} value={axis}>
          {AXIS_LABELS[axis]}
        </option>
      ))}
    </select>
  );
}

export function MeasureSelect({
  query,
  className,
}: {
  query: WidgetQueryInput;
  className: string;
}) {
  return (
    <select
      name="measure"
      aria-label="Measure"
      defaultValue={query.measure ?? 'sum'}
      className={className}
    >
      {MEASURES.map((measure) => (
        <option key={measure} value={measure}>
          {MEASURE_LABELS[measure]}
        </option>
      ))}
    </select>
  );
}

export function PerSelect({ query, className }: { query: WidgetQueryInput; className: string }) {
  return (
    <select
      name="per"
      aria-label="Average per"
      defaultValue={query.averagePer ?? 'month'}
      className={className}
    >
      {TIME_AXES.map((unit) => (
        <option key={unit} value={unit}>
          {AXIS_LABELS[unit]}
        </option>
      ))}
    </select>
  );
}

export function CapitalCheckbox({ query }: { query: WidgetQueryInput }) {
  return <input type="checkbox" name="capital" value="1" defaultChecked={query.includeCapital} />;
}

export const VISUALISATION_HINTS: Record<Visualisation, string> = {
  table: 'Every value, rows × columns',
  line: 'A trend over time',
  stacked_bar: 'Parts of a whole, period by period',
  donut: 'Shares of one total',
  number: 'One headline figure',
};

export const VISUALISATION_GLYPHS: Record<Visualisation, string> = {
  table: '▦',
  line: '⟋',
  stacked_bar: '▥',
  donut: '◐',
  number: '#',
};

export { VISUALISATION_LABELS, VISUALISATIONS };

export interface FilterOption {
  value: string;
  label: string;
  group?: string;
}

export interface FilterDef {
  name: string;
  label: string;
  options: FilterOption[];
  selected: string[];
}

/** The seven filters as plain option lists, so a variant can render them as it likes. */
export function filterDefs(query: WidgetQueryInput, lists: QueryFormLists): FilterDef[] {
  const filters = query.filters ?? {};
  const { accounts, groups, payees, tags } = lists;
  const currencies = [...new Set(accounts.map((account) => account.currency))].sort();
  return [
    {
      name: 'account',
      label: 'Accounts',
      options: accounts.map((a) => ({ value: a.id, label: `${a.bankName} · ${a.name}` })),
      selected: filters.accountIds ?? [],
    },
    {
      name: 'group',
      label: 'Category groups',
      options: groups.map((g) => ({ value: g.id, label: g.name })),
      selected: filters.categoryGroupIds ?? [],
    },
    {
      name: 'category',
      label: 'Categories',
      options: groups.flatMap((g) =>
        g.categories.map((c) => ({ value: c.id, label: c.name, group: g.name })),
      ),
      selected: filters.categoryIds ?? [],
    },
    {
      name: 'payee',
      label: 'Payees',
      options: payees.map((p) => ({ value: p.id, label: p.name })),
      selected: filters.payeeIds ?? [],
    },
    {
      name: 'tag',
      label: 'Tags',
      options: tags.map((t) => ({ value: t.id, label: t.name })),
      selected: filters.tagIds ?? [],
    },
    {
      name: 'type',
      label: 'Category group types',
      options: CATEGORY_GROUP_TYPES.map((t) => ({
        value: t,
        label: CATEGORY_GROUP_TYPE_LABELS[t],
      })),
      selected: filters.categoryGroupTypes ?? [],
    },
    {
      name: 'currency',
      label: 'Currencies',
      options: currencies.map((c) => ({ value: c, label: c })),
      selected: filters.currencies ?? [],
    },
  ];
}

/** A filter as a scrolling checkbox list (the multi-select replacement used by B and C). */
export function CheckboxList({
  def,
  className = 'max-h-56',
}: {
  def: FilterDef;
  className?: string;
}) {
  if (def.options.length === 0)
    return <p className="px-1 text-sm text-zinc-500">Nothing to choose from yet.</p>;
  return (
    <div className={`flex flex-col gap-0.5 overflow-y-auto ${className}`}>
      {def.options.map((option, index) => {
        const previous = def.options[index - 1];
        const heading = option.group && option.group !== previous?.group ? option.group : null;
        return (
          <div key={option.value}>
            {heading && (
              <p className="mt-2 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {heading}
              </p>
            )}
            <label className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <input
                type="checkbox"
                name={def.name}
                value={option.value}
                defaultChecked={def.selected.includes(option.value)}
              />
              {option.label}
            </label>
          </div>
        );
      })}
    </div>
  );
}

/** One-line description of the current query, for summaries. */
export function describeQuery(query: WidgetQueryInput): string {
  const range = query.dateRange;
  const when =
    range.kind === 'fixed'
      ? `${range.from || '…'} → ${range.to || '…'}`
      : range.kind === 'yearToDate'
        ? 'Year to date'
        : `Last ${range.count} ${UNIT_LABELS[range.unit]?.toLowerCase() ?? range.unit}`;
  const rows = query.rows ? AXIS_LABELS[query.rows] : 'nothing';
  const cols = query.columns ? AXIS_LABELS[query.columns] : 'nothing';
  return `${MEASURE_LABELS[query.measure ?? 'sum']} by ${rows} × ${cols} · ${when}`;
}
