import type { Metadata } from 'next';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { getRequestDisplaySettings } from '@/server/formatter';
import { VARIANT_A_NAME, VariantA } from './_prototype/variant-a-split';
import { VARIANT_B_NAME, VariantB } from './_prototype/variant-b-tiles';
import { VARIANT_C_NAME, VariantC } from './_prototype/variant-c-sections';
import { VARIANT_D_NAME, VariantD } from './_prototype/variant-d-sentence';
import { DisplaySettingsForm } from './display-settings-form';
import { FormatPreview } from './format-preview';

/*
 * PROTOTYPE: four variants of the settings page, switchable via `?variant=A|B|C|D|current`,
 * on the existing /settings route. Variants A–D stub the save in memory; `current` is the
 * real page, unchanged. Throwaway: fold the winner in and drop `_prototype/` + the switcher.
 */

export const metadata: Metadata = { title: 'Settings · Finance Manager' };

const VARIANTS = [
  { key: 'A', name: VARIANT_A_NAME },
  { key: 'B', name: VARIANT_B_NAME },
  { key: 'C', name: VARIANT_C_NAME },
  { key: 'D', name: VARIANT_D_NAME },
  { key: 'current', name: 'Today’s page' },
];

function CurrentSettings({
  settings,
}: {
  settings: Awaited<ReturnType<typeof getRequestDisplaySettings>>;
}) {
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

interface SettingsPageProps {
  searchParams: Promise<{ variant?: string }>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const settings = await getRequestDisplaySettings();
  const isPrototype = process.env.NODE_ENV !== 'production';
  const requested = (await searchParams).variant;
  // Production (and the E2E build) always gets today's page.
  const variant = isPrototype ? (requested ?? 'A') : 'current';

  return (
    <>
      {variant === 'A' && <VariantA settings={settings} />}
      {variant === 'B' && <VariantB settings={settings} />}
      {variant === 'C' && <VariantC settings={settings} />}
      {variant === 'D' && <VariantD settings={settings} />}
      {variant === 'current' && <CurrentSettings settings={settings} />}
      {isPrototype && <PrototypeSwitcher variants={VARIANTS} current={variant} />}
    </>
  );
}
