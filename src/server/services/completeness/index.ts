import { z } from 'zod';
import { listAccounts, type Account } from '../accounts';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { daysBetween } from '../fx/dates';
import {
  dataEndOf,
  dataStartOf,
  loadCoverage,
  type DaySpan,
  type ImportCoverage,
} from './coverage';
import { findGaps } from './gaps';
import { findMismatches, type MismatchProblem } from './mismatch';

export type { MismatchProblem } from './mismatch';

/** The Account a Completeness check entry is about, as its row names and links it. */
export type CheckedAccount = Pick<Account, 'id' | 'name' | 'bankName' | 'currency'>;

/** One checked Account (GLOSSARY: Completeness check). */
export interface CompletenessEntry {
  account: CheckedAccount;
  /** The first day the Account's committed Imports cover; null when they cover none. */
  dataStart: string | null;
  /** The last day the Account's committed Imports cover; null when they cover none. */
  dataEnd: string | null;
  /** Whole days from `dataEnd` to the `today` checked against; null without a data end. */
  daysSince: number | null;
  /**
   * Whether the Account is checked for freshness (it has an Import format). A manual-only
   * Account is listed only for a mismatch, so its data start, data end and days since are always
   * null.
   */
  isFreshnessChecked: boolean;
  problems: CompletenessProblem[];
}

/**
 * The data ends more than `STALE_AFTER_DAYS` before today, or the Account's committed Imports
 * cover no day at all (GLOSSARY: Stale).
 */
export interface StaleProblem {
  kind: 'stale';
}

/**
 * Days between the Account's first and latest committed Import that no Import covers and no
 * Manual transaction fills (GLOSSARY: Gap), from its first to its last day.
 */
export type GapProblem = { kind: 'gap' } & DaySpan;

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

/**
 * The Completeness check (spec: Completeness check; ADR-0008): one entry per non-archived
 * Account with an Import format, plus each non-archived manual-only Account with a mismatch.
 * Computed on each call from stored data; `today` is passed in, the clock is never read.
 */
export async function checkCompleteness(
  ctx: ServiceContext,
  input: { today: string },
): Promise<CompletenessEntry[]> {
  const { today } = parseInput(checkInput, input);
  const [accounts, coverageById] = await Promise.all([
    listAccounts(ctx).then((all) => all.filter((account) => account.archivedAt === null)),
    loadCoverage(ctx.db),
  ]);
  // Gaps are a freshness problem, so only Accounts with an Import format are searched for them.
  const freshnessCoverage = new Map(
    accounts.flatMap((account) => {
      const imports = coverageById.get(account.id);
      return account.importFormat !== null && imports ? [[account.id, imports] as const] : [];
    }),
  );
  const [gapsById, mismatches] = await Promise.all([
    findGaps(ctx.db, freshnessCoverage),
    findMismatches(ctx, accounts, coverageById),
  ]);
  const entries = accounts
    .filter((account) => account.importFormat !== null || mismatches.has(account.id))
    .map((account) =>
      entryFor(account, today, {
        imports: coverageById.get(account.id),
        gaps: gapsById.get(account.id) ?? [],
        mismatch: mismatches.get(account.id),
      }),
    );
  // A stable sort: equally bad rows, and all healthy rows, keep Accounts-list order.
  return entries.toSorted((a, b) => worstRank(a) - worstRank(b));
}

/** What the check found for one Account; `imports` is undefined when it has no committed Import. */
interface Findings {
  imports: readonly ImportCoverage[] | undefined;
  gaps: DaySpan[];
  mismatch: MismatchProblem | undefined;
}

function entryFor(account: Account, today: string, findings: Findings): CompletenessEntry {
  const isFreshnessChecked = account.importFormat !== null;
  const dataEnd = isFreshnessChecked ? dataEndOf(findings.imports ?? []) : null;
  const dataStart = isFreshnessChecked ? dataStartOf(findings.imports ?? []) : null;
  const daysSince = dataEnd === null ? null : daysBetween(dataEnd, today);
  const freshness = isFreshnessChecked
    ? [
        ...findings.gaps.map((gap): GapProblem => ({ kind: 'gap', ...gap })),
        ...freshnessProblems(findings.imports !== undefined, daysSince),
      ]
    : [];
  return {
    account: {
      id: account.id,
      name: account.name,
      bankName: account.bankName,
      currency: account.currency,
    },
    dataStart,
    dataEnd,
    daysSince,
    isFreshnessChecked,
    problems: worstFirst([...(findings.mismatch ? [findings.mismatch] : []), ...freshness]),
  };
}

function worstFirst(problems: CompletenessProblem[]): CompletenessProblem[] {
  return problems.toSorted((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind]);
}

/** The rank of an entry's worst problem; healthy entries rank after every problem. */
function worstRank(entry: CompletenessEntry): number {
  const [worst] = entry.problems;
  return worst ? SEVERITY[worst.kind] : HEALTHY_RANK;
}

/** An Account with committed Imports that cover no day has no data end: it is Stale. */
function freshnessProblems(isImported: boolean, daysSince: number | null): CompletenessProblem[] {
  if (!isImported) return [{ kind: 'never_imported' }];
  if (daysSince === null || daysSince > STALE_AFTER_DAYS) return [{ kind: 'stale' }];
  return [];
}
