'use client';

/** PROTOTYPE (throwaway): a minimal React wrapper around ECharts. */
import * as echarts from 'echarts';
import { useEffect, useRef } from 'react';

/** Loosely typed on purpose: prototype code, and ECharts' option types fight inline builders. */
export type EChartsOption = Record<string, unknown>;

interface EChartProps {
  option: EChartsOption;
  className?: string;
  onClick?: (params: {
    dataIndex: number;
    seriesIndex?: number;
    name: string;
    data: unknown;
  }) => void;
}

export function EChart({ option, className, onClick }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  useEffect(() => {
    clickRef.current = onClick;
  }, [onClick]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const instance = echarts.init(element, null, { renderer: 'canvas' });
    chart.current = instance;
    instance.on('click', (params) => clickRef.current?.(params as never));
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option as echarts.EChartsOption, true);
  }, [option]);

  return <div ref={ref} className={className} />;
}

export { echarts };
