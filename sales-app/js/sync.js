import { CONFIG } from './config.js';
import {
  getPendingTransactions,
  markTransactionSynced,
  getPendingAdjustments,
  markAdjustmentSynced,
} from './db.js';

async function postWithBackoff(url, body, maxRetries = 4) {
  let delay = 1000;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(body),
      });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, Math.min(delay, 30000)));
        delay *= 2;
        continue;
      }
      return await res.json();
    } catch (_) {
      if (i === maxRetries) throw new Error('sync failed');
      await new Promise(r => setTimeout(r, Math.min(delay, 30000)));
      delay *= 2;
    }
  }
}

export async function syncPending() {
  const pending = await getPendingTransactions();
  let synced = 0;
  for (const tx of pending) {
    try {
      const result = await postWithBackoff(CONFIG.GAS_URL, { action: 'sale', ...tx });
      if (result && result.status === 'ok') {
        await markTransactionSynced(tx.tx_id);
        synced++;
      }
    } catch (_) {}
  }
  const remaining = (await getPendingTransactions()).length;
  window.dispatchEvent(new CustomEvent('sync-status', { detail: remaining }));
  return synced;
}

export async function syncAdjustments() {
  const pending = await getPendingAdjustments();
  for (const adj of pending) {
    try {
      const result = await postWithBackoff(CONFIG.GAS_URL, {
        action: 'stock_adjust',
        product_id: adj.product_id,
        delta: adj.delta,
        reason: adj.reason,
        timestamp: adj.timestamp,
      });
      if (result && result.status === 'ok') {
        await markAdjustmentSynced(adj.id);
      }
    } catch (_) {}
  }
}

export function startSync() {
  setInterval(async () => {
    await syncPending();
    await syncAdjustments();
  }, CONFIG.SYNC_INTERVAL_MS);
}
