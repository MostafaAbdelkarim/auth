# Testing

## Commands

| Command | What it runs |
|---|---|
| `make test` | everything, with coverage; **fails below 95%** on branches, lines, functions or statements (either app) |
| `make test-e2e` | API end-to-end tests only |
| `cd apps/api && npx jest src/auth` | API unit tests in one folder |
| `cd apps/api && npx jest --config test/jest-e2e.json -t "logout"` | API e2e tests by name |
| `cd apps/web && npx vitest run src/features/auth` | web tests in one folder (`npx vitest` to watch) |

No database or Docker needed: the API tests start an in-memory MongoDB (`mongodb-memory-server`).

## The layers

| Layer | Where | Tools | Use it for |
|---|---|---|---|
| API unit | next to the code, `*.spec.ts` | Jest | logic with branches the HTTP layer can't easily reach (rotation race, logger formatting, env parsing) |
| API e2e | `apps/api/test/*.e2e-spec.ts` | Jest + supertest + mongodb-memory-server | **the default for endpoints**: the real `AppModule`, real middleware, real database |
| Web | next to the code, `*.test.ts(x)` | Vitest + Testing Library + MSW | pages through the real router, the API layer, schemas |

## API e2e helpers

[`test/test-app.ts`](../apps/api/test/test-app.ts) boots the real app against a fresh in-memory MongoDB:

```ts
const testApp = await createTestApp({ AUTH_RATE_LIMIT_PER_MINUTE: '3' });   // env overrides
const server = testApp.app.getHttpServer();
await request(server).post('/api/auth/signup').send(user).expect(201);
await testApp.close();
```

- **Sessions:** `request.agent(server)` keeps cookies between calls.
- **Real log output:** `createTestApp(env, { logDestination: stream })` captures the app's actual JSON log lines, so you can assert on events and correlation ids (see `correlation-and-logging.e2e-spec.ts`).
- **Rate limits** are raised in the default test app. Test them in a dedicated app with low limits.
- **One user per `describe`,** to avoid cross-test interference such as the per-email rate limit.

## Web test helpers

```ts
server.use(http.post('*/api/auth/signin', () => ok({ user: jane })));          // success envelope
server.use(http.post('*/api/auth/signin', () => fail(401, 'INVALID_CREDENTIALS')));  // error envelope
const { user, router } = renderApp('/signin');                                  // real routes + fresh QueryClient
await user.type(screen.getByLabelText('Email'), 'jane@example.com');
expect(await screen.findByText('Welcome to the application.')).toBeInTheDocument();
```

- **Any request without an MSW handler fails the test** (`onUnhandledRequest: 'error'`).
- **Query like a user would:** by role and label first (`getByRole`, `getByLabelText`), then by text, never by CSS class.

## Rules we keep

- **Test first.** Write the test, watch it fail for the right reason, then implement.
- **Revert proof for anything security-related.** Break the code on purpose, check the test fails, restore it. A test that has never failed proves nothing.
- **Coverage is a map, not a target.** Close gaps with tests of real behaviour. The only exclusions are the bootstrap entry points (`main.ts`, `seed.ts`, `main.tsx`) and test helpers.
- **One behaviour per test,** named as a sentence: `it('rejects a refresh token that was already rotated')`.
- **Test through the public surface:** HTTP for the API, user actions for the web. Mock only the network (MSW) or external boundaries.
