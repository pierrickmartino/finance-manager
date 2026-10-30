import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { setOpeningBalance, type ImportFormat } from '../accounts';
import { mutate, type ServiceContext } from '../context';
import { NotFoundError, parseInput } from '../errors';
import type { HistorySnapshot } from '../history';
import {
  SELECT_TRANSACTION,
  TRANSACTION_ORDER,
  transactionSnapshot,
  type Transaction,
} from '../transactions/model';
import type { ParsedStatement } from './parsers';
import {
  buildPreview,
  parseFile,
  type ImportAccount,
  type PreviewBody,
  type PreviewEntry,
} from './pipeline';
import type { Reconciliation } from './reconcile';

export type { EntryStatus, PreviewEntry } from './pipeline';
export type { BalanceCheck, Reconciliation, RunningBalanceBreak } from './reconcile';

/** Largest bank file accepted, in bytes. Monthly exports are a few tens of kilobytes. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
/** Previews nobody commits or discards are dropped after this long. */
const PREVIEW_TTL = '1 day';
const MAX_FILE_NAME_LENGTH = 255;

/** A previewed, not yet committed Import (spec 20). Nothing is saved until it is committed. */
export interface ImportPreview extends PreviewBody {
  id: string;
  accountId: string;
  fileName: string;
}

/** A committed Import, as the per-Account Imports list shows it (spec 32). */
export interface Import {
  id: string;
  accountId: string;
  fileName: string;
  importFormat: ImportFormat;
  importedAt: Date;
  statementFrom: string | null;
  statementTo: string | null;
  openingBalanceMinor: number | null;
  closingBalanceMinor: number | null;
  addedCount: number;
  duplicateCount: number;
  reconciliationStatus: Reconciliation['status'];
  reconciliation: Reconciliation;
  undoneAt: Date | null;
}

export interface PreviewImportInput {
  accountId: string;
  fileName: string;
  content: Uint8Array;
}

export interface CommitImportInput {
  previewId: string;
  /** Use the opening balance the preview proposes (Account with no history). Default true. */
  acceptOpeningBalance?: boolean;
}

const previewImportInput = z.object({
  accountId: z.uuid({ error: 'Account is required' }),
  fileName: z
    .string()
    .trim()
    .min(1, 'File name is required')
    .max(MAX_FILE_NAME_LENGTH, `File name must be at most ${MAX_FILE_NAME_LENGTH} characters`),
  content: z
    .instanceof(Uint8Array, { error: 'Choose a file to import' })
    .refine((bytes) => bytes.length > 0, 'The file is empty')
    .refine(
      (bytes) => bytes.length <= MAX_IMPORT_FILE_BYTES,
      `The file is larger than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB`,
    ),
});

const commitImportInput = z.object({
  previewId: z.uuid({ error: 'Import preview not found' }),
  acceptOpeningBalance: z.boolean().default(true),
});

const id = z.uuid();
const PREVIEW_NOT_FOUND = 'This Import preview no longer exists. Upload the file again.';

const SELECT_IMPORT = `
  SELECT i.id, i.account_id AS "accountId", i.file_name AS "fileName",
         i.import_format AS "importFormat", i.imported_at AS "importedAt",
         i.statement_from AS "statementFrom", i.statement_to AS "statementTo",
         i.opening_balance_minor AS "openingBalanceMinor",
         i.closing_balance_minor AS "closingBalanceMinor",
         i.added_count AS "addedCount", i.duplicate_count AS "duplicateCount",
         i.reconciliation_status AS "reconciliationStatus", i.reconciliation,
         i.undone_at AS "undoneAt"
  FROM import i`;

async function findImportAccount(
  db: Queryable,
  accountId: string,
  lock = false,
): Promise<ImportAccount> {
  const result = await db.query<ImportAccount>(
    `SELECT id, currency, iban, import_format AS "importFormat" FROM account WHERE id = $1
     ${lock ? 'FOR UPDATE' : ''}`,
    [accountId],
  );
  const account = result.rows[0];
  if (!account) throw new NotFoundError('Account not found');
  return account;
}

interface StoredPreview {
  id: string;
  accountId: string;
  fileName: string;
  statement: ParsedStatement;
}

async function findPreview(db: Queryable, previewId: string, lock = false): Promise<StoredPreview> {
  if (!id.safeParse(previewId).success) throw new NotFoundError(PREVIEW_NOT_FOUND);
  const result = await db.query<StoredPreview>(
    `SELECT id, account_id AS "accountId", file_name AS "fileName", statement
     FROM import_preview WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
    [previewId],
  );
  const preview = result.rows[0];
  if (!preview) throw new NotFoundError(PREVIEW_NOT_FOUND);
  return preview;
}

/**
 * Previews an Import (spec 18-27): parses the file with the Account's Import format, rejects a
 * file of another format or Account, Fingerprints and classifies every entry, reconciles, and
 * stores the parsed file server-side until it is committed or discarded. Saves no Transaction.
 */
export async function previewImport(
  ctx: ServiceContext,
  input: PreviewImportInput,
): Promise<ImportPreview> {
  const values = parseInput(previewImportInput, input);
  if (!id.safeParse(values.accountId).success) throw new NotFoundError('Account not found');
  const account = await findImportAccount(ctx.db, values.accountId);
  const statement = parseFile(account, values.content);
  const body = await buildPreview(ctx.db, account, statement);
  await ctx.db.query(`DELETE FROM import_preview WHERE created_at < now() - $1::interval`, [
    PREVIEW_TTL,
  ]);
  const stored = await ctx.db.query<{ id: string }>(
    `INSERT INTO import_preview (account_id, file_name, statement) VALUES ($1, $2, $3) RETURNING id`,
    [account.id, values.fileName, JSON.stringify(statement)],
  );
  return { id: stored.rows[0]!.id, accountId: account.id, fileName: values.fileName, ...body };
}

/** A stored preview, rebuilt against the Account's current Transactions. */
export async function getImportPreview(
  ctx: ServiceContext,
  previewId: string,
): Promise<ImportPreview> {
  const preview = await findPreview(ctx.db, previewId);
  const account = await findImportAccount(ctx.db, preview.accountId);
  const body = await buildPreview(ctx.db, account, preview.statement);
  return { id: preview.id, accountId: preview.accountId, fileName: preview.fileName, ...body };
}

/** Drops a preview without importing anything. */
export async function discardImport(ctx: ServiceContext, previewId: string): Promise<void> {
  await findPreview(ctx.db, previewId);
  await ctx.db.query('DELETE FROM import_preview WHERE id = $1', [previewId]);
}

function importSnapshot(row: Import): HistorySnapshot {
  return {
    accountId: row.accountId,
    fileName: row.fileName,
    importFormat: row.importFormat,
    statementFrom: row.statementFrom,
    statementTo: row.statementTo,
    openingBalanceMinor: row.openingBalanceMinor,
    closingBalanceMinor: row.closingBalanceMinor,
    addedCount: row.addedCount,
    duplicateCount: row.duplicateCount,
    reconciliationStatus: row.reconciliationStatus,
  };
}

async function insertTransaction(
  tx: Queryable,
  account: ImportAccount,
  importId: string,
  entry: PreviewEntry,
): Promise<Transaction> {
  const result = await tx.query<Transaction>(
    `WITH t AS (
       INSERT INTO "transaction" (account_id, import_id, is_manual, booking_date, value_date,
         amount_minor, currency, fingerprint, bank_reference, raw_description, counterparty_name,
         counterparty_iban, payment_reference, bundled_details)
       VALUES ($1, $2, false, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *)
     ${SELECT_TRANSACTION.replace('FROM "transaction" t', 'FROM t')}`,
    [
      account.id,
      importId,
      entry.bookingDate,
      entry.valueDate,
      entry.amountMinor,
      account.currency,
      entry.fingerprint,
      entry.bankReference,
      entry.rawDescription,
      entry.counterpartyName,
      entry.counterpartyIban,
      entry.paymentReference,
      entry.bundledDetails === null ? null : JSON.stringify(entry.bundledDetails),
    ],
  );
  return result.rows[0]!;
}

/**
 * Commits a previewed Import in one database transaction (spec 31): the Import, its new
 * Transactions, and the proposed opening balance when accepted, all in one History Batch whose
 * actor is the Import. The preview is rebuilt first, so Transactions committed since the
 * preview was made are skipped as duplicates rather than added twice.
 */
export async function commitImport(ctx: ServiceContext, input: CommitImportInput): Promise<Import> {
  const values = parseInput(commitImportInput, input);
  const importId = randomUUID();
  return mutate({ ...ctx, actor: { type: 'import', id: importId } }, async ({ tx, history }) => {
    const stored = await findPreview(tx, values.previewId, true);
    const account = await findImportAccount(tx, stored.accountId, true);
    const preview = await buildPreview(tx, account, stored.statement);
    const { statement, reconciliation, counts } = preview;

    await tx.query(
      `INSERT INTO import (id, account_id, file_name, import_format, statement_from, statement_to,
         opening_balance_minor, closing_balance_minor, added_count, duplicate_count,
         reconciliation_status, reconciliation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        importId,
        account.id,
        stored.fileName,
        account.importFormat,
        statement.from,
        statement.to,
        statement.openingBalanceMinor,
        statement.closingBalanceMinor,
        counts.new,
        counts.duplicate,
        reconciliation.status,
        JSON.stringify(reconciliation),
      ],
    );
    const created = await findImport(tx, importId);
    await history.record('import', importId, null, importSnapshot(created));

    for (const entry of preview.entries.filter((e) => e.status === 'new')) {
      const transaction = await insertTransaction(tx, account, importId, entry);
      await history.record('transaction', transaction.id, null, transactionSnapshot(transaction));
    }
    if (preview.proposedOpeningBalance && values.acceptOpeningBalance) {
      await setOpeningBalance({ tx, history }, account.id, preview.proposedOpeningBalance);
    }
    await tx.query('DELETE FROM import_preview WHERE id = $1', [stored.id]);
    return created;
  });
}

async function findImport(db: Queryable, importId: string): Promise<Import> {
  if (!id.safeParse(importId).success) throw new NotFoundError('Import not found');
  const result = await db.query<Import>(`${SELECT_IMPORT} WHERE i.id = $1`, [importId]);
  const found = result.rows[0];
  if (!found) throw new NotFoundError('Import not found');
  return found;
}

export async function getImport(ctx: ServiceContext, importId: string): Promise<Import> {
  return findImport(ctx.db, importId);
}

/** The Account's Imports, newest first (spec 32). */
export async function listImports(ctx: ServiceContext, accountId: string): Promise<Import[]> {
  if (!id.safeParse(accountId).success) throw new NotFoundError('Account not found');
  const result = await ctx.db.query<Import>(
    `${SELECT_IMPORT} WHERE i.account_id = $1 ORDER BY i.imported_at DESC, i.id`,
    [accountId],
  );
  return result.rows;
}

/** The Transactions an Import added, by booking date in the bank's order. */
export async function listImportTransactions(
  ctx: ServiceContext,
  importId: string,
): Promise<Transaction[]> {
  await findImport(ctx.db, importId);
  const result = await ctx.db.query<Transaction>(
    `${SELECT_TRANSACTION} WHERE t.import_id = $1 ORDER BY ${TRANSACTION_ORDER}`,
    [importId],
  );
  return result.rows;
}
