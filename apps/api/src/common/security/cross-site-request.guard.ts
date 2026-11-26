import type { NextFunction, Request, Response } from 'express';
import { AppException } from '../http/app.exception';
import { ErrorCode } from '../http/error-codes';
import { HttpStatus } from '@nestjs/common';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function hasBody(req: Request): boolean {
  const length = req.headers['content-length'];
  return (length !== undefined && length !== '0') || req.headers['transfer-encoding'] !== undefined;
}

/**
 * Defence in depth against CSRF on top of SameSite=Strict cookies, for every state-changing request:
 *
 * 1. Bodies must be JSON. HTML forms can only send form-encoded, multipart or text/plain bodies,
 *    so a cross-site <form> can never reach a handler (blocks login CSRF on /auth/signin).
 * 2. Requests the browser marks as cross-site (Sec-Fetch-Site), or whose Origin is neither this
 *    host nor an allowed CORS origin, are rejected.
 *
 * Runs as Express middleware before body parsing, so rejected bodies are never parsed.
 */
export function crossSiteRequestGuard(allowedOrigins: readonly string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) return next();

    if (hasBody(req) && !req.is('application/json')) {
      return next(
        new AppException(
          ErrorCode.UNSUPPORTED_MEDIA_TYPE,
          'Request body must be application/json',
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        ),
      );
    }

    const origin = req.headers.origin;
    const sameOrigin = origin !== undefined && origin === `${req.protocol}://${req.get('host')}`;
    const allowedOrigin = origin !== undefined && allowedOrigins.includes(origin);
    const crossSite = req.headers['sec-fetch-site'] === 'cross-site';

    if ((crossSite && !allowedOrigin) || (origin !== undefined && !sameOrigin && !allowedOrigin)) {
      return next(
        AppException.forbidden(ErrorCode.CROSS_SITE_REQUEST_BLOCKED, 'Cross-site request blocked'),
      );
    }
    next();
  };
}
