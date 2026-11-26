import { randomUUID } from 'node:crypto';

/** Returned on every response; the API generates it, callers never send it. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * A new UUIDv4 for every request. Any id the caller sends is ignored: ids only come from the
 * server, so log lines can't be spoofed or injected, and one id always means one request.
 */
export function newCorrelationId(): string {
  return randomUUID();
}
