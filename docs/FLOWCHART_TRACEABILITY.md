# Flow chart traceability

Status: **Done** = implemented *and* covered by a passing test · **Partial** = some of it built/tested · **Missing** = not started.
Updated at the end of every phase. Test names are `file › describe › it` (abbreviated).

_Last update: Phase 1 (foundation)._

## F0 — Header constraints

| ID | Box | Status | Implementing files | Tests |
| --- | --- | --- | --- | --- |
| F0.1 | Football only | Partial | `packages/shared/src/enums.ts` (Sport = FOOTBALL), `apps/api/src/modules/api-integration/mock/data.ts` | `ingest-and-schema.test.ts › stores competitions… (football only)`; `mock-provider.test.ts › seeds the seven competitions` |
| F0.2 | RON only | Partial | `packages/shared/src/money.ts`, header balance chip, account page | `money.test.ts › formats RO as 1.234,56 RON…` |
| F0.3 | RO (default) + EN, switch in header on both apps, remembered per user | Done | `apps/web/src/i18n/*`, `apps/web/src/components/language-switcher.tsx`, `apps/admin/src/i18n/*`, `apps/admin/src/components/language-switcher.tsx`, `packages/shared/i18n/*.json`, `PATCH /me`, `PATCH /admin/auth/me` | `auth.test.ts › F0.3 stores the locale on the profile`; `admin-auth.test.ts › remembers the admin language`; `web/test/i18n-parity.test.ts`; `admin/test/i18n-parity.test.ts`; `schemas-i18n.test.ts › ro and en have identical keys` |
| F0.4 | Wallet changes only via bets / cash out / settlement / admin | Partial | `packages/db/prisma/schema.prisma` (WalletTxType), `migrations/*_ledger_guards` (append-only ledger, balance ≥ 0); no deposit/withdraw UI exists | `ingest-and-schema.test.ts › wallet balance can never go negative`, `› wallet transactions and audit logs are append-only` |

## F1 — User journey & betting flow

| ID | Box | Status | Implementing files | Tests |
| --- | --- | --- | --- | --- |
| F1.1 | Visit website | Partial | `apps/web/src/components/header.tsx`, `bottom-nav.tsx`, `footer.tsx`, `app/[locale]/page.tsx` (layout shell only) | — (phase 2) |
| F1.2 | Login | Done | `apps/api/src/modules/user-management/auth.*`, `apps/web/src/app/[locale]/login`, `forgot-password`, `reset-password` | `auth.test.ts › F1.2 Login` (6 tests: login + audit, no account enumeration, rate limit, suspended, refresh rotation/reuse, forgot/reset) |
| F1.3 | Register | Done | `packages/shared/src/schemas/auth.ts`, `auth.service.ts › register`, `apps/web/src/app/[locale]/register` | `auth.test.ts › F1.3 Register` (4 tests); `schemas-i18n.test.ts › register schema` |
| F1.4 | User account | Partial | `account.controller.ts` (`GET/PATCH /me`), `apps/web/src/app/[locale]/account` (profile + balance) | `auth.test.ts › F0.3 stores the locale…` |
| F1.5 | Pre-match football | Missing | — | — |
| F1.6 | Live betting | Missing | (live data ingest exists: `ingest.service.ts › syncLive`) | — |
| F1.7 | My Bets | Missing | — | — |
| F1.8 | Wallet | Missing | — | — |
| F1.9 | Select match & markets | Partial | all market groups priced by `mock/pricing.ts`, stored by `ingest.service.ts` | `mock-provider.test.ts › offers every market group of F1.9` |
| F1.10 | Normal bet | Partial | `packages/shared/src/odds.ts › combineOdds` | `odds-payout.test.ts › combines accumulator odds` |
| F1.11 | Bet Builder | Partial | `packages/shared/src/bet-builder.ts` (2–12, contradictions, fallback price), `mock/pricing.ts › priceBuilderJoint` | `bet-builder.test.ts` (12 tests) |
| F1.12 | Bet slip | Missing | — | — |
| F1.13 | Validate bet | Missing | error codes in `packages/shared/src/errors.ts` | — |
| F1.14 | Rejected | Missing | localised messages for every code in `packages/shared/i18n` | `schemas-i18n.test.ts › every error code … has a message` |
| F1.15 | Create ticket | Missing | `ticketCode()` in `common/auth/crypto.ts` | — |

## F2 — Live betting & cash out

| ID | Box | Status | Implementing files | Tests |
| --- | --- | --- | --- | --- |
| F2.1 | Active ticket → Live | Missing | — | — |
| F2.2 | Live match updates | Partial | `ingest.service.ts › syncLive` (scores, odds, market status → Redis pub/sub), `apps/worker` live-sync every 2 s | `ingest-and-schema.test.ts › records odds changes in OddsHistory and publishes them` |
| F2.3 | Cash out available? | Partial | `packages/shared/src/cashout.ts › quoteCashOut` | `cashout.test.ts` (6 formula tests) |
| F2.4 | User continues | Missing | — | — |
| F2.5 | Accept cash out | Missing | — | — |
| F2.6 | Validate cash out | Partial | `cashout.ts › isCashOutWithinTolerance` | `cashout.test.ts › accepts a fresh offer within 1 %` |
| F2.7 | Ticket cashed out | Missing | — | — |
| F2.8 | Match ends | Partial | provider results: `mock/simulation.ts › finalOutcome`, `OddsProvider.getResult` | `mock-provider.test.ts › … final result matches the last live score` |
| F2.9 | Automatic settlement | Partial | `packages/shared/src/settlement.ts` (all markets, Asian quarters, void) | `settlement.test.ts` (22 tests) |
| F2.10 | Calculate payout | Partial | `packages/shared/src/payout.ts` | `odds-payout.test.ts › payout (F2.10)` (7 tests) |
| F2.11 | Credit wallet | Missing | — | — |

## F3 — Admin / operator

| ID | Box | Status | Implementing files | Tests |
| --- | --- | --- | --- | --- |
| F3.1 | Admin login | Partial | `admin-auth.service.ts`, `admin-auth.controller.ts`, `AdminAuthGuard` + `@Roles`, `apps/admin/src/app/[locale]/login`, `admin-shell.tsx` | `admin-auth.test.ts` (6 tests: TOTP required / bad / replay + audit, first-login enrolment, lockout, idle timeout, token separation, locale). Role-restricted routes get tests with the phase 3 modules. |
| F3.2 | User management | Missing | — | — |
| F3.3 | Wallet management | Missing | schema: `CreditApproval`, `WalletTransaction` | — |
| F3.4 | Bet management | Missing | — | — |
| F3.5 | Sportsbook settings | Partial | `SettingsService` + `packages/shared/src/settings.ts` defaults | — |
| F3.6 | Reports | Missing | — | — |
| F3.7 | All modules → audit | Partial | `AuditService` (transaction-aware) used by auth flows | `auth.test.ts`, `admin-auth.test.ts` audit assertions |
| F3.8 | Audit logs | Partial | `AuditLog` table (append-only trigger), `AuditService` | `ingest-and-schema.test.ts › … audit logs are append-only` |

## F4 — Data & system architecture

| ID | Box | Status | Implementing files | Tests |
| --- | --- | --- | --- | --- |
| F4.1 | Sports data / odds provider | Partial | `api-integration/odds-provider.ts`, `mock/*` (7 leagues, 7 days, 3–5 live, events, drift, suspensions, results, overrides), `api-football/api-football.provider.ts` (skeleton, `ODDS_PROVIDER=api-football`), `mock-control.controller.ts`. Feed-stall auto-suspend: phase 4. | `mock-provider.test.ts` (7 tests), `ingest-and-schema.test.ts › F4.1 / F4.3` |
| F4.2 | Backend / betting engine modules | Done | `apps/api/src/modules/{api-integration,odds-management,bet-processing,cash-out-engine,settlement-engine,wallet-ledger,user-management,admin-panel-api}` | `ingest-and-schema.test.ts › F4.2 engine modules named after the chart` |
| F4.3 | Database | Done | `packages/db/prisma/schema.prisma` + migrations (Users, WalletTransactions, Tickets, Events/Markets/Selections/OddsHistory, SettlementRecords, AuditLog, …) | `ingest-and-schema.test.ts › F4.3 database guards`, `› stores competitions, fixtures…` |
| F4.4 | User frontend | Partial | `apps/web` (Next.js 16 + React 19, responsive shell) | `web/test/i18n-parity.test.ts` |
| F4.5 | Admin frontend | Partial | `apps/admin` (separate Next.js app, 2FA login, protected shell) | `admin/test/i18n-parity.test.ts` |

## F5 — Supported features

| ID | Feature | Status | Proof |
| --- | --- | --- | --- |
| F5.1 | Pre-match betting | Missing | E2E (phase 7) |
| F5.2 | Live betting | Missing | E2E (phase 7) |
| F5.3 | Multiple markets | Partial | `mock-provider.test.ts › offers every market group of F1.9` (UI in phase 2) |
| F5.4 | Bet Builder | Missing | E2E (phase 7) |
| F5.5 | Cash out | Missing | E2E (phase 7) |
| F5.6 | RON wallet (admin controlled) | Missing | E2E (phase 7) |
| F5.7 | Romanian & English | Partial | key-parity tests in shared, web, admin; E2E language switch in phase 7 |
| F5.8 | Reports & logs | Missing | — |
| F5.9 | Responsive | Missing | Playwright 1440 px / 375 px (phase 7) |
| F5.10 | Complete, scalable, secure | Partial | stateless API (JWT + Redis-backed rate limits), Helmet, Argon2id, TOTP 2FA, refresh rotation + reuse detection, append-only ledger/audit; Redis pub/sub for WebSockets in phase 4 |
