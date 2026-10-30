import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { mutate, type MutationScope, type ServiceContext } from '../context';
import { ConflictError, isUniqueViolation, NotFoundError, parseInput } from '../errors';
import type { HistorySnapshot } from '../history';
import {
  accountInput,
  type AccountInput,
  type AccountKind,
  type ImportFormat,
  type ValidAccountInput,
} from './input';

export {
  ACCOUNT_KIND_LABELS,
  ACCOUNT_KINDS,
  IMPORT_FORMAT_LABELS,
  IMPORT_FORMATS,
  type AccountInput,
  type AccountKind,
  type ImportFormat,
} from './input';

export interface Account {
  id: string;
  bankId: string;
  bankName: string;
  name: string;
  currency: string;
  iban: string | null;
  kind: AccountKind;
  importFormat: ImportFormat | null;
  /** Integer minor units of the Account's Currency. */
  openingBalanceMinor: number;
  openingDate: string | null;
  archivedAt: Date | null;
  /** Current balance in the Account's own Currency, in minor units. */
  balanceMinor: number;
}

// The balance in the Account's own Currency: the opening balance plus every Transaction.
const NATIVE_BALANCE = `a.opening_balance_minor + COALESCE(
    (SELECT sum(t.amount_minor) FROM "transaction" t WHERE t.account_id = a.id), 0)::bigint`;

const SELECT_ACCOUNT = `
  SELECT a.id, a.bank_id AS "bankId", b.name AS "bankName", a.name, a.currency, a.iban,
         a.kind, a.import_format AS "importFormat",
         a.opening_balance_minor AS "openingBalanceMinor", a.opening_date AS "openingDate",
         a.archived_at AS "archivedAt", ${NATIVE_BALANCE} AS "balanceMinor"
  FROM account a
  JOIN bank b ON b.id = a.bank_id`;

const accountId = z.uuid();
const ACCOUNT_NOT_FOUND = 'Account not found';

/** What History records about an Account. */
function snapshot(account: Account): HistorySnapshot {
  return {
    bankId: account.bankId,
    name: account.name,
    currency: account.currency,
    kind: account.kind,
    iban: account.iban,
    importFormat: account.importFormat,
    openingBalanceMinor: account.openingBalanceMinor,
    openingDate: account.openingDate,
    archivedAt: account.archivedAt?.toISOString() ?? null,
  };
}

async function findAccount(db: Queryable, id: string, lock = false): Promise<Account> {
  if (!accountId.safeParse(id).success) throw new NotFoundError(ACCOUNT_NOT_FOUND);
  const result = await db.query<Account>(
    `${SELECT_ACCOUNT} WHERE a.id = $1${lock ? ' FOR UPDATE OF a' : ''}`,
    [id],
  );
  const account = result.rows[0];
  if (!account) throw new NotFoundError(ACCOUNT_NOT_FOUND);
  return account;
}

async function requireBankName(db: Queryable, bankId: string): Promise<string> {
  const result = await db.query<{ name: string }>('SELECT name FROM bank WHERE id = $1', [bankId]);
  const bank = result.rows[0];
  if (!bank) throw new NotFoundError('Bank not found');
  return bank.name;
}

/** Whether any Transaction belongs to the Account. */
export async function hasTransactions(db: Queryable, id: string): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM "transaction" WHERE account_id = $1) AS "exists"',
    [id],
  );
  return result.rows[0]!.exists;
}

/** Runs a write that may hit the Account unique constraints, mapping them to user messages. */
async function withUniqueChecks<T>(
  input: ValidAccountInput,
  bankName: string,
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (error: unknown) {
    if (isUniqueViolation(error, 'account_iban_unique')) {
      throw new ConflictError(`An Account with IBAN ${input.iban} already exists`);
    }
    if (isUniqueViolation(error, 'account_name_unique')) {
      throw new ConflictError(`${bankName} already has an Account named "${input.name}"`);
    }
    throw error;
  }
}

function accountValues(input: ValidAccountInput): unknown[] {
  return [
    input.bankId,
    input.name,
    input.kind,
    input.currency,
    input.iban,
    input.importFormat,
    input.openingBalanceMinor,
    input.openingDate,
  ];
}

export async function createAccount(ctx: ServiceContext, input: AccountInput): Promise<Account> {
  const values = parseInput(accountInput, input);
  return mutate(ctx, async ({ tx, history }) => {
    const bankName = await requireBankName(tx, values.bankId);
    const inserted = await withUniqueChecks(values, bankName, () =>
      tx.query<{ id: string }>(
        `INSERT INTO account (bank_id, name, kind, currency, iban, import_format,
                              opening_balance_minor, opening_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        accountValues(values),
      ),
    );
    const account = await findAccount(tx, inserted.rows[0]!.id);
    await history.record('account', account.id, null, snapshot(account));
    return account;
  });
}

export async function updateAccount(
  ctx: ServiceContext,
  id: string,
  input: AccountInput,
): Promise<Account> {
  const values = parseInput(accountInput, input);
  return mutate(ctx, async ({ tx, history }) => {
    const before = await findAccount(tx, id, true);
    const bankName = await requireBankName(tx, values.bankId);
    const changesLedger =
      values.importFormat !== before.importFormat || values.currency !== before.currency;
    if (changesLedger && (await hasTransactions(tx, id))) {
      throw new ConflictError(
        "The Import format and Currency can't change once the Account has Transactions",
      );
    }
    await withUniqueChecks(values, bankName, () =>
      tx.query(
        `UPDATE account
         SET bank_id = $1, name = $2, kind = $3, currency = $4, iban = $5, import_format = $6,
             opening_balance_minor = $7, opening_date = $8
         WHERE id = $9`,
        [...accountValues(values), id],
      ),
    );
    const after = await findAccount(tx, id);
    await history.record('account', id, snapshot(before), snapshot(after));
    return after;
  });
}

/** Archives an Account: it is kept, with its Transactions and History, and listed as archived. */
export async function archiveAccount(ctx: ServiceContext, id: string): Promise<Account> {
  return mutate(ctx, async ({ tx, history }) => {
    const before = await findAccount(tx, id, true);
    if (before.archivedAt) throw new ConflictError('This Account is already archived');
    await tx.query('UPDATE account SET archived_at = now() WHERE id = $1', [id]);
    const after = await findAccount(tx, id);
    await history.record('account', id, snapshot(before), snapshot(after));
    return after;
  });
}

export async function getAccount(ctx: ServiceContext, id: string): Promise<Account> {
  return findAccount(ctx.db, id);
}

/** Every Account, active ones first, then by Bank and name. Archived Accounts are included. */
export async function listAccounts(ctx: ServiceContext): Promise<Account[]> {
  const result = await ctx.db.query<Account>(
    `${SELECT_ACCOUNT}
     ORDER BY a.archived_at IS NOT NULL, lower(b.name), lower(a.name), a.id`,
  );
  return result.rows;
}

/**
 * Sets an Account's opening balance and date inside another mutation (an Import confirming the
 * opening balance its file proposes), recording the change in that mutation's Batch.
 */
export async function setOpeningBalance(
  { tx, history }: Pick<MutationScope, 'tx' | 'history'>,
  id: string,
  opening: { amountMinor: number; date: string },
): Promise<void> {
  const before = await findAccount(tx, id, true);
  await tx.query('UPDATE account SET opening_balance_minor = $1, opening_date = $2 WHERE id = $3', [
    opening.amountMinor,
    opening.date,
    id,
  ]);
  await history.record('account', id, snapshot(before), snapshot(await findAccount(tx, id)));
}
