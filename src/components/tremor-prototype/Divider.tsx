// PROTOTYPE (Tremor redesign): Tremor Raw, re-themed onto the Midnight tokens. Throwaway.
/* eslint-disable */
// @ts-nocheck -- vendored prototype code (strict index access, Recharts 3 types)
'use client';

// Tremor Divider [v1.0.0]

import React from 'react';

import { cx } from './cx';

type DividerProps = React.ComponentPropsWithoutRef<'div'>;

const Divider = React.forwardRef<HTMLDivElement, DividerProps>(
  ({ className, children, ...props }, forwardedRef) => (
    <div
      ref={forwardedRef}
      className={cx(
        // base
        'mx-auto my-6 flex w-full items-center justify-between gap-3 text-sm',
        // text color
        'text-muted',
        className,
      )}
      tremor-id="tremor-raw"
      {...props}
    >
      {children ? (
        <>
          <div
            className={cx(
              // base
              'h-[1px] w-full',
              // background color
              'bg-rule',
            )}
          />
          <div className="whitespace-nowrap text-inherit">{children}</div>
          <div
            className={cx(
              // base
              'h-[1px] w-full',
              // background color
              'bg-rule',
            )}
          />
        </>
      ) : (
        <div
          className={cx(
            // base
            'h-[1px] w-full',
            // background color
            'bg-rule',
          )}
        />
      )}
    </div>
  ),
);

Divider.displayName = 'Divider';

export { Divider };
