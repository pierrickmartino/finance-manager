import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const inputPath = (name: string): string =>
  fileURLToPath(new URL(`./inputs/${name}`, import.meta.url));

export const readInput = (name: string): Buffer => readFileSync(inputPath(name));

export const SEED = 'fixture-seed-1';
