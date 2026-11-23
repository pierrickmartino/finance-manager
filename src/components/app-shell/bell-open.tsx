'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type BellOpen = readonly [isOpen: boolean, setIsOpen: (isOpen: boolean) => void];

const BellOpenContext = createContext<BellOpen | null>(null);

/**
 * Whether the bell's popover is open, held above its Suspense boundary: the bell opened while its
 * items were loading stays open when the loaded bell takes its place.
 */
export function BellOpenProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return <BellOpenContext value={[isOpen, setIsOpen]}>{children}</BellOpenContext>;
}

/** The bell's open state: from `BellOpenProvider`, or its own when rendered without one. */
export function useBellOpen(): BellOpen {
  const shared = useContext(BellOpenContext);
  const own = useState(false);
  return shared ?? own;
}
