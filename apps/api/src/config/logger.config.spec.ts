import type { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import type { Options } from 'pino-http';
import { parseEnv } from './env';
import { buildLoggerParams } from './logger.config';

const base = { MONGO_URI: 'mongodb://x', JWT_ACCESS_SECRET: 'x'.repeat(32) };
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function httpOptions(env: Record<string, string>): Options {
  return buildLoggerParams(parseEnv({ ...base, ...env })).pinoHttp as Options;
}

function fakeRes() {
  const headers: Record<string, string> = {};
  return {
    res: { setHeader: (k: string, v: string) => (headers[k] = v) } as unknown as ServerResponse,
    headers,
  };
}

describe('buildLoggerParams', () => {
  it('is silent in tests, pretty in development and JSON in production', () => {
    expect(httpOptions({ NODE_ENV: 'test' }).level).toBe('silent');
    expect(httpOptions({ NODE_ENV: 'development' }).transport).toMatchObject({
      target: 'pino-pretty',
    });
    const prod = httpOptions({ NODE_ENV: 'production', COOKIE_SECURE: 'true', LOG_LEVEL: 'warn' });
    expect(prod.transport).toBeUndefined();
    expect(prod.level).toBe('warn');
  });

  it('writes to a given destination at the configured level, without pretty printing', () => {
    const destination = new Writable({ write: (_c, _e, cb) => cb() });
    const params = buildLoggerParams(
      parseEnv({ ...base, NODE_ENV: 'development', LOG_LEVEL: 'debug' }),
      destination,
    ).pinoHttp as [Options, Writable];
    expect(params[1]).toBe(destination);
    expect(params[0]).toMatchObject({ level: 'debug', transport: undefined });
  });

  it('uses one uniform line shape', () => {
    const options = httpOptions({ NODE_ENV: 'production', COOKIE_SECURE: 'true' });
    expect(options).toMatchObject({
      messageKey: 'message',
      base: { service: 'auth-api', env: 'production' },
      customAttributeKeys: { reqId: 'correlationId' },
    });
    expect(options.formatters!.level!('info', 30)).toEqual({ level: 'info' });
    expect((options.timestamp as () => string)()).toMatch(/"time":"\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps only method/url and status in the access log, and redacts auth headers', () => {
    const { serializers, redact } = httpOptions({});
    expect(serializers!.req({ method: 'GET', url: '/api/x', headers: { cookie: 'a' } })).toEqual({
      method: 'GET',
      url: '/api/x',
    });
    expect(serializers!.res({ statusCode: 200, headers: {} })).toEqual({ statusCode: 200 });
    expect(redact).toMatchObject({ paths: expect.arrayContaining(['req.headers.cookie']) });
  });

  it('writes readable access-log messages', () => {
    const { customSuccessMessage, customErrorMessage } = httpOptions({});
    const req = { method: 'POST', url: '/api/auth/signin' } as IncomingMessage;
    expect(customSuccessMessage!(req, { statusCode: 200 } as ServerResponse, 12.4)).toBe(
      'POST /api/auth/signin → 200 in 12ms',
    );
    expect(customErrorMessage!(req, { statusCode: 500 } as ServerResponse, new Error('boom'))).toBe(
      'POST /api/auth/signin → 500 (boom)',
    );
  });

  it('generates a new UUIDv4 correlation id per request and sets it on the response', () => {
    const { res, headers } = fakeRes();
    const genReqId = httpOptions({}).genReqId!;
    const first = genReqId({ headers: {} } as unknown as IncomingMessage, res);
    expect(first).toMatch(UUID_V4);
    expect(headers['x-correlation-id']).toBe(first);
    expect(genReqId({ headers: {} } as unknown as IncomingMessage, res)).not.toBe(first);
  });

  it('ignores any correlation id sent by the caller', () => {
    const { res } = fakeRes();
    const clientId = '3b241101-e2bb-4255-8caf-4136c566a962';
    const id = httpOptions({}).genReqId!(
      { headers: { 'x-correlation-id': clientId } } as unknown as IncomingMessage,
      res,
    );
    expect(id).toMatch(UUID_V4);
    expect(id).not.toBe(clientId);
  });

  it('skips access logs for health checks', () => {
    const autoLogging = httpOptions({}).autoLogging as {
      ignore: (req: IncomingMessage) => boolean;
    };
    expect(autoLogging.ignore({ url: '/api/health' } as IncomingMessage)).toBe(true);
    expect(autoLogging.ignore({ url: '/api/users/me' } as IncomingMessage)).toBe(false);
    expect(autoLogging.ignore({} as IncomingMessage)).toBe(false);
  });

  it('logs 5xx and errors as error, 4xx as warn, the rest as info', () => {
    const level = httpOptions({}).customLogLevel!;
    const req = {} as IncomingMessage;
    expect(level(req, { statusCode: 200 } as ServerResponse, undefined)).toBe('info');
    expect(level(req, { statusCode: 404 } as ServerResponse, undefined)).toBe('warn');
    expect(level(req, { statusCode: 503 } as ServerResponse, undefined)).toBe('error');
    expect(level(req, { statusCode: 200 } as ServerResponse, new Error('x'))).toBe('error');
  });
});
