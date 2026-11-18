// PROTOTYPE (Tremor redesign): Tremor Raw, re-themed onto the Midnight tokens. Throwaway.
/* eslint-disable */
// @ts-nocheck -- vendored prototype code (strict index access, Recharts 3 types)
'use client';

// Tremor Tabs [v1.0.0]

import React from 'react';
import * as TabsPrimitives from '@radix-ui/react-tabs';

import { cx } from './cx';
import { focusRing } from './focusRing';

const Tabs = (
  props: Omit<React.ComponentPropsWithoutRef<typeof TabsPrimitives.Root>, 'orientation'>,
) => {
  return <TabsPrimitives.Root tremor-id="tremor-raw" {...props} />;
};

Tabs.displayName = 'Tabs';

type TabsListVariant = 'line' | 'solid';

const TabsListVariantContext = React.createContext<TabsListVariant>('line');

interface TabsListProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitives.List> {
  variant?: TabsListVariant;
}

const variantStyles: Record<TabsListVariant, string> = {
  line: cx(
    // base
    'flex items-center justify-start border-b',
    // border color
    'border-rule',
  ),
  solid: cx(
    // base
    'inline-flex items-center justify-center rounded-md p-1',
    // background color
    'bg-sunken',
  ),
};

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitives.List>, TabsListProps>(
  ({ className, variant = 'line', children, ...props }, forwardedRef) => (
    <TabsPrimitives.List
      ref={forwardedRef}
      className={cx(variantStyles[variant], className)}
      {...props}
    >
      <TabsListVariantContext.Provider value={variant}>{children}</TabsListVariantContext.Provider>
    </TabsPrimitives.List>
  ),
);

TabsList.displayName = 'TabsList';

function getVariantStyles(tabVariant: TabsListVariant) {
  switch (tabVariant) {
    case 'line':
      return cx(
        // base
        '-mb-px items-center justify-center whitespace-nowrap border-b-2 border-transparent px-3 pb-2 text-sm font-medium transition-all',
        // text color
        'text-muted',
        // hover
        'hover:text-ink-soft',
        // border hover
        'hover:border-rule-strong',
        // selected
        'data-[state=active]:border-accent-ink data-[state=active]:text-accent-ink',
        '',
        // disabled
        'data-disabled:pointer-events-none',
        'data-disabled:text-rule-strong',
      );
    case 'solid':
      return cx(
        // base
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium ring-1 ring-inset transition-all',
        // text color
        'text-muted',
        // hover
        'hover:text-ink-soft',
        // ring
        'ring-transparent',
        // selected
        'data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm',
        '',
        // disabled
        'data-disabled:pointer-events-none data-disabled:text-faint data-disabled:opacity-50',
      );
  }
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitives.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitives.Trigger>
>(({ className, children, ...props }, forwardedRef) => {
  const variant = React.useContext(TabsListVariantContext);
  return (
    <TabsPrimitives.Trigger
      ref={forwardedRef}
      className={cx(getVariantStyles(variant), focusRing, className)}
      {...props}
    >
      {children}
    </TabsPrimitives.Trigger>
  );
});

TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitives.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitives.Content>
>(({ className, ...props }, forwardedRef) => (
  <TabsPrimitives.Content
    ref={forwardedRef}
    className={cx('outline-hidden', focusRing, className)}
    {...props}
  />
));

TabsContent.displayName = 'TabsContent';

export { Tabs, TabsContent, TabsList, TabsTrigger };
