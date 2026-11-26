import { Inject, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import helmet from 'helmet';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthController } from './auth/auth.controller';
import { AuthModule } from './auth/auth.module';
import { APP_CONFIG, AppConfigModule, LOG_DESTINATION } from './config/app-config.module';
import type { Env } from './config/env';
import { buildLoggerParams } from './config/logger.config';
import { crossSiteRequestGuard } from './common/security/cross-site-request.guard';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';

const ONE_MINUTE_MS = 60_000;

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG, LOG_DESTINATION],
      useFactory: buildLoggerParams,
    }),
    MongooseModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: Env) => ({ uri: config.MONGO_URI, autoIndex: true }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: Env) => ({
        throttlers: [
          { name: 'default', ttl: ONE_MINUTE_MS, limit: 120 },
          {
            // Brute-force protection per client IP for sign-up / sign-in (refresh and logout opt out).
            name: 'auth',
            ttl: ONE_MINUTE_MS,
            limit: config.AUTH_RATE_LIMIT_PER_MINUTE,
            skipIf: (context) => context.getClass() !== AuthController,
          },
          {
            // Credential stuffing spread over many IPs: limit sign-in attempts per target email.
            name: 'account',
            ttl: ONE_MINUTE_MS,
            limit: config.AUTH_ACCOUNT_RATE_LIMIT_PER_MINUTE,
            skipIf: (context) => context.getHandler() !== AuthController.prototype.signIn,
            getTracker: (req: Record<string, unknown>) => {
              const email = (req.body as { email?: unknown } | undefined)?.email;
              return typeof email === 'string'
                ? `email:${email.trim().toLowerCase()}`
                : `ip:${String(req.ip)}`;
            },
          },
        ],
      }),
    }),
    UsersModule,
    AuthModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  constructor(@Inject(APP_CONFIG) private readonly config: Env) {}

  /**
   * Registered as Nest middleware (not app.use) so it runs AFTER the pino-http request logger:
   * every request, including ones rejected here (403/413/415), gets a correlation id and an
   * access-log line.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        helmet(),
        crossSiteRequestGuard(this.config.CORS_ORIGINS),
        cookieParser(),
        json({ limit: '10kb' }),
      )
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
