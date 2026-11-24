/**
 * PROTOTYPE, wipe me. Seeds a scratch database (`fm_prototype_wipe_me`) with ~14 months of
 * plausible Transactions so the Analytics variants prototype (?variant=) has something to draw.
 * Run: pnpm exec tsx scripts/prototype-seed-analytics.ts
 */
import pg from 'pg';
import { migrate } from '../src/server/db/migrate';
import { createDb } from '../src/server/db/client';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { editClassification } from '../src/server/services/transactions';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { swissToday } from '../src/server/services/fx/dates';

const NAME = 'fm_prototype_wipe_me';
const ADMIN = 'postgresql://postgres:postgres@localhost:5432/postgres';
const URL_ = `postgresql://postgres:postgres@localhost:5432/${NAME}`;

async function main() {
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${NAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${NAME}`);
  await admin.end();
  await migrate(URL_, { quiet: true });

  const db = createDb(URL_);
  const ctx = { db, actor: { type: 'manual' as const, id: null } };
  const bank = await createBank(ctx, { name: 'Alpine Bank' });
  const current = await createAccount(ctx, {
    bankId: bank.id,
    kind: 'current',
    importFormat: null,
    name: 'Current',
    currency: 'CHF',
    openingBalanceMinor: 8_400_00,
    openingDate: '2025-01-01',
  });
  const savings = await createAccount(ctx, {
    bankId: bank.id,
    kind: 'savings',
    importFormat: null,
    name: 'Savings',
    currency: 'CHF',
    openingBalanceMinor: 42_000_00,
    openingDate: '2025-01-01',
  });

  const inc = await createCategoryGroup(ctx, { name: 'Earnings', type: 'income' });
  const salary = await createCategory(ctx, { groupId: inc.id, name: 'Salary' });
  const freelance = await createCategory(ctx, { groupId: inc.id, name: 'Freelance' });
  const home = await createCategoryGroup(ctx, { name: 'Home', type: 'expense' });
  const life = await createCategoryGroup(ctx, { name: 'Living', type: 'expense' });
  const cat = {
    rent: await createCategory(ctx, { groupId: home.id, name: 'Rent' }),
    utilities: await createCategory(ctx, { groupId: home.id, name: 'Utilities' }),
    groceries: await createCategory(ctx, { groupId: life.id, name: 'Groceries' }),
    dining: await createCategory(ctx, { groupId: life.id, name: 'Dining' }),
    transport: await createCategory(ctx, { groupId: life.id, name: 'Transport' }),
    subs: await createCategory(ctx, { groupId: life.id, name: 'Subscriptions' }),
    health: await createCategory(ctx, { groupId: life.id, name: 'Health' }),
    shopping: await createCategory(ctx, { groupId: life.id, name: 'Shopping' }),
  };

  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const add = async (
    accountId: string,
    date: string,
    minor: number,
    description: string,
    categoryId?: string,
  ) => {
    if (date > swissToday()) return;
    const t = await createManualTransaction(ctx, {
      accountId,
      bookingDate: date,
      amountMinor: minor,
      description,
    });
    if (categoryId) await editClassification(ctx, t.id, { categoryId });
  };

  const [ty, tm] = swissToday().split('-').map(Number) as [number, number];
  for (let i = 14; i >= 0; i--) {
    const d = new Date(Date.UTC(ty!, tm! - 1 - i, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const day = (n: number) => `${ym}-${String(n).padStart(2, '0')}`;
    await add(
      current.id,
      day(25),
      7_850_00 + Math.round(rnd() * 400_00),
      'Salary Acme AG',
      salary.id,
    );
    if (rnd() > 0.5)
      await add(
        current.id,
        day(12),
        600_00 + Math.round(rnd() * 1_400_00),
        'Nova Tech invoice',
        freelance.id,
      );
    await add(current.id, day(1), -2_350_00, 'Rent', cat.rent.id);
    await add(
      current.id,
      day(5),
      -(140_00 + Math.round(rnd() * 90_00)),
      'EWZ electricity',
      cat.utilities.id,
    );
    for (const n of [3, 9, 16, 23])
      await add(
        current.id,
        day(n),
        -(90_00 + Math.round(rnd() * 120_00)),
        'Migros',
        cat.groceries.id,
      );
    for (const n of [7, 19])
      await add(
        current.id,
        day(n),
        -(45_00 + Math.round(rnd() * 110_00)),
        'Restaurant',
        cat.dining.id,
      );
    await add(current.id, day(2), -(85_00 + Math.round(rnd() * 40_00)), 'SBB', cat.transport.id);
    await add(current.id, day(14), -49_00, 'Figma', cat.subs.id);
    await add(current.id, day(15), -18_00, 'Spotify', cat.subs.id);
    if (rnd() > 0.4)
      await add(
        current.id,
        day(18),
        -(60_00 + Math.round(rnd() * 300_00)),
        'Pharmacy',
        cat.health.id,
      );
    await add(
      current.id,
      day(21),
      -(80_00 + Math.round(rnd() * 500_00)),
      'Galaxus',
      cat.shopping.id,
    );
    await add(savings.id, day(27), Math.round(rnd() * 30_00) + 20_00, 'Interest');
  }
  await db.end();
  console.log(`Seeded ${URL_}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
