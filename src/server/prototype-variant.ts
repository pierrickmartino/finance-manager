import 'server-only';
/** PROTOTYPE (Tremor redesign), throwaway: which ?variant= a page draws (URL, then cookie). */
import { cookies } from 'next/headers';
import {
  DEFAULT_VARIANT,
  PROTOTYPE_COOKIE,
  isPrototypeEnabled,
  parseVariant,
  type PrototypeVariant,
} from '@/components/prototype-switcher/variants';

export async function cookieVariant(): Promise<PrototypeVariant> {
  if (!isPrototypeEnabled) return 'current';
  return parseVariant((await cookies()).get(PROTOTYPE_COOKIE)?.value) ?? DEFAULT_VARIANT;
}

export async function readVariant(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<PrototypeVariant> {
  if (!isPrototypeEnabled) return 'current';
  const fromUrl = searchParams.variant;
  return parseVariant(typeof fromUrl === 'string' ? fromUrl : null) ?? (await cookieVariant());
}
