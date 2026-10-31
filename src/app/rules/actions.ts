'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import { getRequestDisplaySettings } from '@/server/formatter';
import { ValidationError } from '@/server/services/errors';
import {
  applyRulesToExisting,
  createRule,
  deleteRule,
  reorderRules,
  setRuleEnabled,
  updateRule,
  type ApplyRulesInput,
  type ApplyRulesResult,
  type RuleInput,
} from '@/server/services/rules';
import { draftToRuleInput, DraftError } from './rule-draft';
import type { RuleDraft } from './rule-form-model';

type Result = ActionResult<unknown>;

const conditionDraft = z.object({
  kind: z.enum([
    'description',
    'counterparty',
    'payee',
    'amount',
    'account',
    'direction',
    'bookingDate',
  ]),
  operator: z.string(),
  value: z.string(),
  to: z.string(),
  accountIds: z.array(z.string()),
  direction: z.enum(['in', 'out']),
});

const ruleDraft = z.object({
  name: z.string(),
  enabled: z.boolean(),
  conditions: z.array(conditionDraft),
  payeeId: z.string(),
  categoryId: z.string(),
  tagIds: z.array(z.string()),
});

/** Reads the form's JSON draft into a Rule, in the user's number format. */
async function readRule(formData: FormData): Promise<RuleInput> {
  let draft: RuleDraft;
  try {
    draft = ruleDraft.parse(JSON.parse(formText(formData, 'rule')));
  } catch {
    throw new ValidationError('The Rule form could not be read. Reload the page and try again.');
  }
  const { numberFormat } = await getRequestDisplaySettings();
  try {
    return draftToRuleInput(draft, numberFormat);
  } catch (error: unknown) {
    if (error instanceof DraftError) throw new ValidationError(error.message);
    throw error;
  }
}

function revalidate(): void {
  revalidatePath('/rules', 'layout');
}

export async function saveRuleAction(
  id: string | null,
  _previous: Result | null,
  formData: FormData,
): Promise<Result> {
  const result = await runAction(async () => {
    const ctx = await getServiceContext();
    const input = await readRule(formData);
    return id ? updateRule(ctx, id, input) : createRule(ctx, input);
  });
  if (!result.ok) return result;
  revalidate();
  redirect('/rules');
}

export async function setRuleEnabledAction(
  id: string,
  enabled: boolean,
  _previous: Result | null,
): Promise<Result> {
  const result = await runAction(async () =>
    setRuleEnabled(await getServiceContext(), id, enabled),
  );
  if (result.ok) revalidate();
  return result;
}

export async function deleteRuleAction(id: string, _previous: Result | null): Promise<Result> {
  const result = await runAction(async () => deleteRule(await getServiceContext(), id));
  if (result.ok) revalidate();
  return result;
}

/** Saves a new run order (drag-and-drop or the move buttons). */
export async function reorderRulesAction(ids: string[]): Promise<Result> {
  const result = await runAction(async () => reorderRules(await getServiceContext(), ids));
  if (result.ok) revalidate();
  return result;
}

/**
 * Creates a Rule from a Transaction (the prefilled editor), then opens its apply preview so
 * the Transactions it matches can be reclassified.
 */
export async function createRuleThenPreviewAction(
  _previous: Result | null,
  formData: FormData,
): Promise<Result> {
  const result = await runAction(async () =>
    createRule(await getServiceContext(), await readRule(formData)),
  );
  if (!result.ok) return result;
  revalidate();
  redirect(`/rules/apply?ruleId=${encodeURIComponent(result.data.id)}`);
}

/** Commits the apply preview: the same Rules on the same Transactions, one History Batch. */
export async function applyRulesAction(
  input: ApplyRulesInput,
  _previous: ActionResult<ApplyRulesResult> | null,
): Promise<ActionResult<ApplyRulesResult>> {
  const result = await runAction(async () =>
    applyRulesToExisting(await getServiceContext(), input),
  );
  // Classification shows almost everywhere: the lists, Unclassified, History, the Rules.
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
