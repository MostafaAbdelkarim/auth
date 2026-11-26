import { ErrorCode, errorCodeForStatus } from './error-codes';

describe('errorCodeForStatus', () => {
  it.each([
    [400, ErrorCode.BAD_REQUEST],
    [401, ErrorCode.AUTHENTICATION_REQUIRED],
    [403, ErrorCode.FORBIDDEN],
    [404, ErrorCode.NOT_FOUND],
    [409, ErrorCode.CONFLICT],
    [413, ErrorCode.PAYLOAD_TOO_LARGE],
    [415, ErrorCode.UNSUPPORTED_MEDIA_TYPE],
    [429, ErrorCode.TOO_MANY_REQUESTS],
    [503, ErrorCode.SERVICE_UNAVAILABLE],
    [500, ErrorCode.INTERNAL_ERROR],
    [502, ErrorCode.INTERNAL_ERROR],
    [418, ErrorCode.BAD_REQUEST],
  ])('maps %i to %s', (status, code) => expect(errorCodeForStatus(status)).toBe(code));
});
