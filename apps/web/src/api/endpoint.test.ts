import { http as mock } from 'msw';
import { ok } from '../test/handlers';
import { server } from '../test/server';
import { defineEndpoint } from './endpoint';

function captureRequests() {
  const seen: Array<{ method: string; url: string; body: string }> = [];
  const handler = async ({ request }: { request: Request }) => {
    seen.push({
      method: request.method,
      url: new URL(request.url).pathname + new URL(request.url).search,
      body: await request.text(),
    });
    return ok({ fine: true });
  };
  server.use(mock.all('*/api/*', handler));
  return seen;
}

describe('defineEndpoint', () => {
  it('sends POST input as the JSON body and unwraps the result', async () => {
    const seen = captureRequests();
    const create = defineEndpoint<{ name: string }, { fine: boolean }>({
      method: 'POST',
      path: '/things',
    });

    await expect(create({ name: 'x' })).resolves.toEqual({ fine: true });
    expect(seen).toEqual([{ method: 'POST', url: '/api/things', body: '{"name":"x"}' }]);
  });

  it('sends GET and DELETE input as the query string', async () => {
    const seen = captureRequests();
    const list = defineEndpoint<{ page: number }, unknown>({ method: 'GET', path: '/things' });
    const purge = defineEndpoint<{ force: boolean }, unknown>({
      method: 'DELETE',
      path: '/things',
    });

    await list({ page: 3 });
    await purge({ force: true });
    expect(seen.map((r) => [r.method, r.url, r.body])).toEqual([
      ['GET', '/api/things?page=3', ''],
      ['DELETE', '/api/things?force=true', ''],
    ]);
  });

  it('supports input-less endpoints and custom mapping to path params', async () => {
    const seen = captureRequests();
    const ping = defineEndpoint<void, unknown>({ method: 'GET', path: '/ping' });
    const rename = defineEndpoint<{ id: string; name: string }, unknown>({
      method: 'PATCH',
      path: '/things/:id',
      toRequest: ({ id, name }) => ({ pathParams: { id }, body: { name } }),
    });

    await ping();
    await rename({ id: 't-1', name: 'new' });
    expect(seen.map((r) => [r.method, r.url, r.body])).toEqual([
      ['GET', '/api/ping', ''],
      ['PATCH', '/api/things/t-1', '{"name":"new"}'],
    ]);
  });
});
