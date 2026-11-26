import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException } from '../http/app.exception';
import { ErrorCode } from '../http/error-codes';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost(request: Record<string, unknown> = { url: '/api/thing', id: 'req-1' }) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function bodyOf(json: jest.Mock) {
  return json.mock.calls[0][0];
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('wraps HTTP exceptions in the error envelope with a status-derived code', () => {
    const { host, status, json } = createHost();
    filter.catch(new NotFoundException('Nope'), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(bodyOf(json)).toEqual({
      success: false,
      error: { statusCode: 404, code: ErrorCode.NOT_FOUND, message: 'Nope' },
      meta: { correlationId: 'req-1', timestamp: expect.any(String), path: '/api/thing' },
    });
  });

  it('keeps the code of an AppException', () => {
    const { host, json } = createHost();
    filter.catch(AppException.conflict(ErrorCode.EMAIL_ALREADY_REGISTERED, 'Taken'), host);
    expect(bodyOf(json).error).toEqual({
      statusCode: 409,
      code: ErrorCode.EMAIL_ALREADY_REGISTERED,
      message: 'Taken',
    });
  });

  it('turns validation messages into details', () => {
    const { host, json } = createHost();
    filter.catch(new BadRequestException(['email must be an email', 'name too short']), host);
    expect(bodyOf(json).error).toEqual({
      statusCode: 400,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Request validation failed',
      details: ['email must be an email', 'name too short'],
    });
  });

  it('handles exceptions created with a plain string response', () => {
    const { host, json } = createHost();
    filter.catch(new HttpException('Teapot', 418), host);
    expect(bodyOf(json).error).toEqual({
      statusCode: 418,
      code: ErrorCode.BAD_REQUEST,
      message: 'Teapot',
    });
  });

  it('maps throttling to TOO_MANY_REQUESTS', () => {
    const { host, json } = createHost();
    filter.catch(new ThrottlerException(), host);
    expect(bodyOf(json).error.code).toBe(ErrorCode.TOO_MANY_REQUESTS);
  });

  it('maps a Mongo duplicate key error to 409', () => {
    const { host, status, json } = createHost();
    filter.catch(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(bodyOf(json).error.code).toBe(ErrorCode.CONFLICT);
  });

  it('keeps the 4xx status of body-parser errors (e.g. payload too large)', () => {
    const { host, status, json } = createHost();
    const error = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
      type: 'entity.too.large',
    });
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(413);
    expect(bodyOf(json).error).toEqual({
      statusCode: 413,
      code: ErrorCode.PAYLOAD_TOO_LARGE,
      message: 'request entity too large',
    });
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });

  it.each([
    ['not marked safe to expose', { status: 404 }],
    ['exposed but not a client error', { status: 502, expose: true }],
    ['exposed with a non-numeric status', { status: '400', expose: true }],
  ])('does not trust the status of an error %s', (_case, props) => {
    const { host, status } = createHost();
    filter.catch(Object.assign(new Error('upstream'), props), host);
    expect(status).toHaveBeenCalledWith(500);
  });

  it('hides internal error details and logs them', () => {
    const { host, status, json } = createHost();
    filter.catch(new Error('db password is hunter2'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(bodyOf(json).error).toEqual({
      statusCode: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    });
    expect(Logger.prototype.error).toHaveBeenCalled();
  });

  it('handles thrown non-Error values and requests without an id', () => {
    const { host, status, json } = createHost({ url: '/x' });
    filter.catch('a string was thrown', host);
    filter.catch(null, host);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(bodyOf(json).meta.correlationId).toBe('');
  });
});
