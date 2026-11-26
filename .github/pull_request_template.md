## What and why

<!-- One or two sentences: the behaviour that changes, who sees it (visitor, signed-in user, API client), and why. Link the issue. -->

Closes #

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor (no behaviour change)
- [ ] Tests / docs / tooling only

**Touches:** <!-- delete what doesn't apply --> API · Web · Infra / CI

## How it was verified

<!-- Commands you ran and what you checked by hand. Paste output where useful. -->

- [ ] `make verify` passes locally (audit, lint, typecheck, tests with coverage ≥95%, build)
- [ ] New behaviour has tests; each bug fix has a test that fails without the fix
- [ ] Tried it locally (`make dev`): <!-- what you clicked or curled -->

## API changes (delete if none)

- [ ] Endpoint, DTO or response shape changes are reflected in the Swagger decorators
- [ ] New error codes are added to `ErrorCode` and documented in `docs/api-conventions.md`
- [ ] New routes are protected by default; any `@Public()` is intentional and explained below
- [ ] Validation rules changed in a DTO are mirrored in the web zod schema (and vice versa)
- [ ] Schema / index changes: existing data still works, or the migration is described below
- [ ] Unit specs and e2e specs (`test/*.e2e-spec.ts`) cover the new paths, including the failure ones
- [ ] No secrets, tokens, passwords or raw emails in logs or responses

## Web changes (delete if none)

- [ ] API calls go through `src/api` (`defineEndpoint`); server state uses TanStack Query hooks
- [ ] Loading, error and empty states are handled; submit buttons can't double-submit
- [ ] Accessible: labelled inputs, errors linked with `aria-describedby`, keyboard-usable
- [ ] Tests use the real router (`renderApp`) and MSW handlers

**Screenshots or recording** (UI changes):

| Before | After |
| ------ | ----- |
|        |       |

## Configuration and deployment (delete if none)

- [ ] New env vars are validated in `apps/api/src/config/env.ts`, added to `.env.example` and documented in the README
- [ ] Set in every environment that needs them (local `.env`, docker compose, GitHub environments and secrets)
- [ ] Rollout or rollback steps, if any:

## Security

- [ ] The security checklist in `docs/security.md` ("Checklist for every change") holds
- [ ] Auth, cookie, CORS, guard or `ValidationPipe` settings are unchanged, or the change is explained below

## Notes for the reviewer

<!-- Trade-offs, anything not verified, follow-ups, where to start reading. -->
