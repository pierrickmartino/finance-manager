/**
 * PROTOTYPE (Tremor redesign), throwaway: fills a scratch database with two years of
 * demo data so the ?variant= prototypes have something to draw. Wipe me.
 *
 *   pnpm prototype:seed   # prints the session cookie to sign in with
 */
import { TOTP, Secret } from 'otpauth';
import { createDb } from '../src/server/db/client';
import type { ServiceContext } from '../src/server/services/context';
import { completeSetup, createTotpEnrolment } from '../src/server/services/auth';
import { createBank } from '../src/server/services/banks';
import { createAccount } from '../src/server/services/accounts';
import { seedStarterCategories, listCategoryGroups } from '../src/server/services/categories';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { editClassification } from '../src/server/services/transactions/classification';

const db = createDb(process.env.DATABASE_URL!);
const ctx: ServiceContext = { db, actor: { type: 'manual', id: null } };

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const enrol = createTotpEnrolment();
  const code = new TOTP({ secret: Secret.fromBase32(enrol.secret) }).generate();
  const { session } = await completeSetup(ctx, {
    password: 'prototype passphrase',
    totpSecret: enrol.secret,
    totpCode: code,
  });

  await seedStarterCategories(ctx);
  const groups = await listCategoryGroups(ctx);
  const cats = new Map(groups.flatMap((g) => g.categories.map((c) => [c.name, c.id] as const)));
  const pick = (name: string) => cats.get(name) ?? [...cats.values()][0];
  console.log('categories:', [...cats.keys()].join(', '));

  const ubs = await createBank(ctx, { name: 'UBS' });
  const postfinance = await createBank(ctx, { name: 'PostFinance' });
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - 24, 1);
  const openingDate = iso(start);
  const current = await createAccount(ctx, {
    bankId: ubs.id,
    name: 'Household',
    currency: 'CHF',
    kind: 'current',
    openingBalanceMinor: 850_000,
    openingDate,
  });
  const savings = await createAccount(ctx, {
    bankId: ubs.id,
    name: 'Savings',
    currency: 'CHF',
    kind: 'savings',
    openingBalanceMinor: 4_200_000,
    openingDate,
  });
  const pillar = await createAccount(ctx, {
    bankId: postfinance.id,
    name: 'Pillar 3a',
    currency: 'CHF',
    kind: '3a',
    openingBalanceMinor: 2_100_000,
    openingDate,
  });
  const card = await createAccount(ctx, {
    bankId: postfinance.id,
    name: 'Everyday card',
    currency: 'CHF',
    kind: 'current',
    openingBalanceMinor: 120_000,
    openingDate,
  });

  const recurring: [string, string, number, string][] = [
    ['Salary ACME AG', 'ACME AG', 920_000, 'Salary'],
    ['Rent Wohnung Zürich', 'Immo Verwaltung', -265_000, 'Rent'],
    ['Swisscom mobile', 'Swisscom', -6_990, 'Utilities'],
    ['CSS health insurance', 'CSS', -48_000, 'Health insurance'],
    ['SBB GA', 'SBB', -32_000, 'Public transport'],
    ['Netflix', 'Netflix', -2_090, 'Subscriptions'],
  ];
  const variable: [string, string, number, string][] = [
    ['Migros', 'Migros', -9_500, 'Groceries'],
    ['Coop', 'Coop', -7_800, 'Groceries'],
    ['Restaurant Hiltl', 'Hiltl', -8_400, 'Restaurants'],
    ['Galaxus order', 'Galaxus', -15_900, 'Clothing'],
    ['Apotheke', 'Amavita', -3_200, 'Medical'],
    ['Kino Arena', 'Arena Cinemas', -4_400, 'Leisure'],
    ['Shell fuel', 'Shell', -8_900, 'Fuel'],
  ];

  let made = 0;
  for (let m = 0; m < 25; m++) {
    const month = new Date(start);
    month.setUTCMonth(start.getUTCMonth() + m);
    for (const [desc, payee, amount, cat] of recurring) {
      const d = new Date(month);
      d.setUTCDate(desc.startsWith('Salary') ? 25 : 1 + Math.floor(rand() * 5));
      if (d > new Date()) continue;
      const tx = await createManualTransaction(ctx, {
        accountId: current.id,
        bookingDate: iso(d),
        amountMinor: Math.round(amount * (desc.startsWith('Salary') && m % 12 === 11 ? 2 : 1)),
        description: desc,
        counterpartyName: payee,
      });
      await editClassification(ctx, tx.id, { payeeName: payee, categoryId: pick(cat) });
      made++;
    }
    const count = 14 + Math.floor(rand() * 10);
    let cardSpend = 0;
    for (let i = 0; i < count; i++) {
      const [desc, payee, amount, cat] = variable[Math.floor(rand() * variable.length)]!;
      const d = new Date(month);
      d.setUTCDate(1 + Math.floor(rand() * 27));
      if (d > new Date()) continue;
      const onCard = rand() < 0.6;
      const amountMinor = Math.round(amount * (0.5 + rand()));
      if (onCard) cardSpend += amountMinor;
      const tx = await createManualTransaction(ctx, {
        accountId: onCard ? card.id : current.id,
        bookingDate: iso(d),
        amountMinor,
        description: desc,
        counterpartyName: payee,
      });
      // Leave some unclassified so the Unclassified count is not zero.
      if (rand() < 0.9) {
        await editClassification(ctx, tx.id, { payeeName: payee, categoryId: pick(cat) });
      }
      made++;
    }
    const d = new Date(month);
    d.setUTCDate(27);
    if (d <= new Date() && cardSpend) {
      // Card repayment: out of the household Account, into the card (left as a plain pair).
      await createManualTransaction(ctx, {
        accountId: current.id,
        bookingDate: iso(d),
        amountMinor: cardSpend,
        description: 'Card repayment',
        counterpartyName: 'PostFinance',
      });
      await createManualTransaction(ctx, {
        accountId: card.id,
        bookingDate: iso(d),
        amountMinor: -cardSpend,
        description: 'Repayment received',
        counterpartyName: null,
      });
    }
    if (d <= new Date()) {
      await createManualTransaction(ctx, {
        accountId: savings.id,
        bookingDate: iso(d),
        amountMinor: 150_000 + Math.floor(rand() * 50_000),
        description: 'Monthly savings',
        counterpartyName: null,
      });
      if (month.getUTCMonth() === 11) {
        await createManualTransaction(ctx, {
          accountId: pillar.id,
          bookingDate: iso(d),
          amountMinor: 705_600,
          description: '3a contribution',
          counterpartyName: null,
        });
      }
    }
  }
  console.log(`transactions: ${made}`);
  console.log(`SESSION_TOKEN=${session.token}`);
  await db.end();
}

main().catch(async (error) => {
  console.error(error);
  await db.end();
  process.exit(1);
});
