import type { TransformFnParams } from 'class-transformer';
import { normalizeEmail, trim } from './transforms';

const params = (value: unknown) => ({ value }) as TransformFnParams;

describe('transforms', () => {
  it('trims strings and normalises emails', () => {
    expect(trim(params('  Jane  '))).toBe('Jane');
    expect(normalizeEmail(params('  Jane@Example.COM '))).toBe('jane@example.com');
  });

  it('passes non-strings through untouched so validation can reject them', () => {
    const operator = { $ne: null };
    expect(trim(params(42))).toBe(42);
    expect(normalizeEmail(params(operator))).toBe(operator);
  });
});
