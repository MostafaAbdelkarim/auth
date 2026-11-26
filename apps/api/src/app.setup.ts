import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { ACCESS_TOKEN_COOKIE } from './auth/auth-cookies';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/http/response-envelope.interceptor';
import { RequestLoggingInterceptor } from './common/logging/request-logging.interceptor';
import { APP_CONFIG } from './config/app-config.module';
import type { Env } from './config/env';
import { swaggerBasicAuth } from './common/security/swagger-basic-auth';

/**
 * Shared by main.ts and the e2e tests so both run the exact same setup.
 * The app must be created with { bodyParser: false }: the only body parser is the JSON one
 * registered in AppModule.configure, so form-encoded bodies are never parsed.
 */
export function configureApp(app: NestExpressApplication): Env {
  const config = app.get<Env>(APP_CONFIG);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');
  if (config.TRUST_PROXY) app.set('trust proxy', 1);

  app.enableCors({
    origin: config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS : false,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Accept'],
    exposedHeaders: ['X-Correlation-Id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalInterceptors(new RequestLoggingInterceptor(), new ResponseEnvelopeInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (config.SWAGGER_ENABLED) {
    // Protected whenever credentials are configured (always, in production: see env.ts).
    if (config.SWAGGER_USERNAME && config.SWAGGER_PASSWORD) {
      app.use(
        ['/api/docs', '/api/docs-json', '/api/docs-yaml'],
        swaggerBasicAuth(config.SWAGGER_USERNAME, config.SWAGGER_PASSWORD),
      );
    }
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Auth API')
        .setDescription('Sign up, sign in and session management. Sessions use httpOnly cookies.')
        .setVersion('1.0')
        .addCookieAuth(ACCESS_TOKEN_COOKIE)
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  return config;
}
