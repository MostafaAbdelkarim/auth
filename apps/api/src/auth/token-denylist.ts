/**
 * Revoked access-token ids (JWT `jti`), kept only until each token would have expired anyway.
 *
 * Why a denylist only for access tokens: they are stateless JWTs, so without it a token copied
 * before logout keeps working for up to JWT_ACCESS_TTL_SECONDS. Refresh tokens do NOT use a
 * denylist: they are stored (hashed) in MongoDB, which is what makes rotation, reuse/theft
 * detection and revocation on account deletion possible, and it survives restarts.
 *
 * The interface is async so the production implementation can be Redis.
 */
export abstract class TokenDenylist {
  abstract add(tokenId: string, expiresAt: Date): Promise<void>;
  abstract has(tokenId: string): Promise<boolean>;
}

const SWEEP_INTERVAL_MS = 60_000;

/**
 * In-process implementation, fine for a single API instance.
 *
 * In production we'd use Redis instead, so the denylist is shared by every API instance and
 * survives restarts/deploys:
 *   add: SET denylist:access:<jti> 1 PXAT <expiresAt ms>   (Redis expires the key itself)
 *   has: EXISTS denylist:access:<jti>
 * Losing this in-memory list on restart only re-opens a window of at most
 * JWT_ACCESS_TTL_SECONDS (15 min) for tokens logged out before the restart.
 *
 * Memory is bounded: entries are dropped once their token has expired.
 */
export class InMemoryTokenDenylist extends TokenDenylist {
  private readonly entries = new Map<string, number>();
  private lastSweep: number;

  constructor(private readonly now: () => number = Date.now) {
    super();
    this.lastSweep = now();
  }

  get size(): number {
    return this.entries.size;
  }

  add(tokenId: string, expiresAt: Date): Promise<void> {
    this.sweepIfDue();
    if (expiresAt.getTime() > this.now()) this.entries.set(tokenId, expiresAt.getTime());
    return Promise.resolve();
  }

  has(tokenId: string): Promise<boolean> {
    const expiresAt = this.entries.get(tokenId);
    return Promise.resolve(expiresAt !== undefined && expiresAt > this.now());
  }

  private sweepIfDue(): void {
    const now = this.now();
    if (now - this.lastSweep < SWEEP_INTERVAL_MS) return;
    for (const [id, expiresAt] of this.entries) {
      if (expiresAt <= now) this.entries.delete(id);
    }
    this.lastSweep = now;
  }
}
