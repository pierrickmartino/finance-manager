import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/app-shell';
import { SIDEBAR_COOKIE, parseSidebarMode } from '@/components/app-shell/sidebar-mode';
import { FormatterProvider } from '@/components/formatter-provider';
import { getCurrentSession } from '@/server/app-context';
import { getRequestDisplaySettings } from '@/server/formatter';
import './globals.css';

export const metadata: Metadata = {
  title: 'Finance Manager',
  description: 'Household income and expense tracking',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const settings = await getRequestDisplaySettings();
  // Login and setup render in this layout too: show the app shell only when signed in.
  const isSignedIn = (await getCurrentSession()) !== null;
  const sidebarMode = parseSidebarMode((await cookies()).get(SIDEBAR_COOKIE)?.value);
  return (
    <html lang="en">
      <body>
        <FormatterProvider settings={settings}>
          <AppShell showNavigation={isSignedIn} sidebarMode={sidebarMode}>
            {children}
          </AppShell>
        </FormatterProvider>
      </body>
    </html>
  );
}
