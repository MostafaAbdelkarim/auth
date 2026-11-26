import { Injectable } from '@nestjs/common';
import { AppLogger } from '../common/logging/app-logger';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SoftDeleteModel } from '../common/database/abstract.schema';
import { AppException } from '../common/http/app.exception';
import { ErrorCode } from '../common/http/error-codes';
import { InjectAppConfig } from '../config/app-config.module';
import type { Env } from '../config/env';
import { RefreshToken, RefreshTokenDocument } from './schemas/refresh-token.schema';

const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const invalidRefreshToken = () =>
  AppException.unauthorized(ErrorCode.INVALID_REFRESH_TOKEN, 'Invalid refresh token');

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export interface RotationResult {
  userId: string;
  familyId: string;
  next: IssuedRefreshToken;
}

@Injectable()
export class RefreshTokenService {
  private readonly logger = new AppLogger(RefreshTokenService.name);

  constructor(
    @InjectModel(RefreshToken.name) private readonly model: SoftDeleteModel<RefreshToken>,
    @InjectAppConfig() private readonly config: Env,
  ) {}

  /** Starts a new token family (sign-up / sign-in) or continues one (rotation). */
  async issue(userId: string, familyId: string = randomUUID()): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    await this.model.create({ userId, tokenHash: hashToken(token), familyId, expiresAt });
    this.logger.debug('Refresh token issued', {
      event: 'auth.refresh_token.issued',
      userId,
      familyId,
    });
    return { token, expiresAt };
  }

  /**
   * Consumes a refresh token and issues its successor in the same family.
   *
   * The consume step is one atomic update, so only one caller can rotate a given token.
   * A token that was rotated moments ago is still accepted for REFRESH_REUSE_GRACE_SECONDS,
   * because several tabs of the same browser share one cookie and may refresh at once.
   * Outside that window, presenting a rotated token is treated as theft: the whole family
   * is revoked and the user must sign in again.
   */
  async rotate(token: string): Promise<RotationResult> {
    const tokenHash = hashToken(token);
    const now = new Date();

    const consumed = await this.model
      .findOneAndUpdate(
        { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
        { $set: { revokedAt: now, rotatedAt: now } },
      )
      .exec();
    if (consumed) return this.issueSuccessor(consumed);

    const existing = await this.model.findOne({ tokenHash }).exec();
    if (!existing || existing.expiresAt <= now) {
      this.logger.debug('Unknown or expired refresh token', {
        event: 'auth.refresh.unknown_or_expired',
      });
      throw invalidRefreshToken();
    }
    if (this.isRecentRotation(existing, now)) {
      this.logger.info('Rotated refresh token reused within the grace window (parallel tabs)', {
        event: 'auth.refresh.grace_reuse',
        userId: existing.userId,
        familyId: existing.familyId,
      });
      return this.issueSuccessor(existing);
    }
    if (existing.familyRevokedAt === null) {
      // Rotated long ago and the session is still live: someone kept an old token.
      this.logger.warn('Refresh token reuse detected; revoking the session', {
        event: 'auth.refresh.reuse_detected',
        userId: existing.userId,
        familyId: existing.familyId,
      });
      await this.revokeFamily(existing.familyId);
    }
    throw invalidRefreshToken();
  }

  /** Logout: ends the session the presented token belongs to. Unknown tokens are ignored. */
  async revoke(token: string): Promise<void> {
    const existing = await this.model.findOne({ tokenHash: hashToken(token) }).exec();
    if (!existing) return;
    await this.revokeFamily(existing.familyId);
    this.logger.debug('Session revoked', {
      event: 'auth.refresh.family_revoked',
      userId: existing.userId,
      familyId: existing.familyId,
    });
  }

  private isRecentRotation(token: RefreshTokenDocument, now: Date): boolean {
    return (
      token.rotatedAt !== null &&
      token.familyRevokedAt === null &&
      now.getTime() - token.rotatedAt.getTime() < this.config.REFRESH_REUSE_GRACE_SECONDS * 1000
    );
  }

  private async issueSuccessor(token: RefreshTokenDocument): Promise<RotationResult> {
    const { userId, familyId } = token;
    const next = await this.issue(userId, familyId);
    // Logout may have revoked the family between our consume and our insert; if so, the
    // successor must not survive it.
    if (await this.model.exists({ familyId, familyRevokedAt: { $ne: null } })) {
      await this.revokeFamily(familyId);
      throw AppException.unauthorized(ErrorCode.SESSION_REVOKED, 'Session was ended');
    }
    return { userId, familyId, next };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    const now = new Date();
    await this.model.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: now } });
    await this.model.updateMany(
      { familyId, familyRevokedAt: null },
      { $set: { familyRevokedAt: now } },
    );
  }
}
