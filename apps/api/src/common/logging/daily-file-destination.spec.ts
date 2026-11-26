import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { DailyFileDestination, logDestinationFor } from './daily-file-destination';
import { parseEnv } from '../../config/env';

describe('DailyFileDestination', () => {
  let dir: string;
  let now: Date;
  const clock = () => now;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'logs-'));
    now = new Date('2026-01-15T10:00:00Z');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const read = (...parts: string[]) => readFileSync(join(dir, ...parts), 'utf8');

  it('writes to LOG_DIR/YYYY/MM/YYYY-MM-DD.log, creating the folders', () => {
    const destination = new DailyFileDestination(dir, clock);
    destination.write('{"a":1}\n');
    destination.end();

    expect(read('2026', '01', '2026-01-15.log')).toBe('{"a":1}\n');
  });

  it('appends, so a restart keeps the lines already written that day', () => {
    const first = new DailyFileDestination(dir, clock);
    first.write('before restart\n');
    first.end();
    const second = new DailyFileDestination(dir, clock);
    second.write('after restart\n');
    second.end();

    expect(read('2026', '01', '2026-01-15.log')).toBe('before restart\nafter restart\n');
  });

  it('starts a new file when the UTC day changes', () => {
    const destination = new DailyFileDestination(dir, clock);
    destination.write('day one\n');
    now = new Date('2026-02-01T00:00:01Z');
    destination.write('day two\n');
    destination.end();

    expect(read('2026', '01', '2026-01-15.log')).toBe('day one\n');
    expect(read('2026', '02', '2026-02-01.log')).toBe('day two\n');
  });

  it('names files by the UTC date, matching the timestamps inside them', () => {
    now = new Date('2026-01-15T23:30:00-05:00');
    const destination = new DailyFileDestination(dir, clock);
    destination.write('late evening in New York\n');
    destination.end();

    expect(read('2026', '01', '2026-01-16.log')).toBe('late evening in New York\n');
  });
});

describe('logDestinationFor', () => {
  const base = { MONGO_URI: 'mongodb://x', JWT_ACCESS_SECRET: 'x'.repeat(32) };

  it('logs to stdout only when LOG_DIR is not set', () => {
    expect(logDestinationFor(parseEnv(base))).toBeNull();
  });

  it('sends every line at the configured level to the daily file as well', () => {
    const dir = mkdtempSync(join(tmpdir(), 'logs-'));
    try {
      const destination = logDestinationFor(
        parseEnv({ ...base, LOG_DIR: dir, LOG_LEVEL: 'debug' }),
      );
      const logger = pino({ level: 'debug', timestamp: false, base: null }, destination!);
      logger.debug('kept at debug');

      const today = new Date().toISOString().slice(0, 10);
      const file = join(dir, today.slice(0, 4), today.slice(5, 7), `${today}.log`);
      expect(readFileSync(file, 'utf8')).toContain('"msg":"kept at debug"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
