import { test, expect } from '@playwright/test';

// Placeholder smoke test (issue #7): boots the Vite dev server and checks the
// game canvas mounts. Expand with screenshots / input simulation later.
test('smoke: game boots and canvas mounts', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Arcade Plane/);
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15000 });
});
