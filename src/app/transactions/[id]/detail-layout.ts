import { CARD_CLASS } from '@/components/surface';

/*
 * The Transaction detail's layout, shared by the page and its loading skeleton (`loading.tsx`).
 * The skeleton's header is what an opened Transaction morphs into (ADR-0012), so both draw it
 * from these: a change here moves the page and its skeleton together.
 */

/** One of the page's cards: the Split section, Classification, Transfer, bank fields. */
export const DETAIL_PANEL_CLASS = `${CARD_CLASS} flex flex-col gap-3 p-5`;

/** The two columns under the header: the edits on the left, the bank fields and History right. */
export const DETAIL_COLUMNS_CLASS =
  'grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]';

/** The header strip (`TransactionHeader`). */
export const DETAIL_HEADER_CLASS = `${CARD_CLASS} flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4`;

/** The header's initial: its box, which the page fills with a letter. */
export const DETAIL_HEADER_INITIAL_CLASS = 'h-11 w-11 shrink-0 rounded-lg';

/** The header's name and its date, Account and status beneath. */
export const DETAIL_HEADER_TITLE_CLASS = 'flex min-w-0 flex-1 basis-60 flex-col gap-1.5';
