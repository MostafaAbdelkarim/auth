import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env';
import type { IssuedTokens } from './auth.types';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** The refresh token is only ever sent to the auth routes, never to the rest of the API. */
const ACCESS_TOKEN_PATH = '/api';
const REFRESH_TOKEN_PATH = '/api/auth';

/** 32 random bytes, base64url: exactly what RefreshTokenService issues. */
const REFRESH_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
/** header.payload.signature, base64url segments. */
const JWT_FORMAT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Reads a cookie only if it is a string of the expected shape. cookie-parser turns
 * `j:`-prefixed values into objects, so the raw value must never be trusted as a string.
 */
function readCookie(req: Request, name: string, format: RegExp): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && format.test(value) ? value : undefined;
}

export const readRefreshToken = (req: Request) =>
  readCookie(req, REFRESH_TOKEN_COOKIE, REFRESH_TOKEN_FORMAT);
export const readAccessToken = (req: Request) => readCookie(req, ACCESS_TOKEN_COOKIE, JWT_FORMAT);

function baseOptions(config: Env): CookieOptions {
  return { httpOnly: true, secure: config.COOKIE_SECURE, sameSite: 'strict' };
}

export function setAuthCookies(res: Response, tokens: IssuedTokens, config: Env): void {
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...baseOptions(config),
    path: ACCESS_TOKEN_PATH,
    maxAge: config.JWT_ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...baseOptions(config),
    path: REFRESH_TOKEN_PATH,
    expires: tokens.refreshTokenExpiresAt,
  });
}

export function clearAuthCookies(res: Response, config: Env): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...baseOptions(config), path: ACCESS_TOKEN_PATH });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...baseOptions(config), path: REFRESH_TOKEN_PATH });
}
