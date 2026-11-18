// PROTOTYPE (Tremor redesign): Tremor Raw, re-themed onto the Midnight tokens. Throwaway.
/* eslint-disable */
// @ts-nocheck -- vendored prototype code (strict index access, Recharts 3 types)
'use client';

// Tremor Tracker [v1.0.0]

import React from 'react';
import * as HoverCardPrimitives from '@radix-ui/react-hover-card';

import { cx } from './cx';

interface TrackerBlockProps {
  key?: string | number;
  color?: string;
  tooltip?: string;
  hoverEffect?: boolean;
  defaultBackgroundColor?: string;
}

const Block = ({ color, tooltip, defaultBackgroundColor, hoverEffect }: TrackerBlockProps) => {
  const [open, setOpen] = React.useState(false);
  return (
    <HoverCardPrimitives.Root
      open={open}
      onOpenChange={setOpen}
      openDelay={0}
      closeDelay={0}
      tremor-id="tremor-raw"
    >
      <HoverCardPrimitives.Trigger onClick={() => setOpen(true)} asChild>
        <div className="size-full overflow-hidden px-[0.5px] transition first:rounded-l-[4px] first:pl-0 last:rounded-r-[4px] last:pr-0 sm:px-px">
          <div
            className={cx(
              'size-full rounded-[1px]',
              color || defaultBackgroundColor,
              hoverEffect ? 'hover:opacity-50' : '',
            )}
          />
        </div>
      </HoverCardPrimitives.Trigger>
      <HoverCardPrimitives.Portal>
        <HoverCardPrimitives.Content
          sideOffset={10}
          side="top"
          align="center"
          avoidCollisions
          className={cx(
            // base
            'w-auto rounded-md px-2 py-1 text-sm shadow-md',
            // text color
            'text-paper',
            // background color
            'bg-ink',
          )}
        >
          {tooltip}
        </HoverCardPrimitives.Content>
      </HoverCardPrimitives.Portal>
    </HoverCardPrimitives.Root>
  );
};

Block.displayName = 'Block';

interface TrackerProps extends React.HTMLAttributes<HTMLDivElement> {
  data: TrackerBlockProps[];
  defaultBackgroundColor?: string;
  hoverEffect?: boolean;
}

const Tracker = React.forwardRef<HTMLDivElement, TrackerProps>(
  (
    { data = [], defaultBackgroundColor = 'bg-faint', className, hoverEffect, ...props },
    forwardedRef,
  ) => {
    return (
      <div
        ref={forwardedRef}
        className={cx('group flex h-8 w-full items-center', className)}
        {...props}
      >
        {data.map(({ key, ...props }, index) => (
          <Block
            key={key ?? index}
            defaultBackgroundColor={defaultBackgroundColor}
            hoverEffect={hoverEffect}
            {...props}
          />
        ))}
      </div>
    );
  },
);

Tracker.displayName = 'Tracker';

export { Tracker, type TrackerBlockProps };
