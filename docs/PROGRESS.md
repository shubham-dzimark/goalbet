# Progress

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Monorepo, Docker, schema + migrations, seed, auth (F1.2, F1.3, F3.1), i18n (F0.3), tokens, MockProvider (F4.1), module skeleton (F4.2) | ✅ Done |
| 2 | Homepage + browsing (F1.1, F1.4, F1.5, F1.9), bet slip (F1.12), normal bets (F1.10), validate/reject/create (F1.13–F1.15), wallet + My Bets (F1.7, F1.8) | ✅ Done |
| 3 | Admin app (F3.2–F3.8) | ⏭ Next |
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

## Phase 2 — what was built

- **Catalogue API** (`/catalog/*`, public): home feed (Top Live, Top matches, boosted odds, top competitions, live count), countries → competitions, competition matches, next-24 h list, live list, match page with every market, search, and selection refresh for the slip. Disabled competitions, markets and market types are never shown.
- **Betting engine:** `POST /bets` (Idempotency-Key) validates in flow-chart order. Rejections return a typed code, move no money and are logged as `BetAttempt` + audit. Success creates the ticket and STAKE ledger entry in one row-locked transaction. Live bets wait the bet delay and are re-validated. Plus My Bets endpoints.
- **Wallet ledger:** single balance writer with `SELECT … FOR UPDATE`, history with type/date filters, reconciliation (`reconcile()`). Admin credit/debit backend with required reason and second-admin approval above the threshold.
- **Account:** dashboard data, profile and odds-change preference, self-limits (24 h cooling-off on increases), self-exclusion.
- **Ingest:** finished/cancelled matches leave the catalogue immediately (markets suspended), with a sweep for stale live events; demo boosted odds.
- **Web:** homepage (Top Live carousel, boosted odds, top matches, top competitions), competitions sidebar, all-football page, competition page (by date), live page, match page (all market tabs, line tables, scorers by team, correct-score grid), search. Bet slip with Single / Accumulator / Bet Builder tabs, quick stakes, odds preference, price refresh with up/down flash, accept new odds, guest persistence, mobile floating bar + bottom sheet. My Bets (Active / Settled / Cash Out history + detail), wallet history with filters, account dashboard.
- **Fixes:** the `Button asChild` crash that broke every page for guests after load; self-hosted fonts (Turbopack dev could not load Google fonts); mock prices stay open during stoppage time; no horizontal scroll at 375 px.

**Tests:** 74 unit · 53 API integration · 4 i18n parity. All green. UI checked in Chromium at 1440 px and 375 px (scripted screenshots).

## How to try phase 2

1. Start everything as below, then give a player money (admin screens come in phase 3). Either use Swagger at http://localhost:4000/docs (`POST /admin/auth/login` with an admin from `seed-credentials.txt`, then `POST /admin/users/{id}/wallet`), or use the player I already credited in local testing: `player1@goalbet.local` / `Parola1234`.
2. http://localhost:3000: click odds on the homepage or a match page to fill the slip, switch to **Combinat** (accumulator), pick a quick stake, then **Plasează pariul**.
3. Check **Pariurile mele**, the balance chip, **Portofel** (filters) and **Contul meu** (limits, self-exclusion).
4. Try a rejection: set a "Maximum stake per bet" limit lower than your stake, or bet more than your balance.
5. On a phone-sized window the slip becomes a green bar above the bottom navigation.

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
