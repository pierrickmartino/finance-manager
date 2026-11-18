// PROTOTYPE (Tremor redesign): Tremor Raw, re-themed onto the Midnight tokens. Throwaway.
/* eslint-disable */
// @ts-nocheck -- vendored prototype code (strict index access, Recharts 3 types)
'use client';

// Tremor Button [v1.0.0]

import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { RiLoader2Fill } from '@remixicon/react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cx } from './cx';
import { focusRing } from './focusRing';

const buttonVariants = tv({
  base: [
    // base
    'relative inline-flex items-center justify-center whitespace-nowrap rounded-md border px-3 py-2 text-center text-sm font-medium shadow-xs transition-all duration-100 ease-in-out',
    // disabled
    'disabled:pointer-events-none disabled:shadow-none',
    // focus
    focusRing,
  ],
  variants: {
    variant: {
      primary: [
        // border
        'border-transparent',
        // text color
        'text-paper',
        // background color
        'bg-ink',
        // hover color
        'hover:bg-ink-hover',
        // disabled
        'disabled:opacity-50',
        '',
      ],
      secondary: [
        // border
        'border-rule-strong',
        // text color
        'text-ink',
        // background color
        'bg-surface',
        //hover color
        'hover:bg-sunken',
        // disabled
        'disabled:text-faint',
        '',
      ],
      light: [
        // base
        'shadow-none',
        // border
        'border-transparent',
        // text color
        'text-ink',
        // background color
        'bg-rule',
        // hover color
        'hover:bg-rule-strong/70',
        // disabled
        'disabled:bg-sunken disabled:text-faint',
        '',
      ],
      ghost: [
        // base
        'shadow-none',
        // border
        'border-transparent',
        // text color
        'text-ink',
        // hover color
        'bg-transparent hover:bg-sunken',
        // disabled
        'disabled:text-faint',
        '',
      ],
      destructive: [
        // text color
        'text-paper',
        // border
        'border-transparent',
        // background color
        'bg-negative',
        // hover color
        'hover:bg-negative',
        // disabled
        'disabled:bg-negative disabled:text-paper',
        '',
      ],
    },
  },
  defaultVariants: {
    variant: 'primary',
  },
});

interface ButtonProps
  extends React.ComponentPropsWithoutRef<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild,
      isLoading = false,
      loadingText,
      className,
      disabled,
      variant,
      children,
      ...props
    }: ButtonProps,
    forwardedRef,
  ) => {
    const Component = asChild ? Slot : 'button';
    return (
      <Component
        ref={forwardedRef}
        className={cx(buttonVariants({ variant }), className)}
        disabled={disabled || isLoading}
        tremor-id="tremor-raw"
        {...props}
      >
        {isLoading ? (
          <span className="pointer-events-none flex shrink-0 items-center justify-center gap-1.5">
            <RiLoader2Fill className="size-4 shrink-0 animate-spin" aria-hidden="true" />
            <span className="sr-only">{loadingText ? loadingText : 'Loading'}</span>
            {loadingText ? loadingText : children}
          </span>
        ) : (
          children
        )}
      </Component>
    );
  },
);

Button.displayName = 'Button';

export { Button, buttonVariants, type ButtonProps };
