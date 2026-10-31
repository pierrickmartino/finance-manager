'use server';

import { revalidatePath } from 'next/cache';
import { parseAmount } from '@/lib/format/parse-amount';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import { getRequestDisplaySettings } from '@/server/formatter';
import {
  archiveAccount,
  createAccount,
  updateAccount,
  type Account,
  type AccountInput,
  type AccountKind,
  type ImportFormat,
} from '@/server/services/accounts';
import { ValidationError } from '@/server/services/errors';

/** Reads the Account form. The opening balance is typed in the user's number format. */
async function accountFormInput(formData: FormData): Promise<AccountInput> {
  const currency = formText(formData, 'currency').trim().toUpperCase();
  const balanceText = formText(formData, 'openingBalance').trim();
  const { numberFormat } = await getRequestDisplaySettings();
  const openingBalanceMinor =
    balanceText === '' ? 0 : parseAmount(balanceText, numberFormat, currency);
  if (openingBalanceMinor === null) {
    throw new ValidationError(`Opening balance "${balanceText}" is not an amount`);
  }
  return {
    bankId: formText(formData, 'bankId'),
    name: formText(formData, 'name'),
    currency,
    iban: formText(formData, 'iban'),
    // Validated by the service; the casts only satisfy the compile-time input type.
    kind: formText(formData, 'kind') as AccountKind,
    importFormat: formText(formData, 'importFormat') as ImportFormat | '',
    openingBalanceMinor,
    openingDate: formText(formData, 'openingDate'),
  };
}

export async function createAccountAction(
  _previous: ActionResult<Account> | null,
  formData: FormData,
): Promise<ActionResult<Account>> {
  const result = await runAction(async () =>
    createAccount(await getServiceContext(), await accountFormInput(formData)),
  );
  if (result.ok) revalidatePath('/accounts');
  return result;
}

export async function updateAccountAction(
  id: string,
  _previous: ActionResult<Account> | null,
  formData: FormData,
): Promise<ActionResult<Account>> {
  const result = await runAction(async () =>
    updateAccount(await getServiceContext(), id, await accountFormInput(formData)),
  );
  if (result.ok) revalidatePath('/accounts', 'layout');
  return result;
}

export async function archiveAccountAction(
  id: string,
  _previous: ActionResult<Account> | null,
): Promise<ActionResult<Account>> {
  const result = await runAction(async () => archiveAccount(await getServiceContext(), id));
  if (result.ok) revalidatePath('/accounts', 'layout');
  return result;
}
