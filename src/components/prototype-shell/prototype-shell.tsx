'use client';
/*
 * PROTOTYPE — app-shell redesign. Throwaway: see ./README.md.
 *
 * "Four variants of the signed-in app shell (current + A/B/C), switchable via `?variant=` on any
 * route, rendered around the real pages and data."
 *
 * The choice is stored in a cookie so it survives in-app navigation (Links drop the query
 * string); `?variant=` in the URL wins on load so a link to a variant is shareable.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { NAME as NAME_A, VariantA } from './variant-a-sidebar';
import { NAME as NAME_B, VariantB } from './variant-b-topbar';
import { NAME as NAME_C, VariantC } from './variant-c-rail';
import { NAME as NAME_CURRENT, VariantCurrent } from './variant-current';
import { PrototypeSwitcher } from './prototype-switcher';

/** Must match the cookie name read in src/app/layout.tsx. */
const SHELL_VARIANT_COOKIE = 'fm_prototype_shell';

const VARIANTS = {
  current: { name: NAME_CURRENT, Component: VariantCurrent },
  A: { name: NAME_A, Component: VariantA },
  B: { name: NAME_B, Component: VariantB },
  C: { name: NAME_C, Component: VariantC },
} as const;

type ShellVariant = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as ShellVariant[];

function isShellVariant(value: string | undefined | null): value is ShellVariant {
  return value != null && Object.hasOwn(VARIANTS, value);
}

function persist(variant: ShellVariant) {
  document.cookie = `${SHELL_VARIANT_COOKIE}=${variant}; path=/; max-age=31536000; samesite=lax`;
  const url = new URL(window.location.href);
  url.searchParams.set('variant', variant);
  window.history.replaceState(window.history.state, '', url);
}

export function PrototypeShell({
  initialVariant,
  children,
}: {
  /** The raw cookie value read by the server layout; anything unknown falls back to A. */
  initialVariant: string | undefined;
  children: ReactNode;
}) {
  const [variant, setVariant] = useState<ShellVariant>(
    isShellVariant(initialVariant) ? initialVariant : 'A',
  );

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('variant');
    if (isShellVariant(fromUrl) && fromUrl !== variant) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prototype: URL wins over cookie on load
      setVariant(fromUrl);
      persist(fromUrl);
    }
    // Only on first load: afterwards the switcher owns the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function select(next: ShellVariant) {
    setVariant(next);
    persist(next);
  }

  const { Component } = VARIANTS[variant];
  return (
    <>
      <Component>{children}</Component>
      <PrototypeSwitcher
        variants={KEYS.map((key) => ({ key, name: VARIANTS[key].name }))}
        current={variant}
        onSelect={(key) => select(key as ShellVariant)}
      />
    </>
  );
}
