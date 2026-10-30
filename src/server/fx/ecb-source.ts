import type { EcbRateSource, ReferenceRateDay, ReferenceRateRequest } from '@/server/services/fx';

/**
 * The ECB Data Portal SDMX API: daily (D) euro foreign exchange reference rates (EXR),
 * spot (SP00), average (A), quoted as units of each Currency per EUR.
 * https://data.ecb.europa.eu/help/api/data
 */
const ECB_DATA_URL = 'https://data-api.ecb.europa.eu/service/data/EXR';
const REQUEST_TIMEOUT_MS = 60_000;
const HTTP_NOT_FOUND = 404;

/** Splits one CSV line, honouring double-quoted fields (`""` is a literal quote). */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let isQuoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (isQuoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        isQuoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      isQuoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

/**
 * Reads the ECB `csvdata` answer: one line per (Currency, day), with the columns CURRENCY,
 * TIME_PERIOD and OBS_VALUE among others. Groups them into one entry per publication day.
 */
export function parseEcbCsv(csv: string): ReferenceRateDay[] {
  const lines = csv
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]!);
  const column = (name: string): number => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`ECB answer has no ${name} column`);
    return index;
  };
  const [currencyAt, dateAt, valueAt] = [
    column('CURRENCY'),
    column('TIME_PERIOD'),
    column('OBS_VALUE'),
  ];

  const byDate = new Map<string, Record<string, string>>();
  for (const line of lines.slice(1)) {
    const fields = splitCsvLine(line);
    const [currency, date, value] = [fields[currencyAt], fields[dateAt], fields[valueAt]];
    // A missing observation (blank or NaN) is not a rate.
    if (!currency || !date || !value || value === 'NaN') continue;
    byDate.set(date, { ...byDate.get(date), [currency]: value });
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, perEur]) => ({ date, perEur }));
}

/** The real ECB source. Network errors and non-2xx answers (other than "no data") throw. */
export function createEcbRateSource(fetchImpl: typeof fetch = fetch): EcbRateSource {
  return {
    async fetchReferenceRates({ currencies, from, to }: ReferenceRateRequest) {
      const url = new URL(`${ECB_DATA_URL}/D.${currencies.join('+')}.EUR.SP00.A`);
      url.searchParams.set('startPeriod', from);
      url.searchParams.set('endPeriod', to);
      url.searchParams.set('format', 'csvdata');
      url.searchParams.set('detail', 'dataonly');
      const response = await fetchImpl(url, {
        headers: { Accept: 'text/csv' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }).catch((error: unknown) => {
        // fetch() only says "fetch failed"; the reason (DNS, TLS, timeout) is in its cause.
        const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
        const reason = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`Could not reach the ECB: ${reason}`, { cause: error });
      });
      // The API answers 404 when the range holds no observation (a weekend, a holiday).
      if (response.status === HTTP_NOT_FOUND) return [];
      if (!response.ok) {
        throw new Error(`ECB answered ${response.status} ${response.statusText}`.trim());
      }
      return parseEcbCsv(await response.text());
    },
  };
}
