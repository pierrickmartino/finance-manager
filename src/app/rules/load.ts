import 'server-only';
import type { ServiceContext } from '@/server/services/context';
import { listAccounts } from '@/server/services/accounts';
import { listCategoryGroups } from '@/server/services/categories';
import { listPayees } from '@/server/services/payees';
import { listTags } from '@/server/services/tags';
import type { RuleNames } from './describe';
import type { RuleFormOptions } from './rule-form';

/** What the Rule pages offer and show: Accounts, Payees, Categories and Tags by name. */
export async function loadRuleOptions(
  ctx: ServiceContext,
): Promise<{ options: RuleFormOptions; names: RuleNames }> {
  const [accounts, payees, groups, tags] = await Promise.all([
    listAccounts(ctx),
    listPayees(ctx),
    listCategoryGroups(ctx),
    listTags(ctx),
  ]);
  const pick = <T extends { id: string; name: string }>(items: T[]) =>
    items.map(({ id, name }) => ({ id, name }));
  const options: RuleFormOptions = {
    accounts: accounts.map((account) => ({
      id: account.id,
      name: `${account.bankName} · ${account.name}`,
    })),
    payees: pick(payees),
    categoryGroups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      categories: pick(group.categories),
    })),
    tags: pick(tags),
  };
  const byId = (items: { id: string; name: string }[]) =>
    new Map(items.map((item) => [item.id, item.name]));
  return {
    options,
    names: {
      accounts: byId(options.accounts),
      payees: byId(options.payees),
      categories: new Map(
        groups.flatMap((group) =>
          group.categories.map((category) => [category.id, `${group.name} › ${category.name}`]),
        ),
      ),
      tags: byId(options.tags),
    },
  };
}
