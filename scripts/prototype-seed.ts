/** PROTOTYPE, wipe me: seeds a scratch DB with grouped Categories for /analytics?variant=. */
import { createDb } from '../src/server/db/client';
import { migrate } from '../src/server/db/migrate';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { editClassification } from '../src/server/services/transactions';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { createDatabase, databaseUrl, dropDatabase } from '../test/support/postgres';

const NAME = 'proto_wipe_me';
const TREE = {
  income: {
    Income: { Salary: 7800, Bonus: 900, 'Side gigs': 350 },
    Investments: { Dividends: 120, Interest: 15 },
  },
  expense: {
    Housing: { Rent: -2100, Utilities: -180, Insurance: -95 },
    Food: { Groceries: -620, Restaurants: -240, Coffee: -45 },
    Transport: { 'Public transport': -85, Fuel: -110 },
    Leisure: { Holidays: -400, Hobbies: -90, Subscriptions: -42 },
  },
  capital: { Savings: { '3a pillar': -580, 'ETF plan': -500 } },
} as const;

async function main() {
  await dropDatabase(NAME).catch(() => {});
  await createDatabase(NAME);
  const url = databaseUrl(NAME);
  await migrate(url, { quiet: true });
  const db = createDb(url);
  const ctx = { db, actor: { type: 'manual' as const, id: null } };
  const bank = await createBank(ctx, { name: 'Demo bank' });
  const account = await createAccount(ctx, {
    bankId: bank.id,
    kind: 'current',
    importFormat: null,
    name: 'Main',
    currency: 'CHF',
    openingBalanceMinor: 10_000_00,
    openingDate: '2024-01-01',
  });
  for (const [name, kind, balance] of [
    ['Savings', 'savings', 42_000_00],
    ['Pillar 3a', '3a', 31_500_00],
  ] as const) {
    await createAccount(ctx, {
      bankId: bank.id,
      kind,
      importFormat: null,
      name,
      currency: 'CHF',
      openingBalanceMinor: balance,
      openingDate: '2024-01-01',
    });
  }
  const today = new Date();
  let seed = 7;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (const [type, groups] of Object.entries(TREE)) {
    for (const [groupName, cats] of Object.entries(groups)) {
      const group = await createCategoryGroup(ctx, { name: groupName, type: type as 'income' });
      for (const [catName, base] of Object.entries(cats as Record<string, number>)) {
        const cat = await createCategory(ctx, { groupId: group.id, name: catName });
        for (let m = 0; m < 12; m++) {
          if (catName === 'Bonus' && m % 6 !== 1) continue;
          if (catName === 'Holidays' && m % 4 !== 0) continue;
          const d = new Date(
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, m === 0 ? 2 : 14),
          );
          const amount = Math.round(base * (0.75 + rand() * 0.5) * 100);
          const t = await createManualTransaction(ctx, {
            accountId: account.id,
            bookingDate: d.toISOString().slice(0, 10),
            amountMinor: amount,
            description: `${catName} ${m}`,
          });
          await editClassification(ctx, t.id, { categoryId: cat.id });
        }
      }
    }
  }
  await db.end();
  console.log(url);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
