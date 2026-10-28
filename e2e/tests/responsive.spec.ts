import { expect, test } from '@playwright/test';
import { URLS } from '../stack.mjs';
import { adminLogin, admins, expectNoHorizontalScroll, findMatch, fund, loginPlayer, newPlayer, pick } from './helpers';

// runs in both projects: desktop 1440 px and mobile 375 px (F5.9)
test.describe('F5.9 responsive', () => {
  test('player pages never scroll sideways; the slip works at every width', async ({ page }, info) => {
    const p = await newPlayer();
    await fund(p.id, 5_000);
    const ev = await findMatch('upcoming');
    await loginPlayer(page, p);

    for (const path of ['/ro', '/ro/live', `/ro/match/${ev.id}`, '/ro/my-bets', '/ro/account', '/ro/account/wallet', '/ro/responsible-gambling']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page);
    }

    await page.goto(`/ro/match/${ev.id}`);
    await page.getByTestId(`odds-${pick(ev, 'MATCH_RESULT', 'HOME').id}`).click();
    if (info.project.name === 'mobile') {
      // below xl the slip is a bottom sheet opened from the tab bar
      await page.getByTestId('bottom-nav-slip').click();
    }
    // on mobile the slip lives in the sheet (the desktop column is hidden)
    const slip = info.project.name === 'mobile' ? page.getByRole('dialog') : page.locator('aside');
    await expect(slip.getByTestId('slip-item')).toBeVisible();
    await expect(slip.getByTestId('slip-place')).toBeEnabled();
  });

  test('admin pages never scroll sideways', async ({ page }) => {
    await adminLogin(page, admins().superAdmin);
    for (const path of ['/ro', '/ro/users', '/ro/wallet', '/ro/bets', '/ro/sportsbook', '/ro/reports', '/ro/audit', '/ro/email']) {
      await page.goto(`${URLS.admin}${path}`);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page);
    }
  });
});
