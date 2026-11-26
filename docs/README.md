# Knowledge base

Everything a developer needs to understand this codebase and contribute to it. Each page is short. Start at the top and follow the order.

## Your first hour

1. **Run it.** From the repo root, `make demo`. Open http://localhost:8080 and sign in as `demo@example.com` / `Demo$ecret1`.
2. **Read [Architecture](architecture.md).** The big picture and how a request flows (10 minutes).
3. **Read [Contributing](contributing.md).** The workflow, the conventions and the PR checklist.
4. **Run the gates.** `make verify` runs exactly what CI runs.

## Pages

| Page | Read it when… |
|---|---|
| [Architecture](architecture.md) | you want the big picture: components, modules, request lifecycle |
| [Data model](data-model.md) | you touch MongoDB: ERD, collections, indexes, base schema, soft delete |
| [Auth flows](auth-flows.md) | you touch sign-up, sign-in, sessions or logout (sequence diagrams) |
| [API conventions](api-conventions.md) | you add or change an endpoint: envelope, error codes, step-by-step checklist |
| [Frontend](frontend.md) | you touch the web app: structure, the API layer, forms, routing |
| [Logging and tracing](logging-and-tracing.md) | you log something, or need to debug a production issue |
| [Testing](testing.md) | you write tests: layers, helpers, coverage rules |
| [Infrastructure](infrastructure.md) | you touch Docker, nginx, env config or CI/CD || [Security](security.md) | you touch auth, input handling or config; a checklist of the rules we keep |
| [Contributing](contributing.md) | before your first PR: workflow, code conventions, commit style |

## Where things are

```
apps/api/      NestJS API        → src/auth, src/users, src/common (shared building blocks), src/config
apps/web/      React web app     → src/api (network layer), src/features, src/routes, src/pages
docs/          this knowledge base
Makefile       every command you need (`make help`)
```

Design decisions and their trade-offs are recorded in [AI.md → System design](../AI.md#system-design).
