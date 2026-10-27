import { expect, test } from '@playwright/test';
import { api, balanceOf, findMatch, fund, loginPlayer, newPlayer, pick } from './helpers';

test.describe('Responsible gambling', () => {
  test('the help page links the tools and Romanian help line', async ({ page }) => {
    await page.goto('/ro');
    await page.getByTestId('footer-rg').click();
    await expect(page.getByTestId('rg-page')).toBeVisible();
    await expect(page.getByText('0800 800 099')).toBeVisible();
    await expect(page.locator('a[href="https://onjn.gov.ro"]')).toBeVisible();
  });

  test('a daily stake limit set by the player stops a bigger bet', async ({ page }) => {
    const p = await newPlayer();
    await fund(p.id, 10_000);
    const ev = await findMatch('upcoming');
    await loginPlayer(page, p);

    await page.goto('/ro/account');
    await page.getByTestId('account-tab-limits').click();
    await page.getByTestId('limit-input-DAILY_STAKE').fill('15');
    await page.getByTestId('limit-set-DAILY_STAKE').click();
    await expect(page.getByTestId('limit-DAILY_STAKE')).toContainText('15');

    await page.goto(`/ro/match/${ev.id}`);
    await page.getByTestId(`odds-${pick(ev, 'MATCH_RESULT', 'HOME').id}`).click();
    await page.getByTestId('quick-20').click();
    await page.getByTestId('slip-place').click();
    await expect(page.getByTestId('slip-error')).toBeVisible();
    expect((await balanceOf(p)).balanceBani).toBe(10_000);
  });

  test('self-exclusion blocks bets and deposits but not withdrawals', async ({ page }) => {
    const p = await newPlayer();
    await fund(p.id, 10_000);
    await api('/me/self-exclusion', { token: p.token, body: { days: 1, reason: 'E2E' } });
    const ev = await findMatch('upcoming');
    await loginPlayer(page, p);

    await page.goto('/ro/account');
    await expect(page.getByTestId('exclusion-active')).toBeVisible();
    await page.goto(`/ro/match/${ev.id}`);
    await page.getByTestId(`odds-${pick(ev, 'MATCH_RESULT', 'HOME').id}`).click();
    await page.getByTestId('slip-place').click();
    await expect(page.getByTestId('slip-error')).toBeVisible();

    await page.goto('/ro/account/wallet');
    await expect(page.getByTestId('deposit-btn')).toBeDisabled();
    await expect(page.getByTestId('withdraw-btn')).toBeEnabled();
  });

  test('the reality check reminds the player of time played', async ({ page }) => {
    const p = await newPlayer();
    await api('/me', { method: 'PATCH', token: p.token, body: { realityCheckMinutes: 15 } });
    await page.clock.install();
    await loginPlayer(page, p);
    await page.goto('/ro/account');
    // the reminder is scheduled once the session is restored
    await expect(page.getByTestId('account-balance')).toBeVisible();
    await page.clock.fastForward('16:00');
    await expect(page.getByTestId('reality-check')).toBeVisible();
    await page.getByTestId('reality-continue').click();
    await expect(page.getByTestId('reality-check')).toBeHidden();
  });
});
