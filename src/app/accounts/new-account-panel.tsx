'use client';

import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { CARD_CLASS } from '@/components/surface';
import type { ActionResult } from '@/server/actions';
import type { Account } from '@/server/services/accounts';
import type { Bank } from '@/server/services/banks';
import { AccountForm } from './account-form';
import { createAccountAction } from './actions';
import { accountsHref } from './view';

/** The detail pane's New Account form; a created Account is selected right away. */
export function NewAccountPanel({ banks, date }: { banks: Bank[]; date: string }) {
  const headingId = useId();
  const router = useRouter();

  async function create(
    previous: ActionResult<Account> | null,
    formData: FormData,
  ): Promise<ActionResult<Account>> {
    const result = await createAccountAction(previous, formData);
    if (result.ok) router.push(accountsHref({ account: result.data.id, date }), { scroll: false });
    return result;
  }

  return (
    <section aria-labelledby={headingId} className={`${CARD_CLASS} flex flex-col gap-3 p-5`}>
      <h2 id={headingId} className="text-lg font-semibold">
        New Account
      </h2>
      <AccountForm banks={banks} action={create} submitLabel="Add Account" />
    </section>
  );
}
