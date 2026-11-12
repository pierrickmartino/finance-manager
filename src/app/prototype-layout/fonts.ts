/**
 * PROTOTYPE (layout redesign, `?variant=`): the fonts each variant tries. Throwaway; see
 * ./README.md.
 */
import { Geist, Geist_Mono, Inter, Inter_Tight, Manrope, Newsreader } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--proto-inter' });
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--proto-inter-tight',
});
const geist = Geist({ subsets: ['latin'], variable: '--proto-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--proto-geist-mono' });
const manrope = Manrope({ subsets: ['latin'], variable: '--proto-manrope' });
const newsreader = Newsreader({ subsets: ['latin'], variable: '--proto-newsreader' });

/** The font classes a variant's root needs, so its CSS variables resolve. */
export const VARIANT_FONTS: Record<'A' | 'B' | 'C', string> = {
  A: `${inter.variable} ${interTight.variable}`,
  B: `${geist.variable} ${geistMono.variable}`,
  C: `${manrope.variable} ${newsreader.variable}`,
};
