import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorBody, ErrorResponse } from '../http/api-response';
import { AppLogger } from '../logging/app-logger';
import { AppException } from '../http/app.exception';
import { ErrorCode, errorCodeForStatus } from '../http/error-codes';
import { correlationIdOf } from '../http/response-envelope.interceptor';

const MONGO_DUPLICATE_KEY = 11000;

function isDuplicateKeyError(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    (exception as { code?: unknown }).code === MONGO_DUPLICATE_KEY
  );
}

/**
 * http-errors style client errors (thrown by body-parser for oversized or malformed bodies).
 * They carry a 4xx `status` and `expose: true` when their message is safe to show.
 */
function asExposedClientError(exception: unknown): { status: number; message: string } | null {
  if (!(exception instanceof Error)) return null;
  const { status, expose } = exception as Error & { status?: unknown; expose?: unknown };
  if (expose === true && typeof status === 'number' && status >= 400 && status < 500) {
    return { status, message: exception.message };
  }
  return null;
}

function fromHttpException(exception: HttpException): ApiErrorBody {
  const statusCode = exception.getStatus();
  const response = exception.getResponse();
  const raw =
    typeof response === 'object' && 'message' in response ? response.message : exception.message;

  if (Array.isArray(raw)) {
    // ValidationPipe: one message per failed constraint.
    return {
      statusCode,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Request validation failed',
      details: raw.map(String),
    };
  }
  return {
    statusCode,
    code: exception instanceof AppException ? exception.code : errorCodeForStatus(statusCode),
    message: String(raw),
  };
}

/**
 * Turns every error into the error envelope ({ success: false, error, meta }).
 * Unknown errors become a generic 500 so stack traces and internal messages never reach
 * the client; they are logged with the request id instead.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new AppLogger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const error = this.toErrorBody(exception);

    if (error.statusCode >= 500) {
      this.logger.error('Unhandled error while processing the request', exception, {
        event: 'http.unhandled_error',
        method: request.method,
        path: request.url,
      });
    }

    const body: ErrorResponse = {
      success: false,
      error,
      meta: {
        correlationId: correlationIdOf(request),
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    };
    response.status(error.statusCode).json(body);
  }

  private toErrorBody(exception: unknown): ApiErrorBody {
    if (exception instanceof HttpException) return fromHttpException(exception);

    const clientError = asExposedClientError(exception);
    if (clientError) {
      return {
        statusCode: clientError.status,
        code: errorCodeForStatus(clientError.status),
        message: clientError.message,
      };
    }
    if (isDuplicateKeyError(exception)) {
      return {
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.CONFLICT,
        message: 'Resource already exists',
      };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    };
  }
}
