// PROTOTYPE (Tremor redesign): Tremor Raw, re-themed onto the Midnight tokens. Throwaway.
/* eslint-disable */
// @ts-nocheck -- vendored prototype code (strict index access, Recharts 3 types)
'use client';

// Tremor Callout [v0.0.1]

import React from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cx } from './cx';

const calloutVariants = tv({
  base: 'flex flex-col overflow-hidden rounded-md p-4 text-sm',
  variants: {
    variant: {
      default: [
        // text color
        'text-accent-ink',
        // background color
        'bg-accent-tint',
      ],
      success: [
        // text color
        'text-positive',
        // background color
        'bg-positive-tint',
      ],
      error: [
        // text color
        'text-negative',
        // background color
        'bg-negative-tint',
      ],
      warning: [
        // text color
        'text-warning',
        // background color
        'bg-warning-tint',
      ],
      neutral: [
        // text color
        'text-ink',
        // background color
        'bg-sunken',
      ],
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

interface CalloutProps
  extends React.ComponentPropsWithoutRef<'div'>, VariantProps<typeof calloutVariants> {
  title: string;
  icon?: React.ElementType | React.ReactElement;
}

const Callout = React.forwardRef<HTMLDivElement, CalloutProps>(
  ({ title, icon: Icon, className, variant, children, ...props }: CalloutProps, forwardedRef) => {
    return (
      <div
        ref={forwardedRef}
        className={cx(calloutVariants({ variant }), className)}
        tremor-id="tremor-raw"
        {...props}
      >
        <div className={cx('flex items-start')}>
          {Icon && typeof Icon === 'function' ? (
            <Icon className={cx('mr-1.5 h-5 w-5 shrink-0')} aria-hidden="true" />
          ) : (
            Icon
          )}
          <span className={cx('font-semibold')}>{title}</span>
        </div>
        <div className={cx('overflow-y-auto', children ? 'mt-2' : '')}>{children}</div>
      </div>
    );
  },
);

Callout.displayName = 'Callout';

export { Callout, calloutVariants, type CalloutProps };
