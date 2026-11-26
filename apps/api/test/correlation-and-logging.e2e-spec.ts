import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp, TestApp } from './test-app';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type LogLine = Record<string, unknown> & { correlationId?: string; message?: string };

describe('Correlation id and log format (e2e)', () => {
  let testApp: TestApp;
  let server: App;
  let lines: LogLine[];
  const user = { email: 'traced@example.com', name: 'Traced User', password: 'Sup3r$ecret' };

  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        lines.push(JSON.parse(line) as LogLine);
      }
      callback();
    },
  });

  /** Log lines are written when the response finishes; give the stream a tick. */
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const linesFor = (id: string) => lines.filter((line) => line.correlationId === id);
  const idOf = (res: request.Response) => res.headers['x-correlation-id'];

  beforeAll(async () => {
    lines = [];
    testApp = await createTestApp({ LOG_LEVEL: 'debug' }, { logDestination: sink });
    server = testApp.app.getHttpServer();
    await request(server).post('/api/auth/signup').send(user).expect(201);
  });

  beforeEach(() => {
    lines = [];
  });

  afterAll(() => testApp.close());

  it('generates an id for the request, puts it on every log line and returns it', async () => {
    const res = await request(server)
      .post('/api/auth/signin')
      .send({ email: user.email, password: user.password })
      .expect(200);
    await flush();

    const correlationId = idOf(res);
    expect(correlationId).toMatch(UUID_V4);
    expect(res.body.meta.correlationId).toBe(correlationId);

    const messages = linesFor(correlationId).map((line) => line.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        '→ AuthController.signIn',
        'Sign-in: looking up user',
        'User signed in',
        '← AuthController.signIn (ok)',
        expect.stringMatching(/^POST \/api\/auth\/signin → 200 in \d+ms$/),
      ]),
    );
    // Nothing logged while handling this request is missing the id.
    expect(lines.filter((line) => line.correlationId !== correlationId)).toEqual([]);
  });

  it('gives every request its own id', async () => {
    const first = await request(server).get('/api/users/me').expect(401);
    const second = await request(server).get('/api/users/me').expect(401);
    expect(idOf(first)).toMatch(UUID_V4);
    expect(idOf(second)).toMatch(UUID_V4);
    expect(idOf(first)).not.toBe(idOf(second));
  });

  it.each([
    ['a valid UUIDv4', randomUUID()],
    ['a spoofing attempt', 'admin-audit-0001","level":"fatal'],
  ])('ignores a correlation id sent by the caller (%s)', async (_case, sent) => {
    const res = await request(server)
      .get('/api/users/me')
      .set('X-Correlation-Id', sent)
      .expect(401);
    await flush();

    expect(idOf(res)).toMatch(UUID_V4);
    expect(idOf(res)).not.toBe(sent);
    expect(res.body.meta.correlationId).toBe(idOf(res));
    expect(JSON.stringify(lines)).not.toContain(sent);
  });

  it('writes every line in the same shape', async () => {
    const res = await request(server)
      .post('/api/auth/signin')
      .send({ email: user.email, password: 'Wrong$pass1' })
      .expect(401);
    await flush();

    const correlationId = idOf(res);
    const traced = linesFor(correlationId);
    expect(traced.length).toBeGreaterThan(3);
    for (const line of traced) {
      expect(line).toMatchObject({
        level: expect.stringMatching(/^(debug|info|warn|error)$/),
        time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        service: 'auth-api',
        env: 'test',
        correlationId,
        message: expect.any(String),
      });
    }
    const failure = traced.find((line) => line.event === 'auth.signin.failed');
    expect(failure).toMatchObject({
      level: 'warn',
      context: 'AuthService',
      reason: 'bad_password',
      email: expect.stringMatching(/^[0-9a-f]{12}$/),
    });
    const logged = JSON.stringify(traced);
    expect(logged).not.toContain(user.email);
    expect(logged).not.toContain('Wrong$pass1');
  });

  it.each([
    [
      'rejected by the cross-site guard (415)',
      415,
      () => request(server).post('/api/auth/signin').type('form').send({ a: 'b' }),
    ],
    [
      'rejected by the body parser (413)',
      413,
      () =>
        request(server)
          .post('/api/auth/signin')
          .send({ password: 'x'.repeat(20_000) }),
    ],
  ])('traces requests %s too', async (_case, status, send) => {
    const res = await send().expect(status);
    await flush();

    const correlationId = idOf(res);
    expect(correlationId).toMatch(UUID_V4);
    expect(res.body.meta.correlationId).toBe(correlationId);
    expect(linesFor(correlationId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'warn', res: { statusCode: status } }),
      ]),
    );
  });
});
