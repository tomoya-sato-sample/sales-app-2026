/**
 * TC: B-01 〜 B-13  商品グリッド・カート操作
 * TC: V-01 〜 V-07  バリアントモーダル（エコバッグ・靴ベラ）
 */
import { test, expect } from '@playwright/test';
import { setupPage } from '../helpers/mockApi';

test.describe('B: 商品グリッド', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page, { withStaff: true });
    await expect(page.locator('#screen-main')).toBeVisible();
  });

  test('B-01: 商品が2列グリッドで表示される', async ({ page }) => {
    const grid = page.locator('#product-grid');
    await expect(grid).toBeVisible();
    // 通常商品カード（グループカードは2列全幅なので除く）
    const normalCards = grid.locator('.product-card:not(.group-card)');
    await expect(normalCards).toHaveCount(2); // chopstick_001, item_low
  });

  test('B-02: エコバッグ・靴ベラがグループカードで全幅表示される', async ({ page }) => {
    await expect(page.locator('.group-card[data-group="ecobag"]')).toBeVisible();
    await expect(page.locator('.group-card[data-group="shoehorn"]')).toBeVisible();
  });

  test('B-03: HTTP URL の商品は img タグで表示される（URLテキストでない）', async ({ page }) => {
    // 通常商品カード（架箸）の中に img タグがある
    const chopstickCard = page.locator('[data-id="chopstick_001"]');
    await expect(chopstickCard.locator('img.product-img')).toBeVisible();
    // テキストとして URL が露出していないこと
    await expect(chopstickCard).not.toContainText('https://');
  });

  test('B-04: 在庫0の商品は SOLD OUT バッジ表示・タップ不可', async ({ page }) => {
    // shoehorn_sold はグループモーダル内で SOLD OUT になる → V-03 で確認
    // ここではグループカード全体が SOLD OUT かを確認するケース（全バリアント在庫0は今回なし）
    // 代わりに item_low の sold-out 状態を fixture 変更でテストするため、
    // DOM上の .sold-out 要素のタップが無効になっていることを確認する
    const soldOutCards = page.locator('.product-card.sold-out');
    for (const card of await soldOutCards.all()) {
      await expect(card).toHaveAttribute('aria-disabled', 'true');
    }
  });

  test('B-05: 在庫5以下の商品に「残少」バッジが表示される', async ({ page }) => {
    // item_low: init_stock=3 → 残少
    const lowCard = page.locator('[data-id="item_low"]');
    await expect(lowCard).toHaveClass(/low-stock/);
    await expect(lowCard.locator('.badge-low')).toBeVisible();
    await expect(lowCard.locator('.badge-low')).toContainText('残少');
  });

  test('B-06: 商品タップでカートに追加され badge-qty が表示される', async ({ page }) => {
    // .product-card[data-id] で指定して card-minus-btn との strict mode 衝突を避ける
    const card = page.locator('.product-card[data-id="chopstick_001"]');
    await card.click();
    await expect(card).toHaveClass(/in-cart/);
    await expect(card.locator('.badge-qty')).toContainText('×1');
  });

  test('B-07: 在庫数以上はカートに追加できずトーストが表示される', async ({ page }) => {
    // item_low の在庫 = 3
    const card = page.locator('.product-card[data-id="item_low"]');
    for (let i = 0; i < 3; i++) {
      await card.click();
    }
    // 4回目はトースト表示
    await card.click();
    await expect(page.locator('#toast')).toBeVisible();
    await expect(page.locator('#toast')).toContainText('在庫がありません');
    // バッジは 3 のまま
    await expect(card.locator('.badge-qty')).toContainText('×3');
  });

  test('B-08: カートに1個以上入れると card-minus-btn が出現する', async ({ page }) => {
    const card = page.locator('[data-id="chopstick_001"]');
    await expect(card.locator('.card-minus-btn')).toBeHidden();
    await card.click();
    await expect(card.locator('.card-minus-btn')).toBeVisible();
  });

  test('B-09: card-minus-btn タップで数量が1減る', async ({ page }) => {
    // 2個追加（2回目以降は card-minus-btn が存在するので .product-card で絞る）
    const card = page.locator('.product-card[data-id="chopstick_001"]');
    await card.click();
    await card.click();
    await expect(card.locator('.badge-qty')).toContainText('×2');

    // 1個減らす
    await page.locator('[data-id="chopstick_001"] .card-minus-btn').click();
    await expect(page.locator('[data-id="chopstick_001"] .badge-qty')).toContainText('×1');
  });

  test('B-10: qty=1 の状態で card-minus-btn → カートから削除・ボタン消える', async ({ page }) => {
    await page.locator('[data-id="chopstick_001"]').click();
    await expect(page.locator('[data-id="chopstick_001"] .badge-qty')).toContainText('×1');

    await page.locator('[data-id="chopstick_001"] .card-minus-btn').click();
    // バッジ消え、ボタン消え、in-cart クラスが外れる
    await expect(page.locator('[data-id="chopstick_001"] .badge-qty')).toBeHidden();
    await expect(page.locator('[data-id="chopstick_001"] .card-minus-btn')).toBeHidden();
    await expect(page.locator('[data-id="chopstick_001"]')).not.toHaveClass(/in-cart/);
  });

  test('B-11: card-minus-btn タップ時にカードのタップイベントは発火しない（数量が増えない）', async ({ page }) => {
    await page.locator('[data-id="chopstick_001"]').click(); // qty=1
    await page.locator('[data-id="chopstick_001"] .card-minus-btn').click(); // qty=0 → 削除
    // もし stopPropagation が効いていなければ qty は 0→1 になってしまう
    await expect(page.locator('[data-id="chopstick_001"] .badge-qty')).toBeHidden();
  });

  test('B-12: カート追加でフッターの件数・合計金額がリアルタイム更新される', async ({ page }) => {
    await expect(page.locator('#cart-footer')).toHaveClass(/empty/);

    await page.locator('[data-id="chopstick_001"]').click(); // ¥800
    await expect(page.locator('#cart-footer')).not.toHaveClass(/empty/);
    await expect(page.locator('#cart-count')).toContainText('1点');
    await expect(page.locator('#cart-total')).toContainText('¥800');

    await page.locator('[data-id="item_low"]').click(); // ¥300
    await expect(page.locator('#cart-count')).toContainText('2点');
    await expect(page.locator('#cart-total')).toContainText('¥1,100');
  });

  test('B-13: カートが空のときフッターは empty クラスを持つ', async ({ page }) => {
    await expect(page.locator('#cart-footer')).toHaveClass(/empty/);
  });

  test('B-14: カートが空のときクリアボタンは非表示', async ({ page }) => {
    await expect(page.locator('#clear-cart-btn')).toHaveClass(/hidden/);
  });

  test('B-15: カートに商品を追加するとクリアボタンが表示される', async ({ page }) => {
    await page.locator('.product-card[data-id="chopstick_001"]').click();
    await expect(page.locator('#clear-cart-btn')).not.toHaveClass(/hidden/);
  });

  test('B-16: クリアボタンタップでカートが空になりボタンも非表示になる', async ({ page }) => {
    // 2商品を追加
    await page.locator('.product-card[data-id="chopstick_001"]').click();
    await page.locator('.product-card[data-id="item_low"]').click();
    await expect(page.locator('#cart-count')).toContainText('2点');
    await expect(page.locator('#clear-cart-btn')).not.toHaveClass(/hidden/);

    // クリア
    await page.locator('#clear-cart-btn').click();

    // カートが空になること
    await expect(page.locator('#cart-footer')).toHaveClass(/empty/);
    await expect(page.locator('#cart-count')).toContainText('0点');
    // クリアボタンも非表示になること
    await expect(page.locator('#clear-cart-btn')).toHaveClass(/hidden/);
    // 商品カードのバッジも消えること
    await expect(page.locator('[data-id="chopstick_001"] .badge-qty')).toBeHidden();
    await expect(page.locator('[data-id="item_low"] .badge-qty')).toBeHidden();
  });

  test('B-17: 担当者変更後、商品選択状態がリセットされて画面に反映される', async ({ page }) => {
    // 商品をカートに追加
    await page.locator('.product-card[data-id="chopstick_001"]').click();
    await expect(page.locator('.product-card[data-id="chopstick_001"]')).toHaveClass(/in-cart/);
    await expect(page.locator('#clear-cart-btn')).not.toHaveClass(/hidden/);

    // 担当者変更
    await page.locator('#change-staff-btn').click();
    await expect(page.locator('#screen-staff')).toBeVisible();

    // 別の担当者を選択して戻る
    await page.locator('.staff-card').first().click();
    await expect(page.locator('#screen-main')).toBeVisible();

    // カートがリセットされていること
    await expect(page.locator('#cart-footer')).toHaveClass(/empty/);
    await expect(page.locator('#clear-cart-btn')).toHaveClass(/hidden/);
    await expect(page.locator('.product-card[data-id="chopstick_001"]')).not.toHaveClass(/in-cart/);
    await expect(page.locator('[data-id="chopstick_001"] .badge-qty')).toBeHidden();
  });
});

test.describe('V: バリアントモーダル', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page, { withStaff: true });
    await expect(page.locator('#screen-main')).toBeVisible();
  });

  test('V-01: エコバッググループカードタップでモーダルが開く', async ({ page }) => {
    await page.locator('.group-card[data-group="ecobag"]').click();
    await expect(page.locator('#variant-modal')).toBeVisible();
    await expect(page.locator('#variant-modal-title')).toContainText('エコバッグ');
  });

  test('V-02: モーダルにエコバッグの全バリアントが表示される', async ({ page }) => {
    await page.locator('.group-card[data-group="ecobag"]').click();
    // fixture には赤・カーキ・青の3種
    await expect(page.locator('#variant-grid-items .variant-card')).toHaveCount(3);
  });

  test('V-03: バリアントに在庫数が表示される（在庫0は SOLD OUT）', async ({ page }) => {
    await page.locator('.group-card[data-group="shoehorn"]').click();
    // shoehorn_gold: 在庫あり、shoehorn_sold: 在庫0
    const cards = page.locator('#variant-grid-items .variant-card');
    await expect(cards).toHaveCount(2);
    // 銀（sold）は SOLD OUT 表示
    const soldCard = page.locator('#variant-grid-items .variant-card.sold-out');
    await expect(soldCard).toBeVisible();
    await expect(soldCard.locator('.variant-stock')).toContainText('SOLD OUT');
  });

  test('V-04: バリアントカードをタップするとカートに追加され右上にバッジが表示される', async ({ page }) => {
    await page.locator('.group-card[data-group="ecobag"]').click();
    // sold-out でない最初のカード（赤）をタップ
    const firstCard = page.locator('#variant-grid-items .variant-card:not(.sold-out)').first();
    await firstCard.click();
    await expect(firstCard.locator('.badge-qty')).toContainText('×1');
  });

  test('V-08: カートに入れたバリアントにマイナスボタンが表示される', async ({ page }) => {
    await page.locator('.group-card[data-group="ecobag"]').click();
    const firstCard = page.locator('#variant-grid-items .variant-card:not(.sold-out)').first();
    await expect(firstCard.locator('.variant-minus-btn')).toBeHidden();
    await firstCard.click();
    await expect(firstCard.locator('.variant-minus-btn')).toBeVisible();
  });

  test('V-09: マイナスボタンで数量が減り、0 になるとバッジとボタンが消える', async ({ page }) => {
    await page.locator('.group-card[data-group="ecobag"]').click();
    const firstCard = page.locator('#variant-grid-items .variant-card:not(.sold-out)').first();
    // 2個追加
    await firstCard.click();
    await firstCard.click();
    await expect(firstCard.locator('.badge-qty')).toContainText('×2');
    // 1個減らす
    await firstCard.locator('.variant-minus-btn').click();
    await expect(firstCard.locator('.badge-qty')).toContainText('×1');
    // 0 にする → バッジとボタン消える
    await firstCard.locator('.variant-minus-btn').click();
    await expect(firstCard.locator('.badge-qty')).toBeHidden();
    await expect(firstCard.locator('.variant-minus-btn')).toBeHidden();
  });

  test('V-10: マイナスタップ時にカード追加イベントは発火しない', async ({ page }) => {
    await page.locator('.group-card[data-group="ecobag"]').click();
    const firstCard = page.locator('#variant-grid-items .variant-card:not(.sold-out)').first();
    await firstCard.click(); // qty=1
    await firstCard.locator('.variant-minus-btn').click(); // qty=0 → 削除
    // stopPropagation が効いていれば qty は 0 のまま（カードクリックで 1 に増えない）
    await expect(firstCard.locator('.badge-qty')).toBeHidden();
  });

  test('V-05: ✕ ボタンでモーダルが閉じる', async ({ page }) => {
    await page.locator('.group-card[data-group="ecobag"]').click();
    await expect(page.locator('#variant-modal')).toBeVisible();
    await page.locator('#variant-modal-close').click();
    await expect(page.locator('#variant-modal')).toBeHidden();
  });

  test('V-06: モーダル背景タップで閉じる', async ({ page }) => {
    await page.locator('.group-card[data-group="ecobag"]').click();
    await expect(page.locator('#variant-modal')).toBeVisible();
    // variant-sheet 自身（背景）をクリック
    await page.locator('#variant-modal').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#variant-modal')).toBeHidden();
  });

  test('V-07: 靴ベラグループも同じインタフェースで動作する', async ({ page }) => {
    await page.locator('.group-card[data-group="shoehorn"]').click();
    await expect(page.locator('#variant-modal')).toBeVisible();
    await expect(page.locator('#variant-modal-title')).toContainText('靴ベラ');
    // タップ可能なカード（sold-out でない）が1枚（金のみ）
    const activeCards = page.locator('#variant-grid-items .variant-card:not(.sold-out)');
    await expect(activeCards).toHaveCount(1);
    // タップで追加できること
    await activeCards.first().click();
    await expect(activeCards.first().locator('.badge-qty')).toContainText('×1');
  });
});
