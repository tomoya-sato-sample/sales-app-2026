/**
 * TC: A-01 〜 A-04  担当者選択画面
 */
import { test, expect } from '@playwright/test';
import { setupPage } from '../helpers/mockApi';

test.describe('A: 担当者選択', () => {
  // 各テスト前に IndexedDB・localStorage をクリアしてアプリを起動
  test.beforeEach(async ({ page }) => {
    await setupPage(page); // localStorage なし → 担当者選択画面から
  });

  test('A-01: スタッフ一覧が表示される', async ({ page }) => {
    await expect(page.locator('#screen-staff')).toBeVisible();
    await expect(page.locator('.staff-card')).toHaveCount(2);
    await expect(page.locator('.staff-card').nth(0)).toContainText('田中 太郎');
    await expect(page.locator('.staff-card').nth(1)).toContainText('山田 花子');
  });

  test('A-02: スタッフ選択で画面 B へ遷移し名前が表示される', async ({ page }) => {
    await page.locator('.staff-card').first().click();
    await expect(page.locator('#screen-main')).toBeVisible();
    await expect(page.locator('#staff-display')).toContainText('田中 太郎');
  });

  test('A-03: localStorage に担当者がある場合は選択画面をスキップ', async ({ page }) => {
    // 担当者を事前に localStorage にセットして再読み込み
    await page.evaluate(() => {
      localStorage.setItem(
        'currentStaff',
        JSON.stringify({ id: 'staff_01', name: '田中 太郎', area: '受付' })
      );
    });
    await page.reload();
    await page.waitForSelector('#screen-staff.active, #screen-main.active');
    await expect(page.locator('#screen-main')).toBeVisible();
    await expect(page.locator('#screen-staff')).toBeHidden();
  });

  test('A-04: 「変更」ボタンで担当者選択画面に戻れる', async ({ page }) => {
    // 担当者を選んで画面 B へ進む
    await page.locator('.staff-card').first().click();
    await expect(page.locator('#screen-main')).toBeVisible();

    // 変更ボタンをタップ
    await page.locator('#change-staff-btn').click();
    await expect(page.locator('#screen-staff')).toBeVisible();
    await expect(page.locator('.staff-card')).toHaveCount(2);
  });
});
