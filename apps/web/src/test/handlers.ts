import { http, HttpResponse } from 'msw';

export const jane = {
  id: '3b241101-e2bb-4255-8caf-4136c566a962',
  email: 'jane@example.com',
  name: 'Jane Doe',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const SERVER_CORRELATION_ID = '6f9619ff-8b86-4d11-b42d-00c04fc964ff';
const meta = { correlationId: SERVER_CORRELATION_ID, timestamp: '2026-01-01T00:00:00.000Z' };

/** A success envelope, as the API sends it. */
export function ok(data: unknown, status = 200) {
  return HttpResponse.json({ success: true, data, meta }, { status });
}

/** An error envelope, as the API sends it. */
export function fail(statusCode: number, code: string, message = code, details?: string[]) {
  return HttpResponse.json(
    {
      success: false,
      error: { statusCode, code, message, ...(details ? { details } : {}) },
      meta: { ...meta, path: '/api/test' },
    },
    { status: statusCode },
  );
}

export const handlers = {
  signedOut: [
    http.get('*/api/users/me', () => fail(401, 'AUTHENTICATION_REQUIRED')),
    http.post('*/api/auth/refresh', () => fail(401, 'INVALID_REFRESH_TOKEN')),
  ],
  signedIn: [http.get('*/api/users/me', () => ok(jane))],
};
