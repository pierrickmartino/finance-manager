import { z } from 'zod';
import { mutate, type ServiceContext } from '../context';
import { ConflictError, isUniqueViolation, parseInput } from '../errors';

export interface Bank {
  id: string;
  name: string;
}

const MAX_NAME_LENGTH = 100;

const createBankInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Bank name is required')
    .max(MAX_NAME_LENGTH, `Bank name must be at most ${MAX_NAME_LENGTH} characters`),
});

export type CreateBankInput = z.input<typeof createBankInput>;

export async function createBank(ctx: ServiceContext, input: CreateBankInput): Promise<Bank> {
  const { name } = parseInput(createBankInput, input);
  try {
    return await mutate(ctx, async ({ tx }) => {
      const result = await tx.query<Bank>(
        'INSERT INTO bank (name) VALUES ($1) RETURNING id, name',
        [name],
      );
      return result.rows[0]!;
    });
  } catch (error: unknown) {
    if (isUniqueViolation(error, 'bank_name_unique')) {
      throw new ConflictError(`A Bank named "${name}" already exists`);
    }
    throw error;
  }
}

export async function listBanks(ctx: ServiceContext): Promise<Bank[]> {
  const result = await ctx.db.query<Bank>('SELECT id, name FROM bank ORDER BY lower(name), name');
  return result.rows;
}
