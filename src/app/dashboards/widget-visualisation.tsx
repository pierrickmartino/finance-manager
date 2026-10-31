'use client';

import { useState } from 'react';
import type { ChartSource } from '@/lib/reporting/chart-data';
import type { Visualisation } from '@/server/services/reporting';
import { PivotTable } from '../reports/pivot-table';
import {
  DonutWidgetChart,
  LineWidgetChart,
  SingleNumberWidget,
  StackedBarWidgetChart,
} from './charts';

const CHARTS = {
  line: LineWidgetChart,
  stacked_bar: StackedBarWidgetChart,
  donut: DonutWidgetChart,
} as const;

interface WidgetVisualisationProps {
  data: ChartSource;
  title: string;
  visualisation: Visualisation;
  /** On a Dashboard card (fills the card); otherwise a fixed height for the editor preview. */
  isCompact?: boolean;
}

/**
 * Shows the engine's result table as the Widget's visualisation. Charts can switch to their
 * table, which carries every value as text (and a link) for anyone who can't read the colours.
 */
export function WidgetVisualisation({
  data,
  title,
  visualisation,
  isCompact = false,
}: WidgetVisualisationProps) {
  const [isTable, setTable] = useState(false);
  if (visualisation === 'table')
    return <PivotTable data={data} title={title} isCompact={isCompact} />;
  if (visualisation === 'number') return <SingleNumberWidget data={data} title={title} />;
  const Chart = CHARTS[visualisation];
  return (
    <div className={`flex flex-col gap-2 ${isCompact ? 'h-full' : ''}`}>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setTable(!isTable)}
          className="text-xs text-zinc-600 underline dark:text-zinc-400"
        >
          {isTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      <div className={isCompact ? 'min-h-0 flex-1' : 'h-80'}>
        {isTable ? (
          <PivotTable data={data} title={title} isCompact />
        ) : (
          <Chart data={data} title={title} />
        )}
      </div>
    </div>
  );
}
