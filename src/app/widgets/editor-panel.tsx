import type { ReactNode } from 'react';
import { STORY_SHOWN_AS } from '@/lib/reporting/story';
import {
  VISUALISATION_LABELS,
  VISUALISATIONS,
  type Visualisation,
} from '@/server/services/reporting';

/** The Widget editor's side panel: collapsible sections of labelled controls. */

export const PANEL_INPUT =
  'w-full min-w-0 rounded-md border border-rule-strong bg-surface px-2 py-1 text-sm';

interface PanelSectionProps {
  title: string;
  /** Short status shown on the right of the heading (e.g. "2 active"). */
  badge?: string;
  isOpen?: boolean;
  /** Extra classes, e.g. a `group/…` name for state-dependent fields. */
  className?: string;
  children: ReactNode;
}

export function PanelSection({
  title,
  badge,
  isOpen = true,
  className = '',
  children,
}: PanelSectionProps) {
  return (
    <details open={isOpen} className={`group border-b border-rule last:border-b-0 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <span className="flex items-center gap-2 text-xs font-normal text-muted">
          {badge}
          <span
            aria-hidden="true"
            className="transition-transform group-open:rotate-90 motion-reduce:transition-none"
          >
            ›
          </span>
        </span>
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">{children}</div>
    </details>
  );
}

/** A control with its label on the left. */
export function PanelRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 text-sm">
      <span className="text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

const VISUALISATION_PATHS: Record<Visualisation, string> = {
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  line: 'M3 17l6-6 4 4 8-8',
  stacked_bar: 'M5 20V9h4v11M5 14h4M10 20V4h4v16M10 11h4M15 20v-8h4v8M15 16h4',
  donut: 'M12 3a9 9 0 1 0 9 9h-5a4 4 0 1 1-4-4zM15 3.5A9 9 0 0 1 20.5 9H15z',
  number: 'M9 4L7 20M17 4l-2 16M4 9h16M3 15h16',
};

const ALWAYS_SHARE = { short: 'as a share', full: 'In the Story: a share band of the Accounts' };

/**
 * The visualisation as a row of icon tiles (radio buttons sent as `vis`), each saying what it
 * becomes in the Dashboard Story. The Account balances are always told as a share.
 */
export function VisualisationPicker({
  value,
  isAlwaysShare = false,
}: {
  value: Visualisation;
  isAlwaysShare?: boolean;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Visualisation</legend>
      <div className="grid grid-cols-5 gap-1.5">
        {VISUALISATIONS.map((visualisation) => (
          <label
            key={visualisation}
            title={(isAlwaysShare ? ALWAYS_SHARE : STORY_SHOWN_AS[visualisation]).full}
            className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-rule-strong bg-surface px-1 py-2 text-center text-[11px] leading-tight hover:border-faint has-checked:border-ink has-checked:ring-2 has-checked:ring-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-info"
          >
            <input
              type="radio"
              name="vis"
              value={visualisation}
              defaultChecked={visualisation === value}
              className="sr-only"
            />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-5 w-5"
            >
              <path d={VISUALISATION_PATHS[visualisation]} />
            </svg>
            {VISUALISATION_LABELS[visualisation]}
            <span className="text-[10px] text-muted">
              {(isAlwaysShare ? ALWAYS_SHARE : STORY_SHOWN_AS[visualisation]).short}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
