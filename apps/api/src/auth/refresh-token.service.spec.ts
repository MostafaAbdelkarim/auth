import type { Env } from '../config/env';
import { ErrorCode } from '../common/http/error-codes';
import { RefreshTokenService } from './refresh-token.service';

/** Covers the logout-vs-refresh race, which is a timing window e2e tests can't hit reliably. */
describe('RefreshTokenService', () => {
  const token = {
    userId: '3b241101-e2bb-4255-8caf-4136c566a962',
    familyId: 'family-1',
  };

  function createService(familyRevokedMeanwhile: boolean) {
    const exec = <T>(value: T) => ({ exec: () => Promise.resolve(value) });
    const model = {
      findOneAndUpdate: jest.fn(() => exec(token)),
      create: jest.fn(() => Promise.resolve({})),
      exists: jest.fn(() => Promise.resolve(familyRevokedMeanwhile ? { _id: 'x' } : null)),
      updateMany: jest.fn(() => Promise.resolve({})),
    };
    const config = { REFRESH_TOKEN_TTL_DAYS: 7, REFRESH_REUSE_GRACE_SECONDS: 10 } as Env;
    return { service: new RefreshTokenService(model as never, config), model };
  }

  it('rejects a token from an ended session without treating it as theft', async () => {
    const { service, model } = createService(false);
    model.findOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) } as never);
    Object.assign(model, {
      findOne: jest.fn(() => ({
        exec: () =>
          Promise.resolve({
            ...token,
            expiresAt: new Date(Date.now() + 60_000),
            revokedAt: new Date(),
            rotatedAt: null,
            familyRevokedAt: new Date(),
          }),
      })),
    });

    await expect(service.rotate('a'.repeat(43))).rejects.toMatchObject({
      code: ErrorCode.INVALID_REFRESH_TOKEN,
    });
    expect(model.updateMany).not.toHaveBeenCalled();
  });

  it('rotates normally when the session is still live', async () => {
    const { service } = createService(false);
    const result = await service.rotate('a'.repeat(43));
    expect(result).toMatchObject({ userId: token.userId, familyId: token.familyId });
    expect(result.next.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('kills the new token if logout revoked the session while rotating', async () => {
    const { service, model } = createService(true);
    await expect(service.rotate('a'.repeat(43))).rejects.toMatchObject({
      code: ErrorCode.SESSION_REVOKED,
    });
    expect(model.updateMany).toHaveBeenCalledWith(
      { familyId: token.familyId, revokedAt: null },
      expect.anything(),
    );
  });
});
