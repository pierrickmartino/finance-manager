'use client';

import { useFormatter } from '@/components/formatter-provider';
import type { PeriodValue } from '@/lib/reporting/period-values';
import { NetWorthSparkline } from '../dashboards/(dashboard)/[id]/overview/headline-trend';

/** The Net worth sparkline, its amounts in whole CHF (the sparkline itself runs on the client). */
export function NetWorthTrend({ points, label }: { points: PeriodValue[]; label: string }) {
  const fmt = useFormatter();
  const money = (minor: number) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  return <NetWorthSparkline points={points} money={money} label={label} />;
}
