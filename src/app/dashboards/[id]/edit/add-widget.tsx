'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { ActionForm } from '@/components/action-form';
import { INPUT_CLASS } from '@/components/named-list';
import { CARD_CLASS, PILL_BUTTON_CLASS, SMALL_BUTTON_CLASS } from '@/components/surface';
import type { WidgetPickerOption } from '@/lib/reporting/widget-picker';
import { addBalancesWidgetAction, copyWidgetToDashboardAction } from '../../actions';

interface AddWidgetProps {
  dashboardId: string;
  /** Every Widget that can be copied here (GLOSSARY: Standalone Widget). */
  savedWidgets: WidgetPickerOption[];
}

/**
 * What can be added to a Dashboard: a new Widget, the Account balances or a copy of a saved
 * Widget. Each lands in the first free spot at the bottom of the board (ADR-0010).
 */
export function AddWidgetChoices({ dashboardId, savedWidgets }: AddWidgetProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/widgets/new?dashboard=${dashboardId}`} className={SMALL_BUTTON_CLASS}>
        New Widget
      </Link>
      <ActionForm
        action={addBalancesWidgetAction.bind(null, dashboardId)}
        label="Add Account balances"
      >
        <button type="submit" className={SMALL_BUTTON_CLASS}>
          Account balances
        </button>
      </ActionForm>
      {savedWidgets.length > 0 && (
        <ActionForm
          action={copyWidgetToDashboardAction.bind(null, dashboardId)}
          label="Add an existing Widget"
          className="flex items-center gap-2"
        >
          <select name="widgetId" aria-label="Existing Widget" className={`${INPUT_CLASS} text-xs`}>
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
  );
}

/** Edit mode's "Add Widget" in the header: the choices in a menu that closes on a choice. */
export function AddWidgetMenu(props: AddWidgetProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  return (
    <details
      ref={menuRef}
      className="relative"
      onSubmit={() => menuRef.current?.removeAttribute('open')}
    >
      <summary
        className={`${PILL_BUTTON_CLASS} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        Add Widget
      </summary>
      <div className={`${CARD_CLASS} absolute right-0 z-20 mt-2 w-max max-w-[min(90vw,32rem)] p-3`}>
        <AddWidgetChoices {...props} />
      </div>
    </details>
  );
}

/** Edit mode on a Dashboard without Widgets: the way to add its first one. */
export function EmptyBoard(props: AddWidgetProps) {
  return (
    <div className="flex flex-col items-start gap-3 py-16">
      <p className="text-lg">No Widgets yet.</p>
      <p className="text-muted">
        Add the first Widget: build a new one, start from your Account balances, or copy a saved
        one.
      </p>
      <AddWidgetChoices {...props} />
    </div>
  );
}
