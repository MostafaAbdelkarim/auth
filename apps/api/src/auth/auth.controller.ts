import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ErrorResponse } from '../common/http/api-response';
import { ApiSuccessResponse } from '../common/http/api-success-response.decorator';
import { AppException } from '../common/http/app.exception';
import { ErrorCode } from '../common/http/error-codes';
import { InjectAppConfig } from '../config/app-config.module';
import type { Env } from '../config/env';
import {
  clearAuthCookies,
  readAccessToken,
  readRefreshToken,
  setAuthCookies,
} from './auth-cookies';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';

@ApiTags('auth')
@ApiResponse({ status: 400, type: ErrorResponse, description: 'VALIDATION_FAILED' })
@ApiResponse({ status: 429, type: ErrorResponse, description: 'TOO_MANY_REQUESTS' })
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @InjectAppConfig() private readonly config: Env,
  ) {}

  @Post('signup')
  @ApiSuccessResponse(AuthResponseDto, {
    status: HttpStatus.CREATED,
    description: 'Account created; session cookies set',
  })
  @ApiResponse({ status: 409, type: ErrorResponse, description: 'EMAIL_ALREADY_REGISTERED' })
  async signUp(
    @Body() dto: SignUpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { user, tokens } = await this.authService.signUp(dto);
    setAuthCookies(res, tokens, this.config);
    return { user };
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessResponse(AuthResponseDto, { description: 'Signed in; session cookies set' })
  @ApiResponse({ status: 401, type: ErrorResponse, description: 'INVALID_CREDENTIALS' })
  async signIn(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { user, tokens } = await this.authService.signIn(dto);
    setAuthCookies(res, tokens, this.config);
    return { user };
  }

  // The strict 'auth' limits are for credential guessing; refresh and logout only get the default
  // limit, or users behind one shared IP would be signed out by each other's session refreshes.
  @SkipThrottle({ auth: true, account: true })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessResponse(null, { description: 'Both cookies rotated' })
  @ApiResponse({
    status: 401,
    type: ErrorResponse,
    description: 'INVALID_REFRESH_TOKEN or SESSION_REVOKED',
  })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<null> {
    const token = readRefreshToken(req);
    if (!token) {
      clearAuthCookies(res, this.config);
      throw AppException.unauthorized(ErrorCode.INVALID_REFRESH_TOKEN, 'Missing refresh token');
    }
    try {
      setAuthCookies(res, await this.authService.refresh(token), this.config);
      return null;
    } catch (error) {
      clearAuthCookies(res, this.config);
      throw error;
    }
  }

  @SkipThrottle({ auth: true, account: true })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiSuccessResponse(null, {
    description: 'Refresh session revoked, current access token denylisted, cookies cleared',
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<null> {
    clearAuthCookies(res, this.config);
    await this.authService.logout(readRefreshToken(req), readAccessToken(req));
    return null;
  }
}
