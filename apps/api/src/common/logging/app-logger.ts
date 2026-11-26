import { Logger } from '@nestjs/common';

export type LogFields = Record<string, unknown>;

/**
 * Keys owned by the log line itself (see config/logger.config.ts). Extra fields with these
 * names are moved under `fields` so they can never spoof or overwrite them.
 */
const RESERVED_KEYS = new Set([
  'message',
  'msg',
  'level',
  'time',
  'context',
  'correlationId',
  'service',
  'env',
  'err',
  'req',
  'res',
]);

/** Field names that must never reach a log, whatever their casing or position. */
const SENSITIVE_KEY =
  /password|passwd|pwd|secret|token|authorization|cookie|api[-_]?key|credential/i;
const REDACTED = '[redacted]';
const MAX_DEPTH = 5;

function sanitize(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[truncated]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1, seen));

  const result: LogFields = {};
  for (const [key, inner] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitize(inner, depth + 1, seen);
  }
  return result;
}

function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      type: error.name,
      message: error.message,
      ...(code === undefined ? {} : { code }),
      stack: error.stack,
    };
  }
  return { type: typeof error, message: String(error) };
}

/**
 * The one way to log in the API. Callers give a meaningful message and, optionally, any extra
 * fields; every line then comes out in the same JSON shape:
 *
 *   { level, time, service, env, context, correlationId, message, ...fields, err? }
 *
 * - correlationId is attached automatically for anything logged during a request,
 * - secrets are redacted by key name (password, token, cookie, authorization, secret, …),
 * - errors are serialised the same way everywhere (type, message, code, stack),
 * - standard keys can't be overwritten by extra fields.
 *
 * Usage:
 *   private readonly logger = new AppLogger(AuthService.name);
 *   this.logger.info('User signed in', { event: 'auth.signin.succeeded', userId });
 *   this.logger.error('Could not send email', error, { userId });
 */
export class AppLogger {
  private readonly logger: Logger;

  constructor(context: string) {
    this.logger = new Logger(context);
  }

  debug(message: string, fields?: LogFields): void {
    this.logger.debug(this.format(fields), this.checked(message));
  }

  info(message: string, fields?: LogFields): void {
    this.logger.log(this.format(fields), this.checked(message));
  }

  warn(message: string, fields?: LogFields): void {
    this.logger.warn(this.format(fields), this.checked(message));
  }

  error(message: string, error?: unknown, fields?: LogFields): void {
    const payload = this.format(fields);
    if (error !== undefined) payload.err = serializeError(error);
    this.logger.error(payload, this.checked(message));
  }

  private checked(message: string): string {
    if (!message.trim()) throw new Error('Log message must not be empty');
    return message;
  }

  private format(fields: LogFields = {}): LogFields {
    const clean = sanitize(fields, 0, new WeakSet()) as LogFields;
    const payload: LogFields = {};
    const overridden: LogFields = {};
    for (const [key, value] of Object.entries(clean)) {
      (RESERVED_KEYS.has(key) ? overridden : payload)[key] = value;
    }
    if (Object.keys(overridden).length > 0) payload.fields = overridden;
    return payload;
  }
}
