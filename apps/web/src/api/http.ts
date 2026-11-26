/**
 * The single network layer of the web app. Every API call goes through request(), which:
 * - builds the URL (path params, query string) against the same-origin /api prefix,
 * - sends cookies (the session lives in httpOnly cookies; this code never sees tokens),
 * - unwraps the API's success envelope and turns the error envelope into ApiError, carrying the
 *   correlation id the API generated for that request (never sent from here),
 * - on 401, refreshes the session once (shared across concurrent calls) and retries; if the
 *   server refuses the refresh, tells onSessionExpired() listeners (the app signs the user out).
 *
 * The envelope types mirror apps/api/src/common/http/api-response.ts.
 */
import { ErrorCode } from './error-codes';

/** Set by the API on every response it handles; the web app only reads it. */
const CORRELATION_ID_HEADER = 'X-Correlation-Id';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ResponseMeta {
  correlationId: string;
  timestamp: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: string[];
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
  meta: ResponseMeta & { path: string };
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];
  /**
   * Quote this to support: it finds every server log line of the failed call. Undefined when
   * the API never handled the request (offline, proxy error page), so there is nothing to find.
   */
  readonly correlationId: string | undefined;

  constructor(body: ApiErrorBody, correlationId: string | undefined) {
    super(body.message);
    this.name = 'ApiError';
    this.status = body.statusCode;
    this.code = body.code;
    this.details = body.details ?? [];
    this.correlationId = correlationId;
  }
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestConfig {
  method?: HttpMethod;
  /** Relative to /api, may contain :params, e.g. '/users/:id'. */
  path: string;
  pathParams?: Record<string, string | number>;
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  /** Auth endpoints opt out: a 401 there means bad credentials, not an expired session. */
  retryOnUnauthorized?: boolean;
}

const API_PREFIX = '/api';

export function buildUrl(
  path: string,
  pathParams: RequestConfig['pathParams'] = {},
  query: RequestConfig['query'] = {},
): string {
  const resolvedPath = path.replace(/:([A-Za-z_]\w*)/g, (_match, name: string) => {
    const value = pathParams[name];
    if (value === undefined) throw new Error(`Missing path parameter "${name}" for ${path}`);
    return encodeURIComponent(String(value));
  });

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) search.append(key, String(value));
  }
  const queryString = search.toString();

  return `${window.location.origin}${API_PREFIX}${resolvedPath}${queryString ? `?${queryString}` : ''}`;
}

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return typeof value === 'object' && value !== null && 'success' in value;
}

async function readEnvelope(response: Response): Promise<ApiEnvelope<unknown> | null> {
  try {
    const body: unknown = await response.json();
    return isEnvelope(body) ? body : null;
  } catch {
    return null;
  }
}

/**
 * 'expired': the server rejected the refresh, so the session is over.
 * 'unavailable': the refresh never got an answer (offline, proxy error); the session may be fine.
 */
type RefreshOutcome = 'refreshed' | 'expired' | 'unavailable';

/** Concurrent 401s share one refresh call instead of racing each other. */
let refreshInFlight: Promise<RefreshOutcome> | null = null;

function refreshSession(): Promise<RefreshOutcome> {
  refreshInFlight ??= fetch(buildUrl('/auth/refresh'), { method: 'POST', credentials: 'include' })
    .then((response): RefreshOutcome => {
      if (response.ok) return 'refreshed';
      return response.status === 401 ? 'expired' : 'unavailable';
    })
    .catch((): RefreshOutcome => 'unavailable')
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

const sessionExpiredListeners = new Set<() => void>();

/**
 * Called when a request that needed the session got 401 and the server refused to refresh it.
 * Returns an unsubscribe function.
 */
export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

export async function request<T>(config: RequestConfig): Promise<T> {
  const { method = 'GET', path, pathParams, query, body, signal } = config;
  const retryOnUnauthorized = config.retryOnUnauthorized ?? true;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, pathParams, query), {
      method,
      credentials: 'include',
      signal,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      { statusCode: 0, code: ErrorCode.NETWORK_ERROR, message: 'Could not reach the server' },
      undefined,
    );
  }

  if (response.status === 401 && retryOnUnauthorized) {
    const outcome = await refreshSession();
    if (outcome === 'refreshed') return request<T>({ ...config, retryOnUnauthorized: false });
    if (outcome === 'expired') sessionExpiredListeners.forEach((listener) => listener());
  }

  const correlationId = response.headers.get(CORRELATION_ID_HEADER) ?? undefined;
  const envelope = await readEnvelope(response);
  if (envelope?.success === true) return envelope.data as T;
  if (envelope?.success === false) {
    throw new ApiError(envelope.error, envelope.meta.correlationId || correlationId);
  }
  throw new ApiError(
    {
      statusCode: response.status,
      code: ErrorCode.UNEXPECTED_RESPONSE,
      message: `Unexpected response from the server (HTTP ${response.status})`,
    },
    correlationId,
  );
}

type Options = Omit<RequestConfig, 'method' | 'path' | 'body'>;

/** Shorthands over request() for ad-hoc calls; prefer defineEndpoint() for named API calls. */
export const http = {
  get: <T>(path: string, options?: Options) => request<T>({ ...options, method: 'GET', path }),
  delete: <T>(path: string, options?: Options) =>
    request<T>({ ...options, method: 'DELETE', path }),
  post: <T>(path: string, body?: unknown, options?: Options) =>
    request<T>({ ...options, method: 'POST', path, body }),
  put: <T>(path: string, body?: unknown, options?: Options) =>
    request<T>({ ...options, method: 'PUT', path, body }),
  patch: <T>(path: string, body?: unknown, options?: Options) =>
    request<T>({ ...options, method: 'PATCH', path, body }),
};
