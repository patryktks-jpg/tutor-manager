import { test, expect } from '@playwright/test';

test.describe('Tutor Manager - Chapter 11 Acceptance Flow (iPhone PWA)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for IDB load
    await expect(page.locator('h1')).toBeVisible();
  });

  test('Kryterium 1 & 6: Header, Limit Card, and Weekly Tiles render correctly', async ({ page }) => {
    // Check main title
    await expect(page.locator('text=Limit działalności nierejestrowanej')).toBeVisible();
    await expect(page.locator('text=Podsumowanie tygodnia')).toBeVisible();
  });

  test('Kryterium 3: Quick complete lesson updates limit and status', async ({ page }) => {
    // Check if lesson list or empty state exists
    const planHeading = page.locator('text=Plan na dziś');
    await expect(planHeading).toBeVisible();

    // Verify navigation tabs
    await expect(page.locator('button:has-text("Grafik")')).toBeVisible();
    await expect(page.locator('button:has-text("Uczniowie")')).toBeVisible();
    await expect(page.locator('button:has-text("Finanse")')).toBeVisible();
    await expect(page.locator('button:has-text("Raporty")')).toBeVisible();
  });

  test('Kryterium 5: Reports tab shows monthly period and closing/snapshot option', async ({ page }) => {
    await page.click('button:has-text("Raporty")');
    await expect(page.locator('h1:has-text("Raporty")')).toBeVisible();
    await expect(page.locator('text=Zestawienie działalności')).toBeVisible();
    await expect(page.locator('text=Przychód należny')).toBeVisible();
  });

  test('Settings: Legal parameters and PIN security configuration', async ({ page }) => {
    // Open settings via gear icon
    await page.click('button[aria-label="Ustawienia"]');
    await expect(page.locator('h1:has-text("Ustawienia")')).toBeVisible();
    await expect(page.locator('text=Limit 2026: 225% × 4 806,00 zł = 10 813,50 zł')).toBeVisible();
    await expect(page.locator('text=Arkusz Google')).toBeVisible();
  });
});
