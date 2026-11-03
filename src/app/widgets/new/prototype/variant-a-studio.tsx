/**
 * PROTOTYPE variant A, "Studio": a side panel of collapsible sections, the preview filling the
 * rest and refreshing on every change, and the name + save bar pinned above the preview. No
 * Preview button. Throwaway.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ActionForm } from '@/components/action-form';
import { FieldError } from '@/components/form';
import { AutoSubmitForm } from './client';
import {
  AxisSelect,
  CapitalCheckbox,
  CountInput,
  CurrentCheckbox,
  DateInput,
  filterDefs,
  HiddenFields,
  MeasureSelect,
  PerSelect,
  RangeSelect,
  SaveHidden,
  UnitSelect,
  VISUALISATION_GLYPHS,
  VISUALISATION_LABELS,
  VISUALISATIONS,
  type VariantProps,
} from './fields';

export const name = 'Studio';

const CTRL =
  'w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900';

function Section({
  title,
  badge,
  open = true,
  children,
}: {
  title: string;
  badge?: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="group border-b border-zinc-200 dark:border-zinc-800">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
        <span>{title}</span>
        <span className="flex items-center gap-2 text-xs font-normal text-zinc-500">
          {badge}
          <span className="transition-transform group-open:rotate-90 motion-reduce:transition-none">
            ›
          </span>
        </span>
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">{children}</div>
    </details>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

export function VariantA(props: VariantProps) {
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
  } = props;
  const filters = filterDefs(query, lists);
  const activeFilters = filters.filter((f) => f.selected.length > 0).length;
  return (
    <div className="-mx-4 grid min-h-[calc(100vh-6rem)] lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="border-zinc-200 bg-zinc-50 lg:border-r dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between px-4 py-3">
          <Link
            href={backHref}
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            ← {backLabel}
          </Link>
          <Link href="/widgets/new?variant=A" className="text-xs text-zinc-500 hover:underline">
            Reset
          </Link>
        </div>
        <AutoSubmitForm key={JSON.stringify(query)} className="lg:sticky lg:top-0">
          <HiddenFields hidden={hidden} />
          <Section title="Visualisation">
            <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Visualisation">
              {VISUALISATIONS.map((vis) => (
                <label
                  key={vis}
                  title={VISUALISATION_LABELS[vis]}
                  className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-zinc-300 bg-white p-2 text-[11px] has-checked:border-zinc-900 has-checked:ring-2 has-checked:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:has-checked:border-white dark:has-checked:ring-white"
                >
                  <input
                    type="radio"
                    name="vis"
                    value={vis}
                    defaultChecked={vis === visualisation}
                    className="sr-only"
                  />
                  <span className="text-lg leading-none" aria-hidden>
                    {VISUALISATION_GLYPHS[vis]}
                  </span>
                  <span className="text-center leading-tight">{VISUALISATION_LABELS[vis]}</span>
                </label>
              ))}
            </div>
          </Section>
          <Section title="Data">
            <Row label="Measure">
              <MeasureSelect query={query} className={CTRL} />
            </Row>
            <Row label="Rows">
              <AxisSelect query={query} side="rows" className={CTRL} />
            </Row>
            <Row label="Columns">
              <AxisSelect query={query} side="columns" className={CTRL} />
            </Row>
            <Row label="Average per">
              <PerSelect query={query} className={CTRL} />
            </Row>
            <label className="flex items-center gap-2 text-sm">
              <CapitalCheckbox query={query} /> Include Capital
            </label>
          </Section>
          <Section title="Period">
            <Row label="Range">
              <RangeSelect query={query} className={CTRL} />
            </Row>
            <div className="hidden flex-col gap-3 [details:has(option[value=last]:checked)_&]:flex">
              <Row label="Last">
                <span className="flex gap-2">
                  <CountInput query={query} className={`${CTRL} w-16`} />
                  <UnitSelect query={query} className={CTRL} />
                </span>
              </Row>
            </div>
            <div className="hidden flex-col gap-3 [details:has(option[value=fixed]:checked)_&]:flex">
              <Row label="From">
                <DateInput query={query} side="from" className={CTRL} />
              </Row>
              <Row label="To">
                <DateInput query={query} side="to" className={CTRL} />
              </Row>
            </div>
            <label className="flex items-center gap-2 text-sm [details:has(option[value=fixed]:checked)_&]:hidden">
              <CurrentCheckbox query={query} /> Include the current (partial) period
            </label>
          </Section>
          <Section
            title="Filters"
            badge={activeFilters ? `${activeFilters} active` : 'all'}
            open={activeFilters > 0}
          >
            {filters.map((def) => (
              <label key={def.name} className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">
                  {def.label}
                  {def.selected.length > 0 && (
                    <span className="ml-1 rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">
                      {def.selected.length}
                    </span>
                  )}
                </span>
                <select
                  name={def.name}
                  multiple
                  defaultValue={def.selected}
                  className={`${CTRL} h-20`}
                >
                  {def.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.group ? `${o.group} › ` : ''}
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </Section>
          <noscript>
            <button type="submit">Preview</button>
          </noscript>
        </AutoSubmitForm>
      </aside>

      <main className="flex min-w-0 flex-col">
        <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 px-6 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
          {report ? (
            <ActionForm action={saveAction} label="Save Widget" className="flex items-center gap-3">
              <SaveHidden props={props} />
              <input
                name="name"
                required
                aria-label="Widget name"
                placeholder="Untitled Widget"
                defaultValue={widget?.name ?? ''}
                className="min-w-0 flex-1 border-0 bg-transparent text-xl font-semibold outline-none placeholder:text-zinc-400"
              />
              <span className="hidden text-xs text-zinc-500 sm:inline">
                Preview updates as you edit
              </span>
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
              >
                {widget ? 'Update Widget' : 'Save Widget'}
              </button>
            </ActionForm>
          ) : (
            <p className="text-xl font-semibold text-zinc-400">Untitled Widget</p>
          )}
        </div>
        <div className="flex flex-col gap-3 p-6">
          {error && <FieldError message={error} />}
          {preview}
          <p className="text-xs text-zinc-500">
            All values in CHF. Transfers are always left out; Capital only when included.
          </p>
        </div>
      </main>
    </div>
  );
}
