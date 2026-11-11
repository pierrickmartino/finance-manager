import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/app-shell';
import { PROTOTYPE_LAYOUT_COOKIE } from '@/components/app-shell/prototype-layouts';
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
  const cookieStore = await cookies();
  const sidebarMode = parseSidebarMode(cookieStore.get(SIDEBAR_COOKIE)?.value);
  // PROTOTYPE: the layout variant picked from the floating switcher. Delete after.
  const prototypeLayout = cookieStore.get(PROTOTYPE_LAYOUT_COOKIE)?.value;
  return (
    <html lang="en">
      <body>
        <FormatterProvider settings={settings}>
          <AppShell
            showNavigation={isSignedIn}
            sidebarMode={sidebarMode}
            prototypeLayout={prototypeLayout}
          >
            {children}
          </AppShell>
        </FormatterProvider>
      </body>
    </html>
  );
}
