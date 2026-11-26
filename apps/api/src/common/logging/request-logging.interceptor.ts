import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { AppLogger } from './app-logger';
import { type Observable, tap } from 'rxjs';

/**
 * Logs entry and exit of every controller handler with its name and duration.
 * pino-http already writes one access-log line per request (method, url, status, time);
 * these debug lines add which handler ran, so LOG_LEVEL=debug gives a step-by-step trace,
 * all correlated by the same request id.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new AppLogger('Http');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = `${context.getClass().name}.${context.getHandler().name}`;
    const startedAt = performance.now();
    this.logger.debug(`→ ${handler}`, { event: 'http.handler.started', handler });

    const finish = (outcome: 'ok' | 'error') =>
      this.logger.debug(`← ${handler} (${outcome})`, {
        event: 'http.handler.finished',
        handler,
        outcome,
        durationMs: Math.round(performance.now() - startedAt),
      });

    return next.handle().pipe(tap({ next: () => finish('ok'), error: () => finish('error') }));
  }
}
