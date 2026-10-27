import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Page, expect } from '@playwright/test';
import { generate } from 'otplib';
import { ROOT, URLS } from '../stack.mjs';

export type Role = 'SUPER_ADMIN' | 'OPERATOR' | 'FINANCE';
export interface E2EAdmin {
  email: string;
  password: string;
  secret: string;
  role: Role;
}
export type E2EAdmins = Record<'superAdmin' | 'operator' | 'finance' | 'finance2', E2EAdmin>;

export const ADMINS_FILE = join(ROOT, 'e2e/.auth/admins.json');
export const admins = (): E2EAdmins => JSON.parse(readFileSync(ADMINS_FILE, 'utf8')) as E2EAdmins;

export interface Player {
  id: string;
  name: string;
  email: string;
  password: string;
  token: string;
}

let seq = 0;
const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Direct API call to the E2E API (setup only; the tests themselves go through the UI). */
export async function api<T>(path: string, init: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(`${URLS.api}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...init.headers,
    },
    body: init.body ? JSON.stringify(init.body) : null,
  });
  const json = (await res.json().catch(() => null)) as T;
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

// ── admins: a TOTP code is accepted once, so wait for the next 30 s step before reusing one.
// The last step is kept in a file because Playwright restarts its worker after a failed test. ──
const STEPS_FILE = join(ROOT, 'e2e/.auth/totp-steps.json');
const readSteps = (): Record<string, number> => {
  try {
    return JSON.parse(readFileSync(STEPS_FILE, 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
};
export async function totpFor(a: E2EAdmin): Promise<string> {
  for (;;) {
    const step = Math.floor(Date.now() / 30_000);
    const steps = readSteps();
    if (step > (steps[a.email] ?? -1)) {
      writeFileSync(STEPS_FILE, JSON.stringify({ ...steps, [a.email]: step }));
      return generate({ secret: a.secret });
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

export async function adminToken(a: E2EAdmin): Promise<string> {
  const res = await api<{ accessToken: string }>('/admin/auth/login', { body: { email: a.email, password: a.password, totp: await totpFor(a) } });
  return res.accessToken;
}

/** Signs in to the admin app (password → 6-digit code) and waits for the dashboard. */
export async function adminLogin(page: Page, a: E2EAdmin) {
  await page.goto(`${URLS.admin}/ro/login`);
  await page.fill('#email', a.email);
  await page.fill('#password', a.password);
  await page.click('button[type="submit"]');
  await page.fill('#totp', await totpFor(a));
  await page.click('button[type="submit"]');
  await expect(page.getByTestId('dashboard-kpis')).toBeVisible({ timeout: 30_000 });
}

// ── players ──
export async function newPlayer(): Promise<Player> {
  const id = unique();
  const body = {
    name: 'E2E Player',
    email: `e2e-${id}@example.com`,
    phone: `07${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
    password: 'Parola1234',
    dateOfBirth: '1990-05-01',
    acceptTerms: true,
  };
  const res = await api<{ user: { id: string }; accessToken: string }>('/auth/register', { body });
  return { id: res.user.id, name: body.name, email: body.email, password: body.password, token: res.accessToken };
}

/** Manual credit by a Super admin (below the four-eyes threshold). */
export async function fund(playerId: string, bani: number) {
  const token = await adminToken(admins().superAdmin);
  await api(`/admin/users/${playerId}/wallet`, { token, body: { type: 'ADMIN_CREDIT', amountBani: bani, reason: 'E2E funding' } });
}

export async function loginPlayer(page: Page, p: Pick<Player, 'email' | 'password'>, locale: 'ro' | 'en' = 'ro') {
  await page.goto(`/${locale}/login`);
  await page.fill('#email', p.email);
  await page.fill('#password', p.password);
  await page.click('button[type="submit"]');
  await expect(page.getByTestId('balance-chip')).toBeVisible({ timeout: 30_000 });
}

export const ron = (bani: number) => (bani / 100).toFixed(2);

// ── catalogue ──
interface SelectionLite {
  id: string;
  outcome: string;
  oddsMilli: number;
  active: boolean;
}
interface MarketLite {
  id: string;
  type: string;
  line: number | null;
  status: string;
  selections: SelectionLite[];
}
export interface EventLite {
  id: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  suspended: boolean;
  markets: MarketLite[];
}

/** Matches with open 1X2, Over/Under 2.5 and BTTS markets (pre-match or live). */
export async function findMatches(kind: 'upcoming' | 'live', n = 1, skip: string[] = []): Promise<EventLite[]> {
  const list = await api<{ id: string; suspended: boolean }[]>(`/catalog/${kind}`);
  const found: EventLite[] = [];
  for (const e of list.filter((x) => !x.suspended && !skip.includes(x.id))) {
    const ev = await api<EventLite>(`/catalog/events/${e.id}`);
    const ok = ['MATCH_RESULT', 'BTTS'].every((t) => ev.markets.some((m) => m.type === t && m.status === 'OPEN')) && totals(ev);
    if (ok) found.push(ev);
    if (found.length === n) return found;
  }
  throw new Error(`only ${found.length} ${kind} matches with open main markets, needed ${n}`);
}
export const findMatch = async (kind: 'upcoming' | 'live', skip: string[] = []) => (await findMatches(kind, 1, skip))[0]!;

/** Places what is in the slip; accepts changed prices (live odds move) and retries. */
export async function placeFromSlip(page: Page) {
  for (let i = 0; i < 4; i++) {
    const accept = page.getByTestId('slip-accept-odds');
    if (await accept.isVisible()) await accept.click();
    await page.getByTestId('slip-place').click();
    const done = await Promise.race([
      page.getByTestId('slip-success').waitFor({ timeout: 20_000 }).then(() => true),
      page.getByTestId('slip-accept-odds').waitFor({ timeout: 20_000 }).then(() => false),
    ]);
    if (done) return;
  }
  throw new Error('bet was not accepted after 4 attempts');
}

/** Places a single through the API (setup for admin flows). */
export async function apiBet(p: Player, selectionId: string, oddsMilli: number, stakeBani = 1000) {
  return api<{ id: string; code: string; status: string }>('/bets', {
    token: p.token,
    headers: { 'idempotency-key': `e2e-${unique()}` },
    body: { type: 'SINGLE', stakeBani, oddsChangePreference: 'ANY', legs: [{ kind: 'SELECTION', selectionId, oddsMilli }] },
  });
}

export const balanceOf = async (p: Player) => (await api<{ balanceBani: number; heldBani: number }>('/wallet', { token: p.token }));

const totals = (ev: EventLite) => ev.markets.find((m) => m.type === 'TOTAL_GOALS' && m.line === 250 && m.status === 'OPEN');

export function pick(ev: EventLite, type: string, outcome: string, line: number | null = null): SelectionLite {
  const m = ev.markets.find((x) => x.type === type && (line === null || x.line === line));
  const s = m?.selections.find((x) => x.outcome === outcome);
  if (!s) throw new Error(`no ${type} ${outcome} on ${ev.homeTeam} – ${ev.awayTeam}`);
  return s;
}

/** Fails when the page scrolls sideways (responsive check, F5.9). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}
