# One-command workflows for this repo. Run `make` (or `make help`) to list them.
#
#   make demo     everything from scratch: setup, start the Docker stack, seed the demo user
#   make dev      local development: MongoDB in Docker, API + web in watch mode, seeded
#   make verify   what CI runs: audit, lint, typecheck, tests with coverage, build

SHELL := /bin/bash
.DEFAULT_GOAL := help

APP_URL := http://localhost:8080
DEMO_EMAIL := demo@example.com
# Must match DEMO_USERS in apps/api/src/users/seed-users.ts (`$$` is make's escape for one `$`).
DEMO_PASSWORD := Demo$$ecret1

.PHONY: help demo setup check-tools install env up seed dev seed-dev \
        verify audit lint typecheck test test-e2e build logs ps down reset

help: ## List the available commands
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# ── First run ──────────────────────────────────────────────────────────────────

demo: setup up seed ## Everything from scratch: setup, Docker stack, demo user
	@echo ""
	@echo "  Ready:    $(APP_URL)"
	@# Single quotes: the password contains `$`, which the shell would expand inside double quotes.
	@echo '  Sign in:  $(DEMO_EMAIL) / $(DEMO_PASSWORD)'
	@echo "  API docs: $(APP_URL)/api/docs  (user 'docs', password = SWAGGER_PASSWORD in .env)"

setup: check-tools install env ## Check tools, install dependencies, create .env files with secrets

check-tools: ## Verify Node 22+, npm and Docker (with compose) are installed and running
	@node -e "const [major] = process.versions.node.split('.').map(Number); if (major < 22) { console.error('Node 22+ is required (found ' + process.version + '); see .nvmrc'); process.exit(1); }"
	@command -v npm >/dev/null || { echo "npm is required"; exit 1; }
	@command -v docker >/dev/null || { echo "Docker is required: https://docs.docker.com/get-docker/"; exit 1; }
	@docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required"; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "Docker is installed but not running: start Docker Desktop"; exit 1; }
	@echo "tools: ok (node $$(node -v), $$(docker compose version --short 2>/dev/null | sed 's/^/compose /'))"

install: ## Install all workspace dependencies from the lockfile
	npm ci

env: ## Create or complete .env and apps/api/.env (generated secrets, never printed)
	@node scripts/setup-env.mjs

# ── Docker stack (production-like, http://localhost:8080) ─────────────────────

up: env ## Build and start MongoDB, API and web; waits until all are healthy
	docker compose up -d --build --wait

seed: ## Create the demo user in the running Docker stack (idempotent)
	docker compose exec -T -e ALLOW_DEMO_SEED=true api node dist/seed.js

logs: ## Follow the API logs (JSON, one line per event, with correlation ids)
	docker compose logs -f api

ps: ## Show container status
	docker compose ps

down: ## Stop the stack (keeps the database)
	docker compose down

reset: ## Stop the stack AND delete the database volume (asks first)
	@read -r -p "This deletes all local MongoDB data. Type 'yes' to continue: " answer; \
		[ "$$answer" = "yes" ] && docker compose down -v || echo "aborted"

# ── Local development (hot reload) ────────────────────────────────────────────

dev: env ## MongoDB in Docker + API (:3000) and web (:5173) in watch mode, seeded
	docker compose up -d --wait mongo
	$(MAKE) seed-dev
	npm run dev

seed-dev: ## Create the demo user against the local dev API config (idempotent)
	npm run seed -w apps/api

# ── Quality gates (same as CI) ────────────────────────────────────────────────

verify: audit lint typecheck test build ## Everything CI runs

audit: ## Fail on high-severity vulnerabilities in production dependencies
	npm audit --omit=dev --audit-level=high

lint: ## ESLint in both apps
	npm run lint

typecheck: ## TypeScript in both apps
	npm run typecheck

test: ## All tests with coverage (fails below 95%)
	npm test

test-e2e: ## API end-to-end tests only (in-memory MongoDB)
	npm run test:e2e

build: ## Production builds of both apps
	npm run build
