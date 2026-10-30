'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseAmount } from '@/lib/format/parse-amount';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import { getRequestDisplaySettings } from '@/server/formatter';
import { getAccount } from '@/server/services/accounts';
import {
  deleteBalanceSnapshot,
  recordBalanceSnapshot,
  type BalanceSnapshot,
} from '@/server/services/balance-snapshots';
import { ValidationError } from '@/server/services/errors';
import type { ServiceContext } from '@/server/services/context';
import {
  deleteManualTransaction,
  createManualTransaction,
  updateManualTransaction,
  type ManualTransactionInput,
} from '@/server/services/transactions/manual';
import type { Transaction } from '@/server/services/transactions/model';

/** Reads an amount typed in the user's number format, in the Account's Currency. */
async function readAmount(
  ctx: ServiceContext,
  accountId: string,
  formData: FormData,
  field: string,
  label: string,
): Promise<number> {
  const text = formText(formData, field).trim();
  if (text === '') throw new ValidationError(`${label} is required`);
  const [{ currency }, { numberFormat }] = await Promise.all([
    getAccount(ctx, accountId),
    getRequestDisplaySettings(),
  ]);
  const minor = parseAmount(text, numberFormat, currency);
  if (minor === null) throw new ValidationError(`${label} "${text}" is not an amount`);
  return minor;
}

async function manualFormInput(
  ctx: ServiceContext,
  accountId: string,
  formData: FormData,
): Promise<ManualTransactionInput> {
  return {
    bookingDate: formText(formData, 'bookingDate'),
    amountMinor: await readAmount(ctx, accountId, formData, 'amount', 'Amount'),
    description: formText(formData, 'description'),
    counterpartyName: formText(formData, 'counterpartyName'),
  };
}

/** Balances and snapshot checks change: the Accounts overview and every Account page. */
function revalidateAccounts(): void {
  revalidatePath('/accounts', 'layout');
}

export async function createManualTransactionAction(
  accountId: string,
  _previous: ActionResult<Transaction> | null,
  formData: FormData,
): Promise<ActionResult<Transaction>> {
  const result = await runAction(async () => {
    const ctx = await getServiceContext();
    const input = await manualFormInput(ctx, accountId, formData);
    return createManualTransaction(ctx, { accountId, ...input });
  });
  if (result.ok) revalidateAccounts();
  return result;
}

export async function updateManualTransactionAction(
  accountId: string,
  id: string,
  _previous: ActionResult<Transaction> | null,
  formData: FormData,
): Promise<ActionResult<Transaction>> {
  const result = await runAction(async () => {
    const ctx = await getServiceContext();
    return updateManualTransaction(ctx, id, await manualFormInput(ctx, accountId, formData));
  });
  if (result.ok) revalidateAccounts();
  return result;
}

export async function deleteManualTransactionAction(
  accountId: string,
  id: string,
  _previous: ActionResult | null,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    await deleteManualTransaction(await getServiceContext(), id);
  });
  if (!result.ok) return result;
  revalidateAccounts();
  redirect(`/accounts/${accountId}`);
}

export async function recordBalanceSnapshotAction(
  accountId: string,
  _previous: ActionResult<BalanceSnapshot> | null,
  formData: FormData,
): Promise<ActionResult<BalanceSnapshot>> {
  const result = await runAction(async () => {
    const ctx = await getServiceContext();
    return recordBalanceSnapshot(ctx, {
      accountId,
      date: formText(formData, 'date'),
      balanceMinor: await readAmount(ctx, accountId, formData, 'balance', 'Balance'),
    });
  });
  if (result.ok) revalidateAccounts();
  return result;
}

export async function deleteBalanceSnapshotAction(
  accountId: string,
  id: string,
  _previous: ActionResult | null,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    await deleteBalanceSnapshot(await getServiceContext(), id);
  });
  if (result.ok) revalidateAccounts();
  return result;
}
