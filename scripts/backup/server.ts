/**
 * Backup service: a separate Railway service, next to the Postgres service, that answers
 * `GET /backup` with a fresh `pg_dump` encrypted with `age` to the owner's public key(s).
 *
 * pg_dump's output goes straight into `age` through a pipe, so the plaintext dump never
 * touches disk or the network. Only ciphertext is written (to a temp file, so the response
 * can carry a length and a SHA-256 and a failed dump becomes a 500 instead of a truncated
 * 200) and it is deleted once sent. The private key never exists on Railway.
 *
 * Node built-ins only, and erasable TypeScript only, so the container runs it with
 * `node --experimental-strip-types` and no install step. See docs/runbooks/backup-and-restore.md.
 */
import { spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIN_TOKEN_LENGTH = 32;
const DEFAULT_MIN_INTERVAL_SECONDS = 600;
const DEFAULT_MAX_FAILED_AUTH_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

export interface BackupServerOptions {
  /** Connection string of the database to dump. */
  databaseUrl: string;
  /** Dedicated secret the pull machine sends as `Authorization: Bearer <token>`. */
  token: string;
  /** One or more age public keys (`age1...`). The dump is readable by any of them. */
  recipients: string[];
  port: number;
  host?: string;
  /** Minimum seconds between two dumps (default 600). */
  minIntervalSeconds?: number;
  /** Failed-auth requests allowed per rolling hour before /backup answers 429 (default 10). */
  maxFailedAuthPerHour?: number;
  /** Clock, for tests. */
  now?: () => number;
}

export interface BackupServer {
  address(): AddressInfo | string | null;
  stop(): Promise<void>;
}

export class ConfigError extends Error {}

export function validateOptions(options: BackupServerOptions): void {
  if (!options.databaseUrl) throw new ConfigError('DATABASE_URL is not set');
  if (!options.token || options.token.length < MIN_TOKEN_LENGTH) {
    throw new ConfigError(`BACKUP_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`);
  }
  if (options.recipients.length === 0) {
    throw new ConfigError('BACKUP_AGE_RECIPIENTS must list at least one age public key');
  }
  for (const recipient of options.recipients) {
    if (!/^age1[0-9a-z]{58}$/.test(recipient)) {
      throw new ConfigError(`Not an age public key: ${recipient.slice(0, 12)}...`);
    }
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function isAuthorized(header: string | undefined, token: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? '');
  // Compare fixed-length digests so the comparison time leaks neither content nor length.
  return match !== null && timingSafeEqual(digest(match[1]!), digest(token));
}

function waitForExit(child: ReturnType<typeof spawn>, name: string): Promise<void> {
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${name} exited with ${code}: ${stderr.trim()}`)),
    );
  });
}

/** Runs `pg_dump | age` into `outFile`. Rejects if either side fails. */
async function dumpEncrypted(options: BackupServerOptions, outFile: string): Promise<void> {
  const dump = spawn(
    'pg_dump',
    ['--format=custom', '--no-owner', '--no-privileges', `--dbname=${options.databaseUrl}`],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const recipientArgs = options.recipients.flatMap((recipient) => ['-r', recipient]);
  const age = spawn('age', ['--encrypt', ...recipientArgs, '-o', outFile], {
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  dump.stdout.pipe(age.stdin);
  const results = await Promise.allSettled([waitForExit(dump, 'pg_dump'), waitForExit(age, 'age')]);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function timestamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[:.]/g, '-');
}

export async function startBackupServer(options: BackupServerOptions): Promise<BackupServer> {
  validateOptions(options);
  const now = options.now ?? Date.now;
  const minIntervalMs = (options.minIntervalSeconds ?? DEFAULT_MIN_INTERVAL_SECONDS) * 1000;
  const maxFailedAuth = options.maxFailedAuthPerHour ?? DEFAULT_MAX_FAILED_AUTH_PER_HOUR;
  let failedAuthTimes: number[] = [];
  let lastDumpStartedAt: number | null = null;
  let isDumping = false;

  const send = (res: http.ServerResponse, status: number, body: object): void => {
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  };

  const handleBackup = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const at = now();
    failedAuthTimes = failedAuthTimes.filter((time) => at - time < HOUR_MS);
    if (failedAuthTimes.length >= maxFailedAuth) {
      return send(res, 429, { error: 'Too many failed attempts, try again later' });
    }
    if (!isAuthorized(req.headers.authorization, options.token)) {
      failedAuthTimes = [...failedAuthTimes, at];
      return send(res, 401, { error: 'Unauthorized' });
    }
    if (isDumping || (lastDumpStartedAt !== null && at - lastDumpStartedAt < minIntervalMs)) {
      return send(res, 429, { error: 'A backup was taken too recently, try again later' });
    }
    isDumping = true;
    lastDumpStartedAt = at;
    const dir = await mkdtemp(path.join(tmpdir(), 'fm-backup-'));
    const file = path.join(dir, 'dump.age');
    try {
      await dumpEncrypted(options, file);
      const [{ size }, sha256] = await Promise.all([stat(file), sha256File(file)]);
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': size,
        'content-disposition': `attachment; filename="finance-${timestamp(at)}.dump.age"`,
        'x-backup-sha256': sha256,
      });
      await new Promise<void>((resolve, reject) => {
        createReadStream(file).on('error', reject).pipe(res).on('finish', resolve);
      });
    } catch (error: unknown) {
      console.error('Backup failed', error);
      if (!res.headersSent) send(res, 500, { error: 'Backup failed' });
      else res.destroy();
    } finally {
      isDumping = false;
      await rm(dir, { recursive: true, force: true });
    }
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
    if (req.method === 'GET' && url.pathname === '/backup') {
      handleBackup(req, res).catch((error: unknown) => {
        console.error('Backup request failed', error);
        if (!res.headersSent) send(res, 500, { error: 'Backup failed' });
      });
      return;
    }
    send(res, 404, { error: 'Not found' });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });

  return {
    address: () => server.address(),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

export function optionsFromEnv(env: NodeJS.ProcessEnv): BackupServerOptions {
  return {
    databaseUrl: env.DATABASE_URL ?? '',
    token: env.BACKUP_TOKEN ?? '',
    recipients: (env.BACKUP_AGE_RECIPIENTS ?? '').split(/[\s,]+/).filter(Boolean),
    port: Number(env.PORT ?? 8080),
    host: env.HOST,
    minIntervalSeconds: env.BACKUP_MIN_INTERVAL_SECONDS
      ? Number(env.BACKUP_MIN_INTERVAL_SECONDS)
      : undefined,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startBackupServer(optionsFromEnv(process.env))
    .then((server) => console.log('Backup service listening on', server.address()))
    .catch((error: unknown) => {
      console.error(error instanceof ConfigError ? error.message : error);
      process.exit(1);
    });
}
