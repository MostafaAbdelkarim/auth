import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ErrorResponse } from '../http/api-response';
import { ErrorCode } from '../http/error-codes';

/** Constant-time comparison of two strings of any length (hashes equalise the length). */
function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function readBasicCredentials(header: string | undefined): [string, string] | null {
  if (!header?.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  return separator < 0 ? null : [decoded.slice(0, separator), decoded.slice(separator + 1)];
}

/**
 * HTTP Basic auth in front of Swagger UI and the OpenAPI JSON. The docs reveal the whole API
 * surface, so in a deployment only people with the docs credentials may read them. Basic auth
 * is only safe over TLS, which a real deployment terminates in front of nginx.
 */
export function swaggerBasicAuth(username: string, password: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const credentials = readBasicCredentials(req.headers.authorization);
    // Both comparisons always run, so timing doesn't reveal which part was wrong.
    const userOk = safeEqual(credentials?.[0] ?? '', username);
    const passwordOk = safeEqual(credentials?.[1] ?? '', password);
    if (credentials && userOk && passwordOk) return next();

    const body: ErrorResponse = {
      success: false,
      error: {
        statusCode: 401,
        code: ErrorCode.AUTHENTICATION_REQUIRED,
        message: 'API documentation requires authentication',
      },
      meta: { correlationId: '', timestamp: new Date().toISOString(), path: req.originalUrl },
    };
    res.setHeader('WWW-Authenticate', 'Basic realm="API docs", charset="UTF-8"');
    res.status(401).json(body);
  };
}
