/**
 * TC: C-01 〜 C-12  会計確認画面
 * TC: D-01 〜 D-05  完了画面
 */
import { test, expect, Page } from '@playwright/test';
import { setupPage } from '../helpers/mockApi';

/** 商品をカートに入れて会計画面へ進む共通ヘルパー */
async function gotoCheckout(page: Page) {
  await page.locator('[data-id="chopstick_001"]').click(); // ¥800
  await page.locator('#cart-footer').click();
  await page.waitForSelector('#screen-checkout.active');
}

test.describe('C: 会計確認', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page, { withStaff: true });
    await expect(page.locator('#screen-main')).toBeVisible();
  });

  test('C-01: カートフッタータップで会計画面へ遷移する', async ({ page }) => {
    await page.locator('[data-id="chopstick_001"]').click();
    await page.locator('#cart-footer').click();
    await expect(page.locator('#screen-checkout')).toBeVisible();
  });

  test('C-02: カートが空のときフッタータップしても会計画面へ遷移しない', async ({ page }) => {
    await page.locator('#cart-footer').click();
    await expect(page.locator('#screen-checkout')).toBeHidden();
    await expect(page.locator('#screen-main')).toBeVisible();
  });

  test('C-03: 会計画面の商品に img タグで画像表示される（URL テキストでない）', async ({ page }) => {
    await gotoCheckout(page);
    const item = page.locator('.checkout-item').first();
    await expect(item.locator('img.item-img')).toBeVisible();
    await expect(item).not.toContainText('https://');
  });

  test('C-04: ± ボタンで数量変更が反映される', async ({ page }) => {
    await gotoCheckout(page);
    // + で数量を 2 に
    await page.locator('.qty-btn[data-action="plus"]').click();
    await expect(page.locator('.qty-val')).toContainText('2');
    await expect(page.locator('#checkout-total-amount')).toContainText('¥1,600');

    // - で数量を 1 に
    await page.locator('.qty-btn[data-action="minus"]').click();
    await expect(page.locator('.qty-val')).toContainText('1');
    await expect(page.locator('#checkout-total-amount')).toContainText('¥800');
  });

  test('C-05: 数量を 0 にすると商品が会計リストから削除される', async ({ page }) => {
    await gotoCheckout(page);
    await expect(page.locator('.checkout-item')).toHaveCount(1);
    await page.locator('.qty-btn[data-action="minus"]').click();
    await expect(page.locator('.checkout-item')).toHaveCount(0);
  });

  test('C-06: 決済方法未選択のとき「記録する」は disabled', async ({ page }) => {
    await gotoCheckout(page);
    await expect(page.locator('#record-btn')).toBeDisabled();
  });

  test('C-07: QR コード選択で「記録する」が active になる', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="qr"]').click();
    await expect(page.locator('#record-btn')).toBeEnabled();
  });

  test('C-07b: クレジット選択で「記録する」が active になる', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="card"]').click();
    await expect(page.locator('#record-btn')).toBeEnabled();
  });

  test('C-08: 現金選択でおつり計算 UI が表示される', async ({ page }) => {
    await gotoCheckout(page);
    await expect(page.locator('#cash-section')).toBeHidden();
    await page.locator('[data-payment="cash"]').click();
    await expect(page.locator('#cash-section')).toBeVisible();
  });

  test('C-09: おつり計算が正しい（¥1,000 受取・合計¥800 → おつり¥200）', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="cash"]').click();

    // ¥1,000 クイックボタン
    await page.locator('.bill-btn[data-amount="1000"]').click();
    await expect(page.locator('#change-row')).toBeVisible();
    await expect(page.locator('#change-amount')).toContainText('¥200');
    await expect(page.locator('#record-btn')).toBeEnabled();
  });

  test('C-10: 受取額 < 合計のとき赤エラー表示・「記録する」disabled', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="cash"]').click();

    // ¥500 を手入力（合計 ¥800 に対して不足）
    await page.locator('#cash-received').fill('500');
    await page.locator('#cash-received').dispatchEvent('input');

    await expect(page.locator('#change-short')).toBeVisible();
    await expect(page.locator('#change-row')).toBeHidden();
    await expect(page.locator('#record-btn')).toBeDisabled();
  });

  test('C-11: クイック紙幣ボタン（¥5,000）で金額が入力される', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="cash"]').click();
    await page.locator('.bill-btn[data-amount="5000"]').click();
    await expect(page.locator('#cash-received')).toHaveValue('5000');
    await expect(page.locator('#change-amount')).toContainText('¥4,200');
  });

  test('C-11b: 紙幣ボタンを複数回押すと加算される（¥1,000 × 2 = ¥2,000）', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="cash"]').click();
    await page.locator('.bill-btn[data-amount="1000"]').click();
    await page.locator('.bill-btn[data-amount="1000"]').click();
    await expect(page.locator('#cash-received')).toHaveValue('2000');
    await expect(page.locator('#change-amount')).toContainText('¥1,200');
  });

  test('C-11c: 異なる紙幣ボタンを組み合わせると加算される（¥1,000 + ¥5,000 = ¥6,000）', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="cash"]').click();
    await page.locator('.bill-btn[data-amount="1000"]').click();
    await page.locator('.bill-btn[data-amount="5000"]').click();
    await expect(page.locator('#cash-received')).toHaveValue('6000');
    await expect(page.locator('#change-amount')).toContainText('¥5,200');
  });

  test('C-11d: クリアボタンで金額欄がリセットされる', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="cash"]').click();
    await page.locator('.bill-btn[data-amount="5000"]').click();
    await expect(page.locator('#cash-received')).toHaveValue('5000');
    await page.locator('#cash-clear-btn').click();
    await expect(page.locator('#cash-received')).toHaveValue('');
    await expect(page.locator('#change-row')).toBeHidden();
    await expect(page.locator('#change-short')).toBeHidden();
    await expect(page.locator('#record-btn')).toBeDisabled();
  });

  test('C-11e: ¥50,000 ボタンが存在しない', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="cash"]').click();
    await expect(page.locator('.bill-btn[data-amount="50000"]')).toHaveCount(0);
  });

  test('C-12: 「←」ボタンで画面 B に戻る（カートは維持）', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('#back-btn').click();
    await expect(page.locator('#screen-main')).toBeVisible();
    // カートが維持されていること
    await expect(page.locator('#cart-footer')).not.toHaveClass(/empty/);
    await expect(page.locator('#cart-total')).toContainText('¥800');
  });

  test('C-12b: 「←」で戻り再度会計画面を開いても決済方法の選択が維持される', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="qr"]').click();
    await expect(page.locator('[data-payment="qr"]')).toHaveClass(/selected/);

    // 戻る
    await page.locator('#back-btn').click();
    await expect(page.locator('#screen-main')).toBeVisible();

    // 再度会計へ
    await page.locator('#cart-footer').click();
    await page.waitForSelector('#screen-checkout.active');
    // QR が選択済みのままであること
    await expect(page.locator('[data-payment="qr"]')).toHaveClass(/selected/);
    await expect(page.locator('#record-btn')).toBeEnabled();
  });
});

test.describe('D: 完了画面', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page, { withStaff: true });
    await expect(page.locator('#screen-main')).toBeVisible();
  });

  test('D-01: 「記録する」タップで完了画面へ遷移する', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="qr"]').click();
    await page.locator('#record-btn').click();
    await expect(page.locator('#screen-complete')).toBeVisible();
  });

  test('D-02: 完了画面に商品・合計・決済方法のサマリーが正しく表示される', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="qr"]').click();
    await page.locator('#record-btn').click();

    await expect(page.locator('#complete-rows')).toContainText('架箸 ×1');
    await expect(page.locator('#complete-rows')).toContainText('¥800');
    await expect(page.locator('#complete-total')).toContainText('¥800');
    await expect(page.locator('#complete-payment')).toContainText('QRコード');
  });

  test('D-03: オンライン時は「✓ 送信済み」が表示される', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="card"]').click();
    await page.locator('#record-btn').click();
    await expect(page.locator('#sync-status')).toHaveClass(/sync-ok/);
    await expect(page.locator('#sync-status')).toContainText('送信済み');
  });

  test('D-05: 「次の販売へ」タップで画面 B に戻りカートがクリアされる', async ({ page }) => {
    await gotoCheckout(page);
    await page.locator('[data-payment="qr"]').click();
    await page.locator('#record-btn').click();
    await expect(page.locator('#screen-complete')).toBeVisible();

    await page.locator('#next-btn').click();
    await expect(page.locator('#screen-main')).toBeVisible();
    await expect(page.locator('#cart-footer')).toHaveClass(/empty/);
    await expect(page.locator('#cart-total')).toContainText('¥0');
  });
});
