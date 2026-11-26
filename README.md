# Easy Auth: sign up / sign in module

> **For reviewers, in 30 seconds**
> - **What:** sign up, sign in, a protected welcome page and logout. NestJS + MongoDB API, React + TypeScript web app.
> - **Run it:** `make demo`, then open http://localhost:8080 and sign in as `demo@example.com` / `Demo$ecret1`. Docker and Node 22 are the only requirements.
> - **Check it:** `make verify` runs everything CI runs: audit, lint, typecheck, 240+ tests with ≥95% coverage enforced, build.
> - **Why it's built this way:** [AI.md → System design](AI.md#system-design) covers the decisions, the alternatives and the trade-offs.
> - **How it evolved:** [Design evolution](#design-evolution-review-driven-changes) lists every change made after my own review, with the reason for each.
> - **Contributing:** the [knowledge base](docs/README.md) covers architecture, ERD, sequence diagrams, conventions, testing, logging and infrastructure, written for new developers.

| | |
|---|---|
| **API** | NestJS 11, Mongoose 8 (MongoDB 7), argon2id, JWT, class-validator, pino, Swagger |
| **Web** | React 19, Vite 6, React Router 7, TanStack Query 5, react-hook-form + zod, Tailwind CSS 4 |
| **Tests** | Jest + supertest + mongodb-memory-server (API), Vitest + Testing Library + MSW (web), **≥95% coverage enforced** |
| **Delivery** | Makefile, Docker (multi-stage, non-root, read-only, scanned), docker compose, GitHub Actions: CI on every PR, CodeQL, CD with dev → production promotion, Dependabot |

---

## Quick start

Needs **Docker** (running) and **Node 22+**. One command sets everything up, starts the stack and seeds a demo user:

```bash
make demo
```

| URL | What |
|---|---|
| http://localhost:8080 | Web app. Demo login: `demo@example.com` / `Demo$ecret1` |
| http://localhost:8080/api/docs | Swagger UI, behind HTTP Basic auth: user `docs`, password = `SWAGGER_PASSWORD` in `.env` |
| http://localhost:8080/api/health | Health check (API + MongoDB) |

`make demo` = `make setup` (checks tools, `npm ci`, creates `.env` files with generated secrets) + `make up` (builds and starts MongoDB, API and web, waiting until healthy) + `make seed` (creates the demo user; safe to run again).

## Local development

```bash
make dev        # MongoDB in Docker + API on :3000 and web on :5173 in watch mode, demo user seeded
```

### All commands (`make help`)

| Command | What it does |
|---|---|
| `make demo` | Everything from scratch: setup, Docker stack, demo user |
| `make setup` | Check Node/Docker, `npm ci`, create or complete `.env` + `apps/api/.env` with generated secrets (never printed, never overwritten) |
| `make up` / `make down` | Start (and wait until healthy) / stop the Docker stack |
| `make seed` / `make seed-dev` | Create the demo user in the Docker stack / local dev database (idempotent; refuses production unless explicitly allowed) |
| `make dev` | Hot-reload development |
| `make verify` | What CI runs: audit, lint, typecheck, tests with coverage, build |
| `make test` / `make test-e2e` | All tests with coverage / API e2e only (in-memory MongoDB) |
| `make logs` / `make ps` | Follow the API's JSON logs / container status |
| `make reset` | Stop the stack and delete the database (asks for confirmation) |

The `npm` scripts behind these (`npm run dev`, `npm test`, …) work too.

## API

All routes are under `/api`. Full schemas are in Swagger.

| Method | Path | Auth | Success | Errors (`error.code`) |
|---|---|---|---|---|
| POST | `/auth/signup` | public | `201 { user }` + session cookies | `VALIDATION_FAILED`, `EMAIL_ALREADY_REGISTERED`, `TOO_MANY_REQUESTS` |
| POST | `/auth/signin` | public | `200 { user }` + session cookies | `VALIDATION_FAILED`, `INVALID_CREDENTIALS`, `TOO_MANY_REQUESTS` |
| POST | `/auth/refresh` | refresh cookie | `200 null`, cookies rotated | `INVALID_REFRESH_TOKEN`, `SESSION_REVOKED` |
| POST | `/auth/logout` | refresh cookie | `200 null`, session revoked | |
| GET | `/users/me` | **access cookie** | `200 user` | `AUTHENTICATION_REQUIRED`, `INVALID_ACCESS_TOKEN`, `SESSION_REVOKED` |
| GET | `/health` | public | `200` MongoDB status | `SERVICE_UNAVAILABLE` |

### One response contract for every endpoint

```jsonc
// success
{ "success": true,  "data": { "user": { "id": "3b241101-…", "email": "jane@example.com", … } },
  "meta": { "correlationId": "b72af977-6bb7-49df-922c-0fef23907df6", "timestamp": "2026-…" } }

// failure
{ "success": false,
  "error": { "statusCode": 400, "code": "VALIDATION_FAILED", "message": "Request validation failed",
             "details": ["Name must be at least 3 characters"] },
  "meta":  { "correlationId": "1c0e5b8a-…", "timestamp": "2026-…", "path": "/api/auth/signup" } }
```

- **Success:** a global interceptor wraps every handler's return value. A new endpoint just returns its data.
- **Failure:** a global exception filter shapes every failure, including validation, rate limits, oversized bodies and unknown errors.
- **Error codes:** clients branch on `error.code` (a stable enum), never on message text.
- **Correlation ids:** `meta.correlationId` equals the `X-Correlation-Id` response header and the `correlationId` on every log line for that request (see [Tracing](#tracing-one-uuidv4-correlation-id-per-request)).

## Web API layer

All network calls go through **`apps/web/src/api/http.ts`**. It:

- builds URLs with path and query params, and sends cookies
- unwraps the envelope, and turns errors into a typed `ApiError` (`status`, `code`, `details`, and the server's `correlationId` when the API handled the request)
- does a single shared session refresh on `401`, then retries once

Endpoints are declared once with **`defineEndpoint`**:

```ts
export const authApi = {
  signIn: defineEndpoint<SignInInput, AuthPayload>({ method: 'POST', path: '/auth/signin', retryOnUnauthorized: false }),
  me:     defineEndpoint<void, User>({ method: 'GET', path: '/users/me' }),
};
// a future endpoint with a path param:
const getUser = defineEndpoint<{ id: string }, User>({
  method: 'GET', path: '/users/:id', toRequest: ({ id }) => ({ pathParams: { id } }),
});
```

## Security

The full OWASP Top 10:2025 review and design rationale are in [AI.md](AI.md#owasp-top-102025-review).

**Session handling**
- **Tokens:** tokens live only in `httpOnly`, `SameSite=Strict` cookies (`Secure` when served over HTTPS), never in JavaScript or `localStorage`.
  - **Access token:** a 15-minute JWT, scoped to `/api`. It carries issuer, audience and `typ` claims, and the algorithm is pinned to HS256.
  - **Refresh token:** a random value valid for 7 days, scoped to `/api/auth` and stored only as a SHA-256 hash.
- **Refresh rotation:** refresh tokens rotate on every use. Reusing a rotated token revokes the whole session. Tabs that refresh within the same 10 seconds are tolerated.
- **Logout kills both tokens immediately:**
  - **Refresh token:** its family is revoked in MongoDB. That survives restarts and is shared by every instance.
  - **Access token:** its id (`jti`) is put on a denylist until the token would have expired anyway. The denylist is in memory and sits behind a `TokenDenylist` interface. Production would use Redis (`SET denylist:access:<jti> 1 PXAT <exp>`), so it is shared and survives restarts. With the in-memory version, a restart re-opens a window of at most 15 minutes for tokens logged out before it.
  - **Why refresh tokens are not on a denylist:** see [Design evolution](#design-evolution-review-driven-changes).
- **Account deletion:** a soft-deleted account loses its session at the next refresh, and `/users/me` rejects it immediately.

**CSRF**
- **Cookies:** `SameSite=Strict`.
- **JSON only:** the API accepts only JSON bodies (`415` otherwise), so an HTML form can never submit to it, which also prevents login CSRF.
- **Origin check:** requests from another origin (`Origin` / `Sec-Fetch-Site`) are rejected with `403`.

**Credentials**
- **Hashing:** passwords are hashed with argon2id.
- **Identical failures:** an unknown email and a wrong password get the same `401`, and the timing is equalised with a dummy hash.
- **Rate limits:** 10 sign-up/sign-in attempts per minute per IP, and 5 sign-in attempts per minute per email from any IP (against credential stuffing).

**Input and errors**
- **Validation:** whitelist validation (unknown fields return `400`), a 10 kB body limit (`413`), and JSON-encoded cookie values are rejected.
- **No leaks:** internal errors return a generic `500` with a request id; details are logged, never sent.

**Infrastructure**
- **MongoDB:** requires authentication, and the API uses a least-privilege `readWrite` user. Mongo is published on 127.0.0.1 only.
- **Containers:** non-root, `read_only`, all capabilities dropped, `no-new-privileges`, memory limits.
- **Headers:** helmet on the API. nginx adds a strict CSP, `frame-ancestors 'none'` and `Permissions-Policy`.
- **Fail-safe config:** the API refuses to start if required env vars are missing or weak, if it would send non-`Secure` cookies in production without an explicit override, or if Swagger is enabled in production without credentials.
- **API docs:** Swagger is on, behind HTTP Basic auth (constant-time comparison, a generated password of at least 16 characters). The docs reveal the whole API surface, so only people with the docs login can read them. Basic auth assumes TLS in front of nginx in a real deployment; set `SWAGGER_ENABLED=false` to remove the docs entirely.
- **Supply chain:**
  - `npm audit` gates production dependencies.
  - Trivy scans both images on every PR and before publishing.
  - CodeQL scans the code on every PR.
  - Published images carry build provenance and an SBOM.
  - Actions are pinned to commit SHAs, and Dependabot updates npm, actions and Docker images. See [CI/CD](#cicd).

### Known trade-offs

- **Sign-up reveals registered emails.** A duplicate email returns `409 EMAIL_ALREADY_REGISTERED`. Avoiding that needs email verification ("check your inbox"), which is out of scope. Rate limits reduce the risk.
- **Validation rules exist in both apps** (they are 4 rules) instead of a shared package. Both sides run the same edge cases in tests.
- **Rate-limit counters live in memory.** With several API instances, use a Redis store.
- **The per-email limit can lock an account out briefly.** Someone hammering a victim's email can block that account's sign-in for one minute. That is the usual trade-off for stopping distributed guessing.

## Data model

Every collection extends one **abstract base schema** (`apps/api/src/common/database/abstract.schema.ts`):

| Field | Meaning |
|---|---|
| `_id` | UUIDv4 string generated by the server (exposed as `id`) |
| `createdAt`, `updatedAt` | Maintained by Mongoose |
| `deletedAt` | Soft delete. A plugin hides soft-deleted documents from every find, update, count and aggregate unless the query opts in with `{ withDeleted: true }` |

> **Soft delete is groundwork, on purpose.** No endpoint deletes anything yet.
> - **Future endpoints get it for free:** a future delete-account endpoint, or any new entity that extends `AbstractSchema`, only has to call `Model.softDeleteById(id)`.
> - **Nothing to retrofit:** existing queries already ignore deleted records, and sign-in, `/users/me` and refresh already reject soft-deleted users. The e2e tests prove this.

- **`users`:** `email` (lowercased; a partial unique index over live accounts only, so a deleted account's email can be reused), `name`, and `passwordHash` (excluded from queries by default).
- **`refresh_tokens`:**
  - `userId`, `tokenHash` (unique) and `familyId` (one sign-in)
  - `expiresAt`, with a TTL index so MongoDB deletes expired tokens
  - `revokedAt`, `rotatedAt` and `familyRevokedAt`

## Logging

### One logger, one line format

Backend code logs only through **`AppLogger`** (`apps/api/src/common/logging/app-logger.ts`). A developer writes a meaningful message and, optionally, any extra fields:

```ts
private readonly logger = new AppLogger(AuthService.name);

this.logger.info('User signed in', { event: 'auth.signin.succeeded', userId });
this.logger.warn('Sign-in failed', { event: 'auth.signin.failed', reason, email: fingerprint(email) });
this.logger.error('Could not send email', error, { userId });
```

Every line, whether from application code or the access log, comes out in the same JSON shape:

```json
{"level":"info","time":"2026-11-26T20:30:12.869Z","service":"auth-api","env":"production",
 "correlationId":"b72af977-6bb7-49df-922c-0fef23907df6","context":"AuthService",
 "message":"User signed in","event":"auth.signin.succeeded","userId":"840e08a6-…"}
```

`AppLogger` guarantees:
- **Standard fields first:** `level`, `time` (ISO), `service`, `env`, `context`, `correlationId` and `message` are always present, and extra fields can't overwrite them.
- **Redaction by key name:** sensitive fields (`password`, `token`, `secret`, `cookie`, `authorization`, `apiKey`, …) are redacted at any depth.
- **Uniform errors:** they are serialized as `err: { type, message, code, stack }`.
- **Safe input:** dates, circular structures and very deep objects are all handled, and empty messages are rejected.

### Tracing: one UUIDv4 correlation id per request

```
browser ──request (no id)──▶ nginx ──▶ API: generates a new UUIDv4
        ◀──────── X-Correlation-Id + meta.correlationId ────────┘
                         every log line: "correlationId": "<same uuid>"
```

1. Only the API creates ids: a new UUIDv4 for every request, at the start of the request logger.
2. Any `X-Correlation-Id` sent by a caller is ignored, so an id can't be spoofed or used for log injection. The web app never sends one.
3. The id is bound to every log line written while the request is handled. That includes requests rejected early (403, 413, 415): the security middleware runs *after* the request logger for exactly this reason.
4. It is returned in the `X-Correlation-Id` header and in `meta.correlationId`. Error messages in the UI show it as "Reference: …", so a user report leads straight to the logs.

### Levels and events

Structured JSON logs in production, pretty logs in development.

| Level | Events |
|---|---|
| `info` | one access-log line per request (`POST /api/auth/signin → 200 in 12ms`), plus `auth.signup.succeeded`, `auth.signin.succeeded`, `auth.refresh.succeeded`, `auth.logout`, `auth.access_token.revoked_used` |
| `warn` | `auth.signin.failed` (with reason), `auth.refresh.reuse_detected`, `auth.refresh.inactive_user`, `auth.access_token.rejected`, duplicate sign-ups, plus one access-log line per 4xx |
| `error` | `http.unhandled_error`, with the stack trace |
| `debug` | step-by-step traces: handler entered and left with duration, password hashing, user lookup, token issue. Set `LOG_LEVEL=debug` when investigating |

- **Never logged:** passwords, tokens, cookies or auth headers. They are redacted or never logged.
- **Emails:** logged only as a 12-character fingerprint (part of a SHA-256 hash).

## CI/CD

### Branching: trunk-based, not one branch per environment

`main` is the only long-lived branch. Work happens on short-lived branches and reaches `main` through pull requests. Environments differ by **which already-tested image they run**, not by which branch they were built from.

```
feature branch ──PR──▶ CI + CodeQL ──merge──▶ main ──▶ CI ──▶ CD: build once, scan, publish ──▶ dev (automatic)
                                                                                                  │
                         release.yml (manual or GitHub Release) ── approval ──▶ same image ──▶ production
```

| Workflow | Runs on | What it does |
|---|---|---|
| `ci.yml` | **every pull request** (any branch) and every push to `main` | `npm audit` (blocking for production deps), lint, typecheck, tests with ≥95% coverage, build, Docker build + **Trivy** scan (fails on fixable HIGH/CRITICAL) |
| `codeql.yml` | every pull request, every push to `main`, weekly | CodeQL static security analysis of the TypeScript (`security-extended` queries) |
| `cd.yml` | after CI passes on `main` | builds each image **once**, scans that exact image, publishes it to GHCR tagged with the **commit SHA** (+ `main`) with provenance and an SBOM, then **deploys to `dev`** |
| `release.yml` | manually (with a commit SHA) or when a GitHub Release is published | after **approval**, re-tags the *same* SHA image as `production` (no rebuild; only commits on `main` that passed CD), then **deploys to `production`** |

**Why not a `dev` branch and a `main` branch?** Branch-per-environment setups drift apart (cherry-picks, merge-backs), and they ship a production build that is *different* from the one tested in dev. Trunk-based development with image promotion means:
- **Build once:** production runs byte-for-byte the image that passed every gate and ran in dev.
- **Releases are a decision, not a merge:** a person approves promoting a known SHA.
- **Rollback is just promoting an older SHA.**

> ⚠️ **Deployment is not wired to a cloud provider yet.**
> - **What works now:** CI, CodeQL, building, scanning and publishing images, and promotion between environments.
> - **What's a placeholder:** the `deploy-dev` and `deploy-production` jobs. They're clearly marked and print a warning, because this assessment has no hosting target.
> - **To go live:** wire both jobs to a provider (AWS ECS, Cloud Run, Azure Container Apps, Kubernetes, or a VM with compose). Authenticate through OIDC rather than long-lived secrets, and supply MongoDB, the env vars and TLS. The comments in `cd.yml` and `release.yml` show the provider commands.

### One-time GitHub setup (after creating the repository)

1. **Environments** (Settings → Environments):
   - **`dev`:** no protection rules, so every `main` build deploys automatically.
   - **`production`:** add **Required reviewers**, so every release waits for an approval.
2. **Protect `main`.** Require pull requests, at least one approval, and these passing checks: *Audit, lint, typecheck, test*, *Docker images (build + vulnerability scan)*, *Analyze TypeScript*. Block force pushes and deletion. With the GitHub CLI:
   ```bash
   gh api -X PUT repos/<owner>/<repo>/branches/main/protection --input - <<'JSON'
   { "required_status_checks": { "strict": true, "contexts": [
       "Audit, lint, typecheck, test (coverage ≥95%), build",
       "Docker images (build + vulnerability scan)",
       "Analyze TypeScript" ] },
     "enforce_admins": true,
     "required_pull_request_reviews": { "required_approving_review_count": 1 },
     "restrictions": null, "allow_force_pushes": false, "allow_deletions": false }
   JSON
   ```
3. **Packages:** GHCR images are private by default. Make them public, or grant your hosting provider pull access.

## Configuration

API environment variables, validated at startup (see `apps/api/.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `MONGO_URI` | (required) | refused in production if it still holds the `.env.example` placeholder |
| `JWT_ACCESS_SECRET` | (required) | at least 32 characters; refused in production if it is the `.env.example` placeholder |
| `JWT_ACCESS_TTL_SECONDS` | `900` | |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | |
| `REFRESH_REUSE_GRACE_SECONDS` | `10` | parallel tabs refreshing at once |
| `AUTH_RATE_LIMIT_PER_MINUTE` | `10` | per IP, sign-up/sign-in |
| `AUTH_ACCOUNT_RATE_LIMIT_PER_MINUTE` | `5` | per email, sign-in |
| `CORS_ORIGINS` | empty (CORS off) | comma-separated; only needed if the web app is on another origin |
| `TRUST_PROXY` | `false` | `true` behind a reverse proxy, so rate limits see the real client IP |
| `COOKIE_SECURE` | `true` in production | |
| `ALLOW_INSECURE_COOKIES` | `false` | allows `COOKIE_SECURE=false` in production, for a local http demo only |
| `SWAGGER_ENABLED` | `false` in production (`true` in docker compose) | |
| `SWAGGER_USERNAME` / `SWAGGER_PASSWORD` | unset | Basic-auth login for `/api/docs`. Required with Swagger in production; the password needs at least 16 characters (`make setup` generates it) |
| `ALLOW_DEMO_SEED` | unset | Lets `make seed` run against a production-mode build (local Docker demo only) |
| `LOG_LEVEL` | `info` | |
| `LOG_DIR` | unset (stdout only) | also write `LOG_DIR/YYYY/MM/YYYY-MM-DD.log` ([Logging](docs/logging-and-tracing.md#where-logs-are-kept)) |
| `PORT` | `3000` | |

## Code structure

```
Makefile                   make demo / dev / verify / seed / … (run `make help`)
docs/                      knowledge base for contributors (start at docs/README.md)
scripts/setup-env.mjs      creates .env files with generated secrets (idempotent)
docker/mongo/              MongoDB init: least-privilege app user
.github/workflows/         ci.yml (gates + image scan), codeql.yml (SAST), cd.yml (build once → dev), release.yml (promote → production)
apps/api/src
  seed.ts     demo-user seed entry point (logic in users/seed-users.ts)
  auth/       controller, service, global JWT guard, refresh-token rotation, access-token denylist, cookies, DTOs
  users/      user schema, service, GET /users/me
  common/
    database/ abstract base schema (UUID, timestamps, soft delete)
    http/     response envelope, error codes, AppException, Swagger helpers
    security/ cross-site request guard
    logging/  AppLogger (uniform log lines), request logging interceptor, email fingerprint
    correlation/ UUIDv4 correlation id generation (server-side only)
    filters/  global exception filter
  config/     env schema (zod), log line format (pino)
  health/     terminus health check
apps/web/src
  api/            http.ts (the one network layer), endpoint.ts (defineEndpoint), auth.ts, error codes
  features/auth/  sign-up / sign-in pages, zod schemas, hooks, password checklist
  routes/         route table, ProtectedRoute / GuestRoute
  pages/          welcome page, 404
  components/ui/  Button, TextField, Alert
```

## Testing

| | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| API (177 tests: unit + e2e) | 99.9% | 99.5% | 100% | 100% |
| Web (67 tests) | 100% | 99.3% | 100% | 100% |

`npm test` enforces **95% on every metric** in both apps, and CI runs it. Only bootstrap entry points (`main.ts`, `seed.ts`, `main.tsx`) and test helpers are excluded; their logic lives in tested modules.

- **API e2e:** boots the real app against an in-memory MongoDB. It covers:
  - every validation rule, and the error envelope for each error code
  - the full session lifecycle and refresh-token reuse detection
  - parallel-tab refresh and expired tokens
  - soft-deleted accounts
  - forged or mis-scoped JWTs and malformed cookies
  - CSRF (form bodies, cross-origin, `Sec-Fetch-Site`) and CORS
  - per-IP and per-account rate limits behind a proxy
  - log events containing no personal data
  - correlation ids: always generated by the API, a client-sent id ignored (including a log-injection attempt), present on every captured log line of a request (including early 403/413/415 rejections) and in the response
  - the uniform log line shape, checked on the real JSON output
  - logout invalidating a copied access token immediately
  - oversized and malformed bodies, Swagger on and off, security headers
- **Web:**
  - the API layer: URL building, every HTTP method, envelope unwrapping, error, network and abort handling, single-flight refresh
  - correlation ids: never sent; read from the envelope or the response header, and absent when the API never answered
  - endpoint definitions
  - every page flow through the real router
  - route guards, including the outage screen and retry
  - error messages for each code

## Design evolution (review-driven changes)

The first version met the brief. Everything below was added or changed after I reviewed it. The full reasoning is in [AI.md](AI.md#what-i-asked-for-after-the-first-version).

| # | Area | Review feedback | What changed |
|---|---|---|---|
| 1 | Process | Plan first, in a Markdown file I approve before any code | Written plan, approved, then built test-first |
| 2 | Process | Reuse my own agent skills | Copied and adapted to this stack; kept local (they reference private systems) |
| 3 | Design | Why Mongoose and not Postgres? | The brief requires MongoDB; Mongoose is the best-supported MongoDB library for Nest |
| 4 | Quality | Review the whole codebase | 9 findings: 6 fixed, 2 minor ones fixed, 1 accepted |
| 5 | Testing | ≥95% coverage on all branches | Enforced in both apps and in CI; currently 99%+ everywhere |
| 6 | Schema | Abstract base model with `createdAt`, `updatedAt`, `deletedAt` | `AbstractSchema` + soft-delete query plugin + partial unique email index |
| 7 | Schema | UUIDv4 ids | Server-generated UUIDv4 `_id` on every collection |
| 8 | Security | Check the OWASP Top 10 | Independent audit, all findings fixed (CSRF, MongoDB auth, logging, dependencies, JWT claims, rate limits, hardening) |
| 9 | Unification | Same success/error response shape in BE and FE | `{ success, data, meta }` / `{ success, error, meta }`, stable error codes, mirrored types in the web app |
| 10 | Observability | Logging at every step of every BE endpoint | Handler start and finish traces + domain events + access log |
| 11 | Unification | One reusable API layer in the web app | `request()` core + `defineEndpoint` declarations |
| 12 | Delivery | Keep changes local, no commits | Later work is left uncommitted for you to publish under your own account |
| 13 | Observability | UUIDv4 correlation id from client to response, on every log line | Generated per call in the browser, validated or generated by the API, bound to every log line, returned in header and meta |
| 14 | Observability | One logging component with a uniform format | `AppLogger`: message + extra fields, fixed line shape, automatic redaction and error serialization |
| 15 | Security | Logout: in-memory denylist instead of storing tokens; I pushed back | **Hybrid:** refresh tokens stay revocable in MongoDB (rotation, theft detection, revocation that survives restarts); the access token's `jti` goes on a denylist with expiry (in memory, Redis in production) |
| 16 | Docs | Make all of this visible to reviewers | This table, plus the System design and feedback sections in AI.md |
| 17 | Delivery | Basic CD, not just CI | `cd.yml` publishes the API and web images to GHCR after CI passes on `main` |
| 18 | Delivery | One command for local setup that also seeds the database | `Makefile` (`make demo`, `make dev`, `make verify`, …) + secret-generating `scripts/setup-env.mjs` + idempotent seed |
| 19 | Security | Swagger on, but not open to anyone once deployed | Basic auth with generated credentials; required by the API's config in production |
| 20 | Docs | A short entry point for reviewers | "For reviewers, in 30 seconds" boxes at the top of README and AI.md |
| 21 | Schema | Make the unused soft delete intentional | Documented as groundwork for a delete-account endpoint and future entities |
| 22 | Delivery | CI/CD with `dev` and `main` deploys, tests on any PR. Is that best practice? | I recommended **trunk-based delivery with image promotion** instead of environment branches. We adopted it: CI on every PR → build once on `main` → auto-deploy to `dev` → approved promotion of the same image to `production`. The deploy steps are placeholders until a cloud provider is wired up |
| 23 | Security | Strengthen the pipeline | CodeQL on every PR; Trivy image scanning in CI and before publishing; provenance and SBOM on images. The first Trivy run found fixable HIGH/CRITICAL CVEs in the base images. They were fixed: npm removed from the API runtime image, `apk upgrade` added, nginx moved to 1.31 mainline |
| 24 | Docs | A knowledge base new developers can follow | [`docs/`](docs/README.md): architecture, data model + ERD, auth sequence diagrams, API and frontend conventions, logging/tracing, testing, infrastructure, security checklist, contributing guide. AI.md lists the agent skills that help contributors |
| 25 | Production readiness | PR template, startup env checks, double-submit spinner, auto refresh and sign-out, server-only correlation ids, log storage, git hooks, extensibility, `timingSafeEqual` on login | Added: a PR template for API and web changes, startup refusal of `.env.example` placeholders in production, sign-out with a "session expired" notice when a refresh is refused, correlation ids generated only by the API (a client-sent id is ignored, the web app no longer sends one), daily log files (`LOG_DIR/YYYY/MM/YYYY-MM-DD.log`), husky + lint-staged + commitlint, and extension recipes in [Architecture](docs/architecture.md#extending-it). Vercel deployment was discussed but not added. Already in place, now covered by tests or explained: the double-submit guard, and constant-time password checks. `argon2.verify` already uses `crypto.timingSafeEqual`, and the dummy hash equalises unknown-email timing, so a separate comparison would add nothing |

## Out of scope / next steps

Email verification and password reset · OAuth / SSO · breached-password checks · a delete-account endpoint (soft delete is implemented in the model and service) · roles and permissions · Playwright end-to-end tests in CI · a Redis store for rate limits and the access-token denylist (needed before running several API instances).
