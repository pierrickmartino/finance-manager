import type { Metadata } from 'next';
import Link from 'next/link';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { suggestRuleFromTransaction } from '@/server/services/rules';
import { createRuleThenPreviewAction, saveRuleAction } from '../actions';
import { loadRuleOptions } from '../load';
import { ruleToDraft } from '../rule-draft';
import { RuleForm } from '../rule-form';
import { PAGE_TITLE_CLASS } from '@/components/surface';

export const metadata: Metadata = { title: 'New Rule · Finance Manager' };

interface NewRulePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * A blank Rule, or with `?fromTransaction=<id>` one prefilled from that Transaction (its
 * Account, a description fragment, its direction and its classification). A Rule created from
 * a Transaction opens its apply preview next.
 */
export default async function NewRulePage({ searchParams }: NewRulePageProps) {
  const { fromTransaction } = await searchParams;
  const transactionId = typeof fromTransaction === 'string' ? fromTransaction : null;
  const ctx = await getServiceContext();
  const [{ options }, fmt, suggestion] = await Promise.all([
    loadRuleOptions(ctx),
    getFormatter(),
    transactionId ? suggestRuleFromTransaction(ctx, transactionId) : null,
  ]);
  const initial = ruleToDraft(suggestion, fmt);
  return (
    <section className="flex flex-col gap-6">
      <Link href="/rules" className="text-sm text-muted hover:underline">
        ← Rules
      </Link>
      <h1 className={PAGE_TITLE_CLASS}>New Rule</h1>
      {suggestion && (
        <p className="text-sm text-ink-soft">
          Prefilled from{' '}
          <Link href={`/transactions/${transactionId}`} className="underline">
            the Transaction
          </Link>
          . After creating it, you can preview applying it to existing Transactions.
        </p>
      )}
      <RuleForm
        initial={initial}
        options={options}
        action={suggestion ? createRuleThenPreviewAction : saveRuleAction.bind(null, null)}
        submitLabel="Create Rule"
      />
    </section>
  );
}
