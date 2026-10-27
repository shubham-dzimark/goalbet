import { expect, test } from '@playwright/test';

test.describe('F1.2 registration, F5.7 Romanian & English', () => {
  test('registers in Romanian (18+ enforced), then switches the whole site to English', async ({ page }) => {
    const id = Date.now().toString(36);
    await page.goto('/ro/register');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    await page.fill('#name', 'Ion Popescu');
    await page.fill('#email', `e2e-reg-${id}@example.com`);
    await page.fill('#phone', `07${String(Date.now()).slice(-8)}`);
    await page.fill('#password', 'Parola1234');
    // under 18: refused
    const minor = new Date();
    minor.setFullYear(minor.getFullYear() - 17);
    await page.fill('#dateOfBirth', minor.toISOString().slice(0, 10));
    await page.locator('#acceptTerms').click();
    await page.getByRole('button', { name: /creează|înregistr|cont/i }).last().click();
    await expect(page.locator('#dateOfBirth-error')).toContainText('18');

    await page.fill('#dateOfBirth', '1992-03-14');
    await page.getByRole('button', { name: /creează|înregistr|cont/i }).last().click();
    await expect(page.getByTestId('balance-chip')).toBeVisible({ timeout: 30_000 });

    // language switch keeps the page and translates it
    await page.goto('/ro/my-bets');
    await expect(page.getByRole('heading', { name: /pariurile mele/i })).toBeVisible();
    await page.getByTestId('lang-en').first().click();
    await expect(page).toHaveURL(/\/en\/my-bets/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: /my bets/i })).toBeVisible();
    await expect(page.getByTestId('footer-rg')).toHaveText('Responsible gambling');
  });
});
