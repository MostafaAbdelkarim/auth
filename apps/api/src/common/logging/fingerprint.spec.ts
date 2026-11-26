import { fingerprint } from './fingerprint';

describe('fingerprint', () => {
  it('is stable across case and whitespace and does not contain the input', () => {
    const a = fingerprint('Jane@Example.com');
    expect(a).toHaveLength(12);
    expect(fingerprint(' jane@example.com ')).toBe(a);
    expect(a).not.toContain('jane');
  });

  it('differs for different inputs', () => {
    expect(fingerprint('a@example.com')).not.toBe(fingerprint('b@example.com'));
  });
});
