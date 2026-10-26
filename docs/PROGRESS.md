# Progress

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Monorepo, Docker, schema + migrations, seed, auth (F1.2, F1.3, F3.1), i18n (F0.3), tokens, MockProvider (F4.1), module skeleton (F4.2) | ✅ Done |
| 2 | Homepage + browsing (F1.1, F1.4, F1.5, F1.9), bet slip (F1.12), normal bets (F1.10), validate/reject/create (F1.13–F1.15), wallet + My Bets (F1.7, F1.8) | ✅ Done |
| 3 | Admin app (F3.2–F3.8) | ✅ Done |
| — | Redesign (Emerald Pitch, light/dark, 3D), real fixtures (API-Football free plan), local time zones, Vercel-ready API | ✅ Done |
| 4 | Live (F1.6, F2.1, F2.2), WebSocket + Redis pub/sub, live delay, feed-stall safety | — |
| 5 | Cash out (F2.3–F2.7), settlement + payout + credit (F2.8–F2.11), reconciliation | — |
| 6 | Bet Builder (F1.11), sportsbook settings (F3.5), reports + exposure (F3.6) | — |
| 7 | Responsive polish, responsible gambling, provider skeleton, all E2E, README | — |

## Phase 3 — what was built

- **Admin API** (all behind `AdminAuthGuard`; SUPER_ADMIN can do everything, OPERATOR runs users/bets/sportsbook, FINANCE runs money; every change audited with a reason):
  - users: list/search, detail with stats, edit, suspend/activate (ends sessions), operator limits;
  - wallet: credit/debit with approval threshold (from phase 2), global transaction log;
  - bets: ticket search by view/status/type/code/email/date, ticket detail with wallet movements;
  - sportsbook: leagues (on/off, top), market types, event suspension, single-market suspend/hide (held against the feed), limits & settings (wallet threshold is FINANCE-only);
  - reports: users, stakes/payouts/GGR from the ledger, credits/debits, tickets by status, open exposure and exposure per match, daily series; dashboard;
  - audit: filtered search, list of known actions.
- **Admin app** redesigned in the Emerald Pitch style: grouped sidebar with a pending-approvals badge, dashboard, players list and player page (overview, wallet, bets, limits, history), wallet (approvals, add/remove credit, transaction log + CSV), bets (views + ticket panel), sportsbook (matches with a market panel, leagues, markets, limits), reports (presets, charts, exposure, CSV), audit (filters + before/after panel). Every action asks for a reason; actions are hidden for roles that can't use them. RO/EN.
- **Admin access:** admins are seeded without an authenticator, so the first login shows a QR code; `pnpm --filter @goalbet/api admin:access [--email …] [--rotate-passwords]` unlinks authenticators (e.g. lost phone) and can rotate passwords.
- **Fixes:** the odds feed no longer reopens a market an operator suspended; the settings cache is cleared between tests.

- **Admin accounts:** *My account* for every admin (name, password change with current password + 2FA code, moving 2FA to a new phone, active sessions with sign-out) and *Admin users* for Super admins (create admins with a role and a one-time temporary password, edit name/email/role, suspend/activate, reset password or 2FA). Role/email/password/2FA/status changes sign the admin out everywhere; nobody can demote, suspend or reset themselves, and one active Super admin always remains.

**Tests:** 73 API integration (12 in `admin-panel.test.ts`, 8 in `admin-accounts.test.ts`) · i18n parity (web + admin). All green. Admin screens checked in Chromium at 1600 px and 390 px.

## How to try phase 3

1. `pnpm dev`, open http://localhost:3001, sign in with an admin from `seed-credentials.txt` and scan the QR code on first login.
2. Users → open a player → Add credit (above 5,000 RON it waits for a second admin under Wallet → Approvals), Suspend, Limits.
3. Sportsbook → Matches → suspend a match, open it to suspend a single market; Leagues / Markets toggles; Limits.
4. Bets, Reports (7/30/90 days, CSV) and Audit logs (every action above is there, with before/after).
5. Click your name at the bottom of the sidebar for *My account*; Super admins also get *Admin users* (Add admin → pick Super admin / Operator / Finance → copy the one-time password).

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
