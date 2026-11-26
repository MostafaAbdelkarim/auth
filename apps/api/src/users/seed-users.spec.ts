import { Logger } from '@nestjs/common';
import { AppException } from '../common/http/app.exception';
import { ErrorCode } from '../common/http/error-codes';
import { assertSeedAllowed, DEMO_USERS, seedUsers } from './seed-users';

describe('seedUsers', () => {
  const hasher = {
    hash: jest.fn((p: string) => Promise.resolve(`hashed:${p}`)),
    verify: jest.fn(),
  };
  let users: { findByEmailWithPassword: jest.Mock; create: jest.Mock };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    users = { findByEmailWithPassword: jest.fn().mockResolvedValue(null), create: jest.fn() };
  });
  afterEach(() => jest.restoreAllMocks());

  it('creates missing users with a hashed password', async () => {
    const result = await seedUsers(users as never, hasher, DEMO_USERS);
    expect(result).toEqual({ created: ['demo@example.com'], skipped: [] });
    expect(users.create).toHaveBeenCalledWith({
      email: 'demo@example.com',
      name: 'Demo User',
      passwordHash: 'hashed:Demo$ecret1',
    });
  });

  it('is idempotent: existing users are skipped', async () => {
    users.findByEmailWithPassword.mockResolvedValue({ _id: 'x' });
    const result = await seedUsers(users as never, hasher, DEMO_USERS);
    expect(result).toEqual({ created: [], skipped: ['demo@example.com'] });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('treats a concurrent duplicate as already seeded', async () => {
    users.create.mockRejectedValue(
      AppException.conflict(ErrorCode.EMAIL_ALREADY_REGISTERED, 'taken'),
    );
    const result = await seedUsers(users as never, hasher, DEMO_USERS);
    expect(result.skipped).toEqual(['demo@example.com']);
  });

  it('rethrows other failures', async () => {
    users.create.mockRejectedValue(new Error('db down'));
    await expect(seedUsers(users as never, hasher as never, DEMO_USERS)).rejects.toThrow('db down');
  });

  it('refuses seed data that breaks the real validation rules', async () => {
    await expect(
      seedUsers(users as never, hasher as never, [
        { email: 'weak@example.com', name: 'Weak User', password: 'password' },
      ]),
    ).rejects.toThrow('Seed user weak@example.com does not meet the password policy');
    await expect(
      seedUsers(users as never, hasher as never, [
        { email: 'short@example.com', name: 'Al', password: 'Demo$ecret1' },
      ]),
    ).rejects.toThrow('Seed user short@example.com does not meet the name policy');
  });
});

describe('assertSeedAllowed', () => {
  it('allows development and test', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertSeedAllowed({})).not.toThrow();
  });

  it('refuses production unless explicitly allowed (e.g. the local Docker demo)', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(/ALLOW_DEMO_SEED=true/);
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true' }),
    ).not.toThrow();
  });
});
