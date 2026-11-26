import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import pino, { type DestinationStream } from 'pino';
import type { Env } from '../../config/env';

/**
 * A pino destination that appends each line to `<dir>/YYYY/MM/YYYY-MM-DD.log`, one file per
 * UTC day (the same clock as the `time` field inside each line), e.g. logs/2026/01/2026-01-15.log.
 *
 * Writes are synchronous: a crash cannot lose lines that were still buffered, and the volume of
 * an auth API is far below what that costs. Old files are never deleted here; retention
 * (compress, ship to object storage, delete after N months) belongs to the host, e.g. logrotate
 * or a cron job, so it can't be lost with a code change.
 */
export class DailyFileDestination implements DestinationStream {
  private fd: number | null = null;
  private day = '';

  constructor(
    private readonly dir: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  write(line: string): void {
    const day = this.now().toISOString().slice(0, 10);
    if (day !== this.day || this.fd === null) this.open(day);
    writeSync(this.fd!, line);
  }

  end(): void {
    if (this.fd !== null) closeSync(this.fd);
    this.fd = null;
  }

  private open(day: string): void {
    this.end();
    const folder = join(this.dir, day.slice(0, 4), day.slice(5, 7));
    mkdirSync(folder, { recursive: true });
    this.fd = openSync(join(folder, `${day}.log`), 'a');
    this.day = day;
  }
}

/**
 * Where the app's log lines go: stdout only (null), or stdout plus daily files when LOG_DIR is
 * set. stdout always stays on, so container and platform log collectors keep working.
 */
export function logDestinationFor(config: Env): DestinationStream | null {
  if (!config.LOG_DIR) return null;
  // The logger's own level (LOG_LEVEL) does the filtering; the streams pass everything through.
  return pino.multistream([
    { level: 'trace', stream: process.stdout },
    { level: 'trace', stream: new DailyFileDestination(config.LOG_DIR) },
  ]);
}
