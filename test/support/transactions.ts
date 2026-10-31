import type { Queryable } from '@/server/db/client';

/**
 * Test seeding for Transactions, written straight to the database so query tests control every
 * bank field. Use the service operations (imports, Manual transactions) when the test is about
 * how Transactions get created; use this when it is about reading them back.
 */
export interface SeedTransaction {
  bookingDate: string;
  valueDate?: string | null;
  amountMinor: number;
  rawDescription?: string;
  counterpartyName?: string | null;
  counterpartyIban?: string | null;
  paymentReference?: string | null;
  isManual?: boolean;
}

/** Inserts Transactions into an Account, imported ones under one seeded Import. Returns their ids. */
export async function seedTransactions(
  db: Queryable,
  account: { id: string; currency: string },
  rows: SeedTransaction[],
): Promise<string[]> {
  const needsImport = rows.some((row) => !row.isManual);
  const importId = needsImport ? await seedImport(db, account.id) : null;
  const ids: string[] = [];
  for (const [index, row] of rows.entries()) {
    const isManual = row.isManual ?? false;
    const result = await db.query<{ id: string }>(
      `INSERT INTO "transaction" (account_id, import_id, is_manual, booking_date, amount_minor,
         currency, fingerprint, raw_description, counterparty_name, counterparty_iban,
         payment_reference, value_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        account.id,
        isManual ? null : importId,
        isManual,
        row.bookingDate,
        row.amountMinor,
        account.currency,
        isManual ? null : `seed-${importId}-${index}`,
        row.rawDescription ?? '',
        row.counterpartyName ?? null,
        row.counterpartyIban ?? null,
        row.paymentReference ?? null,
        row.valueDate ?? null,
      ],
    );
    ids.push(result.rows[0]!.id);
  }
  return ids;
}

async function seedImport(db: Queryable, accountId: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO import (account_id, file_name, import_format, added_count, duplicate_count,
       reconciliation_status, reconciliation)
     VALUES ($1, 'seed.csv', 'ubs_csv', 0, 0, 'ok', '{}') RETURNING id`,
    [accountId],
  );
  return result.rows[0]!.id;
}
