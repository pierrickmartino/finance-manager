import { z } from 'zod';
import { checkCompleteness, type CompletenessProblem } from '../completeness';
import { attentionKind, type AttentionTone } from './kind';

/** An Account fails the Completeness check: one item listing all its problems, worst first. */
export interface CompletenessAttentionItem {
  kind: 'completeness';
  /** The Account's id. */
  subject: string;
  accountName: string;
  /** The Account's Currency, for a mismatch's difference. */
  currency: string;
  /** The last day its committed Imports cover, for "Stale: data ends …"; null without one. */
  dataEnd: string | null;
  /** As the Completeness check lists them: worst first, never empty. */
  problems: CompletenessProblem[];
  /** Accounts for a mismatch alone, the Account for any other problem (story 15). */
  href: '/accounts' | `/accounts/${string}`;
  tone: AttentionTone;
}

const daySpan = z.object({ from: z.iso.date(), to: z.iso.date() });

/**
 * The form is the Account's set of problems: Stale with its data end, No Import yet, each Gap's
 * first and last day, a mismatch with its Statement balance date and difference.
 */
const formSchema = z.object({
  stale: z.object({ dataEnd: z.iso.date().nullable() }).nullable(),
  isNeverImported: z.boolean(),
  gaps: z.array(daySpan),
  mismatch: z.object({ statementDate: z.iso.date(), differenceMinor: z.number().int() }).nullable(),
});
type CompletenessForm = z.infer<typeof formSchema>;

function formOf(item: CompletenessAttentionItem): CompletenessForm {
  const form: CompletenessForm = { stale: null, isNeverImported: false, gaps: [], mismatch: null };
  return item.problems.reduce<CompletenessForm>((acc, problem) => {
    switch (problem.kind) {
      case 'stale':
        return { ...acc, stale: { dataEnd: item.dataEnd } };
      case 'never_imported':
        return { ...acc, isNeverImported: true };
      case 'gap':
        return { ...acc, gaps: [...acc.gaps, { from: problem.from, to: problem.to }] };
      case 'mismatch':
        return {
          ...acc,
          mismatch: {
            statementDate: problem.statementDate,
            differenceMinor: problem.differenceMinor,
          },
        };
    }
  }, form);
}

/**
 * Stale got worse when it was not Stale before, or its data now ends earlier (an Import undone).
 * A later data end that is still Stale is progress. ISO dates compare as strings.
 */
function isStaleWorse(now: CompletenessForm['stale'], seen: CompletenessForm['stale']): boolean {
  if (now === null) return false;
  if (seen === null) return true;
  if (seen.dataEnd === null) return false;
  return now.dataEnd === null || now.dataEnd < seen.dataEnd;
}

/** A Gap is new unless it lies within one seen: a part of a Gap filled is progress. */
function hasNewGap(now: CompletenessForm['gaps'], seen: CompletenessForm['gaps']): boolean {
  return now.some((gap) => !seen.some((old) => old.from <= gap.from && gap.to <= old.to));
}

/** A mismatch that differs in date or difference is a changed one: news. */
function isMismatchWorse(
  now: CompletenessForm['mismatch'],
  seen: CompletenessForm['mismatch'],
): boolean {
  if (now === null) return false;
  return (
    seen === null ||
    now.statementDate !== seen.statementDate ||
    now.differenceMinor !== seen.differenceMinor
  );
}

/** Got worse: it has a problem its stored form lacked. Losing a problem alone is progress. */
function gotWorse(now: CompletenessForm, seen: CompletenessForm): boolean {
  return (
    isStaleWorse(now.stale, seen.stale) ||
    (now.isNeverImported && !seen.isNeverImported) ||
    hasNewGap(now.gaps, seen.gaps) ||
    isMismatchWorse(now.mismatch, seen.mismatch)
  );
}

/**
 * Where the Account's problems are fixed: a mismatch on Accounts, beside the FX rates; Stale,
 * never imported and Gaps on the Account itself, which wins when it has both.
 */
function hrefOf(accountId: string, problems: readonly CompletenessProblem[]) {
  const isMismatchOnly = problems.every((problem) => problem.kind === 'mismatch');
  return isMismatchOnly ? ('/accounts' as const) : (`/accounts/${accountId}` as const);
}

/** From the Completeness check itself, in its severity order; Accounts that pass give none. */
export const completenessKind = attentionKind<CompletenessAttentionItem, CompletenessForm>({
  async list(ctx, today) {
    const entries = await checkCompleteness(ctx, { today });
    return entries
      .filter((entry) => entry.problems.length > 0)
      .map((entry) => ({
        kind: 'completeness',
        subject: entry.account.id,
        accountName: entry.account.name,
        currency: entry.account.currency,
        dataEnd: entry.dataEnd,
        problems: entry.problems,
        href: hrefOf(entry.account.id, entry.problems),
        tone: 'warning',
      }));
  },
  form: formOf,
  formSchema,
  gotWorse,
});
