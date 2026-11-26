import { applyDecorators, HttpStatus, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ResponseMeta } from './api-response';

/** Documents a 2xx response wrapped in the success envelope ({ success, data, meta }). */
export function ApiSuccessResponse(
  model: Type<unknown> | null,
  options: { status?: HttpStatus; description?: string } = {},
) {
  const data = model ? { $ref: getSchemaPath(model) } : { type: 'null', example: null };
  return applyDecorators(
    ApiExtraModels(ResponseMeta, ...(model ? [model] : [])),
    ApiResponse({
      status: options.status ?? HttpStatus.OK,
      description: options.description,
      schema: {
        type: 'object',
        required: ['success', 'data', 'meta'],
        properties: {
          success: { type: 'boolean', example: true },
          data,
          meta: { $ref: getSchemaPath(ResponseMeta) },
        },
      },
    }),
  );
}
