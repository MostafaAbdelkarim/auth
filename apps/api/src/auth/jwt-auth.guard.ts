import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppLogger } from '../common/logging/app-logger';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AppException } from '../common/http/app.exception';
import { ErrorCode } from '../common/http/error-codes';
import { readAccessToken } from './auth-cookies';
import { TokenDenylist } from './token-denylist';
import {
  ACCESS_TOKEN_TYPE,
  type AccessTokenPayload,
  type AuthenticatedRequest,
} from './auth.types';

/**
 * Registered globally: every route needs a valid access token cookie unless marked @Public().
 * Forgetting a decorator therefore fails closed, not open.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new AppLogger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly denylist: TokenDenylist,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readAccessToken(request);
    if (!token) {
      throw AppException.unauthorized(ErrorCode.AUTHENTICATION_REQUIRED, 'Authentication required');
    }

    // Issuer, audience, algorithm and expiry are enforced by the JwtModule verify options.
    const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token).catch(() => null);
    if (
      !payload ||
      payload.typ !== ACCESS_TOKEN_TYPE ||
      !isUUID(payload.sub, 4) ||
      !isUUID(payload.jti, 4)
    ) {
      this.logger.warn('Rejected an invalid access token', { event: 'auth.access_token.rejected' });
      throw AppException.unauthorized(
        ErrorCode.INVALID_ACCESS_TOKEN,
        'Invalid or expired access token',
      );
    }

    if (await this.denylist.has(payload.jti)) {
      this.logger.info('Rejected an access token that was revoked at logout', {
        event: 'auth.access_token.revoked_used',
        userId: payload.sub,
      });
      throw AppException.unauthorized(ErrorCode.SESSION_REVOKED, 'Session was ended');
    }

    request.user = { id: payload.sub };
    return true;
  }
}
