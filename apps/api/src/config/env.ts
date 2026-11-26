import { z } from 'zod';

/** Env flags arrive as strings; z.coerce.boolean() would turn "false" into true. */
const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1')
  .optional();

/** `KEY=` in an env file means "not set", not "set to an empty string". */
const optionalText = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/** The placeholders in .env.example ("change-me-…", "CHANGE_ME_…"). */
const ENV_EXAMPLE_PLACEHOLDER = /change[-_]?me/i;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    /** How long a just-rotated refresh token is still accepted (parallel requests from several tabs). */
    REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).max(60).default(10),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
    /** Sign-in attempts per minute for one email, from any number of IPs (credential stuffing). */
    AUTH_ACCOUNT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(5),
    TRUST_PROXY: booleanFlag,
    SWAGGER_ENABLED: booleanFlag,
    /** Basic-auth credentials for /api/docs. Required when Swagger is enabled in production. */
    SWAGGER_USERNAME: optionalText(z.string()),
    SWAGGER_PASSWORD: optionalText(
      z.string().min(16, 'SWAGGER_PASSWORD must be at least 16 characters'),
    ),
    COOKIE_SECURE: booleanFlag,
    /** Escape hatch for a local production-mode demo over plain http. Never set it in a deployment. */
    ALLOW_INSECURE_COOKIES: booleanFlag,
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Also write logs to LOG_DIR/YYYY/MM/YYYY-MM-DD.log (UTC). Unset: stdout only. */
    LOG_DIR: optionalText(z.string()),
  })
  .transform((env) => {
    const isProduction = env.NODE_ENV === 'production';
    return {
      ...env,
      SWAGGER_ENABLED: env.SWAGGER_ENABLED ?? !isProduction,
      COOKIE_SECURE: env.COOKIE_SECURE ?? isProduction,
      ALLOW_INSECURE_COOKIES: env.ALLOW_INSECURE_COOKIES ?? false,
      TRUST_PROXY: env.TRUST_PROXY ?? false,
    };
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['JWT_ACCESS_SECRET', 'MONGO_URI'] as const) {
      if (ENV_EXAMPLE_PLACEHOLDER.test(env[key])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'still the .env.example placeholder; set a real value',
        });
      }
    }
  })
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' ||
      !env.SWAGGER_ENABLED ||
      (env.SWAGGER_USERNAME !== undefined && env.SWAGGER_PASSWORD !== undefined),
    {
      path: ['SWAGGER_ENABLED'],
      message:
        'SWAGGER_USERNAME and SWAGGER_PASSWORD are required when Swagger is enabled in production',
    },
  )
  .refine(
    (env) => env.NODE_ENV !== 'production' || env.COOKIE_SECURE || env.ALLOW_INSECURE_COOKIES,
    {
      path: ['COOKIE_SECURE'],
      message:
        'COOKIE_SECURE must be true in production (set ALLOW_INSECURE_COOKIES=true only for a local http demo)',
    },
  );

export type Env = z.output<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
