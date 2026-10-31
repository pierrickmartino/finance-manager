/**
 * Runs once when the Next.js server starts. Refuses to start when required configuration is
 * missing or malformed, rather than failing on the first login.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { readSecretKey } = await import('@/server/crypto/secret-box');
  readSecretKey();
}
