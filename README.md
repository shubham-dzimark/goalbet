# GoalBet — football betting platform (MVP)

Football only · RON wallet (admin controlled) · Romanian & English. "GoalBet" is a placeholder brand: rebrand in `packages/ui/src/brand/` (`tokens.css` + `brand.ts`).

| App | URL | Stack |
| --- | --- | --- |
| Player site | http://localhost:3000 | Next.js 16, React 19, Tailwind 4, next-intl, TanStack Query, Motion / GSAP / React Three Fiber |
| Admin | http://localhost:3001 | Next.js 16 (separate app, TOTP 2FA, roles) |
| API / betting engine | http://localhost:4000/docs | NestJS 12, Prisma 7, PostgreSQL, Redis, Socket.IO |
| Worker | — | BullMQ jobs: odds ingest, live updates, feed watchdog, settlement, reconciliation |

## What it does

- **Players:** browse competitions and matches (pre-match and live, many market groups), bet slip with singles, accumulators and Bet Builder, live bets with a bet delay, odds-change preference, cash out, My Bets, wallet history, deposit / withdrawal *requests*, stake and deposit limits, reality check, self-exclusion. Live scores and odds arrive over WebSocket.
- **Back office:** dashboard, players (edit, suspend, limits, credit / debit with four-eyes approval above a threshold), Finance queue for deposits and withdrawals, bets, sportsbook settings (leagues, market types, single markets, event suspension, limits), manual settlement with scorers, re-settlement of a wrong result, reports with CSV, audit log, admin accounts, data provider and API key, outgoing email (SMTP) settings.
- **Engine:** every price comes from the backend; bets validated in flow-chart order; append-only ledger with row-locked balance changes and idempotency keys; automatic settlement with WIN / REFUND exactly once; hourly money reconciliation.

The flow chart `football-betting-app-workflow.jpg` is the spec: [docs/FLOWCHART_TRACEABILITY.md](docs/FLOWCHART_TRACEABILITY.md) maps every box to code and tests.

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
pnpm db:seed                                     # saves admin logins to seed-credentials.txt (gitignored)
pnpm dev
```

Whole stack in containers: `docker compose up --build`, then `docker compose exec api node dist/seed.js`.

**Admin sign-in:** seeded admins have no authenticator yet, so the first login shows a QR code to scan. Lost phone or password: `pnpm --filter @goalbet/api admin:access [--email you@x] [--rotate-passwords]`.

**Money for testing:** players start at 0 RON. Credit them in the admin (Players → player → Add credit) or let them request a deposit and approve it under Wallet → Player requests.

## Tests

```bash
pnpm test                        # shared unit + API integration (+ i18n key parity)
pnpm lint && pnpm typecheck

pnpm --filter @goalbet/e2e prepare-stack            # once (add --rebuild after web/admin changes)
pnpm --filter @goalbet/e2e e2e                      # Playwright, desktop 1440 px + mobile 375 px
```

- API integration tests use `TEST_DATABASE_URL` / `TEST_REDIS_URL` when set (environment, or `apps/api/.env.test`, see `.env.test.example`), otherwise Testcontainers.
- **E2E** runs on its own stack (`e2e/stack.mjs`): database `goalbet_e2e`, Redis DB 3, API :4400, web :3400, admin :3401, mock feed. `prepare-stack` recreates the database and builds web/admin into `.next-e2e`; Playwright then starts everything itself and creates one admin per role. Your development data is never touched. Specs cover registration, RO/EN, pre-match / live / accumulator / Bet Builder bets, cash out, deposits and withdrawals with Finance approval (incl. four-eyes), manual credits, manual settlement, reports and audit, roles, responsible gambling tools and responsive layouts.

## Data providers

The engine talks to one `OddsProvider` interface (`apps/api/src/modules/api-integration/odds-provider.ts`), chosen in **Admin → Data provider** (Super admin; switching needs no restart) with `ODDS_PROVIDER` in `.env` as the fallback:

| Provider | Use |
| --- | --- |
| `mock` | Deterministic simulated feed: 7 competitions, 7 days of fixtures, always 3–5 live matches, results. Test controls under `/dev/mock/*` when `MOCK_CONTROL_ENABLED=true`. |
| `api-football` | Real fixtures, scores and odds from API-Football (api-sports.io). The free plan covers a limited range of seasons and 100 calls/day; the client spends the budget carefully and caches live data. Key stored encrypted in the database. |
| your feed | Copy `api-integration/template/provider.template.ts`, implement it, register it in `ProviderRouter.build`. The template lists the rules the engine relies on (market keys, odds format, suspensions, official results). |

## Deployment notes

- Always-on hosts (VM, Docker, Kubernetes): the API is stateless and scales horizontally (every instance relays the Redis update channels to its own sockets; enable sticky sessions on the load balancer for Socket.IO's polling fallback), one or more workers (BullMQ guarantees one run per job tick), PostgreSQL, Redis. Images: `Dockerfile` targets `api`, `worker`, `web`, `admin` (see `docker-compose.yml`).
- Serverless (Vercel): `JOBS_MODE=on-request` refreshes data on visits and `/cron/refresh` + `/cron/settle` replace the worker; no WebSocket (the site falls back to polling). See `apps/api/vercel.json`.
- Production checklist: unique secrets (`JWT_*`, `CRON_SECRET`), `COOKIE_SECURE=true`, `MOCK_CONTROL_ENABLED=false`, real bank details (`PAYMENT_BANK_*`), an SMTP provider for password-reset emails (set in **Admin → Email**, or `SMTP_URL` / `MAIL_FROM` as a fallback), HTTPS everywhere, database backups and point-in-time recovery, log shipping (`SENTRY_DSN`), and alerting on `LEDGER_MISMATCH`, `HOLD_MISMATCH`, `FEED_STALLED` and `JOB_FAILED` audit events.
- With `NODE_ENV=production` the API **refuses to start** with example or shared JWT secrets, `COOKIE_SECURE=false` or `MOCK_CONTROL_ENABLED=true`, and warns about demo bank details, missing SMTP and missing Sentry. The local `docker compose` demo opts out with `ALLOW_INSECURE_LOCAL=true` — never set that on a real deployment.

## Real money in Romania — what this MVP does not cover

This codebase is a technical MVP. Taking real bets from players in Romania is regulated gambling. Before going live, get legal advice; the list below is a starting point, not legal advice.

- **Licence (ONJN).** Online betting requires a licence and operating authorisation from the National Gambling Office (Oficiul Național pentru Jocuri de Noroc, [onjn.gov.ro](https://onjn.gov.ro)) under OUG 77/2009 and its implementing rules: a Romanian or EU legal entity, guarantees and fees, certified software and RNG/betting platform audits, a `.ro` site, servers / data replication that ONJN can access, and reporting of bets and payouts. Only licensed operators may advertise; unlicensed sites are blacklisted and blocked.
- **KYC.** Players must be identified and their age (18+) verified: full name, CNP or ID number, address, ID document check (and a liveness / selfie check), before withdrawals at the latest and usually within a limited time after registration. GoalBet only checks the date of birth the player enters. Add an identity-verification provider and an account status (unverified / verified / blocked), and keep the evidence.
- **AML / CFT.** Gambling operators are reporting entities under the anti-money-laundering law (Legea 129/2019): risk-based customer due diligence (enhanced for high-value players and politically exposed persons), sanctions screening, source-of-funds checks above thresholds, monitoring for suspicious patterns (deposits withdrawn without betting, many small deposits, matched betting), suspicious-transaction reports to ONPCSB, record keeping for at least five years, a designated AML officer and staff training. The audit log, append-only ledger and Finance approval queue here are a foundation, not a compliance programme.
- **Payments.** Real deposits and withdrawals must go through accounts held by the licensed operator, to and from accounts in the player's own name (no third-party payments). Card / e-wallet processing needs a payment provider that accepts gambling merchants. Here every movement is a request approved by Finance.
- **Responsible gambling.** Required tools exist (deposit and stake limits with cooling-off, reality check, self-exclusion, help links, 18+), but the operator must also connect to the national self-exclusion and player-protection requirements set by ONJN, show the licence number and the responsible-gambling notices on every page, and handle complaints.
- **Taxes and data protection.** Tax on winnings withheld at payout and operator taxes are not calculated here. Player data is personal data under GDPR: privacy notice, lawful bases, retention periods, data-subject requests, and a DPIA for profiling (risk scoring).
- **Integrity.** Monitoring of suspicious betting patterns and cooperation with sports integrity bodies is expected of licensed operators; the reports here are not a betting-integrity system.

## Docs

- [docs/FLOWCHART_TRACEABILITY.md](docs/FLOWCHART_TRACEABILITY.md) — every flow chart box → code → tests
- [docs/PROGRESS.md](docs/PROGRESS.md) — phase status and how to try each phase
- [docs/DECISIONS.md](docs/DECISIONS.md) — choices not covered by the brief
