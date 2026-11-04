import type { Classification, Transaction } from '@/server/services/transactions';
import { isPartlyTransfer, PARTLY_TRANSFER, type WithSplitLines } from '../transaction-display';

export type BadgeTone = 'warning' | 'info' | 'positive' | 'neutral';

export interface StatusBadge {
  label: string;
  tone: BadgeTone;
}

/** The parts of a Classification the badges read. */
export interface BadgeClassification extends WithSplitLines {
  category: { name: string } | null;
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
  const badges: StatusBadge[] = [
    classificationBadge(transaction, classification),
    ...(isPartlyTransfer(classification)
      ? [{ label: PARTLY_TRANSFER, tone: 'info' } as const]
      : []),
    { label: transaction.isManual ? 'Manual' : 'Imported', tone: 'neutral' },
  ];
  const locked = classification.lockedFields.length;
  return locked > 0 ? [...badges, { label: `${locked} locked`, tone: 'neutral' }] : badges;
}
