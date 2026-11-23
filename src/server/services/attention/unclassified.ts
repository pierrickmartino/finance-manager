import { z } from 'zod';
import { getClassificationProgress } from '../transactions/unclassified';
import { attentionKind, type AttentionTone } from './kind';

/** Transactions are Unclassified: one item for all of them, with their count. */
export interface UnclassifiedAttentionItem {
  kind: 'unclassified';
  /** Unclassified is about no one Account or Recurring payment. */
  subject: null;
  /** How many Transactions are Unclassified, as the Unclassified view counts them. */
  count: number;
  href: '/unclassified';
  tone: AttentionTone;
}

/** Its form is the count: more Unclassified Transactions got worse, fewer did not. */
export const unclassifiedKind = attentionKind<UnclassifiedAttentionItem, number>({
  async list(ctx) {
    const { unclassified } = await getClassificationProgress(ctx);
    if (unclassified === 0) return [];
    return [
      {
        kind: 'unclassified',
        subject: null,
        count: unclassified,
        href: '/unclassified',
        tone: 'warning',
      },
    ];
  },
  form: (item) => item.count,
  formSchema: z.number().int(),
  gotWorse: (now, seen) => now > seen,
});
