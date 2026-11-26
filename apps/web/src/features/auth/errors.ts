import { ErrorCode } from '../../api/error-codes';
import { ApiError } from '../../api/http';

/** Maps API failures to messages a user can act on, by stable error code (not message text). */
export function describeAuthError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  switch (error.code) {
    case ErrorCode.VALIDATION_FAILED:
      return error.details.join('. ') || 'Please check the form and try again.';
    case ErrorCode.INVALID_CREDENTIALS:
      return 'Invalid email or password.';
    case ErrorCode.EMAIL_ALREADY_REGISTERED:
      return 'An account with this email already exists.';
    case ErrorCode.TOO_MANY_REQUESTS:
      return 'Too many attempts. Please wait a minute and try again.';
    case ErrorCode.NETWORK_ERROR:
      return `Could not reach the server. Check your connection and try again.${reference(error)}`;
    default:
      return `Something went wrong on our side. Please try again.${reference(error)}`;
  }
}

/** The API's correlation id for the failed request, when the API handled it. */
function reference(error: ApiError): string {
  return error.correlationId ? ` (Reference: ${error.correlationId})` : '';
}
