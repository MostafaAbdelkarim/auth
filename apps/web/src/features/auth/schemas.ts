import { z } from 'zod';

/**
 * Password policy from the assessment brief. The API enforces the same rules
 * (apps/api/src/common/validation/password.ts); keep the two in sync.
 * Each rule is listed separately so the sign-up form can show a live checklist.
 * Lengths count Unicode code points ([...value].length), as the API's /u regex does,
 * so an emoji counts as one character on both sides.
 */
const characterCount = (value: string) => [...value].length;

export const passwordRules = [
  {
    id: 'length',
    label: 'At least 8 characters',
    test: (value: string) => characterCount(value) >= 8,
  },
  { id: 'letter', label: 'At least one letter', test: (value: string) => /\p{L}/u.test(value) },
  { id: 'number', label: 'At least one number', test: (value: string) => /\p{N}/u.test(value) },
  {
    id: 'special',
    label: 'At least one special character',
    test: (value: string) => /[^\p{L}\p{N}]/u.test(value),
  },
] as const;

export type PasswordRuleId = (typeof passwordRules)[number]['id'];

const email = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

export const signUpSchema = z.object({
  email,
  name: z
    .string()
    .trim()
    .min(3, 'Name must be at least 3 characters')
    .max(50, 'Name must be at most 50 characters'),
  password: z
    .string()
    .refine((value) => characterCount(value) <= 128, 'Password must be at most 128 characters')
    .refine(
      (value) => passwordRules.every((rule) => rule.test(value)),
      'Password does not meet all the requirements',
    ),
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
