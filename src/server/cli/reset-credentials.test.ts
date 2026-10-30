import { TOTP } from 'otpauth';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { completeSetup, createTotpEnrolment, getSession, login } from '@/server/services/auth';
import { resetCredentialsCli } from './reset-credentials';

const t = setupTestDatabase();

const OLD_PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a brand new passphrase';

function totpCode(secret: string): string {
  return new TOTP({ secret }).generate();
}

/** Runs the CLI with scripted answers and returns everything it printed. */
async function runCli(answers: string[]): Promise<{ exitCode: number; output: string }> {
  const lines: string[] = [];
  const remaining = [...answers];
  const exitCode = await resetCredentialsCli(t.ctx, {
    readPassword: async () => remaining.shift() ?? '',
    print: (line) => lines.push(line),
  });
  return { exitCode, output: lines.join('\n') };
}

function printedSecret(output: string): string {
  const match = /Secret: ([A-Z2-7]+)/.exec(output);
  if (!match) throw new Error(`No secret in output:\n${output}`);
  return match[1]!;
}

function printedRecoveryCodes(output: string): string[] {
  return [...output.matchAll(/^\s*([a-z2-9]{5}-[a-z2-9]{5})$/gm)].map((match) => match[1]!);
}

describe('Credential reset CLI', () => {
  it('replaces the password, authenticator and recovery codes and ends all sessions', async () => {
    const enrolment = createTotpEnrolment();
    const old = await completeSetup(t.ctx, {
      password: OLD_PASSWORD,
      totpSecret: enrolment.secret,
      totpCode: totpCode(enrolment.secret),
    });

    const { exitCode, output } = await runCli([NEW_PASSWORD, NEW_PASSWORD]);

    expect(exitCode).toBe(0);
    expect(await getSession(t.ctx, old.session.token)).toBeNull();
    await expect(
      login(t.ctx, { password: OLD_PASSWORD, code: totpCode(enrolment.secret) }),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      login(t.ctx, { password: NEW_PASSWORD, code: old.recoveryCodes[0]! }),
    ).rejects.toMatchObject({ code: 'unauthenticated' });

    const secret = printedSecret(output);
    await expect(
      login(t.ctx, { password: NEW_PASSWORD, code: totpCode(secret) }),
    ).resolves.toHaveProperty('token');
    const recoveryCodes = printedRecoveryCodes(output);
    expect(recoveryCodes).toHaveLength(10);
    await expect(
      login(t.ctx, { password: NEW_PASSWORD, code: recoveryCodes[0]! }),
    ).resolves.toHaveProperty('token');
  });

  it('lifts a login lockout', async () => {
    const enrolment = createTotpEnrolment();
    await completeSetup(t.ctx, {
      password: OLD_PASSWORD,
      totpSecret: enrolment.secret,
      totpCode: totpCode(enrolment.secret),
    });
    for (let i = 0; i < 5; i++) {
      await login(t.ctx, { password: 'wrong password!!', code: '000000' }).catch(() => {});
    }

    const { output } = await runCli([NEW_PASSWORD, NEW_PASSWORD]);

    await expect(
      login(t.ctx, { password: NEW_PASSWORD, code: totpCode(printedSecret(output)) }),
    ).resolves.toHaveProperty('token');
  });

  it('refuses when the two passwords differ, changing nothing', async () => {
    const enrolment = createTotpEnrolment();
    await completeSetup(t.ctx, {
      password: OLD_PASSWORD,
      totpSecret: enrolment.secret,
      totpCode: totpCode(enrolment.secret),
    });

    const { exitCode, output } = await runCli([NEW_PASSWORD, 'something else entirely']);

    expect(exitCode).toBe(1);
    expect(output).toContain('Passwords do not match');
    await expect(
      login(t.ctx, { password: OLD_PASSWORD, code: totpCode(enrolment.secret) }),
    ).resolves.toHaveProperty('token');
  });

  it('refuses a password that is too short', async () => {
    const { exitCode, output } = await runCli(['short', 'short']);

    expect(exitCode).toBe(1);
    expect(output).toContain('at least 12 characters');
  });
});
