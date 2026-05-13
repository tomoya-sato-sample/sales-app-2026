import { Page } from '@playwright/test';
import productsFixture from '../fixtures/products.json';
import staffFixture from '../fixtures/staff.json';

/** GAS URL へのリクエストをフィクスチャデータで差し替える */
export async function mockGasApi(page: Page) {
  await page.route('https://script.google.com/**', async route => {
    const req = route.request();

    // POST（sale 記録）: 常に成功を返す
    if (req.method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' }),
      });
    }

    // GET: action パラメータでルーティング
    const url = new URL(req.url());
    const action = url.searchParams.get('action');
    const map: Record<string, object> = {
      products: productsFixture,
      staff:    staffFixture,
    };
    const body = map[action ?? ''];
    if (body) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'error', message: 'Unknown action' }),
    });
  });
}

/** GAS POST を強制的に失敗させる（オフライン挙動の検証用） */
export async function mockGasApiOffline(page: Page) {
  await page.route('https://script.google.com/**', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      return route.abort('failed');
    }
    // GET は通常通り（アプリ起動時の商品・スタッフ読み込みは成功させる）
    const url = new URL(req.url());
    const action = url.searchParams.get('action');
    const map: Record<string, object> = {
      products: productsFixture,
      staff:    staffFixture,
    };
    const body = map[action ?? ''];
    if (body) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
    return route.abort('failed');
  });
}

/**
 * 共通セットアップ:
 *   Playwright は各テストに fresh な browser context を提供するため
 *   localStorage / IndexedDB は手動クリア不要。
 *   担当者プリセットは addInitScript でページ読み込み前に注入する。
 */
export async function setupPage(
  page: Page,
  opts: { withStaff?: boolean; offline?: boolean } = {}
) {
  // addInitScript: ページスクリプトより先に実行されるので app.js の init() より前に localStorage が確定する
  if (opts.withStaff) {
    await page.addInitScript(() => {
      localStorage.setItem(
        'currentStaff',
        JSON.stringify({ id: 'staff_01', name: '田中 太郎', area: '受付' })
      );
    });
  }

  if (opts.offline) {
    await mockGasApiOffline(page);
  } else {
    await mockGasApi(page);
  }

  await page.goto('/');
  await page.waitForSelector('#screen-staff.active, #screen-main.active');
}
