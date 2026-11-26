import { newCorrelationId } from './correlation-id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newCorrelationId', () => {
  it('returns a different UUIDv4 every time', () => {
    const ids = new Set(Array.from({ length: 50 }, newCorrelationId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });
});
