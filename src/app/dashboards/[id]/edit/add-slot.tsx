'use client';

import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { SMALL_BUTTON_CLASS } from '@/components/surface';
import type { WidgetPickerOption } from '@/lib/reporting/widget-picker';
import { addBalancesWidgetAction, copyWidgetToDashboardAction } from '../../actions';
import { STORY } from '../story/palette';

interface AddSlotProps {
  dashboardId: string;
  /** Where the new chapter goes, from 0. */
  position: number;
  /** Every Widget that can be copied here (GLOSSARY: Standalone Widget). */
  savedWidgets: WidgetPickerOption[];
  isOpen?: boolean;
}

/**
 * "Add chapter" between two chapters: a new Widget, the Account balances or a copy of an
 * existing Widget, inserted at this place in the Story.
 */
export function AddSlot({ dashboardId, position, savedWidgets, isOpen = false }: AddSlotProps) {
  const positionField = <input type="hidden" name="position" value={position} />;
  return (
    <details open={isOpen} className="group py-3">
      <summary
        className="flex cursor-pointer list-none items-center gap-3 text-sm [&::-webkit-details-marker]:hidden"
        style={{ color: STORY.muted }}
      >
        <span aria-hidden className="h-px flex-1" style={{ background: STORY.rule }} />
        <span
          className="rounded-lg border px-3 py-1 hover:text-ink"
          style={{ borderColor: STORY.rule }}
        >
          <span aria-hidden>+ </span>Add chapter
          <span className="sr-only"> {position + 1}</span>
        </span>
        <span aria-hidden className="h-px flex-1" style={{ background: STORY.rule }} />
      </summary>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <Link
          href={`/widgets/new?dashboard=${dashboardId}&at=${position}`}
          className={SMALL_BUTTON_CLASS}
        >
          New Widget
        </Link>
        <ActionForm
          action={addBalancesWidgetAction.bind(null, dashboardId)}
          label={`Add Account balances as chapter ${position + 1}`}
        >
          {positionField}
          <button type="submit" className={SMALL_BUTTON_CLASS}>
            Account balances
          </button>
        </ActionForm>
        {savedWidgets.length > 0 && (
          <ActionForm
            action={copyWidgetToDashboardAction.bind(null, dashboardId)}
            label={`Add an existing Widget as chapter ${position + 1}`}
            className="flex items-center gap-2"
          >
            {positionField}
            <select
              name="widgetId"
              aria-label="Existing Widget"
              className="rounded-md border border-rule-strong bg-surface px-2 py-1 text-xs"
            >
              {savedWidgets.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button type="submit" className={SMALL_BUTTON_CLASS}>
              Add
            </button>
          </ActionForm>
        )}
      </div>
    </details>
  );
}
