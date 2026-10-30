import type { z } from 'zod';

export type ServiceErrorCode = 'validation' | 'conflict' | 'not_found';

/**
 * An expected failure of a service operation. Its message is safe to show to the user.
 * Anything else thrown by a service is a bug and is reported as a generic error.
 */
export class ServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string) {
    super('validation', message);
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string) {
    super('conflict', message);
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string) {
    super('not_found', message);
  }
}

/** Validates untrusted input at the service boundary. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('; ');
    throw new ValidationError(message);
  }
  return result.data;
}

const UNIQUE_VIOLATION = '23505';

/** True when a Postgres error is a unique-constraint violation (optionally on a named constraint). */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const pgError = error as { code?: string; constraint?: string };
  return (
    pgError.code === UNIQUE_VIOLATION &&
    (constraint === undefined || pgError.constraint === constraint)
  );
}
