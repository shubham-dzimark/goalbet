# GoalBet — football betting platform (MVP)

Football only · RON wallet (admin controlled) · Romanian & English. "GoalBet" is a placeholder brand: rebrand in `packages/ui/src/brand/` (`tokens.css` + `brand.ts`).

| App | URL | Stack |
| --- | --- | --- |
| Player site | http://localhost:3000 | Next.js 16, React 19, Tailwind 4, next-intl |
| Admin | http://localhost:3001 | Next.js 16 (separate app, TOTP 2FA) |
| API / betting engine | http://localhost:4000/docs | NestJS 12, Prisma 7, PostgreSQL, Redis |
| Worker | — | BullMQ jobs (odds ingest, live updates, …) |

## Quick start

Requirements: Node ≥ 22.12, pnpm 12 (`npm i -g pnpm@12`), and either Docker or local PostgreSQL 16+ and Redis 7+.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # then set two random JWT secrets

# Postgres + Redis — pick one
docker compose up -d postgres redis              # then use the docker URLs from .env.example
bash scripts/local-services.sh start            # no Docker: project-local Postgres :5434 + Redis :6379

pnpm build
pnpm db:migrate
pnpm db:seed                                     # prints + saves logins to seed-credentials.txt (gitignored)
pnpm dev
```

Whole stack in containers: `docker compose up --build`, then `docker compose exec api node dist/seed.js`.

## Tests

```bash
pnpm test        # unit + API integration (+ i18n key parity)
pnpm lint && pnpm typecheck
```

API integration tests use `TEST_DATABASE_URL` / `TEST_REDIS_URL` when set (environment, or `apps/api/.env.test`, see `.env.test.example`). Otherwise they start PostgreSQL and Redis with Testcontainers.

## Docs

- [docs/FLOWCHART_TRACEABILITY.md](docs/FLOWCHART_TRACEABILITY.md) — every flow chart box → code → tests
- [docs/PROGRESS.md](docs/PROGRESS.md) — phase status and how to try each phase
- [docs/DECISIONS.md](docs/DECISIONS.md) — choices not covered by the brief
