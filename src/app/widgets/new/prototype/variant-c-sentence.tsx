/**
 * PROTOTYPE variant C, "Sentence": preview-first. The Widget name is the page title (editable),
 * the query reads as one sentence of inline pickers, filters are chips that open a checkbox
 * popover, and the preview gets the full width. Throwaway.
 */
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { FieldError } from '@/components/form';
import {
  AxisSelect,
  CapitalCheckbox,
  CheckboxList,
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
  VISUALISATION_LABELS,
  VISUALISATIONS,
  type VariantProps,
} from './fields';

export const name = 'Sentence + preview-first';

/** An inline picker that reads like an underlined word. */
const WORD =
  'mx-1 field-sizing-content cursor-pointer appearance-none rounded border-0 border-b-2 border-dashed border-sky-500 bg-sky-50 px-1.5 py-0 font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200';

export function VariantC(props: VariantProps) {
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
  return (
    <section className="flex flex-col gap-5">
      <nav className="text-sm text-zinc-500">
        <Link href={backHref} className="hover:underline">
          {backLabel}
        </Link>{' '}
        / {widget ? 'Edit' : 'New'}
      </nav>

      {report ? (
        <ActionForm
          action={saveAction}
          label="Save Widget"
          className="flex flex-wrap items-center gap-3"
        >
          <SaveHidden props={props} />
          <input
            name="name"
            required
            aria-label="Widget name"
            placeholder="Name this Widget…"
            defaultValue={widget?.name ?? ''}
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-3xl font-semibold outline-none placeholder:text-zinc-300 hover:border-zinc-200 focus:border-zinc-300 dark:placeholder:text-zinc-600 dark:hover:border-zinc-700"
          />
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            {widget ? 'Update' : 'Save'}
          </button>
        </ActionForm>
      ) : (
        <h1 className="text-3xl font-semibold text-zinc-300">Name this Widget…</h1>
      )}

      <form
        key={JSON.stringify(query)}
        method="get"
        aria-label="Widget query"
        className="group flex flex-col gap-3"
      >
        <HiddenFields hidden={hidden} />
        <p className="text-lg leading-loose">
          Show the
          <MeasureSelect query={query} className={WORD} />
          <span className="hidden group-has-[option[value=average]:checked]:inline">
            per
            <PerSelect query={query} className={WORD} />
          </span>
          with
          <AxisSelect query={query} side="rows" className={WORD} noneLabel="no rows" />
          down the side and
          <AxisSelect query={query} side="columns" className={WORD} noneLabel="no columns" />
          across, for
          <RangeSelect query={query} className={WORD} />
          <span className="hidden group-has-[option[value=last]:checked]:inline">
            <CountInput query={query} className={`${WORD} w-14 text-center`} />
            <UnitSelect query={query} className={WORD} />
          </span>
          <span className="hidden group-has-[option[value=fixed]:checked]:inline">
            from
            <DateInput query={query} side="from" className={WORD} />
            to
            <DateInput query={query} side="to" className={WORD} />
          </span>
          , drawn as a
          <select
            name="vis"
            aria-label="Visualisation"
            defaultValue={visualisation}
            className={WORD}
          >
            {VISUALISATIONS.map((vis) => (
              <option key={vis} value={vis}>
                {VISUALISATION_LABELS[vis].toLowerCase()}
              </option>
            ))}
          </select>
          .
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">Only:</span>
          {filters.map((def) => {
            const isActive = def.selected.length > 0;
            const chosen = def.options
              .filter((o) => def.selected.includes(o.value))
              .map((o) => o.label);
            return (
              <details key={def.name} className="relative">
                <summary
                  className={`cursor-pointer list-none rounded-full border px-3 py-1 text-sm ${
                    isActive
                      ? 'border-sky-600 bg-sky-600 text-white'
                      : 'border-dashed border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {isActive
                    ? `${def.label}: ${chosen.length <= 2 ? chosen.join(', ') : `${chosen.length} selected`}`
                    : `+ ${def.label}`}
                </summary>
                <div className="absolute left-0 z-20 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                  <CheckboxList def={def} />
                  <button
                    type="submit"
                    className="mt-3 w-full rounded-md bg-zinc-900 py-1 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
                  >
                    Apply
                  </button>
                </div>
              </details>
            );
          })}
          <span className="mx-2 h-5 w-px bg-zinc-200 dark:bg-zinc-800" />
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
            <CapitalCheckbox query={query} /> Capital
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 group-has-[option[value=fixed]:checked]:hidden dark:text-zinc-300">
            <CurrentCheckbox query={query} /> Current period
          </label>
          <span className="flex-1" />
          <Link href="/widgets/new?variant=C" className="text-sm text-zinc-500 hover:underline">
            Start over
          </Link>
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-4 py-1 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Refresh preview
          </button>
        </div>
      </form>

      {error && <FieldError message={error} />}
      <div className="rounded-2xl border border-zinc-200 p-4 shadow-sm dark:border-zinc-800">
        {preview}
      </div>
      <p className="text-xs text-zinc-500">
        All values in CHF. Transfers are always left out; Capital only when included.
      </p>
    </section>
  );
}
