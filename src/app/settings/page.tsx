import type { Metadata } from 'next';
import { getRequestDisplaySettings } from '@/server/formatter';
import { DisplaySettingsForm } from './display-settings-form';
import { FormatPreview } from './format-preview';

export const metadata: Metadata = { title: 'Settings · Finance Manager' };

export default async function SettingsPage() {
  const settings = await getRequestDisplaySettings();

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Display formats</h2>
        <p className="text-sm text-zinc-500">
          How amounts and dates are written on every screen. Labels stay in English.
        </p>
        <DisplaySettingsForm settings={settings} />
        <FormatPreview />
      </div>
    </section>
  );
}
