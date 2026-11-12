'use client';

/**
 * PROTOTYPE (layout redesign, `?variant=`): three Dashboard layouts over the same data. Each
 * owns its structure; only the chart marks (CardBody, Sparkline) and the reporting helpers are
 * shared. Throwaway; see ./README.md.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FieldError } from '@/components/form';
import { useFormatter } from '@/components/formatter-provider';
import { findMonthFlows, spendingInsight, type MonthFlow } from '@/lib/reporting/overview';
import { chapterStory, storyHero } from '@/lib/reporting/story';
import type { RecentActivity } from '../dashboards/[id]/overview/overview-row';
import { Sparkline } from '../dashboards/[id]/overview/marks';
import { CardBody } from '../dashboards/[id]/overview/widget-card';
import type { StoryChapter } from '../dashboards/[id]/story/chapter';
import { withVariant, type LayoutVariant } from './variant';

export interface VariantDashboardProps {
  dashboardName: string;
  editHref: string;
  chapters: StoryChapter[];
  recent: RecentActivity[];
  tabs: ReactNode;
  notice?: ReactNode;
}

type Money = (minor: number) => string;

function useMoney(): Money {
  const fmt = useFormatter();
  return (minor) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
}

/** The numbers every variant headlines, worked out once. */
function useOverview(chapters: StoryChapter[]) {
  const hero = storyHero(chapters);
  const flow = findMonthFlows(chapters);
  const insight = flow ? spendingInsight(flow.months) : null;
  const nets = flow?.months.map((month) => month.net) ?? [];
  const kept = nets.reduce((total, net) => total + net, 0);
  const latest: MonthFlow | undefined = flow?.months.filter((m) => !m.isPartial).at(-1);
  return { hero, flow, insight, nets, kept, latest };
}

function WidgetNotes({ chapter }: { chapter: StoryChapter }) {
  return (
    <>
      {chapter.error && <FieldError message={chapter.error} />}
      {chapter.unconvertedCount > 0 && (
        <p className="text-sm text-warning">{chapter.unconvertedCount} left out: no FX rate yet.</p>
      )}
    </>
  );
}

const signed = (minor: number) => (minor > 0 ? 'text-positive' : 'text-negative');

// A: Ledger, a hairline grid -------------------------------------------------------------------

function LedgerDashboard({
  dashboardName,
  editHref,
  chapters,
  recent,
  tabs,
  notice,
}: VariantDashboardProps) {
  const money = useMoney();
  const fmt = useFormatter();
  const { hero, flow, insight, nets, kept, latest } = useOverview(chapters);
  const kpis = [
    hero && { label: hero.label, value: money(hero.value), href: hero.href },
    flow && { label: `Kept over ${nets.length} months`, value: money(kept), tone: signed(kept) },
    latest && { label: `In · ${latest.label}`, value: money(latest.income) },
    latest && { label: `Out · ${latest.label}`, value: money(-latest.expense) },
  ].filter(Boolean) as { label: string; value: string; href?: string; tone?: string }[];

  return (
    <div className="flex flex-col gap-5">
      {tabs}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{dashboardName}</h1>
          <p className="text-sm text-muted">
            Where you stand, where it went, and what changed this month.
          </p>
        </div>
        <Link
          href={withVariant(editHref, 'A')}
          className="border border-rule-strong bg-surface px-3 py-1.5 text-sm hover:bg-sunken"
        >
          Edit Dashboard
        </Link>
      </header>
      {notice}
      <dl className="grid grid-cols-2 gap-px border border-rule bg-rule lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-surface px-5 py-4">
            <dt className="text-xs text-muted">{kpi.label}</dt>
            <dd className={`mt-1 font-mono text-2xl tabular-nums ${kpi.tone ?? ''}`}>
              {kpi.href ? (
                <Link href={kpi.href} className="hover:underline">
                  {kpi.value}
                </Link>
              ) : (
                kpi.value
              )}
            </dd>
          </div>
        ))}
      </dl>
      {insight && flow && (
        <p className="flex flex-wrap items-center gap-x-3 border-l-4 border-accent bg-accent-tint px-4 py-3 text-sm">
          <strong className="font-semibold">{insight.headline}</strong>
          <span className="text-ink-soft">{insight.detail}</span>
          <Link href={flow.href} className="ml-auto font-medium text-accent-ink hover:underline">
            See the Transactions →
          </Link>
        </p>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-px border border-rule bg-rule md:grid-cols-2">
          {chapters.map((chapter) => {
            const story = chapterStory(chapter, money);
            return (
              <section key={chapter.id} className="flex flex-col gap-4 bg-surface p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-semibold">{chapter.name}</h2>
                  {story.lead && (
                    <span className="font-mono text-sm tabular-nums">{story.lead.detail}</span>
                  )}
                </div>
                {story.lead && <p className="-mt-3 text-xs text-muted">{story.lead.headline}</p>}
                <WidgetNotes chapter={chapter} />
                <CardBody chapter={chapter} money={money} />
                {story.facts.length > 0 && (
                  <dl className="grid gap-y-1 border-t border-rule pt-3 text-xs">
                    {story.facts.map((fact) => (
                      <div key={fact.label} className="flex justify-between gap-2">
                        <dt className="text-muted">{fact.label}</dt>
                        <dd className="font-mono tabular-nums">{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            );
          })}
        </div>
        <section className="border border-rule bg-surface xl:sticky xl:top-20">
          <div className="flex items-center justify-between border-b border-rule px-4 py-3">
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <Link
              href="/transactions?variant=A"
              className="text-xs text-accent-ink hover:underline"
            >
              View all
            </Link>
          </div>
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-28" />
              <col />
              <col className="w-32" />
            </colgroup>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id} className="border-b border-rule last:border-0 hover:bg-sunken">
                  <td className="py-2 pl-4 font-mono text-xs whitespace-nowrap text-muted">
                    {fmt.date(t.bookingDate)}
                  </td>
                  <td className="max-w-0 px-3 py-2">
                    <Link href={`/transactions/${t.id}`} className="block truncate hover:underline">
                      {t.name}
                    </Link>
                    <span className="block truncate text-xs text-muted">{t.category}</span>
                  </td>
                  <td
                    className={`py-2 pr-4 text-right font-mono whitespace-nowrap ${signed(t.amountMinor)}`}
                  >
                    {fmt.amount(t.amountMinor, { currency: t.currency })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

// B: Command, a headline band then content plus a side rail ------------------------------------

function CommandDashboard({
  dashboardName,
  editHref,
  chapters,
  recent,
  tabs,
  notice,
}: VariantDashboardProps) {
  const money = useMoney();
  const fmt = useFormatter();
  const { hero, flow, insight, nets, kept } = useOverview(chapters);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">{tabs}</div>
      <section className="grid gap-8 border-b border-rule pb-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm text-muted">
            {dashboardName} · {hero?.label}
          </p>
          {hero && (
            <Link
              href={hero.href}
              className="mt-1 block font-display text-6xl font-semibold tracking-[-0.04em] tabular-nums hover:text-accent-ink md:text-7xl"
            >
              {money(hero.value)}
            </Link>
          )}
          {flow && (
            <p className="mt-2 text-sm">
              <span className={`font-medium ${signed(kept)}`}>
                {kept >= 0 ? '+' : ''}
                {money(kept)}
              </span>{' '}
              <span className="text-muted">kept over {nets.length} months</span>
            </p>
          )}
          <div className="mt-4 max-w-xl">
            <Sparkline values={nets} />
          </div>
        </div>
        <div className="flex flex-col justify-between gap-6 rounded-lg bg-ink p-6 text-white">
          {insight && flow ? (
            <div>
              <p className="text-xs font-medium text-accent-tint/70">This month</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
                {insight.headline}
              </h2>
              <p className="mt-2 text-white/70">{insight.detail}</p>
            </div>
          ) : (
            <p className="text-white/70">No income-vs-expense Widget to compare months yet.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {flow && (
              <Link
                href={flow.href}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium hover:bg-accent-ink"
              >
                See the Transactions
              </Link>
            )}
            <Link
              href={withVariant(editHref, 'B')}
              className="rounded-md px-3 py-1.5 text-sm ring-1 ring-white/25 hover:bg-white/10"
            >
              Edit Dashboard
            </Link>
          </div>
        </div>
      </section>
      {notice}
      <div className="grid items-start gap-8 xl:grid-cols-[1fr_340px]">
        <div className="grid gap-6 md:grid-cols-2">
          {chapters.map((chapter) => {
            const story = chapterStory(chapter, money);
            return (
              <section
                key={chapter.id}
                className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5"
              >
                <div>
                  <h2 className="text-sm text-muted">{chapter.name}</h2>
                  {story.lead && (
                    <p className="mt-1 font-display text-2xl font-semibold tracking-tight tabular-nums">
                      {story.lead.detail}{' '}
                      <span className="text-sm font-normal text-muted">{story.lead.headline}</span>
                    </p>
                  )}
                </div>
                <WidgetNotes chapter={chapter} />
                <CardBody chapter={chapter} money={money} />
                {story.facts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {story.facts.map((fact) => (
                      <span
                        key={fact.label}
                        className="rounded-md bg-sunken px-2 py-1 text-xs text-ink-soft"
                      >
                        {fact.label}: <span className="font-medium text-ink">{fact.value}</span>
                      </span>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <aside className="xl:sticky xl:top-22">
          <div className="flex items-center justify-between pb-3">
            <h2 className="font-display text-lg font-semibold">Recent activity</h2>
            <Link href="/transactions?variant=B" className="text-sm text-accent-ink">
              View all
            </Link>
          </div>
          <ol className="relative flex flex-col border-l border-rule-strong pl-5">
            {recent.map((t) => (
              <li key={t.id} className="relative pb-4">
                <span
                  aria-hidden
                  className={`absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full ring-4 ring-paper ${t.amountMinor > 0 ? 'bg-positive' : 'bg-accent'}`}
                />
                <Link href={`/transactions/${t.id}`} className="group block">
                  <span className="flex justify-between gap-3">
                    <span className="truncate font-medium group-hover:underline">{t.name}</span>
                    <span className={`tabular-nums ${signed(t.amountMinor)}`}>
                      {fmt.amount(t.amountMinor, { currency: t.currency })}
                    </span>
                  </span>
                  <span className="block text-xs text-muted">
                    {t.category} · {fmt.date(t.bookingDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

// C: Broadsheet, a lead story and ruled columns ------------------------------------------------

function BroadsheetDashboard({
  dashboardName,
  editHref,
  chapters,
  recent,
  tabs,
  notice,
}: VariantDashboardProps) {
  const money = useMoney();
  const fmt = useFormatter();
  const { hero, flow, insight, nets, kept } = useOverview(chapters);
  return (
    <div className="flex flex-col gap-6">
      {tabs}
      <section className="grid gap-8 border-b border-ink pb-8 lg:grid-cols-[2fr_1fr]">
        <div>
          <p className="text-xs font-semibold tracking-wide text-accent-ink">{dashboardName}</p>
          <h1
            className="mt-2 font-display text-5xl leading-[1.02] font-semibold tracking-tight md:text-7xl"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            {insight?.headline ?? 'Where you stand.'}
          </h1>
          {insight && (
            <p className="mt-4 max-w-2xl font-serif text-xl leading-snug text-ink-soft">
              {insight.detail}
            </p>
          )}
          <p className="mt-4 flex flex-wrap gap-4 text-sm">
            {flow && (
              <Link href={flow.href} className="font-medium text-hero underline underline-offset-4">
                See the Transactions
              </Link>
            )}
            <Link
              href={withVariant(editHref, 'C')}
              className="text-ink-soft underline underline-offset-4"
            >
              Edit Dashboard
            </Link>
          </p>
        </div>
        {hero && (
          <div className="border-ink lg:border-l lg:pl-8">
            <p className="font-serif text-lg italic">{hero.label}</p>
            <Link
              href={hero.href}
              className="block font-display text-5xl font-semibold tabular-nums hover:underline"
            >
              {money(hero.value)}
            </Link>
            {flow && (
              <p className="mt-1 text-sm text-muted">
                <span className={signed(kept)}>{money(kept)}</span> kept over {nets.length} months
              </p>
            )}
            <Sparkline values={nets} />
          </div>
        )}
      </section>
      {notice}
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_300px]">
        <div className="grid gap-x-8 md:grid-cols-2 2xl:grid-cols-3">
          {chapters.map((chapter) => {
            const story = chapterStory(chapter, money);
            return (
              <article
                key={chapter.id}
                className="flex flex-col gap-3 border-t-2 border-ink pt-3 pb-8"
              >
                <p className="text-xs font-semibold tracking-wide text-accent-ink">
                  {chapter.name}
                </p>
                {story.lead && (
                  <h2 className="font-display text-2xl leading-tight font-semibold">
                    {story.lead.headline} — {story.lead.detail}
                  </h2>
                )}
                <WidgetNotes chapter={chapter} />
                <CardBody chapter={chapter} money={money} />
                {story.facts.length > 0 && (
                  <p className="font-serif text-base leading-snug text-ink-soft">
                    {story.facts.map((fact) => `${fact.label}: ${fact.value}.`).join(' ')}
                  </p>
                )}
              </article>
            );
          })}
        </div>
        <aside className="border-t-2 border-ink pt-3 lg:border-l lg:border-t-0 lg:border-l-rule lg:pt-0 lg:pl-6">
          <h2 className="font-display text-2xl font-semibold">In brief</h2>
          <ul className="mt-2 divide-y divide-rule">
            {recent.map((t) => (
              <li key={t.id} className="py-3">
                <Link href={`/transactions/${t.id}`} className="group block">
                  <span className="block font-serif text-lg group-hover:underline">
                    {t.name},{' '}
                    <span className={`tabular-nums ${signed(t.amountMinor)}`}>
                      {fmt.amount(t.amountMinor, { currency: t.currency })}
                    </span>
                  </span>
                  <span className="text-xs text-muted">
                    {fmt.date(t.bookingDate)} · {t.category}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/transactions?variant=C" className="mt-2 inline-block text-sm underline">
            All Transactions
          </Link>
        </aside>
      </div>
    </div>
  );
}

export function VariantDashboard({
  variant,
  ...props
}: VariantDashboardProps & { variant: Exclude<LayoutVariant, 'current'> }) {
  if (props.chapters.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {props.tabs}
        <p className="py-16 text-lg text-muted">No Widgets yet.</p>
      </div>
    );
  }
  if (variant === 'A') return <LedgerDashboard {...props} />;
  if (variant === 'B') return <CommandDashboard {...props} />;
  return <BroadsheetDashboard {...props} />;
}
