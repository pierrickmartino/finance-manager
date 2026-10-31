import type { Formatter } from '@/lib/format';
import type { PreviewEntry } from '@/server/services/imports';
import { NOT_A_TRANSFER, TRANSFER_FIELD_PREFIX } from '../transfer-decisions';

const CELL = 'px-3 py-2 text-left align-top';

interface TransferCandidatesProps {
  entries: PreviewEntry[];
  currency: string;
  fmt: Formatter;
}

/**
 * Transfer candidates (spec 83-87): for each entry, the Transactions on other Accounts that may
 * be its other side, best first, plus "Not a Transfer". The IBAN match is pre-selected; nothing
 * is linked unless the commit is submitted with a candidate chosen. Rendered inside the commit
 * form, so the choices are submitted with it.
 */
export function TransferCandidates({ entries, currency, fmt }: TransferCandidatesProps) {
  const withCandidates = entries.filter((entry) => entry.transferCandidates.length > 0);
  if (withCandidates.length === 0) return null;
  return (
    <section aria-labelledby="transfer-candidates" className="flex flex-col gap-2">
      <h2 id="transfer-candidates" className="text-lg font-semibold">
        Possible Transfers
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        These entries may be money moving between your own Accounts. Choose the other side to link
        them as a Transfer: it gets no Category and is left out of income and expense. Rules
        don&apos;t apply to Transfers.
      </p>
      {withCandidates.map((entry) => {
        const name = `${TRANSFER_FIELD_PREFIX}${entry.fingerprint}`;
        const hasPreselection = entry.transferCandidates.some((c) => c.isPreselected);
        const label = `${fmt.date(entry.bookingDate)} ${fmt.amount(entry.amountMinor, { currency })}`;
        return (
          <fieldset
            key={entry.fingerprint}
            aria-label={`Transfer for ${entry.bankReference ?? label}`}
            className="flex flex-col gap-2 rounded-md border border-sky-300 p-3 dark:border-sky-700"
          >
            <legend className="px-1 text-sm font-medium">
              {label} · {entry.counterpartyName ?? entry.rawDescription}
            </legend>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className={CELL}>Link with</th>
                    <th className={CELL}>Account</th>
                    <th className={CELL}>Booking date</th>
                    <th className={CELL}>Description</th>
                    <th className={`${CELL} text-right`}>Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {entry.transferCandidates.map(({ transaction, isPreselected, isIbanMatch }) => (
                    <tr key={transaction.id}>
                      <td className={CELL}>
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name={name}
                            value={transaction.id}
                            defaultChecked={isPreselected}
                            aria-label={`Link with ${transaction.accountName} ${fmt.date(transaction.bookingDate)}`}
                          />
                          {isIbanMatch && <span className="text-xs text-sky-700">IBAN match</span>}
                        </label>
                      </td>
                      <td className={CELL}>{transaction.accountName}</td>
                      <td className={CELL}>{fmt.date(transaction.bookingDate)}</td>
                      <td className={CELL}>
                        {transaction.counterpartyName ?? transaction.rawDescription}
                        <div className="font-mono text-xs text-zinc-500">
                          {transaction.bankReference ?? 'No reference'}
                        </div>
                      </td>
                      <td className={`${CELL} text-right tabular-nums`}>
                        {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={name}
                value={NOT_A_TRANSFER}
                defaultChecked={!hasPreselection}
              />
              Not a Transfer
            </label>
          </fieldset>
        );
      })}
    </section>
  );
}
