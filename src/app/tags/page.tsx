import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { listTags } from '@/server/services/tags';
import { listTransactions } from '@/server/services/transactions';
import { summarizeTags } from './prototype-data';
import { VARIANT_A_NAME, VariantA } from './prototype-variant-a';
import { VARIANT_B_NAME, VariantB } from './prototype-variant-b';
import { VARIANT_C_NAME, VariantC } from './prototype-variant-c';

export const metadata: Metadata = { title: 'Tags · Finance Manager' };

/*
 * PROTOTYPE — three variants of the Tags page, switchable via `?variant=A|B|C`, on the existing
 * `/tags` route. They use the existing Tag server actions; the prototype adds no mutations.
 */
const VARIANTS = [
  { key: 'A', name: VARIANT_A_NAME },
  { key: 'B', name: VARIANT_B_NAME },
  { key: 'C', name: VARIANT_C_NAME },
];

const RECENT_COUNT = 10;

interface TagsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const param = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

export default async function TagsPage({ searchParams }: TagsPageProps) {
  const ctx = await getServiceContext();
  const [tags, fmt, params] = await Promise.all([listTags(ctx), getFormatter(), searchParams]);
  const summaries = await summarizeTags(ctx, tags);
  const requested = param(params.variant) ?? 'A';
  const variant = VARIANTS.some((v) => v.key === requested) ? requested : 'A';
  const tagId = param(params.tag);
  const picked = summaries.find((summary) => summary.tag.id === tagId);
  const selectedA = picked ?? summaries[0];
  const recent =
    variant === 'A' && selectedA
      ? (await listTransactions(ctx, { tagId: selectedA.tag.id, pageSize: RECENT_COUNT }))
          .transactions
      : [];

  return (
    <>
      {variant === 'A' && (
        <VariantA
          summaries={summaries}
          selected={selectedA}
          recent={recent}
          query={param(params.q) ?? ''}
          fmt={fmt}
        />
      )}
      {variant === 'B' && <VariantB summaries={summaries} sort={param(params.sort)} fmt={fmt} />}
      {variant === 'C' && <VariantC summaries={summaries} selected={picked} fmt={fmt} />}
      <Suspense>
        <PrototypeSwitcher variants={VARIANTS} current={variant} />
      </Suspense>
    </>
  );
}
