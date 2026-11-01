import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { listAccountBalances } from '@/server/services/accounts/balances';
import { listBanks } from '@/server/services/banks';
import { summarizeBanks } from './prototype-data';
import { VARIANT_A_NAME, VariantA } from './prototype-variant-a';
import { VARIANT_B_NAME, VariantB } from './prototype-variant-b';
import { VARIANT_C_NAME, VariantC } from './prototype-variant-c';

export const metadata: Metadata = { title: 'Banks · Finance Manager' };

/*
 * PROTOTYPE — three variants of the Banks page, switchable via `?variant=A|B|C`, on the
 * existing `/banks` route. Read-only apart from the existing Add Bank form.
 */
const VARIANTS = [
  { key: 'A', name: VARIANT_A_NAME },
  { key: 'B', name: VARIANT_B_NAME },
  { key: 'C', name: VARIANT_C_NAME },
];

interface BanksPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const param = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

export default async function BanksPage({ searchParams }: BanksPageProps) {
  const ctx = await getServiceContext();
  const params = await searchParams;
  const [banks, balances, fmt] = await Promise.all([
    listBanks(ctx),
    listAccountBalances(ctx),
    getFormatter(),
  ]);
  const summaries = summarizeBanks(banks, balances);
  const requested = param(params.variant) ?? 'A';
  const variant = VARIANTS.some((v) => v.key === requested) ? requested : 'A';

  return (
    <>
      {variant === 'A' && <VariantA summaries={summaries} fmt={fmt} />}
      {variant === 'B' && (
        <VariantB summaries={summaries} selectedId={param(params.bank)} fmt={fmt} />
      )}
      {variant === 'C' && <VariantC summaries={summaries} fmt={fmt} />}
      <Suspense>
        <PrototypeSwitcher variants={VARIANTS} current={variant} />
      </Suspense>
    </>
  );
}
