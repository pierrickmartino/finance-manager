'use client';

import { useId, useState, type ReactNode } from 'react';

type Pane = 'card' | 'data';

const PANES: { id: Pane; label: string }[] = [
  { id: 'card', label: 'Card' },
  { id: 'data', label: 'Data' },
];

/**
 * The Widget editor's preview: the card the Widget becomes on its Dashboard, and the raw table
 * behind it to check the query. Both panes are drawn; only the chosen one shows.
 */
export function PreviewTabs({ card, data }: { card: ReactNode; data: ReactNode }) {
  const [pane, setPane] = useState<Pane>('card');
  const baseId = useId();
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Preview" className="flex gap-1">
        {PANES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${baseId}-${item.id}-tab`}
            aria-selected={pane === item.id}
            aria-controls={`${baseId}-${item.id}`}
            onClick={() => setPane(item.id)}
            className="rounded-md border-b-2 border-transparent px-3 py-1 text-sm font-medium text-muted aria-selected:border-accent-ink aria-selected:text-ink"
          >
            {item.label}
          </button>
        ))}
      </div>
      {PANES.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-${item.id}`}
          aria-labelledby={`${baseId}-${item.id}-tab`}
          hidden={pane !== item.id}
        >
          {item.id === 'card' ? card : data}
        </div>
      ))}
    </div>
  );
}
