import type { PasswordHasher } from '../auth/password-hasher';
import { AppException } from '../common/http/app.exception';
import { ErrorCode } from '../common/http/error-codes';
import { AppLogger } from '../common/logging/app-logger';
import { NAME_MIN_LENGTH, PASSWORD_PATTERN } from '../common/validation/password';
import type { UsersService } from './users.service';

export interface SeedUser {
  email: string;
  name: string;
  password: string;
}

/** Local demo account, documented in the README. Never seed real environments with it. */
export const DEMO_USERS: SeedUser[] = [
  { email: 'demo@example.com', name: 'Demo User', password: 'Demo$ecret1' },
];

/** Demo data must never end up in a real deployment by accident. */
export function assertSeedAllowed(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV === 'production' && env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'Refusing to seed demo users with NODE_ENV=production. Set ALLOW_DEMO_SEED=true only for a local demo.',
    );
  }
}

/**
 * Idempotent: creates the users that don't exist yet and skips the rest. Seed data goes
 * through the same rules and hashing as a real sign-up, so it can't create invalid accounts.
 */
export async function seedUsers(
  users: UsersService,
  hasher: PasswordHasher,
  seeds: SeedUser[],
): Promise<{ created: string[]; skipped: string[] }> {
  const logger = new AppLogger('Seed');
  const result = { created: [] as string[], skipped: [] as string[] };

  for (const seed of seeds) {
    if (!PASSWORD_PATTERN.test(seed.password)) {
      throw new Error(`Seed user ${seed.email} does not meet the password policy`);
    }
    if (seed.name.trim().length < NAME_MIN_LENGTH) {
      throw new Error(`Seed user ${seed.email} does not meet the name policy`);
    }

    if (await users.findByEmailWithPassword(seed.email)) {
      result.skipped.push(seed.email);
      continue;
    }
    try {
      const passwordHash = await hasher.hash(seed.password);
      await users.create({ email: seed.email, name: seed.name, passwordHash });
      result.created.push(seed.email);
    } catch (error) {
      if (error instanceof AppException && error.code === ErrorCode.EMAIL_ALREADY_REGISTERED) {
        result.skipped.push(seed.email);
        continue;
      }
      throw error;
    }
  }

  logger.info('Seeding finished', { event: 'seed.users.finished', ...result });
  return result;
}
