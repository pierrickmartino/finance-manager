import type { Queryable } from '@/server/db/client';
import { IMPORT_FORMAT_LABELS, type ImportFormat } from '../accounts';
import { ValidationError } from '../errors';
import { SELECT_TRANSACTION, TRANSACTION_ORDER, type Transaction } from '../transactions/model';
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
 * `near_duplicate`: a different Fingerprint, but the Account already holds a Transaction with
 * the same amount and booking date (spec 22). The user keeps or skips it; skip by default.
 */
export type EntryStatus = 'new' | 'duplicate' | 'near_duplicate';

export interface PreviewEntry extends ParsedEntry {
  fingerprint: string;
  status: EntryStatus;
  /** For a `near_duplicate`: the Account's Transactions it may repeat. Empty otherwise. */
  nearDuplicates: Transaction[];
}

export type NearDuplicateDecision = 'keep' | 'skip';
/** The user's choice per near-duplicate entry, keyed by the entry's Fingerprint. */
export type NearDuplicateDecisions = Readonly<Record<string, NearDuplicateDecision>>;

/** Whether committing adds the entry: new ones always, near-duplicates only when kept. */
export function isAdded(entry: PreviewEntry, decisions: NearDuplicateDecisions): boolean {
  if (entry.status === 'near_duplicate') return decisions[entry.fingerprint] === 'keep';
  return entry.status === 'new';
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
  /** The entries committing adds, given the near-duplicate decisions (skip by default). */
  added: PreviewEntry[];
  counts: { total: number; new: number; duplicate: number; nearDuplicate: number };
  /** Reconciles with the `added` entries. */
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

const sameDayAmount = (bookingDate: string, amountMinor: number): string =>
  `${bookingDate}|${amountMinor}`;

/**
 * The Account's Transactions with the booking date and amount of one of the entries, grouped by
 * that pair. Manual transactions count too: a Manual one entered before the bank file arrives
 * is the typical near-duplicate.
 */
async function loadSameDayAmounts(
  db: Queryable,
  accountId: string,
  entries: readonly ParsedEntry[],
): Promise<Map<string, Transaction[]>> {
  const byKey = new Map<string, Transaction[]>();
  if (entries.length === 0) return byKey;
  const result = await db.query<Transaction>(
    `${SELECT_TRANSACTION}
     WHERE t.account_id = $1
       AND (t.booking_date, t.amount_minor) IN (
         SELECT * FROM unnest($2::date[], $3::bigint[]))
     ORDER BY ${TRANSACTION_ORDER}`,
    [accountId, entries.map((e) => e.bookingDate), entries.map((e) => e.amountMinor)],
  );
  for (const row of result.rows) {
    const key = sameDayAmount(row.bookingDate, row.amountMinor);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  return byKey;
}

/**
 * Stages 3 and 4: Fingerprint each entry and classify it against the Account's Transactions:
 * a known Fingerprint is a duplicate; otherwise an existing Transaction with the same booking
 * date and amount makes it a near-duplicate; otherwise it is new.
 */
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
  const sameDayAmounts = await loadSameDayAmounts(db, account.id, entries);
  return entries.map((entry, index) => {
    const fingerprint = fingerprints[index]!;
    const isDuplicate = known.has(fingerprint);
    known.add(fingerprint);
    const candidates = isDuplicate
      ? []
      : (sameDayAmounts.get(sameDayAmount(entry.bookingDate, entry.amountMinor)) ?? []);
    const status: EntryStatus = isDuplicate
      ? 'duplicate'
      : candidates.length > 0
        ? 'near_duplicate'
        : 'new';
    return { ...entry, fingerprint, status, nearDuplicates: candidates };
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
 * preview can be rebuilt at any time; commit rebuilds it inside its transaction with the
 * user's near-duplicate decisions (none: every near-duplicate is skipped).
 */
export async function buildPreview(
  db: Queryable,
  account: ImportAccount,
  statement: ParsedStatement,
  decisions: NearDuplicateDecisions = {},
): Promise<PreviewBody> {
  checkStatementAccount(account, statement);
  const entries = await classifyEntries(db, account, statement.entries);
  const newEntries = entries.filter((entry) => entry.status === 'new');
  const added = entries.filter((entry) => isAdded(entry, decisions));
  const balances = await loadBalances(db, account.id, statement);
  const opening = statementOpeningMinor(statement);
  const start = periodStart(statement);
  const { from, to, currency, closingBalanceMinor } = statement;
  return {
    statement: { from, to, currency, openingBalanceMinor: opening, closingBalanceMinor },
    isOpeningBalanceDerived: statement.openingBalanceMinor === null && opening !== null,
    entries,
    added,
    counts: {
      total: entries.length,
      new: newEntries.length,
      duplicate: entries.filter((entry) => entry.status === 'duplicate').length,
      nearDuplicate: entries.filter((entry) => entry.status === 'near_duplicate').length,
    },
    reconciliation: reconcile(statement, added, balances),
    proposedOpeningBalance:
      !balances.hasTransactions && opening !== null && start !== null
        ? { amountMinor: opening, date: start }
        : null,
  };
}
