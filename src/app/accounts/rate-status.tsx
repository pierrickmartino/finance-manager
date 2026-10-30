import type { Formatter } from '@/lib/format';
import type { RateStatus } from '@/server/services/fx';

const TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich',
  hour: '2-digit',
  minute: '2-digit',
});

function dateTime(value: Date, fmt: Formatter): string {
  return `${fmt.date(value)} ${TIME.format(value)}`;
}

/** When FX rates were last fetched, with a warning when CHF values may be out of date. */
export function RateStatusNotice({ status, fmt }: { status: RateStatus; fmt: Formatter }) {
  return (
    <section aria-label="FX rate status" className="flex flex-col gap-1 text-sm">
      <p className="text-zinc-600 dark:text-zinc-400">
        {status.lastFetchedAt
          ? `FX rates last fetched ${dateTime(status.lastFetchedAt, fmt)}`
          : 'FX rates have never been fetched'}
        {status.latestRateDate && ` · newest ECB rate ${fmt.date(status.latestRateDate)}`}
      </p>
      {status.isStale && (
        <p
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          FX rates are stale: {status.staleReason}. CHF values may be out of date.
        </p>
      )}
      {status.lastError && status.lastAttemptAt && (
        <p className="text-red-700 dark:text-red-400">
          The last fetch ({dateTime(status.lastAttemptAt, fmt)}) failed: {status.lastError}
        </p>
      )}
    </section>
  );
}
