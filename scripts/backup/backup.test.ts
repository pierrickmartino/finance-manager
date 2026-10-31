import { execFile, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createDb, type Db } from '@/server/db/client';
import { createBank, listBanks } from '@/server/services/banks';
import type { ServiceContext } from '@/server/services/context';
import { createDatabase, databaseUrl, dropDatabase } from '@test/support/postgres';
import { startBackupServer, type BackupServer } from './server';

const run = promisify(execFile);
const SCRIPTS = import.meta.dirname;
const AGE_HEADER = 'age-encryption.org/v1';
const BANK_NAME = 'Plaintext Canary Bank';

interface KeyPair {
  identityFile: string;
  recipient: string;
}

async function generateKey(dir: string, name: string): Promise<KeyPair> {
  const identityFile = path.join(dir, `${name}.txt`);
  await run('age-keygen', ['-o', identityFile]);
  const { stdout } = await run('age-keygen', ['-y', identityFile]);
  return { identityFile, recipient: stdout.trim() };
}

function ageDecrypt(identityFile: string, input: Buffer): ReturnType<typeof spawnSync> {
  return spawnSync('age', ['--decrypt', '-i', identityFile], { input });
}

const { template, prefix } = inject('testDatabase');
const sourceName = `${prefix}_bk_${randomBytes(3).toString('hex')}`;
const TOKEN = randomBytes(32).toString('hex');

let workDir: string;
let key: KeyPair;
let otherKey: KeyPair;
let sourceDb: Db;
let source: ServiceContext;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'fm-backup-test-'));
  // Throwaway keys, generated per run and deleted afterwards. Never committed.
  key = await generateKey(workDir, 'key');
  otherKey = await generateKey(workDir, 'other-key');
  await createDatabase(sourceName, template);
  sourceDb = createDb(databaseUrl(sourceName));
  source = { db: sourceDb, actor: { type: 'manual', id: null } };
  await createBank(source, { name: BANK_NAME });
  await createBank(source, { name: 'UBS' });
});

afterAll(async () => {
  await sourceDb?.end();
  await dropDatabase(sourceName);
  await rm(workDir, { recursive: true, force: true });
});

async function withServer<T>(
  options: Partial<Parameters<typeof startBackupServer>[0]>,
  fn: (baseUrl: string, server: BackupServer) => Promise<T>,
): Promise<T> {
  const server = await startBackupServer({
    databaseUrl: databaseUrl(sourceName),
    token: TOKEN,
    recipients: [key.recipient],
    port: 0,
    host: '127.0.0.1',
    ...options,
  });
  try {
    const { port } = server.address() as AddressInfo;
    return await fn(`http://127.0.0.1:${port}`, server);
  } finally {
    await server.stop();
  }
}

function getBackup(baseUrl: string, token?: string): Promise<Response> {
  return fetch(`${baseUrl}/backup`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

/** The status of a backup request, after reading its whole body (so the request is over). */
async function backupStatus(baseUrl: string, token?: string): Promise<number> {
  const response = await getBackup(baseUrl, token);
  await response.arrayBuffer();
  return response.status;
}

describe('backup server', () => {
  it('rejects requests without the backup secret or with a wrong one', async () => {
    await withServer({}, async (baseUrl) => {
      expect(await backupStatus(baseUrl)).toBe(401);
      expect(await backupStatus(baseUrl, 'x'.repeat(64))).toBe(401);
    });
  });

  it('streams a dump that is encrypted to the configured key and unreadable without it', async () => {
    await withServer({}, async (baseUrl) => {
      const response = await getBackup(baseUrl, TOKEN);
      expect(response.status).toBe(200);
      const body = Buffer.from(await response.arrayBuffer());

      expect(response.headers.get('x-backup-sha256')).toBe(
        createHash('sha256').update(body).digest('hex'),
      );
      expect(body.subarray(0, AGE_HEADER.length).toString()).toBe(AGE_HEADER);
      // No plaintext leaks: neither the pg_dump magic nor row data appear in the artifact.
      expect(body.includes('PGDMP')).toBe(false);
      expect(body.includes(BANK_NAME)).toBe(false);

      expect(ageDecrypt(otherKey.identityFile, body).status).not.toBe(0);
      const decrypted = ageDecrypt(key.identityFile, body);
      expect(decrypted.status).toBe(0);
      expect((decrypted.stdout as Buffer).subarray(0, 5).toString()).toBe('PGDMP');
    });
  });

  it('refuses a second dump within the minimum interval', async () => {
    let clock = 1_000_000;
    await withServer({ minIntervalSeconds: 600, now: () => clock }, async (baseUrl) => {
      expect(await backupStatus(baseUrl, TOKEN)).toBe(200);
      clock += 599_000;
      expect(await backupStatus(baseUrl, TOKEN)).toBe(429);
      clock += 1_000;
      expect(await backupStatus(baseUrl, TOKEN)).toBe(200);
    });
  });

  it('allows the next dump once the interval has passed, even while an earlier one is still being read', async () => {
    let clock = 1_000_000;
    await withServer({ minIntervalSeconds: 600, now: () => clock }, async (baseUrl) => {
      // Headers only: the first body is still on its way when the next request arrives.
      const first = await getBackup(baseUrl, TOKEN);
      expect(first.status).toBe(200);
      clock += 600_000;

      expect(await backupStatus(baseUrl, TOKEN)).toBe(200);
      await first.arrayBuffer();
    });
  });

  it('locks /backup for an hour after too many failed attempts', async () => {
    let clock = 1_000_000;
    await withServer({ maxFailedAuthPerHour: 3, now: () => clock }, async (baseUrl) => {
      for (let i = 0; i < 3; i += 1) expect(await backupStatus(baseUrl, 'wrong')).toBe(401);
      expect(await backupStatus(baseUrl, TOKEN)).toBe(429);
      clock += 60 * 60 * 1000;
      expect(await backupStatus(baseUrl, TOKEN)).toBe(200);
    });
  });

  it.each([
    ['a short secret', { token: 'too-short' }, /BACKUP_TOKEN/],
    ['no recipient', { recipients: [] }, /BACKUP_AGE_RECIPIENTS/],
    ['a private key as recipient', { recipients: ['AGE-SECRET-KEY-1ABC'] }, /age public key/],
  ])('refuses to start with %s', async (_label, override, message) => {
    await expect(withServer(override, async () => undefined)).rejects.toThrow(message);
  });
});

interface ScriptResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runScript(script: string, args: string[], env: object = {}): Promise<ScriptResult> {
  try {
    const { stdout, stderr } = await run('bash', [path.join(SCRIPTS, script), ...args], {
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error: unknown) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

async function writePullConfig(baseUrl: string, backupDir: string, token = TOKEN) {
  const file = path.join(workDir, `pull-${randomBytes(3).toString('hex')}.env`);
  await writeFile(
    file,
    [`BACKUP_URL=${baseUrl}/backup`, `BACKUP_TOKEN=${token}`, `BACKUP_DIR=${backupDir}`].join('\n'),
  );
  return file;
}

const today = () => new Date().toISOString().slice(0, 10);

describe('pull.sh', () => {
  it("stores the encrypted dump as today's daily and this month's monthly copy", async () => {
    const backupDir = path.join(workDir, `pull-${randomBytes(3).toString('hex')}`);
    await withServer({}, async (baseUrl) => {
      const result = await runScript('pull.sh', [await writePullConfig(baseUrl, backupDir)]);
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
    });
    const daily = await readFile(path.join(backupDir, 'daily', `finance-${today()}.dump.age`));
    expect(daily.subarray(0, AGE_HEADER.length).toString()).toBe(AGE_HEADER);
    expect(ageDecrypt(key.identityFile, daily).status).toBe(0);
    expect(await readdir(path.join(backupDir, 'monthly'))).toEqual([
      `finance-${today().slice(0, 7)}.dump.age`,
    ]);
  });

  it('keeps the newest 14 daily and 12 monthly copies', async () => {
    const backupDir = path.join(workDir, `pull-${randomBytes(3).toString('hex')}`);
    await mkdir(path.join(backupDir, 'daily'), { recursive: true });
    await mkdir(path.join(backupDir, 'monthly'), { recursive: true });
    const oldDays = Array.from(
      { length: 20 },
      (_, i) => `2020-01-${String(i + 1).padStart(2, '0')}`,
    );
    const oldMonths = Array.from(
      { length: 15 },
      (_, i) => `${2018 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
    );
    for (const day of oldDays)
      await writeFile(path.join(backupDir, 'daily', `finance-${day}.dump.age`), 'old');
    for (const month of oldMonths)
      await writeFile(path.join(backupDir, 'monthly', `finance-${month}.dump.age`), 'old');

    await withServer({}, async (baseUrl) => {
      expect((await runScript('pull.sh', [await writePullConfig(baseUrl, backupDir)])).code).toBe(
        0,
      );
    });

    const daily = (await readdir(path.join(backupDir, 'daily'))).sort();
    expect(daily).toHaveLength(14);
    expect(daily[0]).toBe('finance-2020-01-08.dump.age');
    expect(daily.at(-1)).toBe(`finance-${today()}.dump.age`);
    const monthly = (await readdir(path.join(backupDir, 'monthly'))).sort();
    expect(monthly).toHaveLength(12);
    expect(monthly[0]).toBe('finance-2018-05.dump.age');
    expect(monthly.at(-1)).toBe(`finance-${today().slice(0, 7)}.dump.age`);
  });

  it('fails and keeps nothing when the server refuses the secret', async () => {
    const backupDir = path.join(workDir, `pull-${randomBytes(3).toString('hex')}`);
    await withServer({}, async (baseUrl) => {
      const config = await writePullConfig(baseUrl, backupDir, 'w'.repeat(64));
      const result = await runScript('pull.sh', [config]);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toMatch(/401/);
    });
    expect(await readdir(path.join(backupDir, 'daily'))).toEqual([]);
  });

  it('refuses plain http to a remote host', async () => {
    const backupDir = path.join(workDir, `pull-${randomBytes(3).toString('hex')}`);
    const result = await runScript('pull.sh', [
      await writePullConfig('http://example.com', backupDir),
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/https/);
  });
});

describe('restore.sh', () => {
  const targets: string[] = [];
  afterAll(async () => {
    for (const name of targets) await dropDatabase(name);
  });

  async function emptyDatabase(): Promise<string> {
    const name = `${prefix}_rs_${randomBytes(3).toString('hex')}`;
    targets.push(name);
    await createDatabase(name);
    return name;
  }

  async function pulledBackup(): Promise<string> {
    const backupDir = path.join(workDir, `pull-${randomBytes(3).toString('hex')}`);
    await withServer({}, async (baseUrl) => {
      expect((await runScript('pull.sh', [await writePullConfig(baseUrl, backupDir)])).code).toBe(
        0,
      );
    });
    return path.join(backupDir, 'daily', `finance-${today()}.dump.age`);
  }

  it('restores a pulled backup into a fresh database with the same data', async () => {
    const backup = await pulledBackup();
    const target = await emptyDatabase();

    const result = await runScript('restore.sh', [
      '--identity',
      key.identityFile,
      '--target',
      databaseUrl(target),
      backup,
    ]);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);

    const restoredDb = createDb(databaseUrl(target));
    try {
      const restored: ServiceContext = { db: restoredDb, actor: { type: 'manual', id: null } };
      expect(await listBanks(restored)).toEqual(await listBanks(source));
      // The restored schema is live: new writes work, including generated ids.
      await createBank(restored, { name: 'After restore' });
    } finally {
      await restoredDb.end();
    }
  });

  it('refuses a target database that already has tables', async () => {
    const backup = await pulledBackup();
    const result = await runScript('restore.sh', [
      '--identity',
      key.identityFile,
      '--target',
      databaseUrl(sourceName),
      backup,
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/not empty/);
  });

  it('fails without the matching private key', async () => {
    const backup = await pulledBackup();
    const target = await emptyDatabase();
    const result = await runScript('restore.sh', [
      '--identity',
      otherKey.identityFile,
      '--target',
      databaseUrl(target),
      backup,
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/decrypt/i);
  });
});
