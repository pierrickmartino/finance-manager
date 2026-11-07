'use client';

import { useId, useState, type ReactNode } from 'react';
import { STORY } from '../dashboards/[id]/story/palette';

type Pane = 'story' | 'data';

const PANES: { id: Pane; label: string }[] = [
  { id: 'story', label: 'Story' },
  { id: 'data', label: 'Data' },
];

/**
 * The Widget editor's preview: the chapter the Widget becomes in the Dashboard Story, and the
 * raw table behind it to check the query. Both panes are drawn; only the chosen one shows.
 */
export function PreviewTabs({ story, data }: { story: ReactNode; data: ReactNode }) {
  const [pane, setPane] = useState<Pane>('story');
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
            className="rounded-md border-b-2 px-3 py-1 text-sm font-medium"
            style={{
              borderColor: pane === item.id ? STORY.accent : 'transparent',
              color: pane === item.id ? STORY.ink : STORY.muted,
            }}
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
          {item.id === 'story' ? story : data}
        </div>
      ))}
    </div>
  );
}
