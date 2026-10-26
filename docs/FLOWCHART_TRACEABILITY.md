# Flow chart traceability

Status: **Done** = implemented *and* covered by a passing test · **Partial** = some of it built/tested · **Missing** = not started.
Updated at the end of every phase. Test names are `file › describe › it` (abbreviated). API tests live in `apps/api/test`.

_Last update: Phase 2 (pre-match betting)._

## F0 — Header constraints

| ID | Box | Status | Implementing files | Tests |
| --- | --- | --- | --- | --- |
| F0.1 | Football only | Partial | `packages/shared/src/enums.ts` (Sport = FOOTBALL), `mock/data.ts`; no sport selector anywhere in UI | `ingest-and-schema.test.ts › stores competitions… (football only)`; `mock-provider.test.ts › seeds the seven competitions`. Admin side checked in phase 3. |
| F0.2 | RON only | Done | `packages/shared/src/money.ts` (`formatRon`), every amount in web (`lib/format.ts`), wallet currency `RON` | `money.test.ts › formats RO as 1.234,56 RON…`; `betting.test.ts` (amounts in bani end to end) |
| F0.3 | RO (default) + EN, switch in header on both apps, remembered per user | Done | `apps/*/src/i18n/*`, `language-switcher.tsx` (web + admin), `packages/shared/i18n`, `PATCH /me`, `PATCH /admin/auth/me` | `auth.test.ts › F0.3 stores the locale on the profile`; `admin-auth.test.ts › remembers the admin language`; `web|admin/test/i18n-parity.test.ts`; `schemas-i18n.test.ts › ro and en have identical keys` |
| F0.4 | Wallet changes only via bets / cash out / settlement / admin | Done | `WalletService.apply` is the only balance writer; no deposit/withdraw endpoint or UI; DB guards (append-only ledger, balance ≥ 0) | `ingest-and-schema.test.ts › F4.3 database guards`; `admin-wallet.test.ts › F3.3…`; `betting.test.ts › F1.15…` |

## F1 — User journey & betting flow

| ID | Box | Status | Implementing files | Tests |
| --- | --- | --- | --- | --- |
| F1.1 | Visit website | Done | `catalog.service.ts › home`, `boost.service.ts`, web `components/header.tsx` (Sport / Live + count / My Bets + count / search / RO-EN / login-register or balance), `app-chrome.tsx` (sidebar · feed · slip), `sport/home-view.tsx` (Top Live carousel, Boosted odds, Top matches, Top competitions), `sport/competitions-nav.tsx` | `catalog.test.ts › home feed…`, `› hides disabled competitions…` |
| F1.2 | Login | Done | `user-management/auth.*`, web `login`, `forgot-password`, `reset-password` | `auth.test.ts › F1.2 Login` (6 tests) |
| F1.3 | Register | Done | `schemas/auth.ts`, `auth.service.ts › register`, web `register` | `auth.test.ts › F1.3 Register` (4); `schemas-i18n.test.ts › register schema` |
| F1.4 | User account | Done | `account.controller.ts` (`/me`, `/me/dashboard`, `/me/limits`, `/me/self-exclusion`), `responsible-gaming.service.ts`, web `account/page.tsx` (balance, open bets, recent activity, profile, language, odds preference, limits, self-exclusion, links) | `betting.test.ts › F1.4 account dashboard`, `› F1.4 responsible gambling limits`, `› 1. self-excluded`; `auth.test.ts › F0.3…` |
| F1.5 | Pre-match football | Done | `catalog.service.ts › countries / competition / upcoming`, web `sport/page.tsx`, `sport/[competitionId]`, `event-list.tsx` (grouped by date), `event-row.tsx` (1/X/2 + "+N") | `catalog.test.ts › competition page, live list, match page and search`, `› hides disabled…` |
| F1.6 | Live betting | Partial | `catalog.service.ts › live`, web `live/page.tsx` (scores, minute/period, live odds; polling every 4 s) | `catalog.test.ts › … live list …`; `betting.test.ts › live bets wait the bet delay…`. WebSocket push in phase 4. |
| F1.7 | My Bets | Done | `tickets.service.ts`, `bets.controller.ts` (`/tickets?tab=active|settled|cashout`, `/tickets/:id`, `/tickets/counts`), web `my-bets`, `my-bets/[id]`, `bets/ticket-card.tsx` | `betting.test.ts › F1.7 My Bets / F1.8 wallet history` |
| F1.8 | Wallet | Done | `wallet.controller.ts`, `wallet.service.ts › history` (type/date filters, cursor), web `account/wallet` | `betting.test.ts › lists tickets per tab and wallet transactions with filters` |
| F1.9 | Select match & markets | Done | `catalog.service.ts › event`, web `match/[id]`, `market-board.tsx` (tabs per group; 1X2, DC, goals O/U 0.5–5.5, team goals, BTTS, European + Asian handicap, correct score, corners, cards, anytime scorer, player shots, half-time) | `mock-provider.test.ts › offers every market group of F1.9`; `catalog.test.ts › … match page …` |
| F1.10 | Normal bet | Done | `bet-validation.service.ts` (single = 1 leg, acca = 2..20, one selection per match), slip conflict warning (`slipHasConflict`) | `betting.test.ts › F1.10 accumulator…` |
| F1.11 | Bet Builder | Partial | `packages/shared/src/bet-builder.ts`, `mock/pricing.ts › priceBuilderJoint`; slip tab present (phase 6) | `bet-builder.test.ts` (12) |
| F1.12 | Bet slip | Partial | `slip-store.ts` (persisted for guests), `slip/bet-slip.tsx` (Single / Accumulator / Bet Builder tabs, stake RON, quick stakes 10/20/50/100, total odds, potential win, odds-change preference, live price refresh, accept new odds), `slip/mobile-slip.tsx` (floating bar → bottom sheet) | API side covered by `betting.test.ts`; UI verified manually with Playwright screenshots — automated E2E in phase 7 |
| F1.13 | Validate bet (backend) | Done | `bet-validation.service.ts` (user → market status → odds vs preference → limits → balance) | `betting.test.ts › F1.13 validation order…` (7 tests incl. "checks run in flow-chart order") |
| F1.14 | Rejected | Done | typed `DomainError` codes, `BetAttempt` row + `BET_REJECTED` audit, localised messages (`useErrorMessage`), "accept new odds" in slip | `betting.test.ts › expectRejected(...)` in every rejection test (no ticket, no money moved, attempt + audit logged) |
| F1.15 | Create ticket | Done | `bet.service.ts` (Idempotency-Key, live delay + re-validation, `$transaction` + `SELECT … FOR UPDATE`, STAKE ledger entry, 10-char code, ACTIVE / LIVE) | `betting.test.ts › F1.15 create ticket` (6 tests incl. idempotency + parallel overdraw) |

## F2 — Live betting & cash out

| ID | Box | Status | Implementing files | Tests |
| --- | --- | --- | --- | --- |
| F2.1 | Active ticket → Live | Partial | tickets placed on a live event start as LIVE (`bet.service.ts`) | `betting.test.ts › live bets … become LIVE`. Kick-off transition worker: phase 4. |
| F2.2 | Live match updates | Partial | `ingest.service.ts › syncLive` → Redis pub/sub; web polling + odds flash / lock (`odds-button.tsx`) | `ingest-and-schema.test.ts › records odds changes…` |
| F2.3 | Cash out available? | Partial | `packages/shared/src/cashout.ts › quoteCashOut` | `cashout.test.ts` (6) |
| F2.4 | User continues | Missing | — | — |
| F2.5 | Accept cash out | Missing | — | — |
| F2.6 | Validate cash out | Partial | `cashout.ts › isCashOutWithinTolerance` | `cashout.test.ts › accepts a fresh offer within 1 %` |
| F2.7 | Ticket cashed out | Missing | (Cash Out history tab ready) | — |
| F2.8 | Match ends | Partial | `ingest.service.ts › applyLiveState` marks FINISHED/CANCELLED and suspends markets; stale-event sweep via `getResult` | `ingest-and-schema.test.ts › F2.8 match ends`; `mock-provider.test.ts › … final result …` |
| F2.9 | Automatic settlement | Partial | `packages/shared/src/settlement.ts` | `settlement.test.ts` (22) |
| F2.10 | Calculate payout | Partial | `packages/shared/src/payout.ts` | `odds-payout.test.ts › payout (F2.10)` (7) |
| F2.11 | Credit wallet | Missing | ledger supports WIN/REFUND with `uniqueRef` guard | — |

## F3 — Admin / operator

| ID | Box | Status | Implementing files | Tests |
| --- | --- | --- | --- | --- |
| F3.1 | Admin login | Done | `admin-auth.*`, `AdminAuthGuard` + `@Roles` (SUPER_ADMIN always allowed), admin `login` (first login: QR enrolment, then TOTP), `admin-shell.tsx`, `admin-access.ts` CLI (unlink authenticator, rotate passwords) | `admin-auth.test.ts` (6); role enforcement in `admin-wallet.test.ts` and `admin-panel.test.ts` |
| F3.2 | User management | Done | `admin-users.service.ts`/`.controller.ts`: list + search, detail (stats, limits, self-exclusion, rejections), edit, suspend/activate (ends sessions), operator limits; admin `users/` + `users/[id]` (overview, wallet, bets, limits, history) | `admin-panel.test.ts › F3.2` (4) |
| F3.3 | Wallet management | Done | `admin-wallet.service.ts` (credit/debit, required reason, threshold → second-admin approval), `admin-wallet.controller.ts` (+ global transaction log); admin `wallet/` (approvals, add/remove credit, transaction log + CSV), `wallet-adjust-dialog.tsx` | `admin-wallet.test.ts` (3); `admin-panel.test.ts › F3.3` |
| F3.4 | Bet management | Done | `admin-bets.controller.ts` (views all/open/live/settled/cash outs, status, type, code/email, dates; detail with wallet movements); admin `bets/`, `tickets-table.tsx` (ticket panel) | `admin-panel.test.ts › F3.4` |
| F3.5 | Sportsbook settings | Done | `admin-sportsbook.service.ts`/`.controller.ts`: leagues (enable, top), market types, events (suspend/resume, pushed to clients), single markets (suspend held against the feed via `adminSuspended`, hide), limits/settings (OPERATOR; `wallet.*` FINANCE); admin `sportsbook/` | `admin-panel.test.ts › F3.5` (3); `catalog.test.ts › hides disabled…` |
| F3.6 | Reports | Done | `admin-reports.service.ts`: users, stakes/payouts/GGR from the ledger, credits/debits, tickets by status, open exposure, exposure per match, daily series; dashboard; admin `reports/` (presets, charts, CSV) and `/` dashboard | `admin-panel.test.ts › F3.6` |
| F3.7 | All modules → audit | Done | auth, wallet (`WALLET_*`), betting (`BET_PLACED`/`BET_REJECTED`), approvals, limits, self-exclusion, settings, job failures, ledger reconciliation, and every admin action (`USER_*`, `COMPETITION_UPDATED`, `MARKET_TYPE_*`, `EVENT_SUSPENDED`/`EVENT_RESUMED`, `MARKET_UPDATED`, `ADMIN_2FA_*`) with a reason | audit assertions in `auth`, `admin-auth`, `admin-wallet`, `admin-panel`, `betting` tests |
| F3.8 | Audit logs | Done | `AuditLog` (append-only), `AuditService`; `GET /admin/audit` (category, action, actor, entity, dates) + `/admin/audit/actions`; admin `audit/` with before/after panel, player history tab | `admin-panel.test.ts › F3.8` (2); `ingest-and-schema.test.ts › … audit logs are append-only` |

## F4 — Data & system architecture

| ID | Box | Status | Implementing files | Tests |
| --- | --- | --- | --- | --- |
| F4.1 | Sports data / odds provider | Partial | `odds-provider.ts`, `mock/*`, `api-football/*`, `mock-control.controller.ts`; feed-stall auto-suspend in phase 4 | `mock-provider.test.ts` (7), `ingest-and-schema.test.ts` |
| F4.2 | Backend / betting engine modules | Done | `apps/api/src/modules/*` (8 chart-named modules) | `ingest-and-schema.test.ts › F4.2…` |
| F4.3 | Database | Done | `packages/db/prisma/schema.prisma` + migrations | `ingest-and-schema.test.ts › F4.3…` |
| F4.4 | User frontend | Partial | `apps/web` (Next.js 16, responsive: 0 px horizontal overflow at 375 px verified) | `web/test/i18n-parity.test.ts`; Playwright viewports in phase 7 |
| F4.5 | Admin frontend | Done | `apps/admin` (Emerald Pitch back office: dashboard, users, wallet, bets, sportsbook, reports, audit; RO/EN; role-aware actions) | `admin/test/i18n-parity.test.ts`; scripted screenshots |

## F5 — Supported features

| ID | Feature | Status | Proof |
| --- | --- | --- | --- |
| F5.1 | Pre-match betting | Partial | API: `betting.test.ts › places a pre-match single`; E2E in phase 7 |
| F5.2 | Live betting | Partial | API: `betting.test.ts › live bets wait the bet delay…`; E2E in phase 7 |
| F5.3 | Multiple markets | Partial | `mock-provider.test.ts › offers every market group`; UI E2E in phase 7 |
| F5.4 | Bet Builder | Missing | phase 6 |
| F5.5 | Cash out | Missing | phase 5 |
| F5.6 | RON wallet (admin controlled) | Partial | `admin-wallet.test.ts`; E2E in phase 7 |
| F5.7 | Romanian & English | Partial | key-parity tests; E2E in phase 7 |
| F5.8 | Reports & logs | Missing | phase 3 / 6 |
| F5.9 | Responsive | Missing | Playwright 1440 / 375 in phase 7 |
| F5.10 | Complete, scalable, secure | Partial | stateless API, Redis rate limits, Helmet, Argon2id, TOTP, refresh rotation, append-only ledger, row-locked money ops, idempotency |
