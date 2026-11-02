// PROTOTYPE: the Transaction page's building blocks, lifted out of page.tsx so each layout
// variant can arrange them its own way. Throwaway: on cleanup they move back into page.tsx.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ActionForm } from '@/components/action-form';
import { BUTTON_CLASS } from '@/components/named-list';
import type { Formatter } from '@/lib/format';
import type { CategoryGroup } from '@/server/services/categories';
import type { HistoryEntry } from '@/server/services/history';
import {
  CLASSIFICATION_FIELD_LABELS,
  type Classification,
  type TransactionDetail,
  type TransactionListItem,
} from '@/server/services/transactions';
import type { CandidateTransaction } from '@/server/services/transfers';
import { HistoryTable, historyHref } from '../../../history/history-table';
import {
  deleteTransactionFromDetailAction,
  editClassificationAction,
  unlockFieldAction,
} from '../actions';
import { ClassificationForm } from '../classification-form';

export interface DetailProps {
  transaction: TransactionDetail;
  fmt: Formatter;
  classification: Classification;
  groups: CategoryGroup[];
  payeeNames: string[];
  tagNames: string[];
  counterpart: CandidateTransaction | null;
  linkOptions: CandidateTransaction[];
  history: HistoryEntry[];
  /** Variant D only: the list the drawer opens over. */
  neighbours: TransactionListItem[];
  variant: string;
  /** Variant C only: the open tab. */
  tab: string;
}

/** Keeps `?variant=` on links inside the prototype. */
export function withVariant(href: string, variant: string, extra = ''): string {
  return `${href}${href.includes('?') ? '&' : '?'}variant=${variant}${extra}`;
}

export function amountText({ transaction, fmt }: Pick<DetailProps, 'transaction' | 'fmt'>) {
  return fmt.amount(transaction.amountMinor, { currency: transaction.currency });
}

/** Payee, else counterparty, else bank text: what a person calls this Transaction. */
export function displayName(transaction: TransactionDetail): string {
  return (
    transaction.payee?.name ??
    transaction.counterpartyName ??
    (transaction.rawDescription || '(no description)')
  );
}

type Status = { label: string; tone: 'amber' | 'sky' | 'zinc' | 'emerald' };

/** Classification status as badges: Unclassified / Category / Split / Transfer, plus source. */
export function statusBadges({ transaction, classification }: DetailProps): Status[] {
  const badges: Status[] = [];
  if (transaction.transferId) badges.push({ label: 'Transfer', tone: 'sky' });
  else if (classification.splitLines.length > 0)
    badges.push({ label: `Split (${classification.splitLines.length})`, tone: 'zinc' });
  else if (classification.category)
    badges.push({ label: classification.category.name, tone: 'emerald' });
  else badges.push({ label: 'Unclassified', tone: 'amber' });
  badges.push({ label: transaction.isManual ? 'Manual' : 'Imported', tone: 'zinc' });
  if (classification.lockedFields.length > 0)
    badges.push({ label: `${classification.lockedFields.length} locked`, tone: 'zinc' });
  return badges;
}

const TONES: Record<Status['tone'], string> = {
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  sky: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  zinc: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
};

export function Badge({ label, tone }: Status) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{label}</span>
  );
}

export function sourceText({ transaction, fmt }: Pick<DetailProps, 'transaction' | 'fmt'>) {
  return transaction.import
    ? `Import of ${transaction.import.fileName} on ${fmt.date(transaction.import.importedAt)}`
    : 'Manual';
}

/** Every bank field, read-only (spec 38). `dense` drops the amount and booking date. */
export function BankFields({ transaction, fmt, dense = false }: DetailProps & { dense?: boolean }) {
  return (
    <dl
      aria-label="Bank fields"
      className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm"
    >
      {!dense && <Item term="Booking date">{fmt.date(transaction.bookingDate)}</Item>}
      <Item term="Value date">{transaction.valueDate && fmt.date(transaction.valueDate)}</Item>
      {!dense && (
        <Item term="Amount">
          <span className="tabular-nums">{amountText({ transaction, fmt })}</span>
        </Item>
      )}
      <Item term="Description">
        <span className="font-mono text-xs whitespace-pre-wrap">{transaction.rawDescription}</span>
      </Item>
      <Item term="Counterparty">{transaction.counterpartyName}</Item>
      <Item term="Counterparty IBAN">
        {transaction.counterpartyIban && (
          <span className="font-mono">{transaction.counterpartyIban}</span>
        )}
      </Item>
      <Item term="Payment reference">{transaction.paymentReference}</Item>
      <Item term="Bank reference">{transaction.bankReference}</Item>
      <Item term="Source">{sourceText({ transaction, fmt })}</Item>
    </dl>
  );
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{term}</dt>
      <dd className="break-words">{children || '—'}</dd>
    </>
  );
}

const CELL = 'px-3 py-2 text-left';

/** The payments a bank bundled into this one entry, for information only (spec 28). */
export function BundledDetailsTable({ transaction, fmt }: DetailProps) {
  if (!transaction.bundledDetails || transaction.bundledDetails.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table aria-label="Bundled details" className="w-full text-sm">
        <thead className="border-b border-zinc-200 dark:border-zinc-800">
          <tr>
            <th className={CELL}>Counterparty</th>
            <th className={CELL}>IBAN</th>
            <th className={CELL}>Reference</th>
            <th className={`${CELL} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {transaction.bundledDetails.map((detail, index) => (
            <tr key={index}>
              <td className={CELL}>{detail.counterpartyName ?? '—'}</td>
              <td className={`${CELL} font-mono`}>{detail.counterpartyIban ?? '—'}</td>
              <td className={CELL}>{detail.paymentReference ?? '—'}</td>
              <td className={`${CELL} text-right tabular-nums`}>
                {detail.amountMinor === null
                  ? '—'
                  : fmt.amount(detail.amountMinor, { currency: transaction.currency })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The real classification form (same Server Action as today). */
export function Classify(props: DetailProps) {
  return (
    <ClassificationForm
      classification={props.classification}
      groups={props.groups}
      payeeNames={props.payeeNames}
      tagNames={props.tagNames}
      action={editClassificationAction.bind(null, props.transaction.id)}
    />
  );
}

/** The fields a manual edit locked against Rules, each with an Unlock button (spec 65). */
export function LockedFields({ classification }: Pick<DetailProps, 'classification'>) {
  if (classification.lockedFields.length === 0) {
    return <p className="text-sm text-zinc-500">No field is locked: Rules may classify it.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Locked against Rules, because you edited them:
      </p>
      <ul aria-label="Locked fields" className="flex flex-wrap gap-2">
        {classification.lockedFields.map((field) => (
          <li key={field} className="flex items-center gap-2 text-sm">
            <span>{CLASSIFICATION_FIELD_LABELS[field]}</span>
            <ActionForm
              action={unlockFieldAction.bind(null, classification.transactionId, field)}
              label={`Unlock ${CLASSIFICATION_FIELD_LABELS[field]}`}
            >
              <button type="submit" className={BUTTON_CLASS}>
                Unlock
              </button>
            </ActionForm>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RuleLink({ transaction }: Pick<DetailProps, 'transaction'>) {
  return (
    <Link href={`/rules/new?fromTransaction=${transaction.id}`} className="text-sm underline">
      Create rule from this Transaction
    </Link>
  );
}

export function EditDetailsLink({ transaction }: Pick<DetailProps, 'transaction'>) {
  if (!transaction.isManual) return null;
  return (
    <Link
      href={`/accounts/${transaction.accountId}/manual/${transaction.id}`}
      className={BUTTON_CLASS}
    >
      Edit details
    </Link>
  );
}

export function DeleteButton({
  transaction,
  className = BUTTON_CLASS,
}: Pick<DetailProps, 'transaction'> & { className?: string }) {
  return (
    <ActionForm
      action={deleteTransactionFromDetailAction.bind(null, transaction.id, transaction.isManual)}
      label="Delete Transaction"
      confirmMessage={
        transaction.isManual
          ? 'Delete this Manual transaction?'
          : 'Delete this Transaction? Importing its file again adds it back.'
      }
    >
      <button type="submit" className={className}>
        Delete Transaction
      </button>
    </ActionForm>
  );
}

export function HistoryBlock({ transaction, fmt, history }: DetailProps) {
  return (
    <>
      {history.length === 0 ? (
        <p className="text-sm text-zinc-500">No History for this Transaction.</p>
      ) : (
        <HistoryTable entries={history} fmt={fmt} label="Transaction History" />
      )}
      <Link
        href={historyHref({ entityType: 'transaction', entityId: transaction.id })}
        className="text-sm underline"
      >
        Open in History
      </Link>
    </>
  );
}

/** History as a vertical timeline, newest first, grouped by the change that wrote it. */
export function HistoryTimeline({ fmt, history }: DetailProps) {
  if (history.length === 0)
    return <p className="text-sm text-zinc-500">No History for this Transaction.</p>;
  const batches = new Map<string, HistoryEntry[]>();
  for (const entry of history)
    batches.set(entry.batchId, [...(batches.get(entry.batchId) ?? []), entry]);
  return (
    <ol className="relative flex flex-col gap-4 border-l border-zinc-200 pl-5 dark:border-zinc-800">
      {[...batches.values()].map((entries) => {
        const first = entries[0]!;
        return (
          <li key={first.batchId} className="relative">
            <span className="absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full bg-zinc-400 ring-4 ring-white dark:ring-zinc-900" />
            <p className="text-xs text-zinc-500">
              {fmt.dateTime(first.at)} · <span className="font-medium">{first.actorType}</span>
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 text-sm">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <span className="text-zinc-500">{entry.field}</span>{' '}
                  {entry.before !== null && (
                    <>
                      <span className="line-through opacity-60">{short(entry.before)}</span> →{' '}
                    </>
                  )}
                  <span>{short(entry.after)}</span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function short(value: unknown): string {
  if (value === null) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}
