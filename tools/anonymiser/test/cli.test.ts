import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { run } from '../src/cli.ts';
import { readStatement } from '../src/index.ts';
import { inputPath, SEED } from './helpers.ts';

describe('anonymise CLI', () => {
  let dir: string;
  let out: string[];
  let err: string[];
  const io = {
    stdout: (s: string): void => void out.push(s),
    stderr: (s: string): void => void err.push(s),
    env: {} as Record<string, string | undefined>,
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'anonymiser-'));
    out = [];
    err = [];
    io.env = {};
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test.each([
    ['ubs.csv', 'ubs-csv', 'ubs.anonymised.csv'],
    ['camt053.xml', 'camt053', 'camt053.anonymised.xml'],
    ['credit-agricole.ofx', 'ofx', 'credit-agricole.anonymised.ofx'],
  ] as const)('anonymises %s next to the input, detecting its format', (file, format, expected) => {
    const input = join(dir, file);
    copyFileSync(inputPath(file), input);

    const code = run([input, '--seed', SEED], io);

    expect(err.join('')).toBe('');
    expect(code).toBe(0);
    const output = readFileSync(join(dir, expected));
    expect(readStatement(format, output)).toEqual(readStatement(format, readFileSync(input)));
    expect(out.join('')).toContain(`Format: ${format}`);
  });

  test('writes to --out and reads the seed from ANONYMISER_SEED', () => {
    const target = join(dir, 'fixture.csv');
    io.env = { ANONYMISER_SEED: SEED };

    const code = run([inputPath('ubs.csv'), '--out', target], io);

    expect(code).toBe(0);
    expect(existsSync(target)).toBe(true);
  });

  test('refuses to run without a seed', () => {
    const code = run([inputPath('ubs.csv'), '--out', join(dir, 'x.csv')], io);

    expect(code).toBe(1);
    expect(err.join('')).toContain('seed');
    expect(existsSync(join(dir, 'x.csv'))).toBe(false);
  });

  test('refuses a file whose format it cannot recognise', () => {
    const input = join(dir, 'notes.txt');
    copyFileSync(inputPath('../helpers.ts'), input);

    expect(run([input, '--seed', SEED], io)).toBe(1);
    expect(err.join('')).toContain('--format');
  });

  test('refuses a file that does not match the forced format', () => {
    expect(run([inputPath('ubs.csv'), '--format', 'ofx', '--seed', SEED, '--out', join(dir, 'x')], io)).toBe(1);
    expect(existsSync(join(dir, 'x'))).toBe(false);
  });

  test('prints usage with --help', () => {
    expect(run(['--help'], io)).toBe(0);
    expect(out.join('')).toContain('Usage');
  });
});
