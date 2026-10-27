import { expect, test } from '@playwright/test';
import { balanceOf, findMatches, fund, loginPlayer, newPlayer, pick, placeFromSlip } from './helpers';

test.describe('F5.1 pre-match betting, F5.3 markets, F5.4 Bet Builder, F5.5 cash out', () => {
  test('single, accumulator and Bet Builder from the slip; My Bets; cash out', async ({ page }) => {
    const p = await newPlayer();
    await fund(p.id, 50_000);
    const [a, b] = await findMatches('upcoming', 2);
    await loginPlayer(page, p);

    // F5.3 the match page offers many markets
    await page.goto(`/ro/match/${a!.id}`);
    for (const s of [pick(a!, 'MATCH_RESULT', 'HOME'), pick(a!, 'TOTAL_GOALS', 'OVER', 250), pick(a!, 'BTTS', 'YES')]) {
      await expect(page.getByTestId(`odds-${s.id}`)).toBeVisible();
    }

    // single
    await page.getByTestId(`odds-${pick(a!, 'MATCH_RESULT', 'HOME').id}`).click();
    await expect(page.getByTestId('slip-item')).toHaveCount(1);
    await page.getByTestId('quick-20').click();
    await placeFromSlip(page);
    await expect.poll(async () => (await balanceOf(p)).balanceBani).toBe(48_000);
    await page.getByRole('button', { name: /pariu nou|new bet/i }).click();

    // accumulator over two matches
    await page.getByTestId(`odds-${pick(a!, 'MATCH_RESULT', 'DRAW').id}`).click();
    await page.goto(`/ro/match/${b!.id}`);
    await page.getByTestId(`odds-${pick(b!, 'MATCH_RESULT', 'AWAY').id}`).click();
    await page.getByTestId('slip-tab-acca').click();
    await expect(page.getByTestId('slip-total-odds')).toBeVisible();
    await page.getByTestId('quick-10').click();
    await placeFromSlip(page);
    await expect.poll(async () => (await balanceOf(p)).balanceBani).toBe(47_000);
    await page.getByRole('button', { name: /pariu nou|new bet/i }).click();

    // Bet Builder: three picks on one match, one combined price
    for (const s of [pick(b!, 'MATCH_RESULT', 'HOME'), pick(b!, 'TOTAL_GOALS', 'OVER', 250), pick(b!, 'BTTS', 'YES')]) {
      await page.getByTestId(`odds-${s.id}`).click();
    }
    await page.getByTestId('slip-tab-builder').click();
    await expect(page.getByTestId('builder-odds')).toBeVisible();
    // a contradiction is explained instead of priced
    await page.getByTestId(`odds-${pick(b!, 'TOTAL_GOALS', 'UNDER', 250).id}`).click();
    await page.getByTestId(`odds-${pick(b!, 'TOTAL_GOALS', 'OVER', 250).id}`).click();
    await expect(page.getByTestId('builder-invalid')).toBeVisible();
    await page.getByTestId(`odds-${pick(b!, 'TOTAL_GOALS', 'UNDER', 250).id}`).click();
    await page.getByTestId(`odds-${pick(b!, 'TOTAL_GOALS', 'OVER', 250).id}`).click();
    await expect(page.getByTestId('builder-odds')).toBeVisible();
    await page.getByTestId('quick-10').click();
    await placeFromSlip(page);
    await expect.poll(async () => (await balanceOf(p)).balanceBani).toBe(46_000);

    // F1.7 My Bets: three open tickets, the builder is one leg with three picks
    await page.goto('/ro/my-bets');
    await expect(page.getByTestId('ticket-card')).toHaveCount(3);
    await expect(page.getByTestId('ticket-card').filter({ hasText: 'Bet Builder' })).toHaveCount(1);

    // F5.5 cash out the single
    const single = page.getByTestId('ticket-card').filter({ hasText: /simplu|single/i }).first();
    await single.getByTestId('cashout-button').click();
    await single.getByTestId('cashout-confirm').click();
    await page.getByTestId('bets-tab-cashout').click();
    await expect(page.locator('[data-testid="ticket-card"][data-status="CASHED_OUT"]')).toHaveCount(1);
    await expect.poll(async () => (await balanceOf(p)).balanceBani).toBeGreaterThan(46_000);
  });
});
