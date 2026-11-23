import { z } from 'zod';
import { getRateStatus } from '../fx';
import { attentionKind, type AttentionTone } from './kind';

/** The FX rates are Stale: one item, worded as the Accounts page's FX rate notice. */
export interface FxRatesAttentionItem {
  kind: 'fx-rates';
  /** The FX rates are about no one Account or Recurring payment. */
  subject: null;
  /** Why the rates are Stale, as the FX rate status gives it. */
  reason: string;
  /** The newest rate stored; null when there is none. */
  latestRateDate: string | null;
  href: '/accounts';
  tone: AttentionTone;
}

/**
 * Its form is the newest rate's date: Stale again on a later newest rate got worse. The status
 * reads the clock, as the Accounts page's notice does, so the item always agrees with it.
 */
export const fxRatesKind = attentionKind<FxRatesAttentionItem, string | null>({
  async list(ctx) {
    const status = await getRateStatus(ctx);
    if (status.staleReason === null) return [];
    return [
      {
        kind: 'fx-rates',
        subject: null,
        reason: status.staleReason,
        latestRateDate: status.latestRateDate,
        href: '/accounts',
        tone: 'warning',
      },
    ];
  },
  form: (item) => item.latestRateDate,
  formSchema: z.iso.date().nullable(),
  gotWorse: (now, seen) => now !== null && (seen === null || now > seen),
});
