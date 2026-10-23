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
25. **An event stays LIVE in the database after full time until the settlement engine confirms the result** (F2.8). The ingest never writes FINISHED itself.

## Local development

26. **No Docker on the development machine:** `scripts/local-services.sh` runs a project-local Postgres cluster on port 5434 and a portable Redis on 6379. `docker-compose.yml` + `Dockerfile` give the full containerised stack.
