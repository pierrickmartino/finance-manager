import { TOTP } from 'otpauth';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { completeSetup, createTotpEnrolment, getAuthStatus, getSession, login, logout } from '.';

const t = setupTestDatabase();

const PASSWORD = 'correct horse battery staple';

/** The code an authenticator app would show right now for this secret. */
function totpCode(secret: string): string {
  return new TOTP({ secret }).generate();
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

    const session = await login(t.ctx, { password: PASSWORD, code: totpCode(secret) });

    expect(await getSession(t.ctx, session.token)).not.toBeNull();
  });

  it('fails on a wrong password', async () => {
    const { secret } = await setUp();

    await expect(
      login(t.ctx, { password: 'not the password!', code: totpCode(secret) }),
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
  afterEach(() => {
    vi.useRealTimers();
  });

  it('expire after 30 minutes without activity', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-05T10:00:00Z') });
    const { session } = await setUp();

    vi.setSystemTime(new Date('2026-01-05T10:31:00Z'));

    expect(await getSession(t.ctx, session.token)).toBeNull();
  });

  it('stay alive while in use', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-05T10:00:00Z') });
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
  afterEach(() => {
    vi.useRealTimers();
  });

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
      login(t.ctx, { password: PASSWORD, code: totpCode(secret) }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('lets the user in again once the failures are 15 minutes old', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-05T10:00:00Z') });
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
    await login(t.ctx, { password: PASSWORD, code: totpCode(secret) });
    await failLogins(4);

    await expect(
      login(t.ctx, { password: PASSWORD, code: totpCode(secret) }),
    ).resolves.toHaveProperty('token');
  });
});
