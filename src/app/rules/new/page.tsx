import type { Metadata } from 'next';
import Link from 'next/link';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { saveRuleAction } from '../actions';
import { loadRuleOptions } from '../load';
import { ruleToDraft } from '../rule-draft';
import { RuleForm } from '../rule-form';

export const metadata: Metadata = { title: 'New Rule · Finance Manager' };

export default async function NewRulePage() {
  const ctx = await getServiceContext();
  const [{ options }, fmt] = await Promise.all([loadRuleOptions(ctx), getFormatter()]);
  return (
    <section className="flex flex-col gap-6">
      <Link href="/rules" className="text-sm text-zinc-500 hover:underline">
        ← Rules
      </Link>
      <h1 className="text-2xl font-semibold">New Rule</h1>
      <RuleForm
        initial={ruleToDraft(null, fmt)}
        options={options}
        action={saveRuleAction.bind(null, null)}
        submitLabel="Create Rule"
      />
    </section>
  );
}
