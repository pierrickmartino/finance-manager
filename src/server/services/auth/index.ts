import { createHash, randomBytes, randomInt } from 'node:crypto';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { Secret, TOTP } from 'otpauth';
import { z } from 'zod';
import { withTransaction } from '@/server/db/transaction';
import type { ServiceContext } from '../context';
import {
  ConflictError,
  parseInput,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from '../errors';

/*
 * Auth for the single user. Auth tables are not domain data, so writes use a plain
 * transaction rather than `mutate` and record no History.
 */

export interface AuthStatus {
  isSetUp: boolean;
}

export interface TotpEnrolment {
  /** Base32 secret, for manual entry in an authenticator app. */
  secret: string;
  /** The otpauth:// URI the setup screen shows as a QR code. */
  uri: string;
}

export interface NewSession {
  /** The opaque cookie value. Only its hash is stored. */
  token: string;
}

export interface SetupResult {
  /** Shown once; only their hashes are stored. */
  recoveryCodes: string[];
  session: NewSession;
}

const ISSUER = 'Finance Manager';
const ACCOUNT_LABEL = 'owner';
const TOTP_SECRET_BYTES = 20;
/** Accept the previous and next 30-second step too, to absorb clock drift. */
const TOTP_WINDOW = 1;
const RECOVERY_CODE_COUNT = 10;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;
/** A session ends after this long without a request. */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
/** Advisory lock key that serialises logins ("fmauth" in ASCII). */
const LOGIN_LOCK_KEY = 0x666d61757468;

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`);

const setupInput = z.object({
  password: passwordSchema,
  totpSecret: z.string().regex(/^[A-Z2-7]{16,128}$/, 'Invalid authenticator secret'),
  totpCode: z.string().trim(),
});

export type SetupInput = z.input<typeof setupInput>;

function totpFor(secret: string): TOTP {
  return new TOTP({ issuer: ISSUER, label: ACCOUNT_LABEL, secret: Secret.fromBase32(secret) });
}

function isValidTotp(secret: string, code: string): boolean {
  const token = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(token)) return false;
  return totpFor(secret).validate({ token, window: TOTP_WINDOW }) !== null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** e.g. `k3f9q-2hx7m`: 50 bits of randomness, easy to type. */
function generateRecoveryCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const chars = Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

function normaliseRecoveryCode(code: string): string {
  return code.trim().toLowerCase();
}

/** A fresh TOTP secret for the setup screen. Nothing is stored until setup completes. */
export function createTotpEnrolment(): TotpEnrolment {
  const secret = new Secret({ size: TOTP_SECRET_BYTES }).base32;
  return { secret, uri: totpFor(secret).toString() };
}

export async function getAuthStatus(ctx: ServiceContext): Promise<AuthStatus> {
  const result = await ctx.db.query('SELECT 1 FROM auth_credential');
  return { isSetUp: result.rowCount === 1 };
}

/**
 * Completes first-run setup: stores the password (argon2id) and TOTP secret, issues recovery
 * codes and opens a session. Fails once setup has been completed.
 */
export async function completeSetup(ctx: ServiceContext, input: SetupInput): Promise<SetupResult> {
  const { password, totpSecret, totpCode } = parseInput(setupInput, input);
  if (!isValidTotp(totpSecret, totpCode)) {
    throw new ValidationError('The authenticator code is not valid. Check the time on your phone.');
  }
  const passwordHash = await argon2Hash(password);
  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);

  const session = await withTransaction(ctx.db, async (tx) => {
    const inserted = await tx.query(
      `INSERT INTO auth_credential (password_hash, totp_secret) VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [passwordHash, totpSecret],
    );
    if (inserted.rowCount !== 1) {
      throw new ConflictError('Setup has already been completed');
    }
    await insertRecoveryCodes(tx, recoveryCodes);
    return openSession(tx);
  });
  return { recoveryCodes, session };
}

const resetInput = z.object({ password: passwordSchema });

export type ResetInput = z.input<typeof resetInput>;

export interface ResetResult {
  totp: TotpEnrolment;
  recoveryCodes: string[];
}

/**
 * The command-line credential reset (no email reset exists). Sets a new password, a new TOTP
 * secret and new recovery codes, ends every session and lifts any login lockout. On a fresh
 * database it completes setup.
 */
export async function resetCredentials(
  ctx: ServiceContext,
  input: ResetInput,
): Promise<ResetResult> {
  const { password } = parseInput(resetInput, input);
  const totp = createTotpEnrolment();
  const passwordHash = await argon2Hash(password);
  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);

  await withTransaction(ctx.db, async (tx) => {
    await tx.query(
      `INSERT INTO auth_credential (password_hash, totp_secret) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             totp_secret = EXCLUDED.totp_secret,
             updated_at = now()`,
      [passwordHash, totp.secret],
    );
    await insertRecoveryCodes(tx, recoveryCodes);
    await tx.query('DELETE FROM auth_session');
    await tx.query('DELETE FROM auth_login_attempt');
  });
  return { totp, recoveryCodes };
}

type Tx = Parameters<Parameters<typeof withTransaction>[1]>[0];

async function insertRecoveryCodes(tx: Tx, codes: string[]): Promise<void> {
  await tx.query('DELETE FROM auth_recovery_code');
  await tx.query('INSERT INTO auth_recovery_code (code_hash) SELECT unnest($1::text[])', [
    codes.map((code) => sha256(normaliseRecoveryCode(code))),
  ]);
}

async function openSession(tx: Tx): Promise<NewSession> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await tx.query(
    'INSERT INTO auth_session (token_hash, created_at, last_seen_at) VALUES ($1, $2, $2)',
    [sha256(token), now],
  );
  return { token };
}

const loginInput = z.object({
  password: z.string().max(MAX_PASSWORD_LENGTH),
  /** A current authenticator code, or an unused recovery code. */
  code: z.string().max(64),
});

export type LoginInput = z.input<typeof loginInput>;

export interface Session {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
}

const INVALID_LOGIN = 'Wrong password or code';

interface Credential {
  passwordHash: string;
  totpSecret: string;
}

type LoginOutcome = { kind: 'ok'; session: NewSession } | { kind: 'failed' | 'rate_limited' };

/**
 * Checks the password and a TOTP or recovery code, then opens a session. After
 * MAX_FAILED_LOGINS failures within LOGIN_FAILURE_WINDOW_MS (counted since the last success),
 * every attempt is refused until the oldest of them leaves the window. The limit is global,
 * not per client: there is one user, and client addresses behind a proxy can be spoofed.
 */
export async function login(ctx: ServiceContext, input: LoginInput): Promise<NewSession> {
  const parsed = loginInput.safeParse(input);
  const outcome = await withTransaction(ctx.db, async (tx): Promise<LoginOutcome> => {
    // One login at a time, so concurrent guesses cannot slip past the limit.
    await tx.query('SELECT pg_advisory_xact_lock($1)', [LOGIN_LOCK_KEY]);
    const now = new Date();
    if ((await countRecentFailures(tx, now)) >= MAX_FAILED_LOGINS) {
      return { kind: 'rate_limited' };
    }
    const isValid = parsed.success && (await checkCredentials(tx, parsed.data));
    await tx.query('INSERT INTO auth_login_attempt (attempted_at, succeeded) VALUES ($1, $2)', [
      now,
      isValid,
    ]);
    return isValid ? { kind: 'ok', session: await openSession(tx) } : { kind: 'failed' };
  });

  if (outcome.kind === 'rate_limited') {
    throw new RateLimitedError('Too many failed attempts. Try again in 15 minutes.');
  }
  if (outcome.kind !== 'ok') throw new UnauthenticatedError(INVALID_LOGIN);
  return outcome.session;
}

async function countRecentFailures(tx: Tx, now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - LOGIN_FAILURE_WINDOW_MS);
  await tx.query('DELETE FROM auth_login_attempt WHERE attempted_at <= $1', [windowStart]);
  const result = await tx.query<{ failures: number }>(
    `SELECT count(*)::int AS failures FROM auth_login_attempt
     WHERE NOT succeeded
       AND attempted_at > coalesce(
         (SELECT max(attempted_at) FROM auth_login_attempt WHERE succeeded), '-infinity')`,
  );
  return result.rows[0]?.failures ?? 0;
}

async function checkCredentials(
  tx: Tx,
  { password, code }: z.output<typeof loginInput>,
): Promise<boolean> {
  const result = await tx.query<Credential>(
    `SELECT password_hash AS "passwordHash", totp_secret AS "totpSecret" FROM auth_credential`,
  );
  const credential = result.rows[0];
  if (!credential) return false;
  if (!(await argon2Verify(credential.passwordHash, password))) return false;
  return isValidTotp(credential.totpSecret, code) || redeemRecoveryCode(tx, code);
}

/** Marks a recovery code used; false when it is unknown or already used. */
async function redeemRecoveryCode(tx: Tx, code: string): Promise<boolean> {
  const result = await tx.query(
    'UPDATE auth_recovery_code SET used_at = $2 WHERE code_hash = $1 AND used_at IS NULL',
    [sha256(normaliseRecoveryCode(code)), new Date()],
  );
  return result.rowCount === 1;
}

/** The session behind a cookie token, or null. A valid session counts as activity. */
export async function getSession(ctx: ServiceContext, token: string): Promise<Session | null> {
  const now = new Date();
  const result = await ctx.db.query<Session>(
    `UPDATE auth_session SET last_seen_at = $2
     WHERE token_hash = $1 AND last_seen_at > $3
     RETURNING id, created_at AS "createdAt", last_seen_at AS "lastSeenAt"`,
    [sha256(token), now, new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS)],
  );
  return result.rows[0] ?? null;
}

/** Ends the session behind a cookie token, and clears out expired ones. */
export async function logout(ctx: ServiceContext, token: string): Promise<void> {
  const idleSince = new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS);
  await ctx.db.query('DELETE FROM auth_session WHERE token_hash = $1 OR last_seen_at <= $2', [
    sha256(token),
    idleSince,
  ]);
}
