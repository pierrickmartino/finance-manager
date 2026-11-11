import { z } from 'zod';
import { listAccounts, type Account } from '../accounts';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { daysBetween } from '../fx/dates';
import { findGaps, type DaySpan } from './gaps';
import { findMismatches, type MismatchProblem } from './mismatch';

export type { MismatchProblem } from './mismatch';

/** The Account a Completeness check entry is about, as its row names and links it. */
export type CheckedAccount = Pick<Account, 'id' | 'name' | 'bankName' | 'currency'>;

/** One checked Account (GLOSSARY: Completeness check). */
export interface CompletenessEntry {
  account: CheckedAccount;
  /** The last day the Account's latest committed Import covers; null when it has none. */
  dataEnd: string | null;
  /** Whole days from `dataEnd` to the `today` checked against; null without a data end. */
  daysSince: number | null;
  /**
   * Whether the Account is checked for freshness (it has an Import format). A manual-only
   * Account is listed only for a mismatch, so its data end and days since are always null.
   */
  isFreshnessChecked: boolean;
  problems: CompletenessProblem[];
}

/** The data ends more than `STALE_AFTER_DAYS` before today (GLOSSARY: Stale). */
export interface StaleProblem {
  kind: 'stale';
}

/**
 * Days between the Account's first and latest committed Import that no Import covers and no
 * Manual transaction fills (GLOSSARY: Gap). `from` and `to` are its first and last day.
 */
export interface GapProblem {
  kind: 'gap';
  from: string;
  to: string;
}

/** The Account has an Import format but no committed Import ("No Import yet"). */
export interface NeverImportedProblem {
  kind: 'never_imported';
}

/**
 * What can be wrong with a checked Account, tagged by `kind`. The spec's full set is
 * `mismatch` (difference and Statement balance date), `gap` (first and last day), `stale` and
 * `never_imported`; each new kind is a member here and a rank in `SEVERITY`.
 */
export type CompletenessProblem =
  MismatchProblem | GapProblem | StaleProblem | NeverImportedProblem;
export type CompletenessProblemKind = CompletenessProblem['kind'];

/**
 * How bad each kind of problem is, worst (lowest) first: mismatch 0, Gap 1, then Stale and
 * No Import yet (spec: Ordering). A kind without a rank does not compile.
 */
const SEVERITY = {
  mismatch: 0,
  gap: 1,
  stale: 2,
  never_imported: 2,
} as const satisfies Record<CompletenessProblemKind, number>;
/** Ranks after every problem, so healthy rows come last. */
const HEALTHY_RANK = Number.MAX_SAFE_INTEGER;

/** An Account is Stale when its data ends more than this many days before today. */
export const STALE_AFTER_DAYS = 40;

const checkInput = z.object({ today: z.iso.date() });

/** Each Account's data end: the latest last day any of its committed Imports covers. */
const SELECT_DATA_ENDS = `
  SELECT i.account_id AS "accountId",
         max(coalesce(
           i.statement_to,
           (SELECT max(t.booking_date) FROM "transaction" t WHERE t.import_id = i.id)
         )) AS "dataEnd"
  FROM import i
  WHERE i.undone_at IS NULL
  GROUP BY i.account_id`;

/**
 * The Completeness check (spec: Completeness check; ADR-0008): one entry per non-archived
 * Account with an Import format, plus each non-archived manual-only Account with a mismatch.
 * Computed on each call from stored data; `today` is passed in,
 * the clock is never read.
 */
export async function checkCompleteness(
  ctx: ServiceContext,
  input: { today: string },
): Promise<CompletenessEntry[]> {
  const { today } = parseInput(checkInput, input);
  const [accounts, dataEnds, gapsById] = await Promise.all([
    listAccounts(ctx).then((all) => all.filter((account) => account.archivedAt === null)),
    ctx.db.query<{ accountId: string; dataEnd: string | null }>(SELECT_DATA_ENDS),
    findGaps(ctx.db),
  ]);
  const dataEndById = new Map(dataEnds.rows.map((row) => [row.accountId, row.dataEnd]));
  const mismatches = await findMismatches(ctx, accounts);
  const entries = accounts
    .filter((account) => account.importFormat !== null || mismatches.has(account.id))
    .map((account): CompletenessEntry => {
      const isFreshnessChecked = account.importFormat !== null;
      const dataEnd = dataEndById.get(account.id) ?? null;
      const daysSince = dataEnd === null ? null : daysBetween(dataEnd, today);
      const mismatch = mismatches.get(account.id);
      return {
        account: {
          id: account.id,
          name: account.name,
          bankName: account.bankName,
          currency: account.currency,
        },
        dataEnd,
        daysSince,
        isFreshnessChecked,
        problems: worstFirst([
          ...(mismatch ? [mismatch] : []),
          ...(isFreshnessChecked
            ? [
                ...gapProblems(gapsById.get(account.id) ?? []),
                ...freshnessProblems(dataEndById.has(account.id), daysSince),
              ]
            : []),
        ]),
      };
    });
  // A stable sort: equally bad rows, and all healthy rows, keep Accounts-list order.
  return entries.toSorted((a, b) => worstRank(a) - worstRank(b));
}

function worstFirst(problems: CompletenessProblem[]): CompletenessProblem[] {
  return problems.toSorted((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind]);
}

/** The rank of an entry's worst problem; healthy entries rank after every problem. */
function worstRank(entry: CompletenessEntry): number {
  const [worst] = entry.problems;
  return worst ? SEVERITY[worst.kind] : HEALTHY_RANK;
}

function gapProblems(gaps: DaySpan[]): CompletenessProblem[] {
  return gaps.map((gap) => ({ kind: 'gap', from: gap.from, to: gap.to }));
}

/** An Account with committed Imports that cover nothing has no data end: it is Stale. */
function freshnessProblems(isImported: boolean, daysSince: number | null): CompletenessProblem[] {
  if (!isImported) return [{ kind: 'never_imported' }];
  if (daysSince === null || daysSince > STALE_AFTER_DAYS) return [{ kind: 'stale' }];
  return [];
}
