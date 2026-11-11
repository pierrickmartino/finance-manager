import type { Queryable } from '../../db/client';
import { addDays } from '../fx/dates';
import type { DaySpan, ImportCoverage } from './coverage';

/** The days each non-archived Account with an Import format has a Manual transaction on. */
const SELECT_MANUAL_DAYS = `
  SELECT DISTINCT t.account_id AS "accountId", t.booking_date AS "day"
  FROM "transaction" t
  JOIN account a ON a.id = t.account_id
  WHERE t.is_manual AND a.archived_at IS NULL AND a.import_format IS NOT NULL`;

/**
 * Every Account's Gaps (GLOSSARY: Gap), by Account id, oldest first: the runs of days after the
 * first coverage starts and before the latest coverage ends that no committed Import covers,
 * leaving out each run that holds a Manual transaction on that Account.
 */
export async function findGaps(
  db: Queryable,
  coverageById: ReadonlyMap<string, readonly ImportCoverage[]>,
): Promise<Map<string, DaySpan[]>> {
  const manualDays = await db.query<{ accountId: string; day: string }>(SELECT_MANUAL_DAYS);
  const manualById = Map.groupBy(manualDays.rows, (row) => row.accountId);
  return new Map(
    [...coverageById].map(([accountId, imports]) => {
      const manual = manualById.get(accountId) ?? [];
      const gaps = uncovered(spansOf(imports)).filter(
        (hole) => !manual.some(({ day }) => day >= hole.from && day <= hole.to),
      );
      return [accountId, gaps];
    }),
  );
}

/** The Imports that cover a span of days, as those spans. */
function spansOf(imports: readonly ImportCoverage[]): DaySpan[] {
  return imports.flatMap(({ from, to }) => (from !== null && to !== null ? [{ from, to }] : []));
}

/** The holes between the spans, from the first one's start to the last one's end. */
function uncovered(spans: DaySpan[]): DaySpan[] {
  const [first, ...rest] = spans.toSorted((a, b) =>
    a.from < b.from ? -1 : a.from > b.from ? 1 : 0,
  );
  if (!first) return [];
  const holes: DaySpan[] = [];
  let coveredTo = first.to;
  for (const span of rest) {
    const nextDay = addDays(coveredTo, 1);
    if (span.from > nextDay) holes.push({ from: nextDay, to: addDays(span.from, -1) });
    if (span.to > coveredTo) coveredTo = span.to;
  }
  return holes;
}
