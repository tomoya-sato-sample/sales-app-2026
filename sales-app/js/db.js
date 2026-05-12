const DB_NAME = 'sales_db';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('transactions')) {
        db.createObjectStore('transactions', { keyPath: 'tx_id' });
      }
      if (!db.objectStoreNames.contains('products_cache')) {
        db.createObjectStore('products_cache', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('staff_cache')) {
        db.createObjectStore('staff_cache', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('stock_adjustments')) {
        db.createObjectStore('stock_adjustments', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

function txStore(storeName, mode = 'readonly') {
  return openDB().then(db => {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  });
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

// --- Transactions ---

export async function saveTransaction(tx) {
  const store = await txStore('transactions', 'readwrite');
  return promisify(store.put(tx));
}

export async function getPendingTransactions() {
  const store = await txStore('transactions');
  const all = await promisify(store.getAll());
  return all.filter(t => t.status === 'pending');
}

export async function markTransactionSynced(tx_id) {
  const store = await txStore('transactions', 'readwrite');
  const tx = await promisify(store.get(tx_id));
  if (tx) {
    tx.status = 'synced';
    return promisify(store.put(tx));
  }
}

export async function getAllTransactions() {
  const store = await txStore('transactions');
  return promisify(store.getAll());
}

// --- Products Cache ---

export async function saveProducts(products) {
  const store = await txStore('products_cache', 'readwrite');
  await promisify(store.clear());
  for (const p of products) {
    await promisify(store.put({ ...p, cached_at: new Date().toISOString() }));
  }
}

export async function getProducts() {
  const store = await txStore('products_cache');
  return promisify(store.getAll());
}

// --- Staff Cache ---

export async function saveStaff(staffList) {
  const store = await txStore('staff_cache', 'readwrite');
  await promisify(store.clear());
  for (const s of staffList) {
    await promisify(store.put(s));
  }
}

export async function getStaff() {
  const store = await txStore('staff_cache');
  return promisify(store.getAll());
}

// --- Stock Adjustments ---

export async function saveStockAdjustment(adj) {
  const store = await txStore('stock_adjustments', 'readwrite');
  return promisify(store.add({ ...adj, synced: false }));
}

export async function getPendingAdjustments() {
  const store = await txStore('stock_adjustments');
  const all = await promisify(store.getAll());
  return all.filter(a => !a.synced);
}

export async function markAdjustmentSynced(id) {
  const store = await txStore('stock_adjustments', 'readwrite');
  const adj = await promisify(store.get(id));
  if (adj) {
    adj.synced = true;
    return promisify(store.put(adj));
  }
}
