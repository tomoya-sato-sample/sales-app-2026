export const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbwu9bx81xJU-wxdnSr6aCynf4PYuw-z83GZ-lC_PNg2lyvvAPJcMl5mOHjotSInkI7E/exec',
  SYNC_INTERVAL_MS: 30_000,
  DASHBOARD_POLL_MS: 30_000,
  LOW_STOCK_THRESHOLD: 5,
  CACHE_VERSION: 'v1',
  PAYMENT_TYPES: {
    cash: { label: '現金',       icon: '💴' },
    ic:   { label: '交通系IC',   icon: '📱' },
    qr:   { label: 'QRコード',   icon: '🔲' },
    card: { label: 'クレジット', icon: '💳' },
  },
};
