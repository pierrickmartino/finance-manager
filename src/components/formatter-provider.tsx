'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  createFormatter,
  DEFAULT_DISPLAY_SETTINGS,
  type DisplaySettings,
  type Formatter,
} from '@/lib/format';

const FormatterContext = createContext<Formatter>(createFormatter(DEFAULT_DISPLAY_SETTINGS));

interface FormatterProviderProps {
  settings: DisplaySettings;
  children: ReactNode;
}

/** Mounted once in the root layout with the user's display settings. */
export function FormatterProvider({ settings, children }: FormatterProviderProps) {
  const formatter = useMemo(() => createFormatter(settings), [settings]);
  return <FormatterContext.Provider value={formatter}>{children}</FormatterContext.Provider>;
}

/** The shared formatter for client components. */
export function useFormatter(): Formatter {
  return useContext(FormatterContext);
}
