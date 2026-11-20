import { Suspense } from 'react';
import { CARD_CLASS, PLACEHOLDER_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { checkCompleteness } from '@/server/services/completeness';
import type { ServiceContext } from '@/server/services/context';
import { CompletenessNotice } from './completeness-notice';

interface StreamedCompletenessProps {
  ctx: ServiceContext;
  fmt: Formatter;
  today: string;
}

/** The Completeness check while it runs: one notice line, as tall as its closed headline. */
function NoticePlaceholder() {
  return (
    <section
      aria-label="Completeness check"
      aria-busy="true"
      className={`${CARD_CLASS} px-5 py-2.5 text-sm`}
    >
      <span className="sr-only">Loading</span>
      <div className={`${PLACEHOLDER_CLASS} h-5 w-1/2`} />
    </section>
  );
}

async function StreamedCompletenessNotice({ ctx, fmt, today }: StreamedCompletenessProps) {
  const entries = await checkCompleteness(ctx, { today });
  return <CompletenessNotice entries={entries} fmt={fmt} today={today} />;
}

/** The Completeness check above Analytics (ADR-0008, ADR-0015), streamed in behind one notice line. */
export function StreamedCompleteness(props: StreamedCompletenessProps) {
  return (
    <Suspense fallback={<NoticePlaceholder />}>
      <StreamedCompletenessNotice {...props} />
    </Suspense>
  );
}
