'use client';

import { useParams } from 'next/navigation';
import { CARD_CLASS, PLACEHOLDER_CLASS } from '@/components/surface';
import { TransactionMorph } from '../transaction-morph';

const PANEL = `${CARD_CLASS} flex flex-col gap-3 p-5`;

/**
 * The Transaction detail the moment a Transaction is opened, before its data arrives. Its
 * header carries the Transaction's name, so the row or the preview morphs into it straight
 * away (ADR-0012) and the page's content streams in behind.
 */
export default function Loading() {
  const { id } = useParams<{ id: string }>();
  return (
    <section aria-label="Loading the Transaction" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Loading</span>
      <div className={`${PLACEHOLDER_CLASS} h-5 w-28`} />
      <TransactionMorph transactionId={id} part="detail">
        <header
          aria-hidden="true"
          className={`${CARD_CLASS} flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4`}
        >
          <div className={`${PLACEHOLDER_CLASS} h-11 w-11 shrink-0 rounded-lg`} />
          <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
            <div className={`${PLACEHOLDER_CLASS} h-7 w-64 max-w-full`} />
            <div className={`${PLACEHOLDER_CLASS} h-5 w-48 max-w-full`} />
          </div>
          <div className={`${PLACEHOLDER_CLASS} h-9 w-36`} />
        </header>
      </TransactionMorph>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className={`${PANEL} h-72`}>
          <div className={`${PLACEHOLDER_CLASS} h-full`} />
        </div>
        <div className={`${PANEL} h-96`}>
          <div className={`${PLACEHOLDER_CLASS} h-full`} />
        </div>
      </div>
    </section>
  );
}
