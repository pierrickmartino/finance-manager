/**
 * Resets the login credentials: pnpm auth:reset (on Railway: `railway ssh`, then the same).
 * Asks for a new password, then prints a new authenticator secret and new recovery codes.
 * Every session is signed out. There is no email-based reset.
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { resetCredentialsCli } from '../src/server/cli/reset-credentials';
import { createDb } from '../src/server/db/client';

/**
 * A prompt that reads lines from stdin without echoing them (when stdin is a terminal).
 * One interface serves every question, so piped input is not lost between them.
 */
function createPasswordReader(): { readPassword(prompt: string): Promise<string>; close(): void } {
  let isMuted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!isMuted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
  const lines = rl[Symbol.asyncIterator]();
  return {
    async readPassword(prompt) {
      process.stdout.write(prompt);
      isMuted = true;
      const next = await lines.next();
      isMuted = false;
      process.stdout.write('\n');
      return next.done ? '' : next.value;
    },
    close: () => rl.close(),
  };
}

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    return 1;
  }
  const db = createDb(url);
  const reader = createPasswordReader();
  try {
    return await resetCredentialsCli(
      { db, actor: { type: 'system', id: null } },
      { readPassword: reader.readPassword, print: (line) => console.log(line) },
    );
  } finally {
    reader.close();
    await db.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
