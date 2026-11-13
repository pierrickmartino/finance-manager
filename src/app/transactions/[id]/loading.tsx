'use client';

import type { ReactElement } from 'react';
import { useParams } from 'next/navigation';
import { PLACEHOLDER_CLASS } from '@/components/surface';
import { TransactionMorph } from '../transaction-morph';
import {
  DETAIL_COLUMNS_CLASS,
  DETAIL_HEADER_CLASS,
  DETAIL_HEADER_INITIAL_CLASS,
  DETAIL_HEADER_TITLE_CLASS,
  DETAIL_PANEL_CLASS,
} from './detail-layout';

/**
 * The Transaction detail the moment a Transaction is opened, before its data arrives. Its
 * header carries the Transaction's name, so the row or the preview morphs into it straight
 * away (ADR-0012) and the page's content streams in behind. It draws with the page's own
 * layout classes (`detail-layout.ts`), so the morph lands where the page's header will be.
 */
export default function Loading(): ReactElement {
  const { id } = useParams<{ id: string }>();
  return (
    <section aria-label="Loading the Transaction" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Loading</span>
      <div className={`${PLACEHOLDER_CLASS} h-5 w-28`} />
      <TransactionMorph transactionId={id} part="detail">
        <header aria-hidden="true" className={DETAIL_HEADER_CLASS}>
          <div className={`${PLACEHOLDER_CLASS} ${DETAIL_HEADER_INITIAL_CLASS}`} />
          <div className={DETAIL_HEADER_TITLE_CLASS}>
            <div className={`${PLACEHOLDER_CLASS} h-7 w-64 max-w-full`} />
            <div className={`${PLACEHOLDER_CLASS} h-5 w-48 max-w-full`} />
          </div>
          <div className={`${PLACEHOLDER_CLASS} h-9 w-36`} />
        </header>
      </TransactionMorph>
      <div className={DETAIL_COLUMNS_CLASS}>
        <div className={`${DETAIL_PANEL_CLASS} h-72`}>
          <div className={`${PLACEHOLDER_CLASS} h-full`} />
        </div>
        <div className={`${DETAIL_PANEL_CLASS} h-96`}>
          <div className={`${PLACEHOLDER_CLASS} h-full`} />
        </div>
      </div>
    </section>
  );
}
