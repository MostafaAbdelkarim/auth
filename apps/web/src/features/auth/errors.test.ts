import { ApiError } from '../../api/http';
import { describeAuthError } from './errors';

const apiError = (code: string, details?: string[]) =>
  new ApiError({ statusCode: 400, code, message: code, details }, 'corr-42');
const unhandled = (code: string) => new ApiError({ statusCode: 0, code, message: code }, undefined);

describe('describeAuthError', () => {
  it.each([
    [apiError('VALIDATION_FAILED', ['Name too short', 'Bad email']), 'Name too short. Bad email'],
    [apiError('VALIDATION_FAILED'), 'Please check the form and try again.'],
    [apiError('INVALID_CREDENTIALS'), 'Invalid email or password.'],
    [apiError('EMAIL_ALREADY_REGISTERED'), 'An account with this email already exists.'],
    [apiError('TOO_MANY_REQUESTS'), 'Too many attempts. Please wait a minute and try again.'],
    [
      unhandled('NETWORK_ERROR'),
      'Could not reach the server. Check your connection and try again.',
    ],
    [
      apiError('INTERNAL_ERROR'),
      'Something went wrong on our side. Please try again. (Reference: corr-42)',
    ],
    [unhandled('UNEXPECTED_RESPONSE'), 'Something went wrong on our side. Please try again.'],
    [new Error('boom'), 'Something went wrong. Please try again.'],
  ])('describes %s', (error, message) => expect(describeAuthError(error)).toBe(message));
});
