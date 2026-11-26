import type { SignInInput, SignUpInput } from '../features/auth/schemas';
import { defineEndpoint } from './endpoint';
import { ErrorCode } from './error-codes';
import { ApiError } from './http';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthPayload {
  user: User;
}

/** Every auth call in one place, declared once over the shared request layer. */
export const authApi = {
  signUp: defineEndpoint<SignUpInput, AuthPayload>({
    method: 'POST',
    path: '/auth/signup',
    retryOnUnauthorized: false,
  }),
  signIn: defineEndpoint<SignInInput, AuthPayload>({
    method: 'POST',
    path: '/auth/signin',
    retryOnUnauthorized: false,
  }),
  logout: defineEndpoint<void, null>({
    method: 'POST',
    path: '/auth/logout',
    retryOnUnauthorized: false,
  }),
  me: defineEndpoint<void, User>({ method: 'GET', path: '/users/me' }),
};

const SIGNED_OUT_CODES: string[] = [
  ErrorCode.AUTHENTICATION_REQUIRED,
  ErrorCode.INVALID_ACCESS_TOKEN,
  ErrorCode.SESSION_REVOKED,
];

/** The current user, or null when there is no valid session. Other failures are rethrown. */
export async function fetchSession(): Promise<User | null> {
  try {
    return await authApi.me();
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      SIGNED_OUT_CODES.includes(error.code)
    ) {
      return null;
    }
    throw error;
  }
}
