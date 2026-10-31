import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import {
  anonymise,
  detectFormat,
  FORMATS,
  isValidIban,
  readStatement,
  reconciles,
  type Format,
} from './index.ts';

const USAGE = `Usage: pnpm anonymise <input> --seed <secret> [--format ${FORMATS.join('|')}] [--out <path>]

Rewrites a bank export (UBS CSV, CAMT.053, OFX 1.02) with names, addresses, IBANs,
account numbers, references and payment text replaced by deterministic fakes.
Dates, amounts, balances, layout and encoding are kept.

  --seed     Secret seed for the fakes (or set ANONYMISER_SEED). Same seed, same fakes.
  --format   Force the format instead of detecting it from the content.
  --out      Output path. Default: <input>.anonymised.<ext> next to the input.
`;

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly env: Readonly<Record<string, string | undefined>>;
}

const isFormat = (value: string): value is Format => (FORMATS as readonly string[]).includes(value);

const defaultOutput = (input: string): string => {
  const ext = extname(input);
  return join(dirname(input), `${basename(input, ext)}.anonymised${ext}`);
};

/** Valid-looking IBANs of the input must all be gone from the output. */
const leakedIbans = (input: string, output: string): string[] =>
  [...new Set(input.match(/[A-Z]{2}\d{2}[A-Z0-9]{11,30}/g) ?? [])]
    .filter(isValidIban)
    .filter((iban) => output.includes(iban));

function anonymiseFile(inputPath: string, outputPath: string, seed: string, forced: Format | undefined, io: CliIo): void {
  const input = readFileSync(inputPath);
  const format = forced ?? detectFormat(input);
  if (format === undefined) {
    throw new Error(`Cannot recognise the format of ${inputPath}; pass --format ${FORMATS.join('|')}`);
  }
  const before = readStatement(format, input);
  const output = anonymise(format, input, seed);

  // Parse our own output back: the structure must be intact and every money fact unchanged.
  const after = readStatement(format, output);
  if (!isDeepStrictEqual(before, after)) throw new Error('Anonymised output changed dates, amounts or balances');
  const leaks = leakedIbans(input.toString('latin1').replace(/ /g, ''), output.toString('latin1').replace(/ /g, ''));
  if (leaks.length > 0) throw new Error(`${leaks.length} original IBAN(s) remain in the output`);

  writeFileSync(outputPath, output);
  io.stdout(
    [
      `Format: ${format}`,
      `Wrote: ${outputPath}`,
      `Entries: ${after.entries.length}, currency ${after.currency}`,
      `Balances reconcile: ${reconciles(after) ? 'yes' : 'NO (the input does not reconcile either)'}`,
      'Review the output by eye before committing it as a fixture.',
      '',
    ].join('\n'),
  );
}

/** Runs the CLI and returns its exit code. */
export function run(argv: readonly string[], io: CliIo): number {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        seed: { type: 'string' },
        format: { type: 'string' },
        out: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    if (values.help) {
      io.stdout(USAGE);
      return 0;
    }
    const [inputPath] = positionals;
    if (inputPath === undefined || positionals.length > 1) throw new Error('Expected exactly one input file');
    const seed = values.seed ?? io.env.ANONYMISER_SEED;
    if (!seed) throw new Error('A seed is required: pass --seed or set ANONYMISER_SEED');
    if (values.format !== undefined && !isFormat(values.format)) {
      throw new Error(`Unknown --format "${values.format}"; expected ${FORMATS.join('|')}`);
    }
    const outputPath = resolve(values.out ?? defaultOutput(inputPath));
    if (outputPath === resolve(inputPath)) throw new Error('Refusing to overwrite the input file');

    anonymiseFile(inputPath, outputPath, seed, values.format, io);
    return 0;
  } catch (error: unknown) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  process.exitCode = run(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    env: process.env,
  });
}
