import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('produces an argon2id hash that verifies only the right password', async () => {
    const hash = await hasher.hash('Sup3r$ecret');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('Sup3r$ecret');
    await expect(hasher.verify(hash, 'Sup3r$ecret')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'wrong')).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hasher.hash('same')).not.toBe(await hasher.hash('same'));
  });

  it('treats a malformed stored hash as a failed match instead of throwing', async () => {
    await expect(hasher.verify('not-a-hash', 'anything')).resolves.toBe(false);
  });
});
