import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
import type { SuccessResponse } from './api-response';

/** The request's UUIDv4 correlation id (assigned by pino-http, echoed as X-Correlation-Id). */
export function correlationIdOf(request: Request): string {
  const id: unknown = (request as { id?: unknown }).id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : '';
}

/** Wraps every controller result in the success envelope. Errors are handled by the filter. */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, SuccessResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data: data ?? (null as T),
        meta: { correlationId: correlationIdOf(request), timestamp: new Date().toISOString() },
      })),
    );
  }
}
