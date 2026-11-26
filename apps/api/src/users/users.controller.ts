import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ErrorResponse } from '../common/http/api-response';
import { ApiSuccessResponse } from '../common/http/api-success-response.decorator';
import { AppException } from '../common/http/app.exception';
import { ErrorCode } from '../common/http/error-codes';
import { PublicUser, toPublicUser } from './user.types';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth('access_token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Protected: requires a valid access token cookie (global JwtAuthGuard). */
  @Get('me')
  @ApiSuccessResponse(PublicUser, { description: 'The signed-in user' })
  @ApiResponse({ status: 401, type: ErrorResponse, description: 'No valid session' })
  async me(@CurrentUser() authUser: AuthUser): Promise<PublicUser> {
    const user = await this.usersService.findById(authUser.id);
    // The access token can outlive the account (e.g. a soft-deleted user).
    if (!user) {
      throw AppException.unauthorized(ErrorCode.SESSION_REVOKED, 'Session is no longer valid');
    }
    return toPublicUser(user);
  }
}
