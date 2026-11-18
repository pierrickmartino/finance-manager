// PROTOTYPE (Tremor redesign): Tremor Raw, re-themed onto the Midnight tokens. Throwaway.
/* eslint-disable */
// @ts-nocheck -- vendored prototype code (strict index access, Recharts 3 types)
'use client';

// Tremor ProgressBar [v0.0.3]

import React from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cx } from './cx';

const progressBarVariants = tv({
  slots: {
    background: '',
    bar: '',
  },
  variants: {
    variant: {
      default: {
        background: 'bg-accent-tint',
        bar: 'bg-accent-ink',
      },
      neutral: {
        background: 'bg-rule',
        bar: 'bg-muted',
      },
      warning: {
        background: 'bg-warning-tint',
        bar: 'bg-warning',
      },
      error: {
        background: 'bg-negative-tint',
        bar: 'bg-negative',
      },
      success: {
        background: 'bg-positive-tint',
        bar: 'bg-positive',
      },
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

interface ProgressBarProps
  extends React.HTMLProps<HTMLDivElement>, VariantProps<typeof progressBarVariants> {
  value?: number;
  max?: number;
  showAnimation?: boolean;
  label?: string;
}

const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      value = 0,
      max = 100,
      label,
      showAnimation = false,
      variant,
      className,
      ...props
    }: ProgressBarProps,
    forwardedRef,
  ) => {
    const safeValue = Math.min(max, Math.max(value, 0));
    const { background, bar } = progressBarVariants({ variant });
    return (
      <div
        ref={forwardedRef}
        className={cx('flex w-full items-center', className)}
        role="progressbar"
        aria-label="Progress bar"
        aria-valuenow={value}
        aria-valuemax={max}
        tremor-id="tremor-raw"
        {...props}
      >
        <div className={cx('relative flex h-2 w-full items-center rounded-full', background())}>
          <div
            className={cx(
              'h-full flex-col rounded-full',
              bar(),
              showAnimation && 'transform-gpu transition-all duration-300 ease-in-out',
            )}
            style={{
              width: max ? `${(safeValue / max) * 100}%` : `${safeValue}%`,
            }}
          />
        </div>
        {label ? (
          <span
            className={cx(
              // base
              'ml-2 whitespace-nowrap text-sm font-medium leading-none',
              // text color
              'text-ink',
            )}
          >
            {label}
          </span>
        ) : null}
      </div>
    );
  },
);

ProgressBar.displayName = 'ProgressBar';

export { ProgressBar, progressBarVariants, type ProgressBarProps };
