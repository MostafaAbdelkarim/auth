/**
 * Password policy from the assessment brief. The web app's zod schema
 * (apps/web/src/features/auth/schemas.ts) mirrors these rules; keep them in sync.
 *
 * - 8 to 128 characters, counted as Unicode code points (an emoji is one character);
 *   the upper bound keeps argon2 hashing cost bounded
 * - any character is allowed, including whitespace and newlines
 * - at least one letter (any script, so non-ASCII letters count)
 * - at least one number
 * - at least one special character (anything that is not a letter or number)
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_PATTERN =
  /^(?=[\s\S]*\p{L})(?=[\s\S]*\p{N})(?=[\s\S]*[^\p{L}\p{N}])[\s\S]{8,128}$/u;
export const PASSWORD_MESSAGE =
  'Password must be 8-128 characters and include at least one letter, one number and one special character';

export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 50;
