/**
 * PROTOTYPE variant B, "Guided": one question per step, with a progress rail. It starts from
 * what you want to *see* (the visualisation) and works back to the data; filters are checkbox
 * lists, not multi-selects; the preview and Save are the last step. Throwaway.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ActionForm } from '@/components/action-form';
import { FieldError } from '@/components/form';
import { AXIS_LABELS, MEASURE_LABELS, MEASURES, REPORT_AXES } from '@/server/services/reporting';
import { Stepper, type Step } from './client';
import {
  CapitalCheckbox,
  CheckboxList,
  CountInput,
  CurrentCheckbox,
  DateInput,
  describeQuery,
  filterDefs,
  HiddenFields,
  PerSelect,
  SaveHidden,
  UnitSelect,
  VISUALISATION_GLYPHS,
  VISUALISATION_HINTS,
  VISUALISATION_LABELS,
  VISUALISATIONS,
  type VariantProps,
} from './fields';

export const name = 'Guided steps';

const CTRL =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';
const CARD =
  'flex cursor-pointer flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4 has-checked:border-zinc-900 has-checked:ring-2 has-checked:ring-zinc-900 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:has-checked:border-white dark:has-checked:ring-white';

const MEASURE_HINTS = {
  sum: 'Add the amounts up',
  count: 'How many Transactions',
  average: 'The typical amount per period',
} as const;

function Choice({
  name,
  value,
  checked,
  title,
  hint,
  glyph,
}: {
  name: string;
  value: string;
  checked: boolean;
  title: string;
  hint?: string;
  glyph?: string;
}) {
  return (
    <label className={CARD}>
      <input type="radio" name={name} value={value} defaultChecked={checked} className="sr-only" />
      {glyph && (
        <span className="text-2xl leading-none" aria-hidden>
          {glyph}
        </span>
      )}
      <span className="text-sm font-semibold">{title}</span>
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

function AxisChoices({ side, value }: { side: 'rows' | 'columns'; value: string }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold">
        {side === 'rows' ? 'Down the side (rows)' : 'Across the top (columns)'}
      </legend>
      <div className="flex flex-wrap gap-2">
        {['', ...REPORT_AXES].map((axis) => (
          <label
            key={axis || 'none'}
            className="cursor-pointer rounded-full border border-zinc-300 px-3 py-1 text-sm has-checked:border-zinc-900 has-checked:bg-zinc-900 has-checked:text-white dark:border-zinc-700 dark:has-checked:bg-white dark:has-checked:text-zinc-900"
          >
            <input
              type="radio"
              name={side}
              value={axis}
              defaultChecked={axis === value}
              className="sr-only"
            />
            {axis ? AXIS_LABELS[axis as keyof typeof AXIS_LABELS] : 'Nothing'}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

export function VariantB(props: VariantProps) {
  const {
    query,
    lists,
    visualisation,
    report,
    error,
    widget,
    hidden,
    backHref,
    backLabel,
    preview,
    saveAction,
    step,
  } = props;
  const range = query.dateRange;
  const filters = filterDefs(query, lists);
  const active = filters.filter((f) => f.selected.length);

  const steps: Step[] = [
    {
      title: 'How should it look?',
      summary: VISUALISATION_LABELS[visualisation],
      content: (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {VISUALISATIONS.map((vis) => (
            <Choice
              key={vis}
              name="vis"
              value={vis}
              checked={vis === visualisation}
              title={VISUALISATION_LABELS[vis]}
              hint={VISUALISATION_HINTS[vis]}
              glyph={VISUALISATION_GLYPHS[vis]}
            />
          ))}
        </div>
      ),
    },
    {
      title: 'What should it measure?',
      summary: MEASURE_LABELS[query.measure ?? 'sum'],
      content: (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {MEASURES.map((m) => (
              <Choice
                key={m}
                name="measure"
                value={m}
                checked={(query.measure ?? 'sum') === m}
                title={MEASURE_LABELS[m]}
                hint={MEASURE_HINTS[m]}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <Labelled label="Average per">
              <PerSelect query={query} className={CTRL} />
            </Labelled>
            <label className="flex items-center gap-2 text-sm">
              <CapitalCheckbox query={query} /> Include Capital (net cash flow)
            </label>
          </div>
        </div>
      ),
    },
    {
      title: 'How should it be broken down?',
      summary: `${query.rows ? AXIS_LABELS[query.rows] : '—'} × ${query.columns ? AXIS_LABELS[query.columns] : '—'}`,
      content: (
        <div className="flex flex-col gap-6">
          <AxisChoices side="rows" value={query.rows ?? ''} />
          <AxisChoices side="columns" value={query.columns ?? ''} />
        </div>
      ),
    },
    {
      title: 'Over which period?',
      summary: describeQuery(query).split(' · ')[1] ?? '',
      content: (
        <div className="flex flex-col gap-3">
          <label className={`${CARD} flex-row! items-center gap-3!`}>
            <input type="radio" name="range" value="last" defaultChecked={range.kind === 'last'} />
            <span className="text-sm font-semibold">The last</span>
            <CountInput query={query} className={`${CTRL} w-20`} />
            <UnitSelect query={query} className={CTRL} />
          </label>
          <label className={`${CARD} flex-row! items-center gap-3!`}>
            <input
              type="radio"
              name="range"
              value="yearToDate"
              defaultChecked={range.kind === 'yearToDate'}
            />
            <span className="text-sm font-semibold">This year so far</span>
          </label>
          <label className={`${CARD} flex-row! flex-wrap items-center gap-3!`}>
            <input
              type="radio"
              name="range"
              value="fixed"
              defaultChecked={range.kind === 'fixed'}
            />
            <span className="text-sm font-semibold">Between</span>
            <DateInput query={query} side="from" className={CTRL} />
            <span className="text-sm">and</span>
            <DateInput query={query} side="to" className={CTRL} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <CurrentCheckbox query={query} /> Include the current, incomplete period
          </label>
        </div>
      ),
    },
    {
      title: 'Which Transactions?',
      summary: active.length
        ? active.map((f) => `${f.label} (${f.selected.length})`).join(', ')
        : 'All of them',
      content: (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-500">
            Leave a list empty to keep everything. Transfers are always left out.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filters.map((def) => (
              <fieldset
                key={def.name}
                className="min-w-0 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <legend className="px-1 text-sm font-semibold">{def.label}</legend>
                <CheckboxList def={def} className="max-h-40" />
              </fieldset>
            ))}
          </div>
        </div>
      ),
    },
  ];

  const review = (
    <section className="flex flex-col gap-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Step {steps.length + 1} of {steps.length + 1}
        </p>
        <h2 className="text-xl font-semibold">Name &amp; save</h2>
        <p className="text-sm text-zinc-500">{describeQuery(query)}</p>
      </header>
      {error && <FieldError message={error} />}
      {preview}
      {report && (
        <ActionForm
          action={saveAction}
          label="Save Widget"
          className="flex flex-wrap items-end gap-3 rounded-xl bg-zinc-100 p-4 dark:bg-zinc-800"
        >
          <SaveHidden props={props} />
          <Labelled label="Widget name">
            <input
              name="name"
              required
              defaultValue={widget?.name ?? ''}
              className={`${CTRL} w-72`}
            />
          </Labelled>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            {widget ? 'Update Widget' : 'Save Widget'}
          </button>
        </ActionForm>
      )}
    </section>
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {widget ? `Edit Widget: ${widget.name}` : 'New Widget'}
        </h1>
        <Link href={backHref} className="text-sm underline">
          {backLabel}
        </Link>
      </div>
      <Stepper
        key={JSON.stringify(query)}
        steps={steps}
        hiddenFields={<HiddenFields hidden={hidden} />}
        review={review}
        initialStep={step}
      />
    </section>
  );
}
