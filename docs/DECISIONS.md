# Decisions

Choices not dictated by the brief, with the reason. Newest last.

## Toolchain

1. **TypeScript 6.0, not 7.** TS 7 (native compiler) is the npm `latest`, but typescript-eslint (≤ 6.0) and @nestjs/swagger (≤ 6) do not support it yet.
2. **Prisma 7.10.1, not 8.** Prisma's `latest` tag points at an 8.0 release candidate; 7.10.1 is the latest stable. Uses the `prisma-client` generator + `@prisma/adapter-pg`.
3. **NestJS 12 is ESM-only**, so the API and worker are ESM (`NodeNext`, `.js` import suffixes).
4. **Vitest (+ SWC) instead of Jest for API integration tests.** Jest's ESM support is still experimental and Nest 12 ships ESM only. Tests still run against real Postgres/Redis (Testcontainers in CI, local services otherwise). Same semantics as the brief's "Jest + Testcontainers".
5. **`@node-rs/argon2` instead of `argon2`.** Same Argon2id algorithm; prebuilt binaries for every platform (the `argon2` package needs a C++ toolchain on Windows). Parameters: 19 MiB, t=2, p=1 (OWASP).
6. **Custom Zod pipe (`ZBody`/`ZQuery`)** instead of `nestjs-zod`, which does not support Nest 12. The same schema validates the request and generates the Swagger body (`z.toJSONSchema`).
7. **pnpm 12** blocks dependency install scripts by default; the allowlist lives in `pnpm-workspace.yaml` (`allowBuilds`). Telemetry scripts (`@scarf/scarf`) are denied.
8. **`packages/db`** (not in the brief's package list) holds the Prisma schema, migrations and generated client so the API and worker share one client.
9. **The worker reuses the API's NestJS modules** (`@goalbet/api/kit`) in a separate process, so engine logic exists once. Each BullMQ job has its own queue, so a slow job never delays live updates.

## Money, odds and maths

10. **Money columns are `Int` (bani).** Max per row ≈ 21.4 M RON, far above the default max payout (500 000 RON). Reports sum in SQL.
11. **Odds maths uses integer milli-odds and BigInt ratios.** Accumulator total odds are rounded half-up to 3 decimals and the potential win is `floor(stake × totalOdds)`. Settlement computes the effective odds the same way, so an all-won ticket pays exactly its potential win.
12. **Half results in accumulators:** a HALF_WON leg counts as `(odds + 1) / 2` and a HALF_LOST leg as `0.5`.
13. **Ticket outcome:** any LOST leg → LOST; all legs VOID → VOID (stake refunded as REFUND); otherwise WON with the computed payout (a HALF_LOST single therefore "wins" back half its stake).
14. **Cash-out formula:** settled legs are locked in. Won legs keep their placed odds in the numerator and count as 1.00 in the current odds. Void legs are ignored. The offer is capped at the potential win and is unavailable if any leg lost, a market is suspended or a price is missing.
15. **Bet Builder:** Asian handicap is excluded (it can half-settle). Contradictions are detected by searching for any match outcome in which every selection wins, using the settlement rules themselves. Several anytime scorers may be combined. A void part (e.g. player did not play) voids the whole builder leg instead of re-pricing it.

## Auth and security

16. **Access token (15 min) is kept in memory; the refresh token is an httpOnly, SameSite=Lax cookie**, rotated on every refresh. Presenting a replaced refresh token more than 10 s after rotation is treated as theft and revokes every session of that user. Inside the 10 s window it is just refused, so two tabs refreshing together don't log the user out.
17. **The frontends proxy the API under `/api`** (Next rewrites), so cookies are first-party and no CORS is needed in the browser.
18. **Admin 2FA:** an admin without TOTP must enrol on first login (QR + key) before any session is issued. Secrets are AES-256-GCM encrypted at rest, codes cannot be replayed (`totpLastStep`), and the account locks for 15 min after 5 failures. Sessions end after 30 min idle (`ADMIN_IDLE_TIMEOUT_MIN`) or 12 h absolute.
19. **Rate limits are Redis-backed** so they hold across API replicas. Player login/register are limited to 10/min per IP; admin login likewise, with a 5 min block.
20. **Password reset:** no email provider in the MVP. Mails are logged, and outside production they are kept in a Redis "dev mailbox" (`GET /dev/mailbox`, only when `MOCK_CONTROL_ENABLED=true`).
21. **The ledger and audit log are append-only at database level** (triggers). Balance ≥ 0 is a CHECK constraint.

## Mock provider and data

22. **The mock world is deterministic and stateless.** A kickoff every 25 minutes around the clock, so 4–5 matches are live and never fewer than 3 (cancellations are spaced). Matches run in real time. Goals, corners, cards, shots, stoppage time and cancellations are derived from the fixture ref, so every process agrees without shared state. Test/demo control (kick off now, finish, set score, shift odds, suspend, stall the feed) is stored in Redis and exposed at `/dev/mock/*` only when `MOCK_CONTROL_ENABLED=true` (refused in production).
23. **Mock odds come from a Poisson model priced through the shared settlement rules**, so prices can't disagree with settlement. Pre-match odds drift every 30 min for matches in the next 48 h, and live odds drift every 20 s. Margins are 5–15 % by market type.
24. **Team names are real club names; player names are generated (fictional).**
25. **The ingest marks an event FINISHED / CANCELLED as soon as the provider reports it** and suspends its markets, so it leaves the catalogue at once. The settlement engine then settles every finished event without a `settledAt` (F2.8 → F2.9). A sweep asks the provider for the results of LIVE events missing from the feed (e.g. after worker downtime). *(Changed in phase 2: originally the event stayed LIVE until settlement, which kept finished matches in Top Live.)*

## Local development

26. **No Docker on the development machine:** `scripts/local-services.sh` runs a project-local Postgres cluster on port 5434 and a portable Redis on 6379. `docker-compose.yml` + `Dockerfile` give the full containerised stack.

## Phase 2

27. **Live bet delay runs inside the bet request:** the API waits `betting.liveDelayMs` (default 5 s), re-runs the full F1.13 validation, then takes the stake. No money moves until the delay has passed, so a rejection after the delay never needs a refund. Phase 4 may move this to a worker if long-held requests become a problem.
28. **Several singles = several tickets.** The slip's Single tab places one `POST /bets` per selection, each with its own Idempotency-Key. A failure stops the batch, and selections already placed are removed from the slip.
29. **Idempotency keys are released when a request fails**, so the slip can retry after "accept new odds". The frontend sends a fresh key per click.
30. **Odds-change preference** defaults to the player's profile value (`HIGHER`) and can be changed in the slip and on the account page. With HIGHER or ANY the ticket is written at the server's current price, never the submitted one.
31. **Boosted odds:** an `OddsBoost` row overrides a selection's price while active. The price a player gets is `max(provider, boost)` (`effectiveOddsMilli`), used by both catalogue and bet engine. In mock mode the worker keeps 4 demo boosts (+15 % on favourites of top matches); admin management comes with sportsbook settings (F3.5).
32. **Self-limits:** lowering or adding a limit applies at once; raising or removing it waits 24 h. Admin-set per-user limits (`source = ADMIN`) stack with the player's own, and the strictest applies.
33. **Self-exclusion** cannot be lifted by the player. It blocks betting (`SELF_EXCLUDED`) but not logging in, so the player can still see bets and balance.
34. **Fonts are self-hosted** (`@fontsource`, imported via `@goalbet/ui/fonts`) instead of `next/font/google`. Turbopack's dev server failed to load the Google font loader on this setup, and self-hosting also removes network calls from builds and Docker images.
35. **The admin credit/debit backend arrived in phase 2** (screens in phase 3), so test players can be funded and the betting flow exercised end to end.
36. ~~Bet Builder legs are refused (`BUILDER_INVALID`) until phase 6.~~ *Superseded by 74–76: Bet Builder is live since phase 6.*

## Redesign and real data (between phases 2 and 3)

37. **Real fixtures from API-Football on the free plan** (`ODDS_PROVIDER=api-football`). The free plan allows ~100 calls/day and covers yesterday→tomorrow, so the client keeps a Redis call budget (90/day, 8/min) and gives a slot back when a call is refused. Fixtures, teams, kick-offs and live scores are real; pre-match odds are priced by our model from real team stats (predictions endpoint), because pre-match odds would exhaust the budget. Corners, cards and player markets are not offered on this feed. Competitions from the inactive provider are hidden (`Competition.active`).
38. **"Emerald Pitch" palette** (navy, emerald, gold, live red) chosen by the client after the lime/cyan version was rejected. Colours live only in `packages/ui/src/brand/tokens.css`.
39. **Light and dark themes.** Dark is the default palette; `data-theme="light"` on `<html>` overrides the same CSS variables. Translucent overlays use the `tint` colour (white in dark, navy in light) instead of hard-coded white. A tiny inline script applies the saved choice (or the OS preference) before first paint, so pages stay statically rendered with no theme flash. The hero, live spotlight, match header and auth panel are dark "stadium" islands (`data-theme="dark"`) in both themes.
40. **Animation split:** GSAP (ScrollTrigger, SplitText, timelines, hover physics) for scroll-driven and timeline work; Motion (`motion/react`) for React state-driven UI (AnimatePresence on slip items, tab panels, toggles, scroll progress); React Three Fiber for the 3D football (custom Voronoi shader). The 3D scene loads lazily only on desktop with WebGL and normal motion settings, pauses when off-screen, and falls back to an SVG ball. Everything respects `prefers-reduced-motion`.
41. **Times are shown in the player's own time zone** (from the browser), labelled with the zone abbreviation (IST, EET, EDT…) or UTC offset. The server and first client render use Europe/Bucharest so hydration matches; the switch happens right after mount, so no cookie or dynamic rendering is needed.
42. **Team crests are generated** (shape, colours, stripes derived from the team name), so no club logos are used.
43. **Two ways to run background sync** (`JOBS_MODE`): `worker` (default) runs apps/worker with BullMQ on an always-on host; `on-request` is for serverless hosts (Vercel) with no worker: catalogue visits start any stale task in the background (`waitUntil`), using a Redis `SET NX PX` key as both freshness marker and lock (live 15 s, pre-match 2 min, fixtures 10 min), plus a daily Vercel Cron (`/cron/refresh`, bearer `CRON_SECRET`). Both modes share `SyncTasksService`. The serverless API entry is `apps/api/api/index.js` → `dist/serverless.js`.
44. **Local demo:** run the production build (`pnpm build`, then each app's `start`) and share it through a Cloudflare quick tunnel. On Windows, Next.js skips the `standalone` output (copying pnpm symlinks needs admin rights); Docker builds keep it.

## Phase 3

45. **Admin roles:** SUPER_ADMIN can do everything; OPERATOR edits/suspends players, sets operator limits and runs the sportsbook (leagues, markets, events, betting limits); FINANCE moves money and owns the `wallet.*` settings (approval threshold). Every admin can view everything. The admin app hides actions a role cannot use; the API enforces it.
46. **Every operator change carries a written reason** (min. 3 characters), stored in the audit entry's `meta`, so the audit log explains *why*, not only what.
47. **Operator suspension beats the feed:** a market suspended by an operator gets `adminSuspended = true`, and the ingest keeps it SUSPENDED whatever the provider sends until the operator resumes it. Event suspension uses `Event.suspended`, which the feed never writes (the feed uses `feedSuspended`). Both are pushed to clients on the event-updates channel.
48. **Operator limits** (`UserLimit.source = ADMIN`) apply at once, with no cooling-off, and stack with the player's own limits (the strictest wins). Suspending a player ends all their sessions immediately.
49. **Report money figures come from the wallet ledger** (stakes = STAKE, payouts = WIN + CASHOUT + REFUND + VOID_REVERSAL, credits/debits = ADMIN_*), not from ticket fields, so reports always agree with balances. Exposure = potential win of open tickets; per match, each open ticket is counted once.
50. **The admin match list** shows the current provider's leagues only and treats a SCHEDULED match as upcoming until 2 h after kick-off, so data left over from a previous provider does not clutter it.
51. **First admin login enrols 2FA by QR** (seeded admins have no authenticator); `admin:access` resets enrolment and can rotate passwords, printing nothing secret.
52. **Admin accounts are managed in the panel.** Every admin edits their own name, changes their password (current password + 2FA code) and moves 2FA to a new phone (code from the old app, then from the new one). Super admins create admins with a role and a one-time temporary password (shown once, never stored), edit name/email/role, suspend, and reset passwords or 2FA. Any change to role, email, password, 2FA or status ends that admin's sessions; admins cannot change their own role, suspend or reset themselves, and the last active Super admin cannot be demoted or suspended (`LAST_SUPER_ADMIN`, `SELF_ACTION`).

## Phase 4

53. **Socket.IO through the web app's `/api` proxy**, so the socket is same-origin and needs no extra CORS or domain. Next.js strips trailing slashes, so both server and client use `addTrailingSlash: false`. Each API instance subscribes to the Redis channels itself (no socket adapter needed: every instance gets every message). Sockets only receive; all betting stays on HTTP. Serverless mode (`JOBS_MODE=on-request`) has no socket and keeps polling.
54. **Clients patch cached data instead of re-fetching** on each push: a structural, reference-preserving update of every cached match/market/selection, so pages re-render only where something changed. Boosted selections never drop below the boost on a push; the bet slip re-fetches exact effective prices instead of trusting pushed numbers. After a reconnect everything is re-fetched once.
55. **A ticket is LIVE as soon as any of its matches has kicked off** (placed live, or flipped at kick-off). It stays LIVE until settlement (phase 5).
56. **Feed freshness = age of the live data, not of the last sync call.** Providers that cache live data report when it was fetched (`liveDataTime`). The watchdog suspends live matches of active leagues when the data is older than `feed.stallSeconds`; only fresh data lifts it (so sync and watchdog never flap). It runs in the always-on worker only.
57. **Socket messages skip the HTTP rate limiter**: they only join/leave rooms and carry no money actions.

## Deposit & withdrawal requests

58. **Players request, Finance approves** — no self-service money movement, so F0.4 (admin-controlled wallet) still holds. Approved requests write ledger `DEPOSIT` / `WITHDRAWAL` entries with `uniqueRef = PAY:<requestId>` (no double posting). Methods: bank transfer and cash at a partner shop, each switchable; no card processing.
59. **Withdrawals hold funds immediately** (`Wallet.heldBani`, CHECK 0 ≤ held ≤ balance). Every debit except the approved withdrawal itself must leave held money untouched (stakes → `INSUFFICIENT_BALANCE`, admin debits → `NEGATIVE_BALANCE`). Cancel/reject releases the hold. Cash out and settlement (phase 5) only ever add money, so they need no change.
60. **Same four-eyes rule as manual credits:** above `wallet.approvalThresholdBani` a second, different Finance/Super admin must approve.
61. **Limits:** per-request min/max for deposits and withdrawals (settings, Finance-owned), one waiting withdrawal and three waiting deposits per player. Self-excluded players can't deposit but can withdraw (it's their money).
62. **Reference codes** (`D-`/`W-` + 6 characters without 0/O/1/I) identify a payment on a bank statement or at a shop counter. Players see a masked IBAN; Finance sees it in full. Bank details for deposits come from env vars (`PAYMENT_BANK_*`).

## Data provider settings

63. **The provider and API key are admin data, not deployment config.** One `DataProviderConfig` row (CHECK id = 'default'); the key is sealed with AES-256-GCM using a key derived from `JWT_ADMIN_SECRET` (separate derivation from the 2FA secrets), only its last 4 characters are stored in clear for display, it is never returned by the API or written to the audit log. Rotating `JWT_ADMIN_SECRET` makes the stored key unreadable — the env key is then used and the panel asks for the key again.
64. **`ProviderRouter` implements `OddsProvider`** and forwards to the configured provider, rebuilt when the config version changes (15 s cache + Redis `gb:provider-changed`), so switching needs no restart in the API or the worker. Env vars remain the fallback until an admin saves and as a fallback key.
65. **Super admin only** for viewing and changing it (it controls costs and the whole sportsbook's data). *Test key* uses API-Football's free `/status` endpoint and never saves.

## Phase 5

66. **One settlement transaction per match, event row locked.** Selections → markets → legs → tickets → ledger in one `$transaction` (60 s timeout) so a match is either fully settled or not at all; a second run (worker and operator racing) gets `EVENT_ALREADY_SETTLED`. Wallet rows are locked in user-id order to avoid deadlocks between concurrent settlements. Ledger references `WIN:<ticket>` / `REFUND:<ticket>` are the last line of defence against double payment.
67. **Accumulators settle early on a lost leg** (common sportsbook practice): the player sees the result at once and there is nothing to pay. Otherwise a ticket waits until every leg is graded.
68. **A selection the rules can't grade is voided**, not left blocking the match (logged via the settlement record). Player markets are void without player stats, so manual results contain team facts only.
69. ~~No automatic re-settlement.~~ *Superseded by 84: operators can re-settle a match.*
70. **Cash-out offer = shared fallback formula on bettable prices** (provider price or active boost, the same function the bet engine uses). (In phase 5 Bet Builder legs had no live price and got no offer; since phase 6 the whole combination is re-priced, see 76.) Within the 1 % tolerance the *current* offer is paid (it may be a little lower or higher than shown); beyond it the API returns the new offer instead of paying.
71. **Cash out and settlement serialise on the ticket row:** cash out locks the ticket (`FOR UPDATE`); settlement only updates tickets still open (`updateMany … status IN open`), so whichever commits first wins and the other skips — never both. Accepting requires an Idempotency-Key, like bets.
72. **Overdue = unsettled 3 h after kick-off** (90 min + stoppage + half time + margin). Only matches with open bets count: they are listed for operators and the settlement job asks the provider for their result even though the feed never sent full time (worker downtime). Matches without bets are left alone to save provider calls.
73. **Reconciliation keeps its last report in Redis** (`reconcile:last`) for the dashboard; each run is audited (`LEDGER_RECONCILED`) and every mismatch separately. It only reports — it never changes balances.

## Phase 6

74. **A Bet Builder is one leg with one price** (`TicketLeg.kind = BET_BUILDER`, one `TicketLegSelection` per pick with that pick's own price for display). The ticket is a SINGLE; Bet Builder legs are also accepted inside an accumulator by the API (one leg per match still applies), the slip only offers the single.
75. **Pricing order:** the provider's correlated price (`priceBetBuilder`) when available, else the fallback `product × builder.factorBps` (min 1.01). The mock prices goal-model combinations jointly; API-Football's free plan has no builder pricing, so it always uses the fallback. Contradictions are found with the same rules that settle the bet, so a combination we sell can always win.
76. **Odds checks treat the builder price as the leg price:** the player's odds-change preference compares the combined price; `ODDS_CHANGED` details carry `{ eventId, builder: true }` and the slip re-fetches the quote. Cash out re-prices the whole combination, so Bet Builder tickets now get offers (phase 5 had none).
77. **Deposit limits count requests, not only paid deposits** (waiting + approved in a rolling 24 h / 7 d / 30 d window), so a player can't queue requests past the limit. They are checked when the player asks, not again when Finance confirms money that has already arrived. Separate error code `DEPOSIT_LIMIT_EXCEEDED`; same cooling-off rules as stake limits.
78. **Payment reports use two sources on purpose:** money per day comes from the ledger (what was really credited/debited), by method and queue figures come from the requests (method, waiting time). Average decision time counts approvals and rejections decided in the period.

## Phase 7

79. **E2E runs on its own stack, not the development one:** database `goalbet_e2e` (recreated by `prepare-stack`), Redis DB 3, ports 4400/3400/3401, mock feed, fixed local-only secrets. Web and admin are production builds in `.next-e2e` (the API address is baked into the Next.js rewrites at build time, hence `NEXT_DIST_DIR`). Tests create their own players and one admin per role, so they never depend on seed data and can run in any order.
80. **E2E drives the UI for what it proves and uses the API only for setup** (registering players, funding, a live bet before a manual settlement). Live odds move during a test, so the slip helper accepts price changes the way a player would.
81. **Reality check is a per-player preference** (15/30/60/120 minutes or off, stored on the user) and runs in the browser from the start of the browser session; it shows time played, staked, returned and net since then, with Continue / Set limits / Log out. It never blocks betting by itself.
82. **The responsible-gambling page lists the Romanian help line (Joc Responsabil, 0800 800 099) and ONJN.** These contacts must be re-checked before launch; they are content, not configuration.
83. **The provider template is compiled but not wired:** it documents the contract a commercial feed must meet (market keys, odds format, suspensions, official results) and is covered by a unit test so it can't drift from the interface.

## Fixes after phase 7

84. **Re-settlement is all or nothing.** Correcting a match re-grades every selection and leg, then posts only the difference per ticket (`WIN`/`REFUND` up, `VOID_REVERSAL` down, `uniqueRef RESETTLE:<ticket>:v<version>`); accumulators can close or reopen. If any player can no longer cover what must be taken back, the whole correction is refused (`RESETTLE_INSUFFICIENT_FUNDS`, players listed) rather than letting a balance go negative or correcting only some tickets. Cashed-out tickets are never touched. Each correction is a new `SettlementRecord` version (`ADMIN_RESETTLE`) and an `EVENT_RESETTLED` audit entry with every ticket's change.
85. **Manual results include player stats.** The operator ticks the players who played (only squad players with player markets on the match are offered, those with open bets first) with goals and shots; unticked players' markets are void, and scorers' goals can't exceed their team's score.
86. **API-Football results are found by day, not by id list.** The free plan refuses `/fixtures?ids=`; each fixture's UTC day is remembered when it is listed (Redis `af:fixture-days`), and a match's result is found by re-reading that day — one call per day for every match on it, at most every 20 minutes. Matches listed before this change use their kick-off day.
87. **Concurrent market inserts are safe:** after inserting new markets (duplicates skipped), selections are attached to the market rows that actually exist, so two jobs adding the same market at once no longer fail.
88. **The reality check counts from login across all tabs** (localStorage, reset by logout or a 30-minute break), not per tab.
89. **Email goes out over SMTP** (any provider); a failed send is logged and never shown to the person who asked for a reset (no account enumeration). Settings: see 91.
90. **Production refuses unsafe settings at start-up** (see README); `ALLOW_INSECURE_LOCAL` exists only for the local docker demo.
91. **SMTP settings are admin data, like the data-provider key.** One `MailConfig` row (CHECK id = 'default', security in tls/starttls/none, port 1–65535); the password is sealed with AES-256-GCM under its own key derivation from `JWT_ADMIN_SECRET`, never returned by the API or written to the audit log (only "replaced/removed/unchanged"). Every API process re-reads it within 15 s or at once on Redis `gb:mail-changed`, and the mailer rebuilds its connection when the settings version changes: no restart. `SMTP_URL` / `MAIL_FROM` stay the fallback until an admin saves. *Send test* uses the form's unsaved values (no password = the stored one), stores nothing and returns the SMTP server's own error text; each test is audited. Super admin only.
