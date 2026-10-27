# Progress

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Monorepo, Docker, schema + migrations, seed, auth (F1.2, F1.3, F3.1), i18n (F0.3), tokens, MockProvider (F4.1), module skeleton (F4.2) | ✅ Done |
| 2 | Homepage + browsing (F1.1, F1.4, F1.5, F1.9), bet slip (F1.12), normal bets (F1.10), validate/reject/create (F1.13–F1.15), wallet + My Bets (F1.7, F1.8) | ✅ Done |
| 3 | Admin app (F3.2–F3.8) | ✅ Done |
| — | Redesign (Emerald Pitch, light/dark, 3D), real fixtures (API-Football free plan), local time zones, Vercel-ready API | ✅ Done |
| 4 | Live (F1.6, F2.1, F2.2), WebSocket + Redis pub/sub, live delay, feed-stall safety | ✅ Done |
| — | Player deposit & withdrawal requests (admin-approved), held funds, Finance queue | ✅ Done |
| — | Data provider & API key managed in the admin panel (no restart) | ✅ Done |
| 5 | Cash out (F2.3–F2.7), settlement + payout + credit (F2.8–F2.11), reconciliation (incl. held funds = pending withdrawals); cash out and payouts respect held money | ✅ Done |
| 6 | Bet Builder (F1.11), sportsbook settings (F3.5), reports + exposure (F3.6) incl. deposits/withdrawals by day and method and queue age; player deposit limits (daily/weekly/monthly) | — |
| 7 | Responsive polish, responsible gambling, provider skeleton, all E2E (incl. deposit/withdrawal flows), README with the licence / KYC / AML notes for real money | — |

## Phase 5 — what was built

- **Automatic settlement (F2.8–F2.11):** the worker's `settlement` job (every 30 s) takes every finished or cancelled match that is not settled yet and, once the provider has the final result, settles it in one transaction: every selection is graded (all market types, Asian quarter lines, player markets void if the player did not play), then every leg and every ticket whose legs are decided (an accumulator is lost as soon as one leg loses). Winnings (`WIN`) and refunds for void tickets (`REFUND`) go through the ledger with a per-ticket reference, so a ticket is never paid twice. Players see the result and their balance change at once (push). A `SettlementRecord` keeps the result used, its source and version.
- **Manual settlement (F2.9):** Admin → Sportsbook → Matches → *Awaiting settlement* lists matches with open bets that are finished, or still unsettled 3 h after kick-off (the job also asks the provider about those, e.g. after worker downtime). *Settle* asks for the half-time and full-time score, corners, cards and a reason, or *Match cancelled* to void every bet. Operator / Super admin only, audited (`EVENT_SETTLED_MANUALLY`). Without player stats, scorer and shots markets are voided.
- **Cash out (F2.3–F2.7):** each open ticket in My Bets shows a live offer (stake × placed odds ÷ current odds, less the cash-out margin), refreshed when its matches' odds or scores change. *Cash out* → confirm → paid instantly (`CASHOUT`), ticket moves to *Cash Out history*. The offer is re-checked on accept with the ticket locked: up to 1 % lower is paid at the new amount, more than that shows the new offer to confirm again. Live tickets wait the live bet delay. No offer while a match or market is suspended, its league is off, it is past kick-off without the feed having started it, a leg has lost, or cash out is switched off (Sportsbook → Limits). A cashed-out ticket is never paid by settlement.
- **Reconciliation:** hourly, every balance must equal the sum of its ledger and the held amount must equal the player's pending withdrawals. Mismatches are logged and audited (`LEDGER_MISMATCH`, `HOLD_MISMATCH`); the dashboard shows the last check and the number of matches awaiting settlement.
- **Serverless hosts** (no worker): `GET /cron/settle` (same `CRON_SECRET`) runs settlement and the money check; added to `vercel.json`.

**Tests:** 98 API integration (9 new in `settlement.test.ts`: provider settlement, accumulators, refunds, waiting for results, overdue matches, manual settlement with roles and validation, cash out incl. idempotency / price change / suspension / settings, reconciliation of held money) · shared unit tests · i18n parity. All green. Browser check (Chromium, 1500 px and 390 px): cash out offer → confirm → Cash Out history with the balance updated; admin dashboard tiles, *Awaiting settlement* list and the settle dialog (half-time check, cancelled mode).

## How to try phase 5

1. `pnpm dev`. Place a single and an accumulator in the web app (http://localhost:3000).
2. My Bets → Active: each ticket shows *Cash out X RON*. Click it, then *Confirm*: the money is in the wallet at once and the ticket is under *Cash Out history*.
3. Settle a match by hand: admin (http://localhost:3001) → Sportsbook → Matches → status *Awaiting settlement* (or any match that has kicked off) → *Settle*, enter the score and a reason. Winning tickets are paid and the player's My Bets and balance update live. With the mock feed, finished matches are settled automatically within about 30 s.
4. Dashboard: *Awaiting settlement* and *Money check* tiles.

## Data provider settings — what was built

- **Admin → System → Data provider** (Super admin): choose *API-Football* or *Demo data*, set or replace the API key (stored AES-256-GCM encrypted, only the last 4 characters ever shown, never logged), pick the leagues, set the call budget per day / minute, *Test key* (API-Football `/status`: plan, calls used, subscription end — free, no quota used) and *Load fixtures now*. Live-data age and today's calls are shown.
- **No restart:** the engine talks to a `ProviderRouter`; the API and worker re-read the config within 15 s, or at once on a Redis notice, and rebuild the provider. Until an admin saves, the `ODDS_PROVIDER` / `API_FOOTBALL_*` env vars are used (and stay the fallback key).
- Every change is audited with a reason (key shown only as "replaced (…b198)").

**Tests:** 89 API integration (5 new in `data-provider.test.ts`, API-Football mocked) · i18n parity.

## Deposit & withdrawal requests — what was built

- **Players ask, Finance decides** (the wallet stays admin-controlled, F0.4). Wallet page: *Deposit* (bank transfer or cash at a shop → a reference code like `D-7K2Q9M` and the bank details to pay to) and *Withdraw* (amount + IBAN and account holder, or cash at a shop). *My requests* shows each request's status live, the reason when rejected, and lets the player cancel while waiting.
- **Withdrawals hold their amount at once** (`Wallet.heldBani`): held money can't be staked, debited by an admin or requested twice; approval pays it out (ledger `WITHDRAWAL`), rejection/cancel gives it back. Available = balance − held.
- **Admin → Wallet → Player requests** (FINANCE): a queue oldest-first with player balance/held, method and details (full IBAN for Finance); *Money received* / *Paid out* or *Reject* with a reason. Above the approval threshold two different admins must approve. Sidebar badge and dashboard count waiting requests; reports show deposits and withdrawals separately from manual credits.
- **Rules:** limits per request (min/max deposit and withdrawal), methods switchable, at most one waiting withdrawal and three waiting deposits, deposits blocked while self-excluded (withdrawals still allowed), IBAN checked (format + mod-97). Settings live under Sportsbook → Limits (*Deposits & withdrawals*, Finance only). Bank details come from `PAYMENT_BANK_*` env vars (demo values by default).
- **Not included:** card/online payments; real money in Romania needs an ONJN licence, KYC and AML procedures (see phase 7).

**Tests:** 84 API integration (6 new in `payments.test.ts`) · 4 new shared unit tests (IBAN) · i18n parity. Browser check: deposit + rejection flow, player notified live, balance unchanged.

## How to try deposits & withdrawals

1. Log in on http://localhost:3000 → Wallet → *Deposit*: pick a method and amount, note the reference code.
2. Admin (Finance or Super admin) → Wallet → *Player requests*: *Money received* → the player's balance goes up instantly.
3. Player → *Withdraw*: the amount shows as on hold; admin *Paid out* (or *Reject* → the hold returns).

## Phase 4 — what was built

- **Real-time push (F1.6, F2.2):** a Socket.IO gateway in the API (`modules/realtime`) relays the Redis channels the ingest, betting and wallet code already publish on. Rooms: `live` (every match update), `event:<id>` (one match), `user:<id>` (that player's tickets and balance, joined with the access token and re-authenticated on login/logout/refresh). The web app keeps one socket (through its `/api` proxy, WebSocket with polling fallback), follows what each page needs, and patches its cached data in place: scores, minute and status, odds (with the up/down flash), market locks, boosted prices kept at the boost. The bet slip re-fetches exact prices when one of its matches changes; balance and My Bets update on push. Polling stays as a 30 s safety net while connected (the old intervals when not). A dot next to the time zone shows the connection.
- **Kick-off (F2.1):** when a match starts, open tickets with a leg on it become LIVE and the player is notified.
- **Feed-stall safety (F4.1):** the worker checks the live feed every 5 s; when the live data is older than the *feed silence* setting (default 30 s) every live match is suspended (no bets, shown as suspended) until fresh data arrives. Freshness is the age of the data itself, so cached data from a budget-limited provider counts as old. Stalls and recoveries are audited.
- **Fixes:** the HTTP rate limiter no longer runs on socket messages.

**Tests:** 78 API integration (5 new in `realtime.test.ts`, over a real socket) · i18n parity. All green. Browser check: WebSocket through the web proxy, pushed score rendered in about 0.6 s.

**Free API-Football plan:** to stay inside 100 calls/day the provider refreshes live scores every few minutes, so with the default 30 s setting live matches are suspended most of the time (the scores could be out of date). For a demo, raise *Suspend live markets after feed silence of* under Admin → Sportsbook → Limits (e.g. 600 s), or use the mock feed; a paid plan removes the limit.

## How to try phase 4

1. `pnpm dev`, open http://localhost:3000. The dot next to the time zone turns green when live updates are on.
2. With the mock feed (`ODDS_PROVIDER=mock`), live matches tick every few seconds without page refreshes; odds flash up/down. Use `/dev/mock/*` in http://localhost:4000/docs to score a goal or stall the feed and watch matches lock and unlock.
3. Place a bet on a match about to start: in My Bets it turns LIVE at kick-off by itself.

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
