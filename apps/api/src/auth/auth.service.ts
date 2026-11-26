import { Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../common/logging/app-logger';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AppException } from '../common/http/app.exception';
import { ErrorCode } from '../common/http/error-codes';
import { fingerprint } from '../common/logging/fingerprint';
import { UsersService } from '../users/users.service';
import type { PublicUser } from '../users/user.types';
import { toPublicUser } from '../users/user.types';
import {
  ACCESS_TOKEN_TYPE,
  type AccessTokenPayload,
  type IssuedTokens,
  type VerifiedAccessToken,
} from './auth.types';
import type { SignInDto } from './dto/sign-in.dto';
import type { SignUpDto } from './dto/sign-up.dto';
import { PasswordHasher } from './password-hasher';
import { RefreshTokenService } from './refresh-token.service';
import { TokenDenylist } from './token-denylist';

export const INVALID_CREDENTIALS = 'Invalid email or password';

export interface AuthResult {
  user: PublicUser;
  tokens: IssuedTokens;
}

/**
 * Log events (pino, with the request id attached automatically):
 *   info  auth.signup.succeeded / auth.signin.succeeded / auth.refresh.succeeded / auth.logout
 *   warn  auth.signin.failed (reason) / auth.refresh.reuse_detected / auth.refresh.inactive_user
 *   debug step-by-step progress, enable with LOG_LEVEL=debug when investigating
 * Emails are logged only as fingerprints; passwords and tokens are never logged.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new AppLogger(AuthService.name);
  /** Verified against when the email is unknown, so both failure paths cost the same time. */
  private dummyHash: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordHasher: PasswordHasher,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwtService: JwtService,
    private readonly denylist: TokenDenylist,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.passwordHasher.hash('timing-equaliser-not-a-real-password-1!');
  }

  async signUp(dto: SignUpDto): Promise<AuthResult> {
    const email = fingerprint(dto.email);
    this.logger.debug('Sign-up: hashing password', { event: 'auth.signup.started', email });
    const passwordHash = await this.passwordHasher.hash(dto.password);

    this.logger.debug('Sign-up: creating user', { event: 'auth.signup.creating_user', email });
    const user = await this.usersService.create({ email: dto.email, name: dto.name, passwordHash });

    const tokens = await this.issueTokens(user._id);
    this.logger.info('User signed up', { event: 'auth.signup.succeeded', userId: user._id });
    return { user: toPublicUser(user), tokens };
  }

  async signIn(dto: SignInDto): Promise<AuthResult> {
    const email = fingerprint(dto.email);
    this.logger.debug('Sign-in: looking up user', { event: 'auth.signin.started', email });
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    const passwordMatches = await this.passwordHasher.verify(
      user?.passwordHash ?? this.dummyHash,
      dto.password,
    );
    if (!user || !passwordMatches) {
      this.logger.warn('Sign-in failed', {
        event: 'auth.signin.failed',
        reason: user ? 'bad_password' : 'unknown_email',
        email,
      });
      throw AppException.unauthorized(ErrorCode.INVALID_CREDENTIALS, INVALID_CREDENTIALS);
    }

    const tokens = await this.issueTokens(user._id);
    this.logger.info('User signed in', { event: 'auth.signin.succeeded', userId: user._id });
    return { user: toPublicUser(user), tokens };
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    const { userId, familyId, next } = await this.refreshTokens.rotate(refreshToken);

    // A session must not outlive its account (e.g. the user was soft-deleted).
    if (!(await this.usersService.findById(userId))) {
      this.logger.warn('Refresh for a user that no longer exists; revoking the session', {
        event: 'auth.refresh.inactive_user',
        userId,
        familyId,
      });
      await this.refreshTokens.revoke(next.token);
      throw AppException.unauthorized(ErrorCode.SESSION_REVOKED, 'Session is no longer valid');
    }

    const accessToken = await this.signAccessToken(userId);
    this.logger.info('Session refreshed', { event: 'auth.refresh.succeeded', userId, familyId });
    return { accessToken, refreshToken: next.token, refreshTokenExpiresAt: next.expiresAt };
  }

  /**
   * Ends the session on the server:
   * - the refresh-token family is revoked in MongoDB (no further refresh, survives restarts),
   * - the current access token's id is denylisted until it expires, so even a copy of it
   *   stops working immediately instead of living on for up to 15 minutes.
   * Missing, expired or forged tokens are simply skipped: logout always succeeds.
   */
  async logout(refreshToken: string | undefined, accessToken: string | undefined): Promise<void> {
    if (refreshToken) await this.refreshTokens.revoke(refreshToken);

    const access = accessToken
      ? await this.jwtService.verifyAsync<VerifiedAccessToken>(accessToken).catch(() => null)
      : null;
    if (access?.jti) await this.denylist.add(access.jti, new Date(access.exp * 1000));

    this.logger.info('User logged out', {
      event: 'auth.logout',
      userId: access?.sub,
      refreshRevoked: Boolean(refreshToken),
      accessRevoked: Boolean(access?.jti),
    });
  }

  private async issueTokens(userId: string): Promise<IssuedTokens> {
    const [accessToken, refresh] = await Promise.all([
      this.signAccessToken(userId),
      this.refreshTokens.issue(userId),
    ]);
    return { accessToken, refreshToken: refresh.token, refreshTokenExpiresAt: refresh.expiresAt };
  }

  private signAccessToken(userId: string): Promise<string> {
    const payload: AccessTokenPayload = { sub: userId, typ: ACCESS_TOKEN_TYPE, jti: randomUUID() };
    return this.jwtService.signAsync(payload);
  }
}
