import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { UsersService } from '../users/users.service';
import { AuthService, INVALID_CREDENTIALS } from './auth.service';
import type { PasswordHasher } from './password-hasher';
import type { RefreshTokenService } from './refresh-token.service';
import { InMemoryTokenDenylist } from './token-denylist';

describe('AuthService', () => {
  const user = {
    _id: 'u1',
    email: 'jane@example.com',
    name: 'Jane',
    passwordHash: 'real-hash',
    createdAt: new Date(),
  };
  let users: jest.Mocked<Pick<UsersService, 'create' | 'findByEmailWithPassword'>>;
  let hasher: jest.Mocked<PasswordHasher>;
  let service: AuthService;

  beforeEach(async () => {
    users = { create: jest.fn(), findByEmailWithPassword: jest.fn() };
    hasher = { hash: jest.fn().mockResolvedValue('dummy-hash'), verify: jest.fn() };
    const refreshTokens = {
      issue: jest.fn().mockResolvedValue({ token: 'r', expiresAt: new Date() }),
    } as unknown as RefreshTokenService;
    const jwt = { signAsync: jest.fn().mockResolvedValue('a') } as unknown as JwtService;
    service = new AuthService(
      users as unknown as UsersService,
      hasher,
      refreshTokens,
      jwt,
      new InMemoryTokenDenylist(),
    );
    await service.onModuleInit();
  });

  it('stores a hash, never the plain password, on sign-up', async () => {
    hasher.hash.mockResolvedValueOnce('argon-hash');
    users.create.mockResolvedValue(user as never);
    await service.signUp({ email: user.email, name: user.name, password: 'Sup3r$ecret' });
    expect(users.create).toHaveBeenCalledWith({
      email: user.email,
      name: user.name,
      passwordHash: 'argon-hash',
    });
  });

  it('still runs a hash verification when the email is unknown (timing equaliser)', async () => {
    users.findByEmailWithPassword.mockResolvedValue(null);
    hasher.verify.mockResolvedValue(false);

    await expect(service.signIn({ email: 'x@example.com', password: 'p' })).rejects.toThrow(
      new UnauthorizedException(INVALID_CREDENTIALS),
    );
    expect(hasher.verify).toHaveBeenCalledWith('dummy-hash', 'p');
  });

  it('rejects a wrong password with the same message', async () => {
    users.findByEmailWithPassword.mockResolvedValue(user as never);
    hasher.verify.mockResolvedValue(false);
    await expect(service.signIn({ email: user.email, password: 'bad' })).rejects.toThrow(
      INVALID_CREDENTIALS,
    );
    expect(hasher.verify).toHaveBeenCalledWith('real-hash', 'bad');
  });

  it('issues tokens for valid credentials', async () => {
    users.findByEmailWithPassword.mockResolvedValue(user as never);
    hasher.verify.mockResolvedValue(true);
    const result = await service.signIn({ email: user.email, password: 'good' });
    expect(result.user).toEqual({
      id: 'u1',
      email: user.email,
      name: 'Jane',
      createdAt: user.createdAt,
    });
    expect(result.tokens).toMatchObject({ accessToken: 'a', refreshToken: 'r' });
  });
});
