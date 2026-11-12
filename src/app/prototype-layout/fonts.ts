/**
 * PROTOTYPE (layout redesign, `?variant=`): the fonts each variant tries. Throwaway; see
 * ./README.md.
 */
import {
  Fraunces,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Inter,
  Inter_Tight,
  Newsreader,
} from 'next/font/google';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--proto-plex-sans',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--proto-plex-mono',
});
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--proto-inter-tight',
});
const inter = Inter({ subsets: ['latin'], variable: '--proto-inter' });
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--proto-fraunces',
  axes: ['opsz', 'SOFT'],
});
const newsreader = Newsreader({ subsets: ['latin'], variable: '--proto-newsreader' });

/** The font classes a variant's root needs, so its CSS variables resolve. */
export const VARIANT_FONTS: Record<'A' | 'B' | 'C', string> = {
  A: `${plexSans.variable} ${plexMono.variable}`,
  B: `${interTight.variable} ${inter.variable}`,
  C: `${fraunces.variable} ${newsreader.variable} ${inter.variable}`,
};
