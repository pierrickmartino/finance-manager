import type { Metadata } from 'next';
import { Inter, Inter_Tight } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/app-shell';
import { FormatterProvider } from '@/components/formatter-provider';
import { getCurrentSession } from '@/server/app-context';
import { getRequestDisplaySettings } from '@/server/formatter';
import './globals.css';

/** The design system's type (docs/design-system.md): Inter, and Inter Tight for display. */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-inter-tight',
});

export const metadata: Metadata = {
  title: 'Finance Manager',
  description: 'Household income and expense tracking',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const settings = await getRequestDisplaySettings();
  // Login and setup render in this layout too: show the app shell only when signed in.
  const isSignedIn = (await getCurrentSession()) !== null;
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
      <body>
        <FormatterProvider settings={settings}>
          <AppShell showNavigation={isSignedIn}>{children}</AppShell>
        </FormatterProvider>
      </body>
    </html>
  );
}
