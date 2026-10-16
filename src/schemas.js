import { z } from 'zod';

// ─── Inbox triage ───────────────────────────────────────
export const triageSchema = z.object({
  maxEmails: z
    .number({ invalid_type_error: 'maxEmails must be a number' })
    .int('maxEmails must be an integer')
    .min(1, 'maxEmails must be at least 1')
    .max(100, 'maxEmails cannot exceed 100')
    .default(20),

  dryRun: z
    .boolean({ invalid_type_error: 'dryRun must be true or false' })
    .default(false),

  query: z
    .string()
    .max(500, 'query too long')
    .optional()
    .default('is:unread'),
});

// ─── Research ───────────────────────────────────────────
export const researchSchema = z.object({
  query: z
    .string({ required_error: 'query is required' })
    .trim()
    .min(2, 'query must be at least 2 characters')
    .max(500, 'query too long'),

  maxSources: z
    .number({ invalid_type_error: 'maxSources must be a number' })
    .int()
    .min(1)
    .max(10, 'maxSources cannot exceed 10')
    .default(5),
});

// ─── Helper: format Zod errors nicely ───────────────────
export function formatZodError(err) {
  return {
    error: 'validation_error',
    issues: err.issues.map((i) => ({
      path: i.path.join('.') || '(root)',
      message: i.message,
    })),
  };
}