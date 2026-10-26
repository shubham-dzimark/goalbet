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
36. **Bet Builder legs are refused (`BUILDER_INVALID`) until phase 6.** The slip shows the tab with an explanation.

## Redesign and real data (between phases 2 and 3)

37. **Real fixtures from API-Football on the free plan** (`ODDS_PROVIDER=api-football`). The free plan allows ~100 calls/day and covers yesterday→tomorrow, so the client keeps a Redis call budget (90/day, 8/min) and gives a slot back when a call is refused. Fixtures, teams, kick-offs and live scores are real; pre-match odds are priced by our model from real team stats (predictions endpoint), because pre-match odds would exhaust the budget. Corners, cards and player markets are not offered on this feed. Competitions from the inactive provider are hidden (`Competition.active`).
38. **"Emerald Pitch" palette** (navy, emerald, gold, live red) chosen by the client after the lime/cyan version was rejected. Colours live only in `packages/ui/src/brand/tokens.css`.
39. **Light and dark themes.** Dark is the default palette; `data-theme="light"` on `<html>` overrides the same CSS variables. Translucent overlays use the `tint` colour (white in dark, navy in light) instead of hard-coded white. A tiny inline script applies the saved choice (or the OS preference) before first paint, so pages stay statically rendered with no theme flash. The hero, live spotlight, match header and auth panel are dark "stadium" islands (`data-theme="dark"`) in both themes.
40. **Animation split:** GSAP (ScrollTrigger, SplitText, timelines, hover physics) for scroll-driven and timeline work; Motion (`motion/react`) for React state-driven UI (AnimatePresence on slip items, tab panels, toggles, scroll progress); React Three Fiber for the 3D football (custom Voronoi shader). The 3D scene loads lazily only on desktop with WebGL and normal motion settings, pauses when off-screen, and falls back to an SVG ball. Everything respects `prefers-reduced-motion`.
41. **Times are shown in the player's own time zone** (from the browser), labelled with the zone abbreviation (IST, EET, EDT…) or UTC offset. The server and first client render use Europe/Bucharest so hydration matches; the switch happens right after mount, so no cookie or dynamic rendering is needed.
42. **Team crests are generated** (shape, colours, stripes derived from the team name), so no club logos are used.
43. **Two ways to run background sync** (`JOBS_MODE`): `worker` (default) runs apps/worker with BullMQ on an always-on host; `on-request` is for serverless hosts (Vercel) with no worker: catalogue visits start any stale task in the background (`waitUntil`), using a Redis `SET NX PX` key as both freshness marker and lock (live 15 s, pre-match 2 min, fixtures 10 min), plus a daily Vercel Cron (`/cron/refresh`, bearer `CRON_SECRET`). Both modes share `SyncTasksService`. The serverless API entry is `apps/api/api/index.js` → `dist/serverless.js`.
44. **Local demo:** run the production build (`pnpm build`, then each app's `start`) and share it through a Cloudflare quick tunnel. On Windows, Next.js skips the `standalone` output (copying pnpm symlinks needs admin rights); Docker builds keep it.
