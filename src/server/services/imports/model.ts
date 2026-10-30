import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import type { ImportFormat } from '../accounts';
import { NotFoundError } from '../errors';
import type { HistorySnapshot } from '../history';
import type { Reconciliation } from './reconcile';

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
  /** When the Import was undone (its Transactions deleted); null while it stands. */
  undoneAt: Date | null;
}

/** An Account opening balance, as an Import sets it and its undo restores it. */
export interface OpeningBalance {
  amountMinor: number;
  date: string | null;
}

/** The opening balance change an accepted proposal made, kept so undo can restore it. */
export interface OpeningChange {
  before: OpeningBalance;
  after: OpeningBalance;
}

export const id = z.uuid();

export const SELECT_IMPORT = `
  SELECT i.id, i.account_id AS "accountId", i.file_name AS "fileName",
         i.import_format AS "importFormat", i.imported_at AS "importedAt",
         i.statement_from AS "statementFrom", i.statement_to AS "statementTo",
         i.opening_balance_minor AS "openingBalanceMinor",
         i.closing_balance_minor AS "closingBalanceMinor",
         i.added_count AS "addedCount", i.duplicate_count AS "duplicateCount",
         i.reconciliation_status AS "reconciliationStatus", i.reconciliation,
         i.undone_at AS "undoneAt"
  FROM import i`;

export async function findImport(db: Queryable, importId: string, lock = false): Promise<Import> {
  if (!id.safeParse(importId).success) throw new NotFoundError('Import not found');
  const result = await db.query<Import>(
    `${SELECT_IMPORT} WHERE i.id = $1${lock ? ' FOR UPDATE' : ''}`,
    [importId],
  );
  const found = result.rows[0];
  if (!found) throw new NotFoundError('Import not found');
  return found;
}

/** What History records about an Import. */
export function importSnapshot(row: Import): HistorySnapshot {
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
    undoneAt: row.undoneAt?.toISOString() ?? null,
  };
}
