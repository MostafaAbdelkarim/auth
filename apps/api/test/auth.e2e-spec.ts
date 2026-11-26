import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';
import { RefreshToken } from '../src/auth/schemas/refresh-token.schema';
import type { SoftDeleteModel } from '../src/common/database/abstract.schema';
import { User } from '../src/users/schemas/user.schema';
import { createTestApp, TestApp } from './test-app';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const validUser = { email: 'Jane@Example.com', name: 'Jane Doe', password: 'Sup3r$ecret' };
const credentials = { email: 'jane@example.com', password: validUser.password };

function setCookies(res: request.Response): string[] {
  return (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
}

function cookieNames(res: request.Response): string[] {
  return setCookies(res).map((cookie) => cookie.split('=')[0]);
}

function getCookie(res: request.Response, name: string): string | undefined {
  return setCookies(res).find((cookie) => cookie.startsWith(`${name}=`));
}

/** "name=value" of a Set-Cookie header, ready to send back in a Cookie header. */
function cookiePair(res: request.Response, name: string): string {
  return getCookie(res, name)!.split(';')[0];
}

const successEnvelope = (data: unknown) => ({
  success: true,
  data,
  meta: { correlationId: expect.stringMatching(UUID_V4), timestamp: expect.any(String) },
});

const errorEnvelope = (statusCode: number, code: string, extra: Record<string, unknown> = {}) => ({
  success: false,
  error: expect.objectContaining({ statusCode, code, message: expect.any(String), ...extra }),
  meta: {
    correlationId: expect.stringMatching(UUID_V4),
    timestamp: expect.any(String),
    path: expect.any(String),
  },
});

describe('Auth (e2e)', () => {
  let testApp: TestApp;
  let server: App;

  beforeAll(async () => {
    // No grace window here, so replaying a rotated token is always treated as theft.
    testApp = await createTestApp({ REFRESH_REUSE_GRACE_SECONDS: '0' });
    server = testApp.app.getHttpServer();
  });

  afterAll(() => testApp.close());

  describe('POST /api/auth/signup', () => {
    it('creates the user, normalises the email and sets httpOnly session cookies', async () => {
      const res = await request(server).post('/api/auth/signup').send(validUser).expect(201);

      expect(res.body).toEqual(
        successEnvelope({
          user: {
            id: expect.stringMatching(UUID_V4),
            email: 'jane@example.com',
            name: 'Jane Doe',
            createdAt: expect.any(String),
          },
        }),
      );
      expect(JSON.stringify(res.body)).not.toMatch(/password|token|deletedAt/i);
      expect(cookieNames(res)).toEqual(['access_token', 'refresh_token']);
      expect(getCookie(res, 'access_token')).toMatch(/HttpOnly/i);
      expect(getCookie(res, 'access_token')).toMatch(/SameSite=Strict/i);
      expect(getCookie(res, 'refresh_token')).toMatch(/Path=\/api\/auth/);
    });

    it('rejects a duplicate email (case-insensitive) with 409 EMAIL_ALREADY_REGISTERED', async () => {
      const res = await request(server)
        .post('/api/auth/signup')
        .send({ ...validUser, email: 'JANE@example.com' })
        .expect(409);
      expect(res.body).toEqual(errorEnvelope(409, 'EMAIL_ALREADY_REGISTERED'));
    });

    it.each([
      ['an invalid email', { email: 'not-an-email' }, 'Email must be a valid email address'],
      ['an email that is not a string', { email: { $ne: null } }, 'Email must be a valid email'],
      ['a name under 3 characters', { name: 'Jo' }, 'Name must be at least 3 characters'],
      ['a name of only spaces', { name: '     ' }, 'Name must be at least 3 characters'],
      ['a password under 8 characters', { password: 'Ab1!' }, 'Password must be'],
      ['a password without a letter', { password: '12345678!' }, 'Password must be'],
      ['a password without a number', { password: 'abcdefgh!' }, 'Password must be'],
      ['a password without a special character', { password: 'abcdefg1' }, 'Password must be'],
    ])('rejects %s with 400 VALIDATION_FAILED', async (_case, override, expected) => {
      const res = await request(server)
        .post('/api/auth/signup')
        .send({ ...validUser, email: 'other@example.com', ...override })
        .expect(400);
      expect(res.body).toEqual(
        errorEnvelope(400, 'VALIDATION_FAILED', {
          details: expect.arrayContaining([expect.stringContaining(expected)]),
        }),
      );
      expect(cookieNames(res)).toEqual([]);
    });

    it('rejects unknown fields instead of silently storing them', async () => {
      const res = await request(server)
        .post('/api/auth/signup')
        .send({ ...validUser, email: 'admin@example.com', role: 'admin', _id: 'x' })
        .expect(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining(['property role should not exist', 'property _id should not exist']),
      );
    });
  });

  describe('POST /api/auth/signin', () => {
    it('signs in with the right credentials', async () => {
      const res = await request(server)
        .post('/api/auth/signin')
        .send({ email: ' jane@EXAMPLE.com ', password: validUser.password })
        .expect(200);
      expect(res.body.data.user.email).toBe('jane@example.com');
      expect(cookieNames(res)).toEqual(['access_token', 'refresh_token']);
    });

    it('returns the same 401 INVALID_CREDENTIALS for a wrong password and an unknown email', async () => {
      const wrongPassword = await request(server)
        .post('/api/auth/signin')
        .send({ email: validUser.email, password: 'Wrong$pass1' })
        .expect(401);
      const unknownEmail = await request(server)
        .post('/api/auth/signin')
        .send({ email: 'nobody@example.com', password: 'Wrong$pass1' })
        .expect(401);

      expect(wrongPassword.body.error).toEqual({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
      expect(unknownEmail.body.error).toEqual(wrongPassword.body.error);
    });
  });

  describe('session lifecycle', () => {
    it('me → refresh → logout → me is rejected', async () => {
      const agent = request.agent(server);
      await agent.post('/api/auth/signin').send(credentials).expect(200);

      const me = await agent.get('/api/users/me').expect(200);
      expect(me.body).toEqual(
        successEnvelope(expect.objectContaining({ email: 'jane@example.com', name: 'Jane Doe' })),
      );

      const refreshed = await agent.post('/api/auth/refresh').expect(200);
      expect(refreshed.body).toEqual(successEnvelope(null));
      expect(cookieNames(refreshed)).toEqual(['access_token', 'refresh_token']);
      await agent.get('/api/users/me').expect(200);

      const logout = await agent.post('/api/auth/logout').expect(200);
      expect(logout.body).toEqual(successEnvelope(null));
      const me401 = await agent.get('/api/users/me').expect(401);
      expect(me401.body.error.code).toBe('AUTHENTICATION_REQUIRED');
      await agent.post('/api/auth/refresh').expect(401);
    });

    it('logout immediately invalidates the access token too, not only the refresh token', async () => {
      const signIn = await request(server).post('/api/auth/signin').send(credentials).expect(200);
      const accessCookie = cookiePair(signIn, 'access_token');
      const refreshCookie = cookiePair(signIn, 'refresh_token');
      await request(server).get('/api/users/me').set('Cookie', accessCookie).expect(200);

      await request(server)
        .post('/api/auth/logout')
        .set('Cookie', [accessCookie, refreshCookie])
        .expect(200);

      // A copy of the access token taken before logout (e.g. by malware) is now rejected.
      const replay = await request(server)
        .get('/api/users/me')
        .set('Cookie', accessCookie)
        .expect(401);
      expect(replay.body.error.code).toBe('SESSION_REVOKED');
    });

    it('logout with an already-expired or forged access token still succeeds', async () => {
      await request(server)
        .post('/api/auth/logout')
        .set('Cookie', 'access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.forged')
        .expect(200);
    });

    it('logout without a session still succeeds and clears cookies', async () => {
      const res = await request(server).post('/api/auth/logout').expect(200);
      expect(cookieNames(res)).toEqual(['access_token', 'refresh_token']);
    });

    it('revokes the whole session when a rotated refresh token is reused', async () => {
      const signIn = await request(server).post('/api/auth/signin').send(credentials).expect(200);
      const original = cookiePair(signIn, 'refresh_token');

      const rotated = await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', original)
        .expect(200);
      const next = cookiePair(rotated, 'refresh_token');

      // Replaying the old token (e.g. stolen) fails and also kills its successor.
      const replay = await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', original)
        .expect(401);
      expect(replay.body.error.code).toBe('INVALID_REFRESH_TOKEN');
      await request(server).post('/api/auth/refresh').set('Cookie', next).expect(401);
      // And replaying again after the session is already revoked stays a plain 401.
      await request(server).post('/api/auth/refresh').set('Cookie', original).expect(401);
    });

    it('rejects an expired refresh token and clears the session cookies', async () => {
      const signIn = await request(server).post('/api/auth/signin').send(credentials).expect(200);
      const tokens = testApp.app.get<SoftDeleteModel<RefreshToken>>(
        getModelToken(RefreshToken.name),
      );
      await tokens.updateMany(
        { userId: signIn.body.data.user.id },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );

      const res = await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', cookiePair(signIn, 'refresh_token'))
        .expect(401);
      expect(getCookie(res, 'refresh_token')).toMatch(/Expires=Thu, 01 Jan 1970/);
    });
  });

  describe('soft-deleted accounts', () => {
    const doomed = { email: 'doomed@example.com', name: 'Doomed User', password: 'Sup3r$ecret' };

    it('cannot sign in, use an existing session, or refresh it, and the email is free again', async () => {
      const users = testApp.app.get<SoftDeleteModel<User>>(getModelToken(User.name));
      const agent = request.agent(server);
      const signUp = await agent.post('/api/auth/signup').send(doomed).expect(201);

      expect(await users.softDeleteById(signUp.body.data.user.id)).toBe(true);

      const me = await agent.get('/api/users/me').expect(401);
      expect(me.body.error.code).toBe('SESSION_REVOKED');
      const refresh = await agent.post('/api/auth/refresh').expect(401);
      expect(refresh.body.error.code).toBe('SESSION_REVOKED');
      const signIn = await request(server)
        .post('/api/auth/signin')
        .send({ email: doomed.email, password: doomed.password })
        .expect(401);
      expect(signIn.body.error.code).toBe('INVALID_CREDENTIALS');

      const again = await request(server).post('/api/auth/signup').send(doomed).expect(201);
      expect(again.body.data.user.id).not.toBe(signUp.body.data.user.id);
    });
  });

  describe('protected endpoint GET /api/users/me', () => {
    it('rejects a request without a cookie', async () => {
      const res = await request(server).get('/api/users/me').expect(401);
      expect(res.body).toEqual(errorEnvelope(401, 'AUTHENTICATION_REQUIRED'));
      expect(res.body.meta.path).toBe('/api/users/me');
    });

    it('rejects a forged access token', async () => {
      const res = await request(server)
        .get('/api/users/me')
        .set('Cookie', 'access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.forged')
        .expect(401);
      expect(res.body.error.code).toBe('INVALID_ACCESS_TOKEN');
    });

    it.each([
      ['another type', { typ: 'email-verification' }, {}],
      ['another audience', {}, { audience: 'some-other-service' }],
      ['another issuer', {}, { issuer: 'some-other-service' }],
      ['a subject that is not a user id', { sub: 'admin' }, {}],
    ])('rejects a correctly signed token with %s', async (_case, claims, options) => {
      const jwt = testApp.app.get(JwtService);
      const token = await jwt.signAsync(
        { sub: '3b241101-e2bb-4255-8caf-4136c566a962', typ: 'access', ...claims },
        options,
      );
      await request(server).get('/api/users/me').set('Cookie', `access_token=${token}`).expect(401);
    });

    it('rejects JSON-encoded cookies instead of crashing', async () => {
      await request(server)
        .get('/api/users/me')
        .set('Cookie', 'access_token=j:{"$ne":null}')
        .expect(401);
      const refresh = await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=j:{"$ne":null}')
        .expect(401);
      expect(refresh.body.error.code).toBe('INVALID_REFRESH_TOKEN');
      const logout = await request(server)
        .post('/api/auth/logout')
        .set('Cookie', 'refresh_token=j:["x"]')
        .expect(200);
      expect(cookieNames(logout)).toEqual(['access_token', 'refresh_token']);
    });
  });

  describe('cross-site request protection', () => {
    it('refuses form-encoded bodies (login CSRF) with 415', async () => {
      const res = await request(server)
        .post('/api/auth/signin')
        .type('form')
        .send({ email: 'jane@example.com', password: validUser.password })
        .expect(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(cookieNames(res)).toEqual([]);
    });

    it('refuses text/plain bodies too', async () => {
      await request(server)
        .post('/api/auth/signin')
        .set('Content-Type', 'text/plain')
        .send('{"email":"jane@example.com"}')
        .expect(415);
    });

    it('refuses a request from another origin', async () => {
      const res = await request(server)
        .post('/api/auth/signin')
        .set('Origin', 'https://evil.example')
        .send(credentials)
        .expect(403);
      expect(res.body.error.code).toBe('CROSS_SITE_REQUEST_BLOCKED');
    });

    it('refuses a request the browser marks as cross-site', async () => {
      await request(server)
        .post('/api/auth/logout')
        .set('Sec-Fetch-Site', 'cross-site')
        .expect(403);
    });

    it('allows same-origin browser requests', async () => {
      await request(server)
        .post('/api/auth/logout')
        .set('Host', 'app.test')
        .set('Origin', 'http://app.test')
        .set('Sec-Fetch-Site', 'same-origin')
        .expect(200);
    });
  });

  describe('logging', () => {
    const logUser = { email: 'logged@example.com', password: 'Sup3r$ecret' };

    beforeAll(() =>
      request(server)
        .post('/api/auth/signup')
        .send({ ...logUser, name: 'Logged User' })
        .expect(201),
    );
    afterEach(() => jest.restoreAllMocks());

    it('records security events without personal data or secrets', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn');
      const log = jest.spyOn(Logger.prototype, 'log');

      await request(server)
        .post('/api/auth/signin')
        .send({ email: logUser.email, password: 'Wrong$pass1' })
        .expect(401);
      await request(server).post('/api/auth/signin').send(logUser).expect(200);

      const events = [...warn.mock.calls, ...log.mock.calls].map(([payload]) => payload);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event: 'auth.signin.failed', reason: 'bad_password' }),
          expect.objectContaining({ event: 'auth.signin.succeeded', userId: expect.any(String) }),
        ]),
      );
      const logged = JSON.stringify(events);
      expect(logged).not.toContain(logUser.email);
      expect(logged).not.toContain(logUser.password);
    });
  });

  describe('platform', () => {
    it('GET /api/health reports MongoDB as up', async () => {
      const res = await request(server).get('/api/health').expect(200);
      expect(res.body.data.info.mongodb.status).toBe('up');
    });

    it('serves the OpenAPI document when Swagger is enabled', async () => {
      const res = await request(server).get('/api/docs-json').expect(200);
      expect(res.body.paths).toHaveProperty('/api/auth/signup');
    });

    it('returns 404 NOT_FOUND in the error envelope for unknown routes', async () => {
      const res = await request(server).get('/api/nope').expect(404);
      expect(res.body).toEqual(errorEnvelope(404, 'NOT_FOUND'));
    });

    it('rejects an oversized body with 413, not a server error', async () => {
      const res = await request(server)
        .post('/api/auth/signin')
        .send({ email: 'a@example.com', password: 'x'.repeat(20_000) })
        .expect(413);
      expect(res.body).toEqual(errorEnvelope(413, 'PAYLOAD_TOO_LARGE'));
    });

    it('rejects malformed JSON with 400', async () => {
      const res = await request(server)
        .post('/api/auth/signin')
        .set('Content-Type', 'application/json')
        .send('{bad')
        .expect(400);
      expect(res.body.success).toBe(false);
    });

    it('sets security headers', async () => {
      const res = await request(server).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});

describe('Refresh from several tabs at once (e2e)', () => {
  let testApp: TestApp;
  let server: App;
  const tabUser = { email: 'tabs@example.com', name: 'Tab User', password: 'Sup3r$ecret' };

  beforeAll(async () => {
    testApp = await createTestApp({ REFRESH_REUSE_GRACE_SECONDS: '30' });
    server = testApp.app.getHttpServer();
    await request(server).post('/api/auth/signup').send(tabUser).expect(201);
  });

  afterAll(() => testApp.close());

  async function signInCookie(): Promise<string> {
    const res = await request(server)
      .post('/api/auth/signin')
      .send({ email: tabUser.email, password: tabUser.password })
      .expect(200);
    return cookiePair(res, 'refresh_token');
  }

  it('lets two tabs refresh with the same token without killing the session', async () => {
    const shared = await signInCookie();

    const [tabA, tabB] = await Promise.all([
      request(server).post('/api/auth/refresh').set('Cookie', shared),
      request(server).post('/api/auth/refresh').set('Cookie', shared),
    ]);
    expect([tabA.status, tabB.status]).toEqual([200, 200]);

    // Both tabs keep working afterwards.
    for (const res of [tabA, tabB]) {
      await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', cookiePair(res, 'refresh_token'))
        .expect(200);
    }
  });

  it('still refuses a rotated token after logout, even inside the grace window', async () => {
    const original = await signInCookie();
    const rotated = await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', original)
      .expect(200);

    await request(server)
      .post('/api/auth/logout')
      .set('Cookie', cookiePair(rotated, 'refresh_token'))
      .expect(200);
    await request(server).post('/api/auth/refresh').set('Cookie', original).expect(401);
  });
});

describe('Production-like settings (e2e)', () => {
  let testApp: TestApp;
  let server: App;

  beforeAll(async () => {
    testApp = await createTestApp({
      AUTH_RATE_LIMIT_PER_MINUTE: '3',
      AUTH_ACCOUNT_RATE_LIMIT_PER_MINUTE: '2',
      TRUST_PROXY: 'true',
      SWAGGER_ENABLED: 'false',
      CORS_ORIGINS: 'https://app.example.com',
    });
    server = testApp.app.getHttpServer();
  });

  afterAll(() => testApp.close());

  it('does not expose Swagger when disabled', async () => {
    await request(server).get('/api/docs').expect(404);
    await request(server).get('/api/docs-json').expect(404);
  });

  it('allows CORS only for configured origins', async () => {
    const allowed = await request(server)
      .options('/api/auth/signin')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(server)
      .options('/api/auth/signin')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('accepts state-changing requests from an allowed CORS origin', async () => {
    await request(server)
      .post('/api/auth/logout')
      .set('Origin', 'https://app.example.com')
      .set('Sec-Fetch-Site', 'cross-site')
      .set('X-Forwarded-For', '192.0.2.50')
      .expect(200);
  });

  it('does not count session refresh or logout against the sign-in limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      await request(server).post('/api/auth/refresh').expect(401);
      await request(server).post('/api/auth/logout').expect(200);
    }
  });

  it('returns 429 after too many sign-in attempts from one client IP (behind the proxy)', async () => {
    const attempt = (ip: string, n: number) =>
      request(server)
        .post('/api/auth/signin')
        .set('X-Forwarded-For', ip)
        .send({ email: `ip-test-${n}@example.com`, password: 'nope' });

    for (let i = 0; i < 3; i += 1) await attempt('203.0.113.7', i).expect(401);
    const limited = await attempt('203.0.113.7', 3).expect(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');
    // Another client behind the same proxy has its own budget.
    await attempt('198.51.100.9', 4).expect(401);
  });

  it('limits sign-in attempts per account even when they come from different IPs', async () => {
    const attempt = (ip: string, email = 'victim@example.com') =>
      request(server)
        .post('/api/auth/signin')
        .set('X-Forwarded-For', ip)
        .send({ email, password: 'nope' });

    await attempt('192.0.2.1').expect(401);
    await attempt('192.0.2.2').expect(401);
    await attempt('192.0.2.3').expect(429);
    // Other accounts are unaffected.
    await attempt('192.0.2.4', 'someone-else@example.com').expect(401);
  });

  it('falls back to the client IP when the sign-in body has no usable email', async () => {
    const res = await request(server)
      .post('/api/auth/signin')
      .set('X-Forwarded-For', '192.0.2.99')
      .send({ email: 42, password: 'nope' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('API docs behind authentication (e2e)', () => {
  let testApp: TestApp;
  let server: App;
  const docsAuth = (user: string, pass: string) =>
    `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

  beforeAll(async () => {
    testApp = await createTestApp({
      SWAGGER_ENABLED: 'true',
      SWAGGER_USERNAME: 'docs',
      SWAGGER_PASSWORD: 'docs-password-for-tests',
    });
    server = testApp.app.getHttpServer();
  });

  afterAll(() => testApp.close());

  it.each(['/api/docs', '/api/docs-json'])('challenges anonymous readers of %s', async (path) => {
    const res = await request(server).get(path).expect(401);
    expect(res.headers['www-authenticate']).toContain('Basic realm="API docs"');
  });

  it('rejects wrong credentials', async () => {
    await request(server)
      .get('/api/docs-json')
      .set('Authorization', docsAuth('docs', 'wrong-password'))
      .expect(401);
  });

  it('serves the OpenAPI document with the right credentials', async () => {
    const res = await request(server)
      .get('/api/docs-json')
      .set('Authorization', docsAuth('docs', 'docs-password-for-tests'))
      .expect(200);
    expect(res.body.paths).toHaveProperty('/api/auth/signin');
  });

  it('leaves the API itself unaffected', async () => {
    await request(server).get('/api/health').expect(200);
  });
});
