# Contributing

## Setup (once)

Prerequisites: **Node 22+** (`.nvmrc`), **Docker** (running) and `make`.

```bash
make setup     # checks tools, npm ci, creates .env files with generated secrets
make dev       # MongoDB + API (:3000) + web (:5173) with hot reload, demo user seeded
```

Demo login: `demo@example.com` / `Demo$ecret1`. API docs: http://localhost:3000/api/docs.

`npm ci` also installs the git hooks (husky):

| Hook | Runs | Blocks on |
|---|---|---|
| `pre-commit` | ESLint `--fix` and Prettier on the staged files only (`.lintstagedrc.json` per workspace) | any lint error or warning |
| `commit-msg` | commitlint | a message that isn't Conventional Commits with the types and scopes below |
| `pre-push` | `npm run typecheck` (whole repo) | type errors |

Tests are not in a hook (too slow to run on every commit); `make verify` and CI run them.

## Workflow

We work **trunk-based**: `main` is the only long-lived branch and is always releasable.

1. **Branch from `main`:** `feat/<short-name>`, `fix/<short-name>`, `chore/…`, `docs/…`.
2. **Keep it small:** one behaviour per PR where possible. Small PRs get reviewed faster and break less.
3. **Test first** (see [Testing](testing.md)), then implement.
4. **Before pushing:** run `make verify`, the exact gates CI runs.
5. **Open a PR to `main`.** CI and CodeQL must pass, and one approval is required.
6. **After merge,** CD deploys to `dev` automatically. Production is a separate, approved promotion ([Infrastructure](infrastructure.md#cicd)).

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org): `type(scope): what changed, in the imperative`.

```
feat(auth): revoke the access token immediately on logout
fix(web): keep the post-sign-in redirect when the form unmounts
test(api): cover expired refresh tokens
```

Types: `feat`, `fix`, `test`, `docs`, `refactor`, `perf`, `chore`, `build`, `ci`, `revert`. Scopes (optional): `api`, `web`, `auth`, `users`, `infra`, `deps`. Use the body to explain *why* when it isn't obvious. The `commit-msg` hook enforces this ([`commitlint.config.mjs`](../commitlint.config.mjs)).

## Code conventions

**General**
- **TypeScript strict everywhere.** No `any`; use `unknown` and narrow it. No non-null `!` unless you can say why it can't be null.
- **Formatting is automatic:** Prettier (single quotes, trailing commas, 100 columns) and ESLint (type-aware in the API). Don't hand-format; don't argue with the formatter.
- **Comments explain *why*, not *what*.** A good comment states a constraint or a decision ("registered after the logger so rejected requests still get a correlation id").
- **Prefer small, pure functions** and early returns over nested `if`s.
- **No secrets, personal data or magic numbers in code.** Use config, constants or named values.

**API (NestJS)**
- **One feature, one module.** Controllers stay thin (HTTP in and out); services hold the logic.
- **Inputs:** DTOs with class-validator decorators.
- **Outputs:** plain data mapped to a public type. The envelope is added for you.
- **Errors:** throw `AppException` with an `ErrorCode`. Never `res.status().json()` by hand.
- **Logging:** `AppLogger` only (see [Logging and tracing](logging-and-tracing.md)).
- **Config:** `@InjectAppConfig()` only. Never read `process.env` outside `env.ts`.
- **Persistence:** models extend `AbstractSchema` and are built with `createSchema()` (see [Data model](data-model.md)).
- **File names:** `kebab-case.<role>.ts` (`users.service.ts`, `sign-up.dto.ts`). Tests sit next to the code as `*.spec.ts`, e2e tests in `test/`.

**Web (React)**
- **Function components and hooks only.** Components are `PascalCase.tsx`; everything else is `camelCase.ts`.
- **Network:** through `src/api` only (`defineEndpoint`). Server state goes in TanStack Query hooks inside the feature.
- **Forms:** react-hook-form + a zod schema that mirrors the API's rules.
- **Accessibility:** every input has a label, errors are linked with `aria-describedby`, and buttons have text.
- **Tests:** next to the code as `*.test.tsx`, going through the real router (`renderApp`).

**Naming**
- **Log events:** `domain.action.outcome`.
- **Error codes:** `SCREAMING_SNAKE`.
- **Booleans** read as questions (`isPublic`, `hadSession`).

## Pull request checklist

Opening a PR pre-fills [the template](../.github/pull_request_template.md), with sections for API, web and configuration changes; delete the ones that don't apply. The essentials:

- [ ] `make verify` passes locally (audit, lint, typecheck, tests with coverage ≥95%, build).
- [ ] New behaviour has tests; security-relevant changes have a revert proof.
- [ ] API changes: Swagger decorators updated; error codes documented in [API conventions](api-conventions.md).
- [ ] New env vars: validated in `env.ts`, documented in `.env.example` and the README.
- [ ] The [security checklist](security.md#checklist-for-every-change) holds.
- [ ] Docs updated if you changed how something works (this knowledge base, README).

## Using AI assistants

AI-assisted contributions are welcome under the same rules: you own every line, tests come first, and nothing counts as done without fresh `make verify` output. [AI.md](../AI.md#agent-skills-for-contributors) lists the agent skills that fit this codebase.
