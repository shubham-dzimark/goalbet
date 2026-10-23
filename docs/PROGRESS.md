# Progress

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Monorepo, Docker, schema + migrations, seed, auth (F1.2, F1.3, F3.1), i18n (F0.3), tokens, MockProvider (F4.1), module skeleton (F4.2) | ✅ Done |
| 2 | Homepage + browsing (F1.1, F1.4, F1.5, F1.9), bet slip (F1.12), normal bets (F1.10), validate/reject/create (F1.13–F1.15), wallet + My Bets (F1.7, F1.8) | ⏭ Next |
| 3 | Admin app (F3.2–F3.8) | — |
| 4 | Live (F1.6, F2.1, F2.2), WebSocket + Redis pub/sub, live delay, feed-stall safety | — |
| 5 | Cash out (F2.3–F2.7), settlement + payout + credit (F2.8–F2.11), reconciliation | — |
| 6 | Bet Builder (F1.11), sportsbook settings (F3.5), reports + exposure (F3.6) | — |
| 7 | Responsive polish, responsible gambling, provider skeleton, all E2E, README | — |

## Phase 1 — what was built

- **Monorepo:** pnpm 12 + Turborepo; `apps/{web,admin,api,worker}`, `packages/{shared,ui,db}`; ESLint, Prettier, strict TS; GitHub Actions CI (build, lint, typecheck, tests with Postgres + Redis services).
- **Database:** full Prisma schema from the brief, plus sessions, password resets, idempotency records and market-type settings. DB guards: balance ≥ 0, append-only ledger and audit log.
- **Shared maths (pure, tested):** money (bani, RO/EN formatting), odds, accumulator odds, payout incl. void/half results, cash-out formula, settlement rules for every market (Asian quarter lines), Bet Builder contradictions + fallback pricing, Zod schemas, error codes, shared RO/EN messages.
- **API (NestJS 12, Swagger at /docs):** player register/login/refresh/logout/forgot/reset, `GET/PATCH /me`; admin login with TOTP (enrolment, replay protection, lockout, idle timeout); Redis-backed rate limits; Helmet; typed errors; transaction-aware audit service; settings service; idempotency service (ready for phase 2); health.
- **Odds provider:** `OddsProvider` interface, deterministic `MockProvider` (7 competitions, 7 days, 3–5 live, events, drift, suspensions, results, test controls), `ApiFootballProvider` skeleton.
- **Ingest + worker:** fixtures/markets/odds/live scores into Postgres with OddsHistory and Redis pub/sub; BullMQ jobs `fixtures-sync` (5 min), `prematch-odds` (60 s), `live-sync` (2 s); job failures audited.
- **Seed:** one admin per role (+ a second finance admin for approvals) with TOTP pre-enrolled, 3 players at 0 RON, default settings, fixtures + live matches.
- **Web (Next.js 16):** RO/EN routing, GoalBet header (Sport/Live/My Bets, search, RO/EN, login/register or balance chip), mobile bottom nav, footer (18+), login/register/forgot/reset pages, account page, homepage layout shell.
- **Admin (Next.js 16):** 2FA login (password → code, or QR enrolment), protected shell with module navigation, RO/EN, session-timeout handling.

**Tests:** 74 unit (shared) · 29 API integration · 4 i18n parity (web + admin). All green.

## How to try phase 1

```bash
pnpm install
bash scripts/local-services.sh start    # or: docker compose up -d postgres redis
pnpm build
pnpm db:migrate && pnpm db:seed         # credentials → seed-credentials.txt
pnpm dev                                # web :3000 · admin :3001 · api :4000/docs · worker
```

- Register at http://localhost:3000/ro/register (try an under-18 date or a taken email), log in, switch RO/EN.
- http://localhost:3001: sign in with an admin from `seed-credentials.txt`. Add the TOTP secret to an authenticator app, or paste the `otpauth://` URI into one.
- http://localhost:4000/docs: every endpoint, including `/dev/mock/*` to drive the mock feed.
