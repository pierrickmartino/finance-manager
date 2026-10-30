'use server';

import { formText, runAction, type ActionResult } from '@/server/actions';
import { getPublicServiceContext } from '@/server/app-context';
import { completeSetup } from '@/server/services/auth';
import { seedStarterCategories } from '@/server/services/categories';
import { ValidationError } from '@/server/services/errors';
import { setSessionCookie } from '@/server/session-cookie';

/** Completes first-run setup and signs in. Returns the recovery codes to show once. */
export async function completeSetupAction(
  _previous: ActionResult<string[]> | null,
  formData: FormData,
): Promise<ActionResult<string[]>> {
  return runAction(async () => {
    const password = formText(formData, 'password');
    if (password !== formText(formData, 'passwordConfirmation')) {
      throw new ValidationError('Passwords do not match');
    }
    const { recoveryCodes, session } = await completeSetup(await getPublicServiceContext(), {
      password,
      totpSecret: formText(formData, 'totpSecret'),
      totpCode: formText(formData, 'totpCode'),
    });
    await setSessionCookie(session.token);
    // First run: the editable starter Categories (spec 53). Idempotent.
    await seedStarterCategories(await getPublicServiceContext());
    return recoveryCodes;
  });
}
