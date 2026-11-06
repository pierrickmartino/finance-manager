import type { Formatter } from '@/lib/format';
import type { RateStatus } from '@/server/services/fx';

/** When FX rates were last fetched, with a warning when CHF values may be out of date. */
export function RateStatusNotice({ status, fmt }: { status: RateStatus; fmt: Formatter }) {
  return (
    <section aria-label="FX rate status" className="flex flex-col gap-1 text-sm">
      <p className="text-ink-soft">
        {status.lastFetchedAt
          ? `FX rates last fetched ${fmt.dateTime(status.lastFetchedAt)}`
          : 'FX rates have never been fetched'}
        {status.latestRateDate && ` · newest ECB rate ${fmt.date(status.latestRateDate)}`}
      </p>
      {status.isStale && (
        <p
          role="alert"
          className="rounded-md border border-warning-rule bg-warning-tint px-3 py-2 text-warning"
        >
          FX rates are stale: {status.staleReason}. CHF values may be out of date.
        </p>
      )}
      {status.lastError && status.lastAttemptAt && (
        <p className="text-negative">
          The last fetch ({fmt.dateTime(status.lastAttemptAt)}) failed: {status.lastError}
        </p>
      )}
    </section>
  );
}
