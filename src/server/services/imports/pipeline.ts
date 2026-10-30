import type { Queryable } from '@/server/db/client';
import { IMPORT_FORMAT_LABELS, type ImportFormat } from '../accounts';
import { ValidationError } from '../errors';
import { fingerprintEntries } from './fingerprint';
import {
  parserFor,
  UnreadableFileError,
  type BankAccountId,
  type ParsedEntry,
  type ParsedStatement,
} from './parsers';
import {
  reconcile,
  statementOpeningMinor,
  type AccountBalances,
  type Reconciliation,
} from './reconcile';

/**
 * The import pipeline: parse → check against the Account → Fingerprint → classify →
 * reconcile → preview. Each stage is a function below; `buildPreview` runs them in order.
 * Later stages (Rules #15, Transfer candidates) slot in after `reconcile`.
 */

/** The Account fields the pipeline needs. */
export interface ImportAccount {
  id: string;
  currency: string;
  iban: string | null;
  importFormat: ImportFormat | null;
}

/**
 * `new`: will be added on commit. `duplicate`: same Fingerprint as a Transaction the Account
 * already holds (or an earlier entry of the same file), skipped silently (spec 21).
 */
export type EntryStatus = 'new' | 'duplicate';

export interface PreviewEntry extends ParsedEntry {
  fingerprint: string;
  status: EntryStatus;
}

export interface PreviewBody {
  /**
   * `openingBalanceMinor` is the file's opening balance: the one it states or, for a file with
   * a closing balance only (OFX), the one derived from it (see `isOpeningBalanceDerived`).
   */
  statement: Pick<
    ParsedStatement,
    'from' | 'to' | 'currency' | 'openingBalanceMinor' | 'closingBalanceMinor'
  >;
  /** True when the file states no opening balance and it was computed as closing − entries. */
  isOpeningBalanceDerived: boolean;
  /** Oldest first. */
  entries: PreviewEntry[];
  counts: { total: number; new: number; duplicate: number };
  reconciliation: Reconciliation;
  /**
   * On an Account with no Transactions: the opening balance the file implies (stated, or derived
   * from the closing balance), dated the first day of the period. Committing can accept it.
   */
  proposedOpeningBalance: { amountMinor: number; date: string } | null;
}

/** Stage 1: parse the file with the Account's format. Wrong-format files are rejected here. */
export function parseFile(account: ImportAccount, content: Uint8Array): ParsedStatement {
  if (!account.importFormat) {
    throw new ValidationError('This Account has no Import format, so files cannot be imported');
  }
  const label = IMPORT_FORMAT_LABELS[account.importFormat];
  const parser = parserFor(account.importFormat);
  if (!parser) throw new ValidationError(`${label} files cannot be imported yet`);
  try {
    return parser.parse(content);
  } catch (error: unknown) {
    if (error instanceof UnreadableFileError) {
      throw new ValidationError(
        `This file doesn't match the Account's Import format (${label}): ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Whether a file's bank account identifiers (OFX `BANKID` / `BRANCHID` / `ACCTID`) fit the
 * IBAN. A French IBAN's BBAN is the bank code, the branch code, the account number and a key,
 * in that order, so the BBAN must start with the bank and branch codes and then hold the
 * account number. Identifiers the file leaves out are not checked.
 */
function ibanHoldsBankAccount(iban: string, bankAccount: BankAccountId): boolean {
  const bban = iban.slice(4);
  const prefix = `${bankAccount.bankId ?? ''}${bankAccount.branchId ?? ''}`;
  if (!bban.startsWith(prefix)) return false;
  return !bankAccount.accountId || bban.slice(prefix.length).includes(bankAccount.accountId);
}

/** Stage 2: the file must be this Account's statement (IBAN or bank identifiers, Currency). */
export function checkStatementAccount(account: ImportAccount, statement: ParsedStatement): void {
  if (statement.iban && account.iban && statement.iban !== account.iban) {
    throw new ValidationError(
      `This file is for IBAN ${statement.iban}, but this Account's IBAN is ${account.iban}`,
    );
  }
  const { bankAccount } = statement;
  if (bankAccount && account.iban && !ibanHoldsBankAccount(account.iban, bankAccount)) {
    const named = [
      bankAccount.bankId && `bank ${bankAccount.bankId}`,
      bankAccount.branchId && `branch ${bankAccount.branchId}`,
      bankAccount.accountId && `account ${bankAccount.accountId}`,
    ].filter(Boolean);
    throw new ValidationError(
      `This file is for ${named.join(', ')}, which is not this Account (IBAN ${account.iban})`,
    );
  }
  if (statement.currency !== account.currency) {
    throw new ValidationError(
      `This file is in ${statement.currency}, but this Account is in ${account.currency}`,
    );
  }
  const foreign = statement.entries.find((entry) => entry.currency !== account.currency);
  if (foreign) {
    throw new ValidationError(
      `An entry of ${foreign.bookingDate} is in ${foreign.currency}, but this Account is in ${account.currency}`,
    );
  }
}

/** Stages 3 and 4: Fingerprint each entry and classify it against the Account's Transactions. */
async function classifyEntries(
  db: Queryable,
  account: ImportAccount,
  entries: readonly ParsedEntry[],
): Promise<PreviewEntry[]> {
  const fingerprints = fingerprintEntries(account.id, entries);
  const existing = await db.query<{ fingerprint: string }>(
    `SELECT fingerprint FROM "transaction" WHERE account_id = $1 AND fingerprint = ANY($2::text[])`,
    [account.id, fingerprints],
  );
  const known = new Set(existing.rows.map((row) => row.fingerprint));
  return entries.map((entry, index) => {
    const fingerprint = fingerprints[index]!;
    const status: EntryStatus = known.has(fingerprint) ? 'duplicate' : 'new';
    known.add(fingerprint);
    return { ...entry, fingerprint, status };
  });
}

/** The first day of the statement: its stated start, or else its first entry's booking date. */
function periodStart(statement: ParsedStatement): string | null {
  return statement.from ?? statement.entries[0]?.bookingDate ?? null;
}

function periodEnd(statement: ParsedStatement): string | null {
  return statement.to ?? statement.entries.at(-1)?.bookingDate ?? null;
}

async function loadBalances(
  db: Queryable,
  accountId: string,
  statement: ParsedStatement,
): Promise<AccountBalances> {
  const result = await db.query<AccountBalances>(
    `SELECT EXISTS (SELECT 1 FROM "transaction" t WHERE t.account_id = a.id) AS "hasTransactions",
            a.opening_balance_minor + COALESCE((SELECT sum(t.amount_minor) FROM "transaction" t
              WHERE t.account_id = a.id AND ($2::date IS NULL OR t.booking_date < $2)), 0)::bigint
              AS "balanceBeforePeriodMinor",
            a.opening_balance_minor + COALESCE((SELECT sum(t.amount_minor) FROM "transaction" t
              WHERE t.account_id = a.id AND ($3::date IS NULL OR t.booking_date <= $3)), 0)::bigint
              AS "balanceAtPeriodEndMinor"
     FROM account a WHERE a.id = $1`,
    [accountId, periodStart(statement), periodEnd(statement)],
  );
  return result.rows[0]!;
}

/**
 * Runs the stages after parsing against the Account's current Transactions. Read-only, so a
 * preview can be rebuilt at any time; commit rebuilds it inside its transaction.
 */
export async function buildPreview(
  db: Queryable,
  account: ImportAccount,
  statement: ParsedStatement,
): Promise<PreviewBody> {
  checkStatementAccount(account, statement);
  const entries = await classifyEntries(db, account, statement.entries);
  const newEntries = entries.filter((entry) => entry.status === 'new');
  const balances = await loadBalances(db, account.id, statement);
  const opening = statementOpeningMinor(statement);
  const start = periodStart(statement);
  const { from, to, currency, closingBalanceMinor } = statement;
  return {
    statement: { from, to, currency, openingBalanceMinor: opening, closingBalanceMinor },
    isOpeningBalanceDerived: statement.openingBalanceMinor === null && opening !== null,
    entries,
    counts: {
      total: entries.length,
      new: newEntries.length,
      duplicate: entries.length - newEntries.length,
    },
    reconciliation: reconcile(statement, newEntries, balances),
    proposedOpeningBalance:
      !balances.hasTransactions && opening !== null && start !== null
        ? { amountMinor: opening, date: start }
        : null,
  };
}
