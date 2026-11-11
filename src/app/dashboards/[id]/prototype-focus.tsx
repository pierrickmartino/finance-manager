'use client';

/**
 * PROTOTYPE — throwaway. Variant C, "Focus": no grid of cards. A strip of four headline numbers,
 * then one Widget at a time on a large stage, picked from a list of every Widget on the
 * Dashboard (each with its one-line story), and a ledger of the latest Transactions. Stays in
 * the design system's ink and vermilion; the inspiration's teal stays in the hero.
 */

import Link from 'next/link';
import { useState } from 'react';
import { FieldError } from '@/components/form';
import { useFormatter } from '@/components/formatter-provider';
import { chapterKind, chapterStory } from '@/lib/reporting/story';
import { derive } from './prototype-derive';
import type { RecentTransaction } from './prototype-recent';
import type { StoryChapter } from './story/chapter';
import { PeriodBars, RankedBars, ShareBand, TrendChart } from './story/chapter-charts';
import { StoryStillness } from './story/stillness';

interface Props {
  dashboardName: string;
  editHref: string;
  chapters: StoryChapter[];
  recent: RecentTransaction[];
}

function Stat({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: string;
  note?: string;
  href?: string;
}) {
  const number = (
    <span className="font-display text-3xl tracking-tight tabular-nums md:text-4xl">{value}</span>
  );
  return (
    <div className="flex flex-col gap-1 border-rule py-4 md:border-l md:pl-6 md:first:border-l-0 md:first:pl-0">
      <span className="text-sm text-muted">{label}</span>
      {href ? (
        <Link href={href} className="hover:text-accent-ink">
          {number}
        </Link>
      ) : (
        number
      )}
      {note && <span className="text-sm text-muted">{note}</span>}
    </div>
  );
}

function StatStrip({ chapters }: { chapters: StoryChapter[] }) {
  const fmt = useFormatter();
  const money = (minor: number) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const { netWorth, flow } = derive(chapters);
  const income = flow ? flow.months.reduce((t, m) => t + m.income, 0) : null;
  const expense = flow ? flow.months.reduce((t, m) => t + m.expense, 0) : null;
  const kept = income && expense != null ? (income - expense) / income : null;
  return (
    <div className="grid grid-cols-2 gap-x-6 border-y border-rule md:grid-cols-4">
      <Stat
        label="Net worth today"
        value={netWorth ? money(netWorth.value) : '—'}
        note={netWorth ? `${netWorth.accounts.length} Accounts` : undefined}
        href={netWorth?.href}
      />
      <Stat
        label="In, last 12 months"
        value={income != null ? money(income) : '—'}
        href={flow?.href}
      />
      <Stat
        label="Out, last 12 months"
        value={expense != null ? money(expense) : '—'}
        href={flow?.href}
      />
      <div className="flex flex-col gap-1 border-rule py-4 md:border-l md:pl-6">
        <span className="text-sm text-muted">Kept</span>
        <span className="font-display text-3xl tracking-tight text-accent tabular-nums md:text-4xl">
          {kept != null ? `${Math.round(kept * 100)}%` : '—'}
        </span>
        <span aria-hidden className="mt-1 h-1.5 w-full rounded-full bg-sunken">
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: `${Math.max(0, Math.min(1, kept ?? 0)) * 100}%` }}
          />
        </span>
      </div>
    </div>
  );
}

function StageChart({ chapter }: { chapter: StoryChapter }) {
  const fmt = useFormatter();
  const { data } = chapter;
  if (!data) return null;
  if (data.rows.length === 0) return <p className="text-muted">No data in this date range yet.</p>;
  switch (chapterKind(chapter)) {
    case 'number':
      return (
        <p className="font-display text-7xl tabular-nums">
          {data.total == null ? '—' : fmt.amount(data.total, { currency: 'CHF', isWhole: true })}
        </p>
      );
    case 'share':
      return <ShareBand data={data} title={chapter.name} />;
    case 'ranking':
      return <RankedBars data={data} title={chapter.name} />;
    case 'trend':
      return <TrendChart data={data} title={chapter.name} />;
    case 'bars':
      return <PeriodBars data={data} title={chapter.name} />;
  }
}

function Stage({ chapter }: { chapter: StoryChapter }) {
  const fmt = useFormatter();
  const story = chapterStory(chapter, (minor) =>
    fmt.amount(minor, { currency: 'CHF', isWhole: true }),
  );
  return (
    <section aria-labelledby="stage-title" className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="stage-title" className="text-sm font-medium text-muted">
            {chapter.name}
          </h2>
          {story.lead && (
            <p className="mt-1 font-display text-4xl leading-tight tracking-tight">
              {story.lead.headline} <span className="text-accent-ink">{story.lead.detail}</span>
            </p>
          )}
        </div>
        {chapter.data && (
          <Link href={chapter.data.hrefs.total} className="text-sm underline underline-offset-4">
            {chapter.source === 'account_balances' ? 'See the Accounts' : 'See the Transactions'}
          </Link>
        )}
      </div>
      {chapter.error && <FieldError message={chapter.error} />}
      {/* Keyed so a newly picked Widget draws fresh; still, so it shows without scrolling. */}
      <StoryStillness isStill>
        <div key={chapter.id}>
          <StageChart chapter={chapter} />
        </div>
      </StoryStillness>
      {story.facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-4 border-t border-rule pt-4 md:grid-cols-3">
          {story.facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-sm text-muted">{fact.label}</dt>
              <dd className="text-lg tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function WidgetList({
  chapters,
  currentId,
  onPick,
}: {
  chapters: StoryChapter[];
  currentId: string;
  onPick: (id: string) => void;
}) {
  const fmt = useFormatter();
  return (
    <nav aria-label="Widgets" className="flex flex-col">
      {chapters.map((chapter, index) => {
        const story = chapterStory(chapter, (minor) =>
          fmt.amount(minor, { currency: 'CHF', isWhole: true }),
        );
        const isCurrent = chapter.id === currentId;
        return (
          <button
            key={chapter.id}
            type="button"
            onClick={() => onPick(chapter.id)}
            aria-current={isCurrent ? 'true' : undefined}
            className={`group flex gap-3 border-l-2 py-3 pr-2 pl-4 text-left ${
              isCurrent ? 'border-accent bg-accent-tint' : 'border-rule hover:bg-sunken'
            }`}
          >
            <span
              className={`font-display text-2xl leading-none italic ${isCurrent ? 'text-accent' : 'text-faint'}`}
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{chapter.name}</span>
              <span className="block truncate text-sm text-muted">
                {story.lead ? `${story.lead.headline} · ${story.lead.detail}` : 'One number'}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function Ledger({ recent }: { recent: RecentTransaction[] }) {
  const fmt = useFormatter();
  return (
    <section aria-labelledby="ledger-title">
      <div className="flex items-baseline justify-between border-b border-ink pb-2">
        <h2 id="ledger-title" className="font-display text-2xl tracking-tight">
          Latest Transactions
        </h2>
        <Link href="/transactions" className="text-sm underline underline-offset-4">
          All Transactions
        </Link>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {recent.map((t) => (
            <tr key={t.id} className="border-b border-rule hover:bg-sunken">
              <td className="py-2.5 pr-4 whitespace-nowrap text-muted tabular-nums">
                {fmt.date(t.bookingDate)}
              </td>
              <td className="w-full py-2.5 pr-4">
                <Link href={`/transactions/${t.id}`} className="font-medium hover:underline">
                  {t.name}
                </Link>
                <span className="ml-2 text-muted">{t.category}</span>
              </td>
              <td
                className={`py-2.5 text-right whitespace-nowrap tabular-nums ${t.amountMinor > 0 ? 'text-positive' : ''}`}
              >
                {fmt.amount(t.amountMinor, { currency: t.currency })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function PrototypeFocus({ dashboardName, editHref, chapters, recent }: Props) {
  const [currentId, setCurrentId] = useState(chapters[0]?.id ?? '');
  const current = chapters.find((chapter) => chapter.id === currentId) ?? chapters[0];
  return (
    <div className="flex flex-col gap-8 px-1 md:px-2">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl tracking-tight">{dashboardName}</h1>
        <Link
          href={editHref}
          className="rounded-md border border-rule-strong bg-surface px-3 py-1.5 text-sm font-medium hover:bg-sunken"
        >
          Edit Dashboard
        </Link>
      </header>
      <StatStrip chapters={chapters} />
      {current && (
        <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <WidgetList chapters={chapters} currentId={current.id} onPick={setCurrentId} />
          <Stage chapter={current} />
        </div>
      )}
      <Ledger recent={recent} />
    </div>
  );
}
