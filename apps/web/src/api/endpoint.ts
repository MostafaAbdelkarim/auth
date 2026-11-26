import { type HttpMethod, request, type RequestConfig } from './http';

export interface EndpointDefinition<TInput> {
  method: HttpMethod;
  path: string;
  retryOnUnauthorized?: boolean;
  /**
   * How the call's input becomes the request. Defaults: GET/DELETE send it as the query
   * string, other methods as the JSON body. Override to use path params or split input.
   */
  toRequest?: (input: TInput) => Pick<RequestConfig, 'body' | 'query' | 'pathParams'>;
}

export type Endpoint<TInput, TResponse> = [TInput] extends [void]
  ? (input?: void, options?: { signal?: AbortSignal }) => Promise<TResponse>
  : (input: TInput, options?: { signal?: AbortSignal }) => Promise<TResponse>;

function defaultToRequest(method: HttpMethod, input: unknown) {
  if (input === undefined) return {};
  return method === 'GET' || method === 'DELETE'
    ? { query: input as RequestConfig['query'] }
    : { body: input };
}

/**
 * Declares one API endpoint once, as a typed function. All network behaviour (envelope,
 * errors, cookies, session refresh) lives in request(); endpoints only describe themselves:
 *
 *   const getUser = defineEndpoint<{ id: string }, User>({
 *     method: 'GET', path: '/users/:id', toRequest: ({ id }) => ({ pathParams: { id } }),
 *   });
 */
export function defineEndpoint<TInput = void, TResponse = unknown>(
  definition: EndpointDefinition<TInput>,
): Endpoint<TInput, TResponse> {
  const call = (input: TInput, options: { signal?: AbortSignal } = {}) =>
    request<TResponse>({
      method: definition.method,
      path: definition.path,
      retryOnUnauthorized: definition.retryOnUnauthorized,
      signal: options.signal,
      ...(definition.toRequest
        ? definition.toRequest(input)
        : defaultToRequest(definition.method, input)),
    });
  return call as Endpoint<TInput, TResponse>;
}
