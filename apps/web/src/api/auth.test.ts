import { http as mock } from 'msw';
import { fail, jane, ok } from '../test/handlers';
import { server } from '../test/server';
import { fetchSession } from './auth';

describe('fetchSession', () => {
  it('returns the user when signed in', async () => {
    server.use(mock.get('*/api/users/me', () => ok(jane)));
    await expect(fetchSession()).resolves.toEqual(jane);
  });

  it.each(['AUTHENTICATION_REQUIRED', 'INVALID_ACCESS_TOKEN', 'SESSION_REVOKED'])(
    'returns null for a 401 %s',
    async (code) => {
      server.use(
        mock.get('*/api/users/me', () => fail(401, code)),
        mock.post('*/api/auth/refresh', () => fail(401, 'INVALID_REFRESH_TOKEN')),
      );
      await expect(fetchSession()).resolves.toBeNull();
    },
  );

  it('rethrows other failures so they are not mistaken for being signed out', async () => {
    server.use(mock.get('*/api/users/me', () => fail(500, 'INTERNAL_ERROR')));
    await expect(fetchSession()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
