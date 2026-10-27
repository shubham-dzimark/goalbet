import { type Page, expect, test } from '@playwright/test';
import { URLS } from '../stack.mjs';
import { adminLogin, admins, balanceOf, loginPlayer, newPlayer } from './helpers';

/** Finance approves a player request by its reference code (admin → Wallet → Player requests). */
async function approve(admin: Page, reference: string, expectAnother = false) {
  await admin.goto(`${URLS.admin}/ro/wallet`);
  await admin.getByTestId(`approve-${reference}`).click();
  const note = admin.getByTestId('reason-input');
  if (await note.isVisible()) await note.fill('E2E: confirmed');
  await admin.getByTestId('reason-confirm').click();
  await expect(admin.getByTestId('toast-success')).toBeVisible();
  if (!expectAnother) await expect(admin.getByTestId(`approve-${reference}`)).toHaveCount(0);
}

const referenceIn = async (page: Page, testId: string) => {
  const text = (await page.getByTestId(testId).textContent()) ?? '';
  const ref = /[DW]-[A-Z0-9]{6}/.exec(text)?.[0];
  if (!ref) throw new Error(`no reference in ${testId}: ${text}`);
  return ref;
};

test.describe('F5.6 RON wallet (admin controlled): credits, deposits and withdrawals', () => {
  test('manual credit by Finance, then a deposit and a withdrawal approved by Finance', async ({ page, browser }) => {
    const p = await newPlayer();
    const adminCtx = await browser.newContext({ locale: 'ro-RO' });
    const admin = await adminCtx.newPage();
    await adminLogin(admin, admins().finance);

    // F3.3 manual credit with a reason
    await admin.goto(`${URLS.admin}/ro/users/${p.id}`);
    await admin.getByTestId('credit-btn').click();
    await admin.getByTestId('adjust-amount').fill('200');
    await admin.getByTestId('adjust-reason').fill('E2E welcome credit');
    await admin.getByTestId('adjust-submit').click();
    await expect.poll(async () => (await balanceOf(p)).balanceBani).toBe(20_000);

    // the player sees it and asks for a deposit
    await loginPlayer(page, p);
    await page.goto('/ro/account/wallet');
    await page.getByTestId('deposit-btn').click();
    await page.getByTestId('dep-amount').fill('150');
    await page.getByTestId('dep-submit').click();
    await expect(page.getByTestId('deposit-done')).toBeVisible();
    const dep = await referenceIn(page, 'deposit-done');
    await page.keyboard.press('Escape');
    // nothing moves until Finance confirms the money arrived
    expect((await balanceOf(p)).balanceBani).toBe(20_000);
    await approve(admin, dep);
    await expect.poll(async () => (await balanceOf(p)).balanceBani).toBe(35_000);

    // withdrawal: held at once, paid out by Finance
    await page.getByTestId('withdraw-btn').click();
    await page.getByTestId('method-CASH_AT_SHOP').click();
    await page.getByTestId('wd-amount').fill('100');
    await page.getByTestId('wd-submit').click();
    await expect(page.getByTestId('withdraw-done')).toBeVisible();
    const wd = await referenceIn(page, 'withdraw-done');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await balanceOf(p)).heldBani).toBe(10_000);
    await expect(page.getByTestId('wallet-held')).toBeVisible();
    await approve(admin, wd);
    await expect.poll(async () => balanceOf(p)).toMatchObject({ balanceBani: 25_000, heldBani: 0 });

    // the ledger shows every movement
    await page.reload();
    await expect(page.locator('[data-testid="wallet-row"][data-type="DEPOSIT"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="wallet-row"][data-type="WITHDRAWAL"]')).toHaveCount(1);
    await adminCtx.close();
  });

  test('a deposit above the approval threshold needs two different Finance admins', async ({ page, browser }) => {
    const p = await newPlayer();
    await loginPlayer(page, p);
    await page.goto('/ro/account/wallet');
    await page.getByTestId('deposit-btn').click();
    await page.getByTestId('dep-amount').fill('6000');
    await page.getByTestId('dep-submit').click();
    const dep = await referenceIn(page, 'deposit-done');

    const ctx1 = await browser.newContext({ locale: 'ro-RO' });
    const first = await ctx1.newPage();
    await adminLogin(first, admins().finance);
    await approve(first, dep, true);
    expect((await balanceOf(p)).balanceBani).toBe(0);
    // the same admin cannot give the second approval
    await first.reload();
    await expect(first.getByTestId(`approve-${dep}`)).toBeDisabled();

    const ctx2 = await browser.newContext({ locale: 'ro-RO' });
    const second = await ctx2.newPage();
    await adminLogin(second, admins().finance2);
    await approve(second, dep);
    await expect.poll(async () => (await balanceOf(p)).balanceBani).toBe(600_000);
    await ctx1.close();
    await ctx2.close();
  });
});
