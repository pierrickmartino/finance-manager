import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { historyHref } from '@/app/history/history-table';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import type { ServiceContext } from '@/server/services/context';
import { NotFoundError } from '@/server/services/errors';
import { getRule, type Rule } from '@/server/services/rules';
import { saveRuleAction } from '../actions';
import { loadRuleOptions } from '../load';
import { ruleToDraft } from '../rule-draft';
import { RuleForm } from '../rule-form';

export const metadata: Metadata = { title: 'Edit Rule · Finance Manager' };

async function loadRule(ctx: ServiceContext, id: string): Promise<Rule> {
  try {
    return await getRule(ctx, id);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getServiceContext();
  const [rule, { options }, fmt] = await Promise.all([
    loadRule(ctx, id),
    loadRuleOptions(ctx),
    getFormatter(),
  ]);
  return (
    <section className="flex flex-col gap-6">
      <Link href="/rules" className="text-sm text-zinc-500 hover:underline">
        ← Rules
      </Link>
      <h1 className="text-2xl font-semibold">{rule.name}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Saving changes this Rule for future imports and Manual transactions only.{' '}
        <Link href={historyHref({ entityType: 'rule', entityId: rule.id })} className="underline">
          Rule History
        </Link>
        {' · '}
        <Link href={historyHref({ actorType: 'rule', actorId: rule.id })} className="underline">
          Changes made by this Rule
        </Link>
      </p>
      <RuleForm
        initial={ruleToDraft(rule, fmt)}
        options={options}
        action={saveRuleAction.bind(null, rule.id)}
        submitLabel="Save Rule"
      />
    </section>
  );
}
