import { Suspense } from 'react';
import type { Formatter } from '@/lib/format';
import { rowsHeight } from '@/lib/reporting/board';
import { cardFrame, timeAxisOf } from '@/lib/reporting/card';
import { checkCompleteness } from '@/server/services/completeness';
import type { ServiceContext } from '@/server/services/context';
import type { Widget } from '@/server/services/reporting';
import { CardErrorBoundary } from './overview/card-error-boundary';
import {
  NoticePlaceholder,
  TilePlaceholder,
  WidgetCardPlaceholder,
} from './overview/card-placeholder';
import {
  InsightCard,
  NetWorthCard,
  RecentActivityCard,
  type RecentActivity,
} from './overview/overview-row';
import { BOARD_CARD_CLASS, BoardCell, BoardGrid, type BoardCard } from './overview/widget-board';
import { WidgetCard } from './overview/widget-card';
import { CompletenessNotice } from './completeness-notice';

/*
 * The Dashboard Story's parts that wait on a query, each streamed in behind its own Suspense
 * boundary so the page shell renders at once. Each Widget's card is a promise started once
 * by the page and shared: its card and the overview row read the same one, so no query runs twice.
 */

/** The cards that loaded; one that failed unexpectedly is left out (its own card says so). */
async function loadedCards(cards: Promise<BoardCard>[]): Promise<BoardCard[]> {
  const results = await Promise.allSettled(cards);
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

/** A Widget with its card still on its way: the Widget alone is enough for its placeholder. */
export interface StreamedWidget {
  widget: Widget;
  card: Promise<BoardCard>;
}

async function StreamedCard({ card }: { card: Promise<BoardCard> }) {
  return <WidgetCard card={await card} className={BOARD_CARD_CLASS} />;
}

/**
 * The board, each Widget's card streamed in as soon as its own query finishes, in any order.
 * Until then, its cell holds a placeholder of the card's size with the Widget's name.
 */
export function StreamedBoard({ cards }: { cards: StreamedWidget[] }) {
  return (
    <BoardGrid>
      {cards.map(({ widget, card }) => {
        // Before the query has run there is no data: the card is framed from the Widget alone.
        const frame = cardFrame({
          ...widget,
          timeAxis: timeAxisOf(widget.query),
          data: null,
        });
        const shape = frame.placeholder;
        const height = rowsHeight(widget.layout?.h ?? frame.sizes.initial.h);
        return (
          <BoardCell key={widget.id} layout={widget.layout}>
            <CardErrorBoundary name={widget.name}>
              <Suspense
                fallback={
                  <WidgetCardPlaceholder name={widget.name} shape={shape} height={height} />
                }
              >
                <StreamedCard card={card} />
              </Suspense>
            </CardErrorBoundary>
          </BoardCell>
        );
      })}
    </BoardGrid>
  );
}

async function StreamedNetWorthAndInsight({ cards }: { cards: Promise<BoardCard>[] }) {
  const loaded = await loadedCards(cards);
  return (
    <>
      <NetWorthCard cards={loaded} />
      <InsightCard cards={loaded} />
    </>
  );
}

async function StreamedRecent({ recent }: { recent: Promise<RecentActivity[]> }) {
  return <RecentActivityCard recent={await recent} />;
}

/**
 * The overview row's cards. The net worth and insight cards are worked out from every card,
 * so they wait for all of them; recent activity has a query of its own and arrives on its own.
 */
export function StreamedOverview({
  cards,
  recent,
}: {
  cards: Promise<BoardCard>[];
  recent: Promise<RecentActivity[]>;
}) {
  return (
    <>
      <Suspense
        fallback={
          <>
            <TilePlaceholder label="Net worth" className="lg:row-span-2" />
            <TilePlaceholder label="This month's insight" className="lg:row-span-2" />
          </>
        }
      >
        <StreamedNetWorthAndInsight cards={cards} />
      </Suspense>
      <Suspense fallback={<TilePlaceholder label="Recent activity" className="lg:row-span-2" />}>
        <StreamedRecent recent={recent} />
      </Suspense>
    </>
  );
}

async function StreamedCompletenessNotice({
  ctx,
  fmt,
  today,
}: {
  ctx: ServiceContext;
  fmt: Formatter;
  today: string;
}) {
  const entries = await checkCompleteness(ctx, { today });
  return <CompletenessNotice entries={entries} fmt={fmt} today={today} />;
}

/** The home Dashboard's Completeness check (ADR-0008), streamed in behind one notice line. */
export function StreamedCompleteness(props: {
  ctx: ServiceContext;
  fmt: Formatter;
  today: string;
}) {
  return (
    <Suspense fallback={<NoticePlaceholder />}>
      <StreamedCompletenessNotice {...props} />
    </Suspense>
  );
}
