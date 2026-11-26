import { InMemoryTokenDenylist } from './token-denylist';

describe('InMemoryTokenDenylist', () => {
  let now: number;
  let denylist: InMemoryTokenDenylist;

  beforeEach(() => {
    now = 1_000_000;
    denylist = new InMemoryTokenDenylist(() => now);
  });

  it('remembers a revoked token id until the token would have expired anyway', async () => {
    await denylist.add('jti-1', new Date(now + 60_000));
    await expect(denylist.has('jti-1')).resolves.toBe(true);
    await expect(denylist.has('jti-2')).resolves.toBe(false);

    now += 60_000;
    await expect(denylist.has('jti-1')).resolves.toBe(false);
  });

  it('ignores tokens that are already expired', async () => {
    await denylist.add('old', new Date(now - 1));
    expect(denylist.size).toBe(0);
  });

  it('sweeps expired entries so memory stays bounded by the access-token lifetime', async () => {
    await denylist.add('a', new Date(now + 1_000));
    await denylist.add('b', new Date(now + 120_000));
    expect(denylist.size).toBe(2);

    now += 61_000; // past 'a' and past the sweep interval
    await denylist.add('c', new Date(now + 1_000));
    expect(denylist.size).toBe(2); // 'a' swept, 'b' and 'c' kept
  });
});
