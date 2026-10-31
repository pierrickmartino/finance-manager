import type { Formatter } from '@/lib/format';
import type { PreviewEntry } from '@/server/services/imports';
import { NEAR_DUPLICATE_FIELD_PREFIX } from '../near-duplicate-decisions';

const CELL = 'px-3 py-2 text-left align-top';

interface Side {
  bookingDate: string;
  amountMinor: number;
  counterpartyName: string | null;
  paymentReference: string | null;
  bankReference: string | null;
  rawDescription: string;
}

interface NearDuplicatesProps {
  entries: PreviewEntry[];
  currency: string;
  fmt: Formatter;
}

function SideCells({ side, currency, fmt }: { side: Side; currency: string; fmt: Formatter }) {
  return (
    <>
      <td className={CELL}>{fmt.date(side.bookingDate)}</td>
      <td className={CELL}>
        {side.counterpartyName ?? side.rawDescription}
        {side.paymentReference && (
          <div className="text-xs text-zinc-500">{side.paymentReference}</div>
        )}
        <div className="font-mono text-xs text-zinc-500">
          {side.bankReference ?? 'No reference'}
        </div>
      </td>
      <td className={`${CELL} text-right tabular-nums`}>
        {fmt.amount(side.amountMinor, { currency })}
      </td>
    </>
  );
}

/**
 * Near-duplicates (spec 22), each next to the Transaction the Account already holds with the
 * same date and amount, with a keep or skip choice (skip by default). Rendered inside the
 * commit form, so the choices are submitted with it.
 */
export function NearDuplicates({ entries, currency, fmt }: NearDuplicatesProps) {
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="near-duplicates" className="flex flex-col gap-2">
      <h2 id="near-duplicates" className="text-lg font-semibold">
        Possible duplicates
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        These entries have the same date and amount as a Transaction already on this Account, but a
        different reference. Keep the ones that are really new. Skipped ones are not imported. The
        reconciliation above counts them as skipped.
      </p>
      {entries.map((entry) => (
        <fieldset
          key={entry.fingerprint}
          className="flex flex-col gap-2 rounded-md border border-amber-300 p-3 dark:border-amber-700"
        >
          <legend className="px-1 text-sm font-medium">
            {entry.bankReference ?? entry.counterpartyName ?? fmt.date(entry.bookingDate)}
          </legend>
          <div className="overflow-x-auto">
            <table
              aria-label={`Possible duplicate ${entry.fingerprint}`}
              className="w-full text-sm"
            >
              <thead className="border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className={CELL}></th>
                  <th className={CELL}>Booking date</th>
                  <th className={CELL}>Counterparty</th>
                  <th className={`${CELL} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr>
                  <th scope="row" className={`${CELL} font-medium`}>
                    In this file
                  </th>
                  <SideCells side={entry} currency={currency} fmt={fmt} />
                </tr>
                {entry.nearDuplicates.map((existing) => (
                  <tr key={existing.id} className="text-zinc-600 dark:text-zinc-400">
                    <th scope="row" className={`${CELL} font-medium`}>
                      {existing.isManual ? 'Manual transaction' : 'Already on the Account'}
                    </th>
                    <SideCells side={existing} currency={currency} fmt={fmt} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={`${NEAR_DUPLICATE_FIELD_PREFIX}${entry.fingerprint}`}
                value="skip"
                defaultChecked
              />
              Skip
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={`${NEAR_DUPLICATE_FIELD_PREFIX}${entry.fingerprint}`}
                value="keep"
              />
              Keep
            </label>
          </div>
        </fieldset>
      ))}
    </section>
  );
}
