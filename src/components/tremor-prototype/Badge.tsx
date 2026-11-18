// PROTOTYPE (Tremor redesign): Tremor Raw, re-themed onto the Midnight tokens. Throwaway.
/* eslint-disable */
// @ts-nocheck -- vendored prototype code (strict index access, Recharts 3 types)
'use client';

// Tremor Badge [v1.0.0]

import React from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cx } from './cx';

const badgeVariants = tv({
  base: cx(
    'inline-flex items-center gap-x-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
  ),
  variants: {
    variant: {
      default: ['bg-accent-tint text-accent-ink ring-accent-ink/30', ''],
      neutral: ['bg-sunken text-ink ring-muted/30', ''],
      success: ['bg-positive-tint text-positive ring-positive/30', ''],
      error: ['bg-negative-tint text-negative ring-negative/20', ''],
      warning: ['bg-warning-tint text-warning ring-warning/30', ''],
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

interface BadgeProps
  extends React.ComponentPropsWithoutRef<'span'>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }: BadgeProps, forwardedRef) => {
    return (
      <span
        ref={forwardedRef}
        className={cx(badgeVariants({ variant }), className)}
        tremor-id="tremor-raw"
        {...props}
      />
    );
  },
);

Badge.displayName = 'Badge';

export { Badge, badgeVariants, type BadgeProps };
