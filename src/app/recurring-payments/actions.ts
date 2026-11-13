'use server';

import { revalidatePath } from 'next/cache';
import { runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import {
  dismissRecurringPayment,
  restoreRecurringPayment,
  type ChargeRef,
} from '@/server/services/recurring-payments';

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  const result = await runAction(fn);
  if (result.ok) {
    revalidatePath('/recurring-payments');
    revalidatePath('/history');
  }
  return result;
}

/** Dismisses the Recurring payment made of `charges`. The service validates them. */
export async function dismissRecurringPaymentAction(
  charges: ChargeRef[],
  _previous: ActionResult<unknown> | null,
  _formData: FormData,
): Promise<ActionResult<unknown>> {
  return run(async () => dismissRecurringPayment(await getServiceContext(), { charges }));
}

/** Restores a dismissed Recurring payment by deleting its dismissal. */
export async function restoreRecurringPaymentAction(
  dismissalId: string,
  _previous: ActionResult<unknown> | null,
  _formData: FormData,
): Promise<ActionResult<unknown>> {
  return run(async () => restoreRecurringPayment(await getServiceContext(), dismissalId));
}
