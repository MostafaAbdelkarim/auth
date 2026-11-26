import { createHash } from 'node:crypto';

/**
 * A short, stable, non-reversible tag for a personal value (e.g. an email) so logs can
 * correlate events for one account without storing the value itself.
 */
export function fingerprint(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 12);
}
