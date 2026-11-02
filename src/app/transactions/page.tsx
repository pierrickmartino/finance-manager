import type { Metadata } from 'next';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { listAccounts } from '@/server/services/accounts';
import { listCategoryGroups } from '@/server/services/categories';
import { listPayees } from '@/server/services/payees';
import { listTags } from '@/server/services/tags';
import { ServiceError } from '@/server/services/errors';
import {
  listTransactions,
  type TransactionPage,
  type TransactionQuery,
} from '@/server/services/transactions';
import type { VariantProps } from './_prototype/shared';
import { VARIANT_A_NAME, VariantA } from './_prototype/variant-a';
import { VARIANT_B_NAME, VariantB } from './_prototype/variant-b';
import { VARIANT_C_NAME, VariantC } from './_prototype/variant-c';
import { VARIANT_D_NAME, VariantD } from './_prototype/variant-d';
import { pickSelected, readTransactionSearch } from './search';

export const metadata: Metadata = { title: 'Transactions · Finance Manager' };

interface TransactionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function loadPage(
  query: TransactionQuery | null,
): Promise<{ page: TransactionPage | null; error: string | null }> {
  if (!query) return { page: null, error: null };
  try {
    return { page: await listTransactions(await getServiceContext(), query), error: null };
  } catch (error: unknown) {
    if (error instanceof ServiceError) return { page: null, error: error.message };
    throw error;
  }
}

/**
 * Master / detail: the filters in a rail, the matching Transactions, and (from `xl` up) a
 * preview of the selected one, so reviewing many Transactions never leaves the page.
 */
export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const fmt = await getFormatter();
  const params = await searchParams;
  const search = readTransactionSearch(params, fmt.settings.numberFormat);
  const ctx = await getServiceContext();
  const [{ page, error: queryError }, accounts, groups, payees, tags] = await Promise.all([
    loadPage(search.query),
    listAccounts(ctx),
    listCategoryGroups(ctx),
    listPayees(ctx),
    listTags(ctx),
  ]);
  const error = search.error ?? queryError;
  const selected = page ? pickSelected(page.transactions, search.selected) : null;

  const variant = typeof params.variant === 'string' ? params.variant : 'A';
  const props: VariantProps = {
    fmt,
    values: search.values,
    lists: { accounts, groups, payees, tags },
    page,
    error,
    selected,
    variant,
  };

  // PROTOTYPE: four layouts of this page, switched with ?variant= (see _prototype/).
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

const VARIANTS = [
  { key: 'A', name: VARIANT_A_NAME },
  { key: 'B', name: VARIANT_B_NAME },
  { key: 'C', name: VARIANT_C_NAME },
  { key: 'D', name: VARIANT_D_NAME },
];
