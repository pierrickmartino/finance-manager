'use client';

import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { CARD_CLASS } from '@/components/surface';
import { CreateBankForm } from './create-bank-form';
import { banksHref } from './view';

/** The detail pane's New Bank form; a created Bank is selected right away. */
export function NewBankPanel() {
  const headingId = useId();
  const router = useRouter();

  return (
    <section aria-labelledby={headingId} className={`${CARD_CLASS} flex flex-col gap-3 p-5`}>
      <h2 id={headingId} className="text-lg font-semibold">
        New Bank
      </h2>
      <p className="text-sm text-zinc-500">
        The institution holding one or more Accounts. Add its Accounts once it exists.
      </p>
      <CreateBankForm onCreated={(bank) => router.push(banksHref(bank.id), { scroll: false })} />
    </section>
  );
}
