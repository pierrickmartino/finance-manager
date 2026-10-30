import QRCode from 'qrcode';
import type { ServiceContext } from '@/server/services/context';
import { ServiceError } from '@/server/services/errors';
import { resetCredentials } from '@/server/services/auth';

export interface CliIo {
  /** Asks for a secret without echoing it. */
  readPassword(prompt: string): Promise<string>;
  print(line: string): void;
}

/**
 * The credential reset behind `pnpm auth:reset` (run through Railway's shell). Asks for a new
 * password twice, then prints the new authenticator secret, its QR code and the recovery codes.
 * Returns the process exit code.
 */
export async function resetCredentialsCli(ctx: ServiceContext, io: CliIo): Promise<number> {
  const password = await io.readPassword('New password: ');
  const confirmation = await io.readPassword('Repeat the new password: ');
  if (password !== confirmation) {
    io.print('Passwords do not match. Nothing was changed.');
    return 1;
  }

  try {
    const { totp, recoveryCodes } = await resetCredentials(ctx, { password });
    const qr = await QRCode.toString(totp.uri, { type: 'terminal', small: true });
    io.print('Credentials reset. Every session has been signed out.');
    io.print('');
    io.print('Add this account to your authenticator app (scan the QR code or type the secret):');
    io.print(qr);
    io.print(`Secret: ${totp.secret}`);
    io.print('');
    io.print('Recovery codes (each works once; store them somewhere safe):');
    for (const code of recoveryCodes) io.print(`  ${code}`);
    return 0;
  } catch (error: unknown) {
    if (error instanceof ServiceError) {
      io.print(`${error.message}. Nothing was changed.`);
      return 1;
    }
    throw error;
  }
}
