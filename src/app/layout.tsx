import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FormatterProvider } from '@/components/formatter-provider';
import { getRequestDisplaySettings } from '@/server/formatter';
import './globals.css';

export const metadata: Metadata = {
  title: 'Finance Manager',
  description: 'Household income and expense tracking',
};

const NAV_LINKS = [
  { href: '/banks', label: 'Banks' },
  { href: '/settings', label: 'Settings' },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const settings = await getRequestDisplaySettings();
  return (
    <html lang="en">
      <body>
        <FormatterProvider settings={settings}>
          <header className="border-b border-zinc-200 dark:border-zinc-800">
            <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
              <Link href="/" className="font-semibold">
                Finance Manager
              </Link>
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </FormatterProvider>
      </body>
    </html>
  );
}
