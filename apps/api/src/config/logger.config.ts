import type { IncomingMessage, ServerResponse } from 'node:http';
import { RequestMethod } from '@nestjs/common';
import type { Params } from 'nestjs-pino';
import { stdTimeFunctions, type DestinationStream } from 'pino';
import { CORRELATION_ID_HEADER, newCorrelationId } from '../common/correlation/correlation-id';
import type { Env } from './env';

/**
 * One JSON shape for every log line (application logs via AppLogger and the access log):
 *
 *   { "level": "info", "time": "2026-…Z", "service": "auth-api", "env": "production",
 *     "context": "AuthService", "correlationId": "<uuid v4>", "message": "User signed in",
 *     …extra fields }
 *
 * The correlation id is pino-http's request id, generated here for every request (never taken
 * from the caller), so every line logged while handling a request carries it automatically. It
 * is returned in the X-Correlation-Id response header and in the response envelope's meta.
 */
export function buildLoggerParams(config: Env, destination?: DestinationStream | null): Params {
  const options: NonNullable<Exclude<Params['pinoHttp'], DestinationStream | unknown[]>> = {
    level: config.NODE_ENV === 'test' && !destination ? 'silent' : config.LOG_LEVEL,
    transport:
      config.NODE_ENV === 'development' && !destination
        ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } }
        : undefined,
    messageKey: 'message',
    timestamp: stdTimeFunctions.isoTime,
    base: { service: 'auth-api', env: config.NODE_ENV },
    formatters: { level: (label: string) => ({ level: label }) },
    customAttributeKeys: { reqId: 'correlationId' },
    // Bind only the correlation id (not the whole request) to every line logged during a request.
    quietReqLogger: true,
    genReqId: (_req: IncomingMessage, res: ServerResponse) => {
      const id = newCorrelationId();
      res.setHeader(CORRELATION_ID_HEADER, id);
      return id;
    },
    // The access log keeps only what is needed to read it: no headers, no bodies.
    serializers: {
      req: (req: { method?: string; url?: string }) => ({ method: req.method, url: req.url }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      censor: '[redacted]',
    },
    customSuccessMessage: (req, res, responseTime) =>
      `${req.method} ${req.url} → ${res.statusCode} in ${Math.round(responseTime)}ms`,
    customErrorMessage: (req, res, error) =>
      `${req.method} ${req.url} → ${res.statusCode} (${error.message})`,
    autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
    customLogLevel: (_req, res, err) =>
      err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
  };
  return {
    pinoHttp: destination ? [options, destination] : options,
    forRoutes: [{ path: '*path', method: RequestMethod.ALL }],
  };
}
