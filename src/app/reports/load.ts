import 'server-only';
import { getServiceContext } from '@/server/app-context';
import { listAccounts } from '@/server/services/accounts';
import { listCategoryGroups } from '@/server/services/categories';
import { ServiceError } from '@/server/services/errors';
import { listPayees } from '@/server/services/payees';
import {
  runWidgetQuery,
  type ReportTable,
  type WidgetQueryInput,
} from '@/server/services/reporting';
import { listTags } from '@/server/services/tags';
import type { QueryFormLists } from './query-form';

/** Runs a Widget query, turning an invalid query into a message for the page. */
export async function loadReport(
  query: WidgetQueryInput,
): Promise<{ report: ReportTable | null; error: string | null }> {
  try {
    return { report: await runWidgetQuery(await getServiceContext(), query), error: null };
  } catch (error: unknown) {
    if (error instanceof ServiceError) return { report: null, error: error.message };
    throw error;
  }
}

/** The choices the Widget query form offers. */
export async function loadQueryFormLists(): Promise<QueryFormLists> {
  const ctx = await getServiceContext();
  const [accounts, groups, payees, tags] = await Promise.all([
    listAccounts(ctx),
    listCategoryGroups(ctx),
    listPayees(ctx),
    listTags(ctx),
  ]);
  return { accounts, groups, payees, tags };
}
