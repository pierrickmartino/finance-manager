import type { Metadata } from 'next';
import Link from 'next/link';
import { SelectField, TextField } from '@/components/form';
import { BUTTON_CLASS } from '@/components/named-list';
import type { Formatter } from '@/lib/format';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { listAccounts } from '@/server/services/accounts';
import { ServiceError } from '@/server/services/errors';
import {
  getRule,
  MAX_PREVIEW_ROWS,
  previewApplyRules,
  type ApplyRulesPreview,
  type RuleFieldChange,
} from '@/server/services/rules';
import { applyRulesAction } from '../actions';
import { ApplyForm } from './apply-form';
import { applyInputOf, readApplyValues, type ApplyValues } from './apply-search';

export const metadata: Metadata = { title: 'Apply Rules · Finance Manager' };

const CELL = 'px-3 py-2 text-left align-top';

const FIELD_LABELS: Record<RuleFieldChange['field'], string> = {
  payee: 'Payee',
  category: 'Category',
  tags: 'Tags',
};

interface ApplyPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The preview reports the problem (e.g. "Rule not found"); the heading just goes without. */
function ignoreServiceError(error: unknown): null {
  if (error instanceof ServiceError) return null;
  throw error;
}

async function loadPreview(
  values: ApplyValues,
): Promise<{ preview: ApplyRulesPreview | null; error: string | null }> {
  try {
    return {
      preview: await previewApplyRules(await getServiceContext(), applyInputOf(values)),
      error: null,
    };
  } catch (error: unknown) {
    if (error instanceof ServiceError) return { preview: null, error: error.message };
    throw error;
  }
}

/**
 * Apply Rules to existing Transactions: pick the Transactions, see what would change (old →
 * new, per field), then commit it as one History Batch.
 */
export default async function ApplyRulesPage({ searchParams }: ApplyPageProps) {
  const values = readApplyValues(await searchParams);
  const ctx = await getServiceContext();
  const [accounts, rule, fmt, { preview, error }] = await Promise.all([
    listAccounts(ctx),
    values.ruleId ? getRule(ctx, values.ruleId).catch(ignoreServiceError) : null,
    getFormatter(),
    loadPreview(values),
  ]);
  const title = rule ? `Apply “${rule.name}”` : 'Apply all Rules';

  return (
    <section className="flex flex-col gap-6">
      <Link href="/rules" className="text-sm text-zinc-500 hover:underline">
        ← Rules
      </Link>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {rule
          ? 'Runs this Rule (even when disabled) on existing Transactions.'
          : 'Runs every enabled Rule, in order, on existing Transactions.'}{' '}
        Fields edited by hand and Transactions in a Transfer are never changed.
      </p>

      <form
        method="get"
        aria-label="Choose Transactions"
        className="flex flex-wrap items-end gap-3"
      >
        {values.ruleId && <input type="hidden" name="ruleId" value={values.ruleId} />}
        <SelectField
          label="Account"
          name="accountId"
          defaultValue={values.accountId}
          options={[
            { value: '', label: 'All Accounts' },
            ...accounts.map((account) => ({
              value: account.id,
              label: `${account.bankName} · ${account.name}`,
            })),
          ]}
        />
        <TextField label="From" name="from" type="date" defaultValue={values.from} />
        <TextField label="To" name="to" type="date" defaultValue={values.to} />
        <TextField label="Text" name="text" defaultValue={values.text} />
        <label className="flex items-center gap-2 py-1 text-sm">
          <input
            type="checkbox"
            name="unclassified"
            value="true"
            defaultChecked={values.unclassified === 'true'}
          />
          Only Unclassified
        </label>
        <button type="submit" className={BUTTON_CLASS}>
          Preview
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {preview && (
        <PreviewSection
          preview={preview}
          fmt={fmt}
          apply={applyRulesAction.bind(null, applyInputOf(values))}
        />
      )}
    </section>
  );
}

interface PreviewSectionProps {
  preview: ApplyRulesPreview;
  fmt: Formatter;
  apply: Parameters<typeof ApplyForm>[0]['action'];
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function PreviewSection({ preview, fmt, apply }: PreviewSectionProps) {
  const { examined, changedCount, fieldCounts, skippedTransfers, changes } = preview;
  const perField = (Object.keys(FIELD_LABELS) as RuleFieldChange['field'][])
    .filter((field) => fieldCounts[field] > 0)
    .map((field) => `${FIELD_LABELS[field]} on ${fieldCounts[field]}`);

  return (
    <section aria-label="Preview" className="flex flex-col gap-3">
      <p className="text-sm">
        {changedCount === 0
          ? `Nothing to change in ${plural(examined, 'Transaction')}.`
          : `${changedCount} of ${plural(examined, 'Transaction')} would change: ${perField.join(', ')}.`}
        {skippedTransfers > 0 &&
          ` ${plural(skippedTransfers, 'Transaction')} in a Transfer left alone.`}
      </p>
      <ApplyForm action={apply} count={changedCount} />
      {changes.length > 0 && (
        <div className="overflow-x-auto">
          {changedCount > changes.length && (
            <p className="text-sm text-zinc-500">
              Showing the first {MAX_PREVIEW_ROWS}; applying changes all {changedCount}.
            </p>
          )}
          <table aria-label="Changes" className="w-full text-sm">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className={CELL}>Date</th>
                <th className={CELL}>Account</th>
                <th className={CELL}>Description</th>
                <th className={`${CELL} text-right`}>Amount</th>
                <th className={CELL}>Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {changes.map((change) => (
                <tr key={change.transactionId}>
                  <td className={`${CELL} whitespace-nowrap tabular-nums`}>
                    {fmt.date(change.bookingDate)}
                  </td>
                  <td className={CELL}>{change.accountName}</td>
                  <td className={CELL}>
                    <Link
                      href={`/transactions/${change.transactionId}`}
                      className="hover:underline"
                    >
                      {change.rawDescription || '(no description)'}
                    </Link>
                  </td>
                  <td className={`${CELL} text-right whitespace-nowrap tabular-nums`}>
                    {fmt.amount(change.amountMinor, { currency: change.currency })}
                  </td>
                  <td className={CELL}>
                    <ul>
                      {change.fields.map((field) => (
                        <li key={field.field}>
                          {FIELD_LABELS[field.field]}: {field.before ?? '—'} → {field.after ?? '—'}{' '}
                          <span className="text-xs text-zinc-500">({field.ruleName})</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
