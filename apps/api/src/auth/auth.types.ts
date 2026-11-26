import type { Request } from 'express';

export interface AuthUser {
  id: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

/** Access tokens carry a type claim so a token minted for another purpose is never a session. */
export const ACCESS_TOKEN_TYPE = 'access';
export const JWT_ISSUER = 'easygenerator-auth-api';
export const JWT_AUDIENCE = 'easygenerator-auth-web';

export interface AccessTokenPayload {
  sub: string;
  typ: typeof ACCESS_TOKEN_TYPE;
  /** Unique token id, so a single access token can be revoked (TokenDenylist). */
  jti: string;
}

/** What the JWT library adds on top of our payload when verifying. */
export interface VerifiedAccessToken extends AccessTokenPayload {
  exp: number;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}
