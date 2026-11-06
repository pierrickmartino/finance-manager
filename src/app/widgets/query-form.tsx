import type { ReactNode } from 'react';
import {
  activeFilterCount,
  queryFilterLists,
  type FilterList,
} from '@/lib/reporting/query-filters';
import type { Account } from '@/server/services/accounts';
import type { CategoryGroup } from '@/server/services/categories';
import type { Payee } from '@/server/services/payees';
import {
  AXIS_LABELS,
  MEASURE_LABELS,
  MEASURES,
  REPORT_AXES,
  TIME_AXES,
  type WidgetQueryInput,
} from '@/server/services/reporting';
import type { Tag } from '@/server/services/tags';
import { AutoSubmitForm } from './auto-submit-form';
import { PANEL_INPUT, PanelRow, PanelSection } from './editor-panel';

const UNIT_LABELS = { month: 'months', quarter: 'quarters', year: 'years' } as const;

/*
 * Fields that apply only to some choices stay in the form (so switching keeps their values)
 * and are shown by CSS from the choice: the date range kind, and the average measure.
 */
const WHEN_LAST = 'hidden [[data-period]:has(option[value=last]:checked)_&]:block';
const WHEN_FIXED = 'hidden [[data-period]:has(option[value=fixed]:checked)_&]:flex';
const UNLESS_FIXED = '[[data-period]:has(option[value=fixed]:checked)_&]:hidden';
const WHEN_AVERAGE = 'hidden [[data-measure]:has(option[value=average]:checked)_&]:block';

export interface QueryFormLists {
  accounts: Account[];
  groups: CategoryGroup[];
  payees: Payee[];
  tags: Tag[];
}

interface QueryFormProps {
  query: WidgetQueryInput;
  lists: QueryFormLists;
  /** Extra hidden fields to keep (e.g. the Widget being edited). */
  hidden?: Record<string, string>;
  /** The dates the preview covers: what "Fixed dates" starts from when switched to. */
  shownRange?: { from: string; to: string };
  /** Sections shown before the query's own (e.g. the visualisation). */
  children?: ReactNode;
}

export function HiddenFields({ fields }: { fields: Record<string, string> }) {
  return Object.entries(fields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

function AxisSelect({ query, side }: { query: WidgetQueryInput; side: 'rows' | 'columns' }) {
  return (
    <select name={side} defaultValue={query[side] ?? ''} className={PANEL_INPUT}>
      <option value="">None</option>
      {REPORT_AXES.map((axis) => (
        <option key={axis} value={axis}>
          {AXIS_LABELS[axis]}
        </option>
      ))}
    </select>
  );
}

function DataSection({ query }: { query: WidgetQueryInput }) {
  return (
    <PanelSection title="Data">
      <div data-measure className="flex flex-col gap-3">
        <PanelRow label="Measure">
          <select name="measure" defaultValue={query.measure ?? 'sum'} className={PANEL_INPUT}>
            {MEASURES.map((measure) => (
              <option key={measure} value={measure}>
                {MEASURE_LABELS[measure]}
              </option>
            ))}
          </select>
        </PanelRow>
        <div className={WHEN_AVERAGE}>
          <PanelRow label="Average per">
            <select name="per" defaultValue={query.averagePer ?? 'month'} className={PANEL_INPUT}>
              {TIME_AXES.map((unit) => (
                <option key={unit} value={unit}>
                  {AXIS_LABELS[unit]}
                </option>
              ))}
            </select>
          </PanelRow>
        </div>
      </div>
      <PanelRow label="Rows">
        <AxisSelect query={query} side="rows" />
      </PanelRow>
      <PanelRow label="Columns">
        <AxisSelect query={query} side="columns" />
      </PanelRow>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="capital" value="1" defaultChecked={query.includeCapital} />
        Include Capital (net cash flow)
      </label>
    </PanelSection>
  );
}

function PeriodSection({
  query,
  shownRange,
}: {
  query: WidgetQueryInput;
  shownRange?: { from: string; to: string };
}) {
  const range = query.dateRange;
  const fixed = range.kind === 'fixed' ? range : (shownRange ?? { from: '', to: '' });
  return (
    <PanelSection title="Period">
      <div data-period className="flex flex-col gap-3">
        <PanelRow label="Range">
          <select name="range" defaultValue={range.kind} className={PANEL_INPUT}>
            <option value="last">Last complete periods</option>
            <option value="yearToDate">Year to date</option>
            <option value="fixed">Fixed dates</option>
          </select>
        </PanelRow>
        <div className={WHEN_LAST}>
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 text-sm">
            <span className="text-ink-soft">Last</span>
            <span className="flex gap-2">
              <input
                name="count"
                type="number"
                min={1}
                aria-label="Number of periods"
                defaultValue={range.kind === 'last' ? range.count : 12}
                className={`${PANEL_INPUT} w-16`}
              />
              <select
                name="unit"
                aria-label="Period"
                defaultValue={range.kind === 'last' ? range.unit : 'month'}
                className={PANEL_INPUT}
              >
                {TIME_AXES.map((unit) => (
                  <option key={unit} value={unit}>
                    {UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
            </span>
          </div>
        </div>
        <div className={`flex-col gap-3 ${WHEN_FIXED}`}>
          <PanelRow label="From">
            <input name="from" type="date" defaultValue={fixed.from} className={PANEL_INPUT} />
          </PanelRow>
          <PanelRow label="To">
            <input name="to" type="date" defaultValue={fixed.to} className={PANEL_INPUT} />
          </PanelRow>
        </div>
        <label className={`flex items-center gap-2 text-sm ${UNLESS_FIXED}`}>
          <input
            type="checkbox"
            name="current"
            value="1"
            defaultChecked={range.kind !== 'fixed' && range.includeCurrent === true}
          />
          Include the current period (partial)
        </label>
      </div>
    </PanelSection>
  );
}

/** One filter as a collapsible checkbox list; open when it already narrows the query. */
function FilterChecklist({ list }: { list: FilterList }) {
  const count = list.selected.length;
  return (
    <details open={count > 0} className="group/filter">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm text-ink-soft [&::-webkit-details-marker]:hidden">
        {list.label}
        <span className="text-xs text-muted">{count > 0 ? `${count} selected` : 'all'}</span>
      </summary>
      <fieldset className="mt-1 flex max-h-48 min-w-0 flex-col gap-0.5 overflow-y-auto rounded-md border border-rule bg-surface p-1.5">
        <legend className="sr-only">{list.label}</legend>
        {list.options.length === 0 && (
          <p className="px-1 text-sm text-muted">Nothing to choose yet.</p>
        )}
        {list.options.map((option, index) => (
          <div key={option.value}>
            {option.group && option.group !== list.options[index - 1]?.group && (
              <p className="mt-1.5 px-1 text-xs font-semibold text-muted">{option.group}</p>
            )}
            <label className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-sunken">
              <input
                type="checkbox"
                name={list.name}
                value={option.value}
                defaultChecked={list.selected.includes(option.value)}
              />
              {option.label}
            </label>
          </div>
        ))}
      </fieldset>
    </details>
  );
}

function FiltersSection({ query, lists }: { query: WidgetQueryInput; lists: QueryFormLists }) {
  const filterLists = queryFilterLists(query.filters ?? {}, lists);
  const active = activeFilterCount(filterLists);
  return (
    <PanelSection
      title="Filters"
      badge={active > 0 ? `${active} active` : 'none'}
      isOpen={active > 0}
    >
      <p className="text-xs text-muted">Nothing ticked lets everything in.</p>
      {filterLists.map((list) => (
        <FilterChecklist key={list.name} list={list} />
      ))}
    </PanelSection>
  );
}

/**
 * The Widget query definition (spec 99–103) as the editor's side panel: a GET form that
 * refreshes the preview on every change. Fields that don't apply to the chosen date range or
 * measure are hidden but kept.
 */
export function QueryForm({ query, lists, hidden = {}, shownRange, children }: QueryFormProps) {
  return (
    <AutoSubmitForm action="/widgets/new" label="Widget query">
      <HiddenFields fields={hidden} />
      {children}
      <DataSection query={query} />
      <PeriodSection query={query} shownRange={shownRange} />
      <FiltersSection query={query} lists={lists} />
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
