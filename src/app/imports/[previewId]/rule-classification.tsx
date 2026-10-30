import Link from 'next/link';
import type { RuleClassification } from '@/server/services/rules';

interface RuleClassificationCellProps {
  classification: RuleClassification | null;
}

function ByRule({ ruleId, ruleName }: { ruleId: string; ruleName: string }) {
  return (
    <span className="text-xs text-zinc-500">
      {' '}
      (Rule{' '}
      <Link href={`/rules/${ruleId}`} className="hover:underline">
        {ruleName}
      </Link>
      )
    </span>
  );
}

/** The Payee, Category and Tags the Rules give an entry, and which Rule set each (spec 29). */
export function RuleClassificationCell({ classification }: RuleClassificationCellProps) {
  if (!classification) return null;
  const { payee, category, tags } = classification;
  if (!payee && !category && tags.length === 0) {
    return <span className="text-zinc-500">No Rule matched</span>;
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
      {payee && (
        <>
          <dt className="text-zinc-500">Payee</dt>
          <dd>
            {payee.name}
            <ByRule {...payee} />
          </dd>
        </>
      )}
      {category && (
        <>
          <dt className="text-zinc-500">Category</dt>
          <dd>
            {category.name}
            <ByRule {...category} />
          </dd>
        </>
      )}
      {tags.length > 0 && (
        <>
          <dt className="text-zinc-500">Tags</dt>
          <dd>
            {tags.map((tag, index) => (
              <span key={tag.id}>
                {index > 0 && ', '}
                {tag.name}
                <ByRule {...tag} />
              </span>
            ))}
          </dd>
        </>
      )}
    </dl>
  );
}
