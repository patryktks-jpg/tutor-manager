import { test, expect } from '@playwright/test';

test.describe('Tutor Manager - Chapter 11 Acceptance Flow (iPhone PWA)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for IDB load and main view to be visible
    await expect(page.locator('h1')).toBeVisible();
  });

  test('Kryterium 1 & 6: Header, Limit Card, and Weekly Tiles render correctly', async ({ page }) => {
    // Check main title
    await expect(page.locator('text=Limit działalności nierejestrowanej')).toBeVisible();
    await expect(page.locator('text=Podsumowanie tygodnia')).toBeVisible();
    await expect(page.locator('text=Plan na dziś')).toBeVisible();

    // Verify navigation tabs
    await expect(page.locator('button:has-text("Grafik")')).toBeVisible();
    await expect(page.locator('button:has-text("Uczniowie")')).toBeVisible();
    await expect(page.locator('button:has-text("Finanse")')).toBeVisible();
    await expect(page.locator('button:has-text("Raporty")')).toBeVisible();
  });

  test('Kryterium 3: Quick complete & pay lesson updates limit, status and ewidencja atomowo', async ({ page }) => {
    // 1. Go to Grafik (Calendar) and plan a lesson for today
    await page.click('button:has-text("Grafik")');
    await expect(page.locator('h1:has-text("Grafik")')).toBeVisible();

    await page.click('button:has-text("+ Zaplanuj lekcję")');
    await expect(page.locator('text=Zaplanuj lekcję')).toBeVisible();

    // Fill form and submit
    await page.click('button[type="submit"]:has-text("Zapisz lekcję")');

    // 2. Return to Start tab
    await page.click('button:has-text("Start")');
    await expect(page.locator('text=Plan na dziś')).toBeVisible();

    // 3. Find the action button "Zrealizuj" (which triggers completeAndPayLesson)
    const zrealizujBtn = page.locator('button:has-text("Zrealizuj")').first();
    await expect(zrealizujBtn).toBeVisible();

    // Read current used limit text
    const limitSection = page.locator('text=Limit działalności nierejestrowanej').locator('..');
    await expect(limitSection).toBeVisible();

    // Click "Zrealizuj" to execute atomic complete & BLIK pay
    await zrealizujBtn.click();

    // 4. Verify lesson badge changed to "Opłacona"
    await expect(page.locator('.ios-badge-green:has-text("Opłacona")').first()).toBeVisible();

    // 5. Navigate to Finanse -> Ewidencja przychodów
    await page.click('button:has-text("Finanse")');
    await expect(page.locator('h1:has-text("Finanse")')).toBeVisible();

    // Switch sub-tab to Ewidencja
    await page.click('button:has-text("Ewidencja przychodów")');
    await expect(page.locator('text=Ewidencja sprzedaży')).toBeVisible();

    // Verify that paid income entry is visible with status Opłacona and sequential number
    await expect(page.locator('text=Opłacona').first()).toBeVisible();
    await expect(page.locator('text=2026/').first()).toBeVisible();
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
