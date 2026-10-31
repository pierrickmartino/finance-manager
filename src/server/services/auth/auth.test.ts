import { TOTP } from 'otpauth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import {
  completeSetup,
  createTotpEnrolment,
  getAuthStatus,
  getSession,
  login,
  logout,
  resetCredentials,
} from '.';

const t = setupTestDatabase();

const PASSWORD = 'correct horse battery staple';
const TOTP_STEP_MS = 30_000;

// A TOTP code works once, so tests move the clock to the next 30-second step between codes.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-05T09:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

/** The code an authenticator app would show right now for this secret. */
function totpCode(secret: string): string {
  return new TOTP({ secret }).generate();
}

/** The code an authenticator app shows once the clock reaches the next step. */
function nextTotpCode(secret: string): string {
  vi.setSystemTime(Date.now() + TOTP_STEP_MS);
  return totpCode(secret);
}

async function storedTotpSecret(): Promise<string> {
  const result = await t.ctx.db.query<{ value: string }>(
    'SELECT totp_secret_enc AS value FROM auth_credential',
  );
  return result.rows[0]!.value;
}

async function setUp() {
  const { secret } = createTotpEnrolment();
  const result = await completeSetup(t.ctx, {
    password: PASSWORD,
    totpSecret: secret,
    totpCode: totpCode(secret),
  });
  return { secret, ...result };
}

describe('First-run setup', () => {
  it('is pending until completed, then done', async () => {
    expect(await getAuthStatus(t.ctx)).toEqual({ isSetUp: false });

    await setUp();

    expect(await getAuthStatus(t.ctx)).toEqual({ isSetUp: true });
  });

  it('can only be completed once', async () => {
    await setUp();

    await expect(setUp()).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects a wrong authenticator code and stays pending', async () => {
    const { secret } = createTotpEnrolment();
    const wrong = totpCode(secret) === '000000' ? '111111' : '000000';

    await expect(
      completeSetup(t.ctx, { password: PASSWORD, totpSecret: secret, totpCode: wrong }),
    ).rejects.toMatchObject({ code: 'validation' });
    expect(await getAuthStatus(t.ctx)).toEqual({ isSetUp: false });
  });

  it('opens a session', async () => {
    const { session } = await setUp();

    expect(await getSession(t.ctx, session.token)).not.toBeNull();
  });
});

describe('Login', () => {
  it('with the password and a current authenticator code opens a session', async () => {
    const { secret } = await setUp();

    const session = await login(t.ctx, { password: PASSWORD, code: nextTotpCode(secret) });

    expect(await getSession(t.ctx, session.token)).not.toBeNull();
  });

  it('refuses an authenticator code that was already used', async () => {
    const { secret } = await setUp();
    const setupCode = totpCode(secret);

    await expect(login(t.ctx, { password: PASSWORD, code: setupCode })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    const code = nextTotpCode(secret);
    await login(t.ctx, { password: PASSWORD, code });
    await expect(login(t.ctx, { password: PASSWORD, code })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('refuses an earlier code still inside the drift window once a later one was used', async () => {
    const { secret } = await setUp();
    vi.setSystemTime(Date.now() + 2 * TOTP_STEP_MS);
    const earlier = totpCode(secret);
    const later = nextTotpCode(secret);

    await login(t.ctx, { password: PASSWORD, code: later });

    await expect(login(t.ctx, { password: PASSWORD, code: earlier })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('fails on a wrong password', async () => {
    const { secret } = await setUp();

    await expect(
      login(t.ctx, { password: 'not the password!', code: nextTotpCode(secret) }),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('fails on a wrong authenticator code', async () => {
    await setUp();
    const otherSecret = createTotpEnrolment().secret;

    await expect(
      login(t.ctx, { password: PASSWORD, code: totpCode(otherSecret) }),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('fails before setup', async () => {
    await expect(login(t.ctx, { password: PASSWORD, code: '123456' })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('does not accept an unknown session token', async () => {
    await setUp();

    expect(await getSession(t.ctx, 'made-up-token')).toBeNull();
  });
});

describe('Recovery codes', () => {
  it('replace the authenticator code exactly once', async () => {
    const { recoveryCodes } = await setUp();
    const [code] = recoveryCodes;

    const session = await login(t.ctx, { password: PASSWORD, code: code! });
    expect(await getSession(t.ctx, session.token)).not.toBeNull();

    await expect(login(t.ctx, { password: PASSWORD, code: code! })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('are ten distinct codes, any of which works', async () => {
    const { recoveryCodes } = await setUp();

    expect(new Set(recoveryCodes).size).toBe(10);
    await expect(
      login(t.ctx, { password: PASSWORD, code: recoveryCodes[9]!.toUpperCase() }),
    ).resolves.toHaveProperty('token');
  });

  it('are not consumed by a login with a wrong password', async () => {
    const { recoveryCodes } = await setUp();
    const [code] = recoveryCodes;

    await expect(login(t.ctx, { password: 'not the password!', code: code! })).rejects.toThrow();

    await expect(login(t.ctx, { password: PASSWORD, code: code! })).resolves.toHaveProperty(
      'token',
    );
  });
});

describe('Sessions', () => {
  it('expire after 30 minutes without activity', async () => {
    vi.setSystemTime(new Date('2026-01-05T10:00:00Z'));
    const { session } = await setUp();

    vi.setSystemTime(new Date('2026-01-05T10:31:00Z'));

    expect(await getSession(t.ctx, session.token)).toBeNull();
  });

  it('stay alive while in use', async () => {
    vi.setSystemTime(new Date('2026-01-05T10:00:00Z'));
    const { session } = await setUp();

    vi.setSystemTime(new Date('2026-01-05T10:25:00Z'));
    expect(await getSession(t.ctx, session.token)).not.toBeNull();
    vi.setSystemTime(new Date('2026-01-05T10:50:00Z'));

    expect(await getSession(t.ctx, session.token)).not.toBeNull();
  });

  it('end on logout', async () => {
    const { session } = await setUp();

    await logout(t.ctx, session.token);

    expect(await getSession(t.ctx, session.token)).toBeNull();
  });
});

describe('Login rate limiting', () => {
  async function failLogins(times: number): Promise<void> {
    for (let i = 0; i < times; i++) {
      await expect(
        login(t.ctx, { password: 'not the password!', code: '123456' }),
      ).rejects.toMatchObject({ code: 'unauthenticated' });
    }
  }

  it('blocks even correct credentials after 5 failures in 15 minutes', async () => {
    const { secret } = await setUp();
    await failLogins(5);

    await expect(
      login(t.ctx, { password: PASSWORD, code: nextTotpCode(secret) }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('lets the user in again once the failures are 15 minutes old', async () => {
    vi.setSystemTime(new Date('2026-01-05T10:00:00Z'));
    const { secret } = await setUp();
    await failLogins(5);

    vi.setSystemTime(new Date('2026-01-05T10:16:00Z'));

    await expect(
      login(t.ctx, { password: PASSWORD, code: totpCode(secret) }),
    ).resolves.toHaveProperty('token');
  });

  it('forgets earlier failures after a successful login', async () => {
    const { secret } = await setUp();
    await failLogins(4);
    await login(t.ctx, { password: PASSWORD, code: nextTotpCode(secret) });
    await failLogins(4);

    await expect(
      login(t.ctx, { password: PASSWORD, code: nextTotpCode(secret) }),
    ).resolves.toHaveProperty('token');
  });
});

describe('Authenticator secret at rest', () => {
  it('is stored encrypted, not in the clear', async () => {
    const { secret } = await setUp();

    const stored = await storedTotpSecret();

    expect(stored).not.toContain(secret);
    expect(stored).toMatch(/^v1:/);
  });

  it('is stored encrypted after a credential reset too', async () => {
    const { totp } = await resetCredentials(t.ctx, { password: PASSWORD });

    expect(await storedTotpSecret()).not.toContain(totp.secret);
    await expect(
      login(t.ctx, { password: PASSWORD, code: totpCode(totp.secret) }),
    ).resolves.toHaveProperty('token');
  });

  it('a legacy plaintext secret still signs in once and is then encrypted', async () => {
    const { secret } = await setUp();
    await t.ctx.db.query('UPDATE auth_credential SET totp_secret_enc = $1', [secret]);

    await login(t.ctx, { password: PASSWORD, code: nextTotpCode(secret) });

    expect(await storedTotpSecret()).not.toContain(secret);
    await expect(
      login(t.ctx, { password: PASSWORD, code: nextTotpCode(secret) }),
    ).resolves.toHaveProperty('token');
  });
});
