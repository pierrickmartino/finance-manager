/**
 * PROTOTYPE ONLY — throwaway (see /prototype skill). Question: how should "Categories per
 * period" make a Category group and its Categories (Income vs Income › Salary) read as a
 * hierarchy? Variants A/B/C on /analytics via `?variant=`; `current` is today's card.
 *
 * Reads the section's existing card data plus the Category groups (for type and membership).
 * No service changes.
 */

import { Suspense } from 'react';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import type { AnalyticsCard } from '@/server/services/analytics';
import type { CategoryGroup } from '@/server/services/categories';
import { CardSection } from './card-section';
import { CategoryVariants, type ProtoGroup } from './categories-per-period-variants.prototype';

export const CATEGORY_VARIANTS = [
  { key: 'current', name: 'Today’s heatmap' },
  { key: 'A', name: 'Indented tree heatmap' },
  { key: 'B', name: 'Collapsible groups' },
  { key: 'C', name: 'Group blocks + share bars' },
] as const;

export async function CategoriesPerPeriodPrototype({
  variant,
  card,
  groups,
}: {
  variant: string;
  card: Promise<AnalyticsCard>;
  groups: Promise<CategoryGroup[]>;
}) {
  const switcher = (
    <Suspense>
      <PrototypeSwitcher variants={CATEGORY_VARIANTS} />
    </Suspense>
  );
  if (variant === 'current' || !CATEGORY_VARIANTS.some((v) => v.key === variant)) {
    return (
      <>
        <CardSection
          card={card}
          empty="Nothing to show yet: no classified Transactions in these periods."
        />
        {switcher}
      </>
    );
  }
  const [loaded, all] = await Promise.all([card, groups]);
  const protoGroups: ProtoGroup[] = all.map((group) => ({
    id: group.id,
    name: group.name,
    type: group.type,
    categoryIds: group.categories.map((category) => category.id),
  }));
  return (
    <>
      <CategoryVariants variant={variant} card={loaded} groups={protoGroups} />
      {switcher}
    </>
  );
}
