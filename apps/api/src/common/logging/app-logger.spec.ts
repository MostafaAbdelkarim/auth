import { Logger } from '@nestjs/common';
import { AppLogger } from './app-logger';

describe('AppLogger', () => {
  const logger = new AppLogger('AuthService');
  let calls: Record<'debug' | 'log' | 'warn' | 'error', jest.SpyInstance>;

  beforeEach(() => {
    calls = {
      debug: jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined),
      log: jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
      warn: jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
      error: jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
    };
  });
  afterEach(() => jest.restoreAllMocks());

  it('writes a message plus the extra fields at each level', () => {
    logger.debug('Hashing password', { step: 'hash' });
    logger.info('User signed in', { userId: 'u-1', event: 'auth.signin.succeeded' });
    logger.warn('Sign-in failed', { reason: 'bad_password' });

    expect(calls.debug).toHaveBeenCalledWith({ step: 'hash' }, 'Hashing password');
    expect(calls.log).toHaveBeenCalledWith(
      { userId: 'u-1', event: 'auth.signin.succeeded' },
      'User signed in',
    );
    expect(calls.warn).toHaveBeenCalledWith({ reason: 'bad_password' }, 'Sign-in failed');
  });

  it('writes dates as ISO strings', () => {
    logger.info('Token issued', { expiresAt: new Date('2026-01-01T00:00:00.000Z') });
    expect(calls.log).toHaveBeenCalledWith(
      { expiresAt: '2026-01-01T00:00:00.000Z' },
      'Token issued',
    );
  });

  it('works without extra fields', () => {
    logger.info('Started');
    expect(calls.log).toHaveBeenCalledWith({}, 'Started');
  });

  it('serialises errors under "err" with type, message and stack', () => {
    const failure = Object.assign(new TypeError('boom'), { code: 'E_BOOM' });
    logger.error('Unexpected failure', failure, { path: '/api/x' });

    expect(calls.error).toHaveBeenCalledWith(
      {
        path: '/api/x',
        err: { type: 'TypeError', message: 'boom', code: 'E_BOOM', stack: expect.any(String) },
      },
      'Unexpected failure',
    );
  });

  it('records non-Error throwables too', () => {
    logger.error('Odd failure', 'a string was thrown');
    expect(calls.error).toHaveBeenCalledWith(
      { err: { type: 'string', message: 'a string was thrown' } },
      'Odd failure',
    );
    logger.error('No error given');
    expect(calls.error).toHaveBeenLastCalledWith({}, 'No error given');
  });

  it('redacts secrets anywhere in the fields, however they are named', () => {
    logger.info('Debugging a request', {
      password: 'Sup3r$ecret',
      body: { newPassword: 'x', profile: { accessToken: 'y', name: 'Jane' } },
      headers: { Authorization: 'Bearer z', cookie: 'a=b' },
      items: [{ refresh_token: 'r' }, 'plain'],
      apiSecret: 's',
      userId: 'u-1',
    });

    expect(calls.log).toHaveBeenCalledWith(
      {
        password: '[redacted]',
        body: { newPassword: '[redacted]', profile: { accessToken: '[redacted]', name: 'Jane' } },
        headers: { Authorization: '[redacted]', cookie: '[redacted]' },
        items: [{ refresh_token: '[redacted]' }, 'plain'],
        apiSecret: '[redacted]',
        userId: 'u-1',
      },
      'Debugging a request',
    );
  });

  it('cannot overwrite the standard fields of the log line', () => {
    logger.info('Hello', { message: 'spoof', level: 'fatal', correlationId: 'fake', ok: 1 });
    expect(calls.log).toHaveBeenCalledWith(
      { ok: 1, fields: { message: 'spoof', level: 'fatal', correlationId: 'fake' } },
      'Hello',
    );
  });

  it('stops at a safe depth and survives circular structures', () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    const deep = { a: { b: { c: { d: { e: { f: 'too deep' } } } } } };
    logger.info('Shapes', { circular, deep });

    const [payload] = calls.log.mock.calls[0] as [Record<string, unknown>];
    expect(payload.circular).toEqual({ name: 'loop', self: '[circular]' });
    expect(JSON.stringify(payload.deep)).toContain('[truncated]');
  });

  it('rejects an empty message so every line says something', () => {
    expect(() => logger.info('  ')).toThrow('Log message must not be empty');
  });
});
