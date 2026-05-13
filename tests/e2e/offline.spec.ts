/**
 * TC: D-04  オフライン時の挙動
 * GAS POST を abort することでネットワーク障害を再現
 */
import { test, expect } from '@playwright/test';
import { setupPage } from '../helpers/mockApi';

test.describe('D-04: オフライン時の販売記録', () => {
  test('POST が失敗すると「⏳ オフライン保留中」と表示される', async ({ page }) => {
    // offline モード: GET は成功（アプリ起動OK）、POST は abort
    await setupPage(page, { withStaff: true, offline: true });
    await expect(page.locator('#screen-main')).toBeVisible();

    // 商品をカートに追加して会計へ
    await page.locator('[data-id="chopstick_001"]').click();
    await page.locator('#cart-footer').click();
    await page.waitForSelector('#screen-checkout.active');

    // QR コードで記録
    await page.locator('[data-payment="qr"]').click();
    await page.locator('#record-btn').click();

    // 完了画面でオフライン保留が表示される
    await expect(page.locator('#screen-complete')).toBeVisible();
    await expect(page.locator('#sync-status')).toHaveClass(/sync-pending/);
    await expect(page.locator('#sync-status')).toContainText('オフライン保留中');
  });

  test('オフライン時でも販売フローが最後まで完了する（IndexedDB に保存される）', async ({ page }) => {
    await setupPage(page, { withStaff: true, offline: true });
    await expect(page.locator('#screen-main')).toBeVisible();

    await page.locator('[data-id="item_low"]').click(); // ¥300
    await page.locator('#cart-footer').click();
    await page.waitForSelector('#screen-checkout.active');

    // 現金支払い ¥1,000 受取
    await page.locator('[data-payment="cash"]').click();
    await page.locator('.bill-btn[data-amount="1000"]').click();
    await expect(page.locator('#record-btn')).toBeEnabled();
    await page.locator('#record-btn').click();

    // 完了画面まで到達できること
    await expect(page.locator('#screen-complete')).toBeVisible();
    await expect(page.locator('#complete-total')).toContainText('¥300');
    await expect(page.locator('#sync-status')).toContainText('オフライン保留中');

    // IndexedDB に pending トランザクションが記録されていること
    const pendingCount = await page.evaluate(async () => {
      return new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('sales_db', 1);
        req.onsuccess = e => {
          const db = (e.target as IDBOpenDBRequest).result;
          const tx = db.transaction('transactions', 'readonly');
          const store = tx.objectStore('transactions');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            const pending = (getAll.result as Array<{ status: string }>)
              .filter(t => t.status === 'pending').length;
            resolve(pending);
          };
          getAll.onerror = () => reject(new Error('IDB error'));
        };
      });
    });
    expect(pendingCount).toBe(1);
  });
});
