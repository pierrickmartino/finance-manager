import type { Classification, Transaction } from '@/server/services/transactions';

export type BadgeTone = 'warning' | 'info' | 'positive' | 'neutral';

export interface StatusBadge {
  label: string;
  tone: BadgeTone;
}

/** The parts of a Classification the badges read. */
export interface BadgeClassification {
  category: { name: string } | null;
  splitLines: readonly unknown[];
  lockedFields: Classification['lockedFields'];
}

/** What it is classified as: a Transfer, a Split, a Category, or nothing yet. */
function classificationBadge(
  { transferId }: Pick<Transaction, 'transferId'>,
  { category, splitLines }: BadgeClassification,
): StatusBadge {
  if (transferId) return { label: 'Transfer', tone: 'info' };
  if (splitLines.length > 0) return { label: `Split (${splitLines.length})`, tone: 'neutral' };
  if (category) return { label: category.name, tone: 'positive' };
  return { label: 'Unclassified', tone: 'warning' };
}

/**
 * The Transaction's status at a glance: its classification, where it came from, and how many
 * fields are locked against Rules (when any is).
 */
export function transactionBadges(
  transaction: Pick<Transaction, 'transferId' | 'isManual'>,
  classification: BadgeClassification,
): StatusBadge[] {
  const badges = [
    classificationBadge(transaction, classification),
    { label: transaction.isManual ? 'Manual' : 'Imported', tone: 'neutral' } as const,
  ];
  const locked = classification.lockedFields.length;
  return locked > 0 ? [...badges, { label: `${locked} locked`, tone: 'neutral' }] : badges;
}
