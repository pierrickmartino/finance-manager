import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { NotFoundError } from '@/server/services/errors';
import { listCategoryGroups } from '@/server/services/categories';
import { listHistory } from '@/server/services/history';
import { listPayees } from '@/server/services/payees';
import { listTags } from '@/server/services/tags';
import {
  getClassification,
  getTransaction,
  listTransactions,
  type TransactionDetail,
} from '@/server/services/transactions';
import { getTransferCounterpart, listLinkOptions } from '@/server/services/transfers';
import { readTransactionSearch } from '../search';
import type { DetailProps } from './_prototype/shared';
import { VARIANT_A_NAME, VariantA } from './_prototype/variant-a';
import { VARIANT_B_NAME, VariantB } from './_prototype/variant-b';
import { VARIANT_C_NAME, VariantC } from './_prototype/variant-c';
import { VARIANT_D_NAME, VariantD } from './_prototype/variant-d';

export const metadata: Metadata = { title: 'Transaction · Finance Manager' };

interface TransactionPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function loadTransaction(id: string): Promise<TransactionDetail> {
  try {
    return await getTransaction(await getServiceContext(), id);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

const VARIANTS = [
  { key: 'A', name: VARIANT_A_NAME },
  { key: 'B', name: VARIANT_B_NAME },
  { key: 'C', name: VARIANT_C_NAME },
  { key: 'D', name: VARIANT_D_NAME },
];

const param = (value: string | string[] | undefined, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

/**
 * One Transaction (spec 38, 48, 63-65, 116): every bank field read-only, where it came from, its
 * classification with the fields locked against Rules, and its History.
 *
 * PROTOTYPE: four layouts of this page, switched with ?variant=A|B|C|D (see _prototype/).
 * The data loading is today's; only the rendering differs.
 */
export default async function TransactionPage({ params, searchParams }: TransactionPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const variant = param(query.variant, 'A');
  const transaction = await loadTransaction(id);
  const ctx = await getServiceContext();
  const fmt = await getFormatter();
  const [history, classification, groups, payees, tags, counterpart] = await Promise.all([
    listHistory(ctx, { entityType: 'transaction', entityId: transaction.id }),
    getClassification(ctx, transaction.id),
    listCategoryGroups(ctx),
    listPayees(ctx),
    listTags(ctx),
    getTransferCounterpart(ctx, transaction.id),
  ]);
  const listQuery = readTransactionSearch({}, fmt.settings.numberFormat).query;
  const neighbours =
    variant === 'D' && listQuery ? (await listTransactions(ctx, listQuery)).transactions : [];

  const props: DetailProps = {
    transaction,
    fmt,
    classification,
    groups,
    payeeNames: payees.map((payee) => payee.name),
    tagNames: tags.map((tag) => tag.name),
    counterpart,
    linkOptions: counterpart ? [] : await listLinkOptions(ctx, transaction.id),
    history,
    neighbours,
    variant,
    tab: param(query.tab, 'overview'),
  };

  return (
    <>
      {variant === 'B' ? (
        <VariantB {...props} />
      ) : variant === 'C' ? (
        <VariantC {...props} />
      ) : variant === 'D' ? (
        <VariantD {...props} />
      ) : (
        <VariantA {...props} />
      )}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}
