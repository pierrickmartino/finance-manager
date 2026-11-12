import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { ServiceError, type ServiceErrorCode } from '@/server/services/errors';

/** What every server action returns: the envelope the UI renders from. */
export type ActionResult<T = void> =
  { ok: true; data: T } | { ok: false; error: string; code: ServiceErrorCode | 'unexpected' };

/**
 * Wraps a service call for a server action. Expected ServiceErrors become user-facing
 * messages; anything else is logged and reported generically, so internals never leak.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error: unknown) {
    // Let Next.js control flow (redirect() to /login when the session has expired) through.
    unstable_rethrow(error);
    if (error instanceof ServiceError) {
      return { ok: false, error: error.message, code: error.code };
    }
    console.error('Server action failed', error);
    return { ok: false, error: 'Something went wrong. Please try again.', code: 'unexpected' };
  }
}

/** Reads a text field from a submitted form; missing fields become ''. */
export function formText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === 'string' ? value : '';
}
