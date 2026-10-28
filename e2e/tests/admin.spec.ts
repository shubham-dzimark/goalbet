import { expect, test } from '@playwright/test';
import { URLS } from '../stack.mjs';
import { adminLogin, adminToken, admins, api, apiBet, findMatch, fund, newPlayer, pick } from './helpers';

test.describe('F2.9 manual settlement, F5.8 reports & logs', () => {
  test('an operator settles a live match with an entered result; the bet is paid; reports and audit show it', async ({ page }) => {
    const p = await newPlayer();
    await fund(p.id, 10_000);
    const ev = await findMatch('live');
    const home = pick(ev, 'MATCH_RESULT', 'HOME');
    const ticket = await apiBet(p, home.id, home.oddsMilli);

    await adminLogin(page, admins().operator);
    await page.getByTestId('nav-sportsbook').click();
    await page.getByPlaceholder(/echip|team/i).fill(ev.homeTeam);
    await page.getByTestId(`event-settle-${ev.id}`).click();
    await page.getByTestId('settle-htHome').fill('1');
    await page.getByTestId('settle-htAway').fill('0');
    await page.getByTestId('settle-ftHome').fill('2');
    await page.getByTestId('settle-ftAway').fill('0');
    await page.getByTestId('reason-input').fill('E2E: result confirmed on TV');
    await page.getByTestId('reason-confirm').click();
    await expect(page.getByTestId('toast-success')).toBeVisible();

    // the player's ticket is won and paid
    await expect
      .poll(async () => (await api<{ status: string; payoutBani: number | null }>(`/tickets/${ticket.id}`, { token: p.token })).status)
      .toBe('WON');
    const paid = await api<{ payoutBani: number }>(`/tickets/${ticket.id}`, { token: p.token });
    expect(paid.payoutBani).toBeGreaterThan(1000);

    // F2.9 the result was wrong: re-settle as 0–0, the winnings are taken back
    await page.locator('select').nth(1).selectOption('FINISHED');
    await page.getByTestId(`event-resettle-${ev.id}`).click();
    await page.getByTestId('settle-htHome').fill('0');
    await page.getByTestId('settle-ftHome').fill('0');
    await page.getByTestId('reason-input').fill('E2E: goal disallowed by VAR');
    await page.getByTestId('reason-confirm').click();
    // the first settlement's toast may still be showing
    await expect(page.getByTestId('toast-success').last()).toBeVisible();
    await expect.poll(async () => (await api<{ status: string }>(`/tickets/${ticket.id}`, { token: p.token })).status).toBe('LOST');

    // F3.6 reports
    await page.getByTestId('nav-reports').click();
    await expect(page.getByTestId('report')).toBeVisible();
    await expect(page.getByTestId('bet-type-SINGLE')).toBeVisible();
    await expect(page.getByTestId('report-payments')).toBeVisible();

    // F3.8 audit log
    await page.goto(`${URLS.admin}/ro/audit`);
    await expect(page.getByTestId('audit-table').getByText('EVENT_SETTLED_MANUALLY').first()).toBeVisible();
  });

  test('roles: Finance cannot settle matches, Operator cannot approve payments', async ({ page }) => {
    await adminLogin(page, admins().finance);
    await page.getByTestId('nav-sportsbook').click();
    await page.getByTestId('events-table').waitFor();
    const settle = page.locator('[data-testid^="event-settle-"]').first();
    if (await settle.count()) await expect(settle).toBeDisabled();

    // a signed-in Operator is refused by the payments API (403, not 401)
    const token = await adminToken(admins().operator);
    const res = await fetch(`${URLS.api}/admin/payment-requests/00000000-0000-0000-0000-000000000000/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(403);
  });
});
