import type { NextFunction, Request, Response } from 'express';
import { swaggerBasicAuth } from './swagger-basic-auth';

function call(authorization?: string) {
  const req = { headers: authorization ? { authorization } : {} } as Request;
  const res = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response & { setHeader: jest.Mock; status: jest.Mock; json: jest.Mock };
  const next = jest.fn() as NextFunction & jest.Mock;
  swaggerBasicAuth('docs-admin', 'a-very-long-docs-password')(req, res, next);
  return { res, next };
}

const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

describe('swaggerBasicAuth', () => {
  it('lets the right credentials through', () => {
    const { next, res } = call(basic('docs-admin', 'a-very-long-docs-password'));
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('accepts a password that contains a colon', () => {
    const req = { headers: { authorization: basic('u', 'pa:ss:word') } } as Request;
    const next = jest.fn();
    swaggerBasicAuth('u', 'pa:ss:word')(req, {} as Response, next);
    expect(next).toHaveBeenCalled();
  });

  it.each([
    ['no header', undefined],
    ['a wrong password', basic('docs-admin', 'nope')],
    ['a wrong user', basic('someone', 'a-very-long-docs-password')],
    ['another scheme', 'Bearer abc'],
    ['garbage', 'Basic !!!'],
  ])('challenges a request with %s', (_case, header) => {
    const { res, next } = call(header);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="API docs", charset="UTF-8"',
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'AUTHENTICATION_REQUIRED' }),
      }),
    );
  });
});
