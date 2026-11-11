import type { Queryable } from '../../db/client';
import { addDays } from '../fx/dates';

/** A run of days, first and last day included, as ISO dates. */
export interface DaySpan {
  from: string;
  to: string;
}

/**
 * Each committed Import's coverage: its statement period, a missing start or end falling back
 * to that Import's earliest or latest Transaction date. Undone Imports cover nothing.
 */
const SELECT_COVERAGE = `
  SELECT i.account_id AS "accountId",
         coalesce(i.statement_from,
           (SELECT min(t.booking_date) FROM "transaction" t WHERE t.import_id = i.id)) AS "from",
         coalesce(i.statement_to,
           (SELECT max(t.booking_date) FROM "transaction" t WHERE t.import_id = i.id)) AS "to"
  FROM import i
  WHERE i.undone_at IS NULL`;

/** The days each Account has a Manual transaction on. */
const SELECT_MANUAL_DAYS = `
  SELECT DISTINCT account_id AS "accountId", booking_date AS "day"
  FROM "transaction"
  WHERE is_manual`;

/**
 * Every Account's Gaps (GLOSSARY: Gap), by Account id, oldest first: the runs of days after the
 * first coverage starts and before the latest coverage ends that no committed Import covers,
 * leaving out each run that holds a Manual transaction on that Account.
 */
export async function findGaps(db: Queryable): Promise<Map<string, DaySpan[]>> {
  const [coverage, manualDays] = await Promise.all([
    db.query<{ accountId: string; from: string | null; to: string | null }>(SELECT_COVERAGE),
    db.query<{ accountId: string; day: string }>(SELECT_MANUAL_DAYS),
  ]);
  const manualById = new Map<string, string[]>();
  for (const { accountId, day } of manualDays.rows) {
    manualById.set(accountId, [...(manualById.get(accountId) ?? []), day]);
  }
  const spansById = new Map<string, DaySpan[]>();
  for (const { accountId, from, to } of coverage.rows) {
    if (from === null || to === null) continue;
    spansById.set(accountId, [...(spansById.get(accountId) ?? []), { from, to }]);
  }
  return new Map(
    [...spansById].map(([accountId, spans]) => {
      const manual = manualById.get(accountId) ?? [];
      const gaps = uncovered(spans).filter(
        (hole) => !manual.some((day) => day >= hole.from && day <= hole.to),
      );
      return [accountId, gaps];
    }),
  );
}

/** The holes between the spans, from the first one's start to the last one's end. */
function uncovered(spans: DaySpan[]): DaySpan[] {
  const sorted = spans.toSorted((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const holes: DaySpan[] = [];
  let coveredTo = sorted[0]!.to;
  for (const span of sorted.slice(1)) {
    const nextDay = addDays(coveredTo, 1);
    if (span.from > nextDay) holes.push({ from: nextDay, to: addDays(span.from, -1) });
    if (span.to > coveredTo) coveredTo = span.to;
  }
  return holes;
}
