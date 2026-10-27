import { expect, test } from '@playwright/test';
import { balanceOf, findMatch, fund, loginPlayer, newPlayer, pick, placeFromSlip } from './helpers';

test.describe('F5.2 live betting', () => {
  test('a live match updates on the page and a live bet is accepted after the bet delay', async ({ page }) => {
    const p = await newPlayer();
    await fund(p.id, 10_000);
    const ev = await findMatch('live');
    await loginPlayer(page, p);

    await page.goto('/ro/live');
    await expect(page.getByText(ev.homeTeam).first()).toBeVisible();

    await page.goto(`/ro/match/${ev.id}`);
    await page.getByTestId(`odds-${pick(ev, 'MATCH_RESULT', 'HOME').id}`).click();
    // live prices move every few seconds: accept any change
    await page.getByTestId('slip-odds-pref').selectOption('ANY');
    await page.getByTestId('quick-10').click();
    const started = Date.now();
    await placeFromSlip(page);
    // F1.15 the live bet delay (5 s by default) runs before the bet is accepted
    expect(Date.now() - started).toBeGreaterThanOrEqual(4_500);
    await expect.poll(async () => (await balanceOf(p)).balanceBani).toBe(9_000);

    await page.goto('/ro/my-bets');
    await expect(page.locator('[data-testid="ticket-card"][data-status="LIVE"]')).toHaveCount(1);
  });
});
