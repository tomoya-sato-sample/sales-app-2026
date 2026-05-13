import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,       // IndexedDB の状態をテスト間で汚染しないよう直列実行
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['html', { open: 'on-failure' }]],
  use: {
    baseURL: 'http://localhost:8080',
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro 相当
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',               // SW がテストに干渉しないよう無効化
  },
  webServer: {
    command: 'npx http-server sales-app -p 8080 -c-1 --cors -s',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'ignore',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
