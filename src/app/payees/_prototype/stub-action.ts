'use server';
/* PROTOTYPE — every form in the redesign variants posts here. Nothing is saved. */
import type { ActionResult } from '@/server/actions';

export async function prototypeStubAction(): Promise<ActionResult<unknown>> {
  return { ok: false, error: 'Prototype: not saved.', code: 'unexpected' };
}
