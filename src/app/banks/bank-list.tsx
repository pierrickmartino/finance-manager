import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { banksHref, NEW_BANK, type BankSummary } from './view';

interface BankListProps {
  summaries: BankSummary[];
  /** The selected Bank's id, or `NEW_BANK`. */
  selected: string;
  fmt: Formatter;
}

const ITEM_CLASS = 'rounded-md px-3 py-2.5 text-sm';
const SELECTED_CLASS = 'bg-zinc-100 font-medium dark:bg-zinc-800';
const IDLE_CLASS = 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50';

/**
 * The master list: each Bank with its active Account count and CHF total. The last entry
 * opens the New Bank form.
 */
export function BankList({ summaries, selected, fmt }: BankListProps) {
  return (
    <nav aria-label="Bank list" className={`${CARD_CLASS} flex flex-col p-2`}>
      <ul className="flex flex-col">
        {summaries.map(({ bank, activeCount, chfMinor }) => {
          const isSelected = bank.id === selected;
          return (
            <li key={bank.id}>
              <Link
                href={banksHref(bank.id)}
                scroll={false}
                aria-current={isSelected ? 'true' : undefined}
                className={`flex items-center justify-between gap-3 ${ITEM_CLASS} ${
                  isSelected ? SELECTED_CLASS : IDLE_CLASS
                }`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{bank.name}</span>
                  <span className="text-xs font-normal text-zinc-500">
                    {activeCount} Account{activeCount === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="tabular-nums">{fmt.amount(chfMinor, { currency: 'CHF' })}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href={banksHref(NEW_BANK)}
        scroll={false}
        aria-current={selected === NEW_BANK ? 'true' : undefined}
        className={`mt-3 border border-dashed border-zinc-300 text-center dark:border-zinc-700 ${ITEM_CLASS} ${
          selected === NEW_BANK ? SELECTED_CLASS : IDLE_CLASS
        }`}
      >
        + New Bank
      </Link>
    </nav>
  );
}
