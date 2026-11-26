import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from './error-codes';

/**
 * The one response contract for every endpoint:
 *   success: { success: true,  data: T,          meta }
 *   failure: { success: false, error: ApiError,  meta }
 * The web app's API layer (apps/web/src/api/http.ts) mirrors these types.
 */
export class ResponseMeta {
  @ApiProperty({
    example: '6f9619ff-8b86-4d11-b42d-00c04fc964ff',
    format: 'uuid',
    description:
      'UUIDv4 correlation id: sent by the client or generated, echoed as X-Correlation-Id and present on every log line of the request',
  })
  correlationId: string;

  @ApiProperty({ example: '2026-01-01T12:00:00.000Z' })
  timestamp: string;
}

export class ErrorMeta extends ResponseMeta {
  @ApiProperty({ example: '/api/auth/signup' })
  path: string;
}

export class ApiErrorBody {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ enum: ErrorCode, example: ErrorCode.VALIDATION_FAILED })
  code: ErrorCode;

  @ApiProperty({ example: 'Request validation failed' })
  message: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['Name must be at least 3 characters'],
    description: 'Field-level messages, present for validation errors',
  })
  details?: string[];
}

export class ErrorResponse {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty({ type: ApiErrorBody })
  error: ApiErrorBody;

  @ApiProperty({ type: ErrorMeta })
  meta: ErrorMeta;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}
