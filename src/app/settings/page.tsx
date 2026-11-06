import type { Metadata } from 'next';
import { getRequestDisplaySettings } from '@/server/formatter';
import { DisplaySection } from './display-section';
import { PAGE_TITLE_CLASS } from '@/components/surface';

export const metadata: Metadata = { title: 'Settings · Finance Manager' };

/** The page's sections, listed in the side menu. Add one here when a new section lands. */
const SECTIONS = [{ id: 'display', label: 'Display' }] as const;

export default async function SettingsPage() {
  const settings = await getRequestDisplaySettings();

  return (
    <section className="flex flex-col gap-6">
      <h1 className={PAGE_TITLE_CLASS}>Settings</h1>
      <div className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 md:flex-col">
          {SECTIONS.map((section, index) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={index === 0 ? 'location' : undefined}
              className="rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-sunken aria-[current]:bg-rule aria-[current]:font-medium aria-[current]:text-ink"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <section
          id="display"
          aria-labelledby="display-heading"
          className="flex max-w-2xl flex-col gap-3"
        >
          <h2 id="display-heading" className="text-lg font-medium">
            Display
          </h2>
          <DisplaySection settings={settings} />
        </section>
      </div>
    </section>
  );
}
