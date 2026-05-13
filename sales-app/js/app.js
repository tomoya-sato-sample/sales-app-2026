import { CONFIG } from './config.js';
import {
  saveTransaction, getPendingTransactions,
  saveProducts, getProducts,
  saveStaff, getStaff,
} from './db.js';
import { syncPending, startSync } from './sync.js';

// --- State ---
let state = {
  staff: [],
  currentStaff: null,
  products: [],
  currentStock: {},
  cart: {},           // { productId: qty }
  payment: null,
  lastTx: null,
};

// --- Init ---
async function init() {
  if (!('indexedDB' in window)) {
    showToast('このブラウザはIndexedDBに対応していません', 4000);
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  await loadStaff();
  await loadProducts();
  startSync();
  window.addEventListener('sync-status', e => updatePendingBadge(e.detail));
  updatePendingBadge(0);
}

// --- Staff ---
async function loadStaff() {
  let staffList = await getStaff();
  if (!staffList.length) {
    staffList = await fetchStaff();
  }
  state.staff = staffList;

  const saved = localStorage.getItem('currentStaff');
  if (saved) {
    try {
      state.currentStaff = JSON.parse(saved);
      showScreen('main');
      return;
    } catch (_) {}
  }
  renderStaffScreen();
  showScreen('staff');
}

async function fetchStaff() {
  try {
    const res = await fetch(`${CONFIG.GAS_URL}?action=staff`);
    const json = await res.json();
    if (json.data) {
      await saveStaff(json.data);
      return json.data;
    }
  } catch (_) {}
  return [];
}

function renderStaffScreen() {
  const grid = document.getElementById('staff-grid');
  grid.innerHTML = state.staff.length
    ? state.staff.map(s => `
        <div class="staff-card" data-id="${s.id}" data-name="${s.name}" data-area="${s.area}">
          <div class="name">${s.name}</div>
          <div class="area">${s.area}</div>
        </div>`).join('')
    : '<p class="loading">スタッフ情報を読み込めませんでした</p>';

  grid.querySelectorAll('.staff-card').forEach(el => {
    el.addEventListener('click', () => {
      state.currentStaff = {
        id: el.dataset.id,
        name: el.dataset.name,
        area: el.dataset.area,
      };
      localStorage.setItem('currentStaff', JSON.stringify(state.currentStaff));
      document.getElementById('staff-display').textContent = state.currentStaff.name;
      showScreen('main');
    });
  });
}

// --- Products ---
async function loadProducts() {
  let products = await getProducts();
  if (!products.length) {
    products = await fetchProducts();
  }
  state.products = products;
  initStock();
  renderProducts();
}

async function fetchProducts() {
  try {
    const res = await fetch(`${CONFIG.GAS_URL}?action=products`);
    const json = await res.json();
    if (json.data) {
      await saveProducts(json.data);
      return json.data;
    }
  } catch (_) {}
  return [];
}

function initStock() {
  state.currentStock = {};
  state.products.forEach(p => {
    state.currentStock[p.id] = p.init_stock || 0;
  });
}

function calcSoldStock() {
  const sold = {};
  state.products.forEach(p => { sold[p.id] = 0; });
  // sold counts come from locally synced transactions only
  return sold;
}

// --- Product Visual Helper ---
function productVisual(emoji, name, cls = '') {
  if (emoji && emoji.startsWith('http')) {
    return `<img src="${emoji}" class="product-img${cls ? ' ' + cls : ''}" alt="${name}" loading="lazy">`;
  }
  return `<div class="product-emoji">${emoji || '🛒'}</div>`;
}

// --- Group Config ---
const GROUP_CONFIGS = {
  ecobag:   { name: 'エコバッグ', emoji: '👜' },
  shoehorn: { name: '靴ベラ',     emoji: '✨' },
};

function variantSwatchColor(name) {
  if (name.includes('赤')) return '#c0392b';
  if (name.includes('カーキ')) return '#7d7a3d';
  if (name.includes('青')) return '#2980b9';
  return '#2c2c2c';
}

function variantSwatchBorder(name) {
  return name.includes('金') ? '#c9a227' : 'rgba(0,0,0,.15)';
}

// --- Product Grid ---
function renderProducts() {
  const grid = document.getElementById('product-grid');
  if (!state.products.length) {
    grid.innerHTML = '<p class="loading">商品を読み込み中...</p>';
    return;
  }

  const groupCategories = new Set(Object.keys(GROUP_CONFIGS));
  const others = state.products
    .filter(p => !groupCategories.has(p.category))
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));

  let html = '';

  // グループカード（エコバッグ・靴ベラ）
  for (const [category, config] of Object.entries(GROUP_CONFIGS)) {
    const items = state.products.filter(p => p.category === category);
    if (!items.length) continue;

    const totalInCart = items.reduce((s, p) => s + (state.cart[p.id] || 0), 0);
    const allSoldOut = items.every(p => (state.currentStock[p.id] ?? 0) <= 0);

    const badge = totalInCart > 0
      ? `<span class="product-badge badge-qty">×${totalInCart}</span>`
      : allSoldOut ? '<span class="product-badge badge-sold">SOLD OUT</span>' : '';

    const swatches = items.map(p =>
      `<span class="swatch" style="background:${variantSwatchColor(p.name)};border-color:${variantSwatchBorder(p.name)}" title="${p.name}"></span>`
    ).join('');

    const groupImage = items[0].emoji || '';
    html += `<div class="product-card group-card${allSoldOut ? ' sold-out' : totalInCart > 0 ? ' in-cart' : ''}" data-group="${category}" ${allSoldOut ? 'aria-disabled="true"' : ''}>
      ${badge}
      ${productVisual(groupImage, config.name, 'group-img')}
      <div class="group-info">
        <div class="pname">${config.name}</div>
        <div class="swatches">${swatches}</div>
        <div class="group-sub">${items.length}種類 ¥${Math.min(...items.map(p => p.price)).toLocaleString()}</div>
      </div>
    </div>`;
  }

  // その他の商品
  html += others.map(p => {
    const stock = state.currentStock[p.id] ?? 0;
    const qty = state.cart[p.id] || 0;
    const soldOut = stock <= 0;
    const lowStock = !soldOut && stock <= CONFIG.LOW_STOCK_THRESHOLD;
    let cls = 'product-card';
    if (soldOut) cls += ' sold-out';
    else if (qty > 0) cls += ' in-cart';
    else if (lowStock) cls += ' low-stock';

    let badge = '';
    if (soldOut) badge = '<span class="product-badge badge-sold">SOLD OUT</span>';
    else if (qty > 0) badge = `<span class="product-badge badge-qty">×${qty}</span>`;
    else if (lowStock) badge = '<span class="product-badge badge-low">残少</span>';

    return `<div class="${cls}" data-id="${p.id}" ${soldOut ? 'aria-disabled="true"' : ''}>
      ${badge}
      ${qty > 0 ? `<button class="card-minus-btn" data-id="${p.id}">－</button>` : ''}
      ${productVisual(p.emoji, p.name)}
      <div class="pname">${p.name}</div>
      <div class="price">¥${p.price.toLocaleString()}</div>
    </div>`;
  }).join('');

  grid.innerHTML = html;

  grid.querySelectorAll('.group-card:not(.sold-out)').forEach(el => {
    el.addEventListener('click', () => openVariantModal(el.dataset.group));
  });
  grid.querySelectorAll('.product-card:not(.sold-out):not(.group-card)').forEach(el => {
    el.addEventListener('click', () => addToCart(el.dataset.id));
  });
  grid.querySelectorAll('.card-minus-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      state.cart[id] = Math.max(0, (state.cart[id] || 0) - 1);
      if (state.cart[id] === 0) delete state.cart[id];
      renderProducts();
      updateCartFooter();
    });
  });
}

// --- Variant Modal (汎用) ---
let _currentVariantCategory = null;

function openVariantModal(category) {
  _currentVariantCategory = category;
  renderVariantModal(category);
  document.getElementById('variant-modal').classList.remove('hidden');
}

function closeVariantModal() {
  document.getElementById('variant-modal').classList.add('hidden');
  _currentVariantCategory = null;
}

function renderVariantModal(category) {
  const config = GROUP_CONFIGS[category];
  const items = state.products.filter(p => p.category === category);

  document.getElementById('variant-modal-title').textContent =
    `${config.emoji} ${config.name}を選択`;

  const grid = document.getElementById('variant-grid-items');
  grid.innerHTML = items.map(p => {
    const stock = state.currentStock[p.id] ?? 0;
    const qty = state.cart[p.id] || 0;
    const soldOut = stock <= 0;
    const lowStock = !soldOut && stock <= CONFIG.LOW_STOCK_THRESHOLD;
    const label = p.name.replace(config.name, '').trim();

    let badge = '';
    if (soldOut)   badge = '<span class="product-badge badge-sold">SOLD OUT</span>';
    else if (qty > 0) badge = `<span class="product-badge badge-qty">×${qty}</span>`;

    return `<div class="variant-card${soldOut ? ' sold-out' : qty > 0 ? ' in-cart' : ''}" data-id="${p.id}" ${soldOut ? 'aria-disabled="true"' : ''}>
      ${badge}
      ${qty > 0 ? `<button class="variant-minus-btn" data-id="${p.id}">－</button>` : ''}
      <div class="swatch-lg" style="background:${variantSwatchColor(p.name)};border-color:${variantSwatchBorder(p.name)}"></div>
      <div class="variant-label">${label}</div>
      <div class="variant-stock ${lowStock ? 'low' : soldOut ? 'out' : ''}">
        ${soldOut ? 'SOLD OUT' : `残 ${stock}`}
      </div>
    </div>`;
  }).join('');

  // カードタップで追加
  grid.querySelectorAll('.variant-card:not(.sold-out)').forEach(el => {
    el.addEventListener('click', () => {
      addToCart(el.dataset.id);
      renderVariantModal(category); // モーダル内バッジを即更新
    });
  });
  // マイナスボタンで減算
  grid.querySelectorAll('.variant-minus-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      state.cart[id] = Math.max(0, (state.cart[id] || 0) - 1);
      if (state.cart[id] === 0) delete state.cart[id];
      renderVariantModal(category);
      renderProducts();
      updateCartFooter();
    });
  });
}

function addToCart(id) {
  const stock = state.currentStock[id] ?? 0;
  const current = state.cart[id] || 0;
  if (current >= stock) {
    showToast('在庫がありません');
    return;
  }
  state.cart[id] = current + 1;
  renderProducts();
  updateCartFooter();
}

function updateCartFooter() {
  const footer = document.getElementById('cart-footer');
  const total = calcCartTotal();
  const count = Object.values(state.cart).reduce((s, v) => s + v, 0);
  document.getElementById('cart-total').textContent = `¥${total.toLocaleString()}`;
  document.getElementById('cart-count').textContent = `${count}点`;
  footer.classList.toggle('empty', count === 0);
}

function calcCartTotal() {
  return Object.entries(state.cart).reduce((sum, [id, qty]) => {
    const p = state.products.find(p => p.id === id);
    return sum + (p ? p.price * qty : 0);
  }, 0);
}

// --- Checkout Screen ---
function openCheckout() {
  const count = Object.values(state.cart).reduce((s, v) => s + v, 0);
  if (count === 0) return;
  renderCheckout();
  showScreen('checkout');
}

function renderCheckout() {
  const items = Object.entries(state.cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const p = state.products.find(p => p.id === id);
      return { ...p, qty };
    });

  document.getElementById('checkout-items').innerHTML = items.map(item => `
    <div class="checkout-item" data-id="${item.id}">
      <div class="item-visual">${productVisual(item.emoji, item.name, 'item-img')}</div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-price">¥${item.price.toLocaleString()} × <span class="qty-display">${item.qty}</span></div>
      </div>
      <div class="qty-ctrl">
        <button class="qty-btn" data-action="minus" data-id="${item.id}">－</button>
        <span class="qty-val">${item.qty}</span>
        <button class="qty-btn" data-action="plus" data-id="${item.id}">＋</button>
      </div>
    </div>`).join('');

  document.getElementById('checkout-items').querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'plus') {
        const stock = state.currentStock[id] ?? 0;
        if ((state.cart[id] || 0) < stock) state.cart[id] = (state.cart[id] || 0) + 1;
      } else {
        state.cart[id] = Math.max(0, (state.cart[id] || 0) - 1);
        if (state.cart[id] === 0) delete state.cart[id];
      }
      renderCheckout();
      updateCartFooter();
      updateRecordBtn();
    });
  });

  // Payment buttons
  document.querySelectorAll('.payment-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.payment === state.payment);
    btn.onclick = () => {
      state.payment = btn.dataset.payment;
      document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const isCash = state.payment === 'cash';
      document.getElementById('cash-section').classList.toggle('hidden', !isCash);
      if (isCash) {
        document.getElementById('cash-received').value = '';
        document.getElementById('change-row').classList.add('hidden');
        document.getElementById('change-short').classList.add('hidden');
        setTimeout(() => document.getElementById('cash-received').focus(), 100);
      }
      updateRecordBtn();
    };
  });

  // 現金受取入力
  const cashInput = document.getElementById('cash-received');
  cashInput.oninput = () => updateChange();
  document.querySelectorAll('.bill-btn, .coin-btn').forEach(btn => {
    btn.onclick = () => {
      cashInput.value = (parseInt(cashInput.value, 10) || 0) + parseInt(btn.dataset.amount, 10);
      updateChange();
    };
  });
  document.getElementById('cash-clear-btn').onclick = () => {
    cashInput.value = '';
    document.getElementById('change-row').classList.add('hidden');
    document.getElementById('change-short').classList.add('hidden');
    updateRecordBtn();
  };

  document.getElementById('checkout-total-amount').textContent = `¥${calcCartTotal().toLocaleString()}`;
  updateRecordBtn();
}

function updateChange() {
  const total = calcCartTotal();
  const received = parseInt(document.getElementById('cash-received').value, 10) || 0;
  const change = received - total;
  const changeRow = document.getElementById('change-row');
  const changeShort = document.getElementById('change-short');

  if (received === 0) {
    changeRow.classList.add('hidden');
    changeShort.classList.add('hidden');
  } else if (change >= 0) {
    document.getElementById('change-amount').textContent = `¥${change.toLocaleString()}`;
    changeRow.classList.remove('hidden');
    changeShort.classList.add('hidden');
  } else {
    changeRow.classList.add('hidden');
    changeShort.classList.remove('hidden');
  }
  updateRecordBtn();
}

function updateRecordBtn() {
  const btn = document.getElementById('record-btn');
  const hasItems = Object.values(state.cart).some(v => v > 0);
  if (!state.payment || !hasItems) { btn.disabled = true; return; }
  if (state.payment === 'cash') {
    const total = calcCartTotal();
    const received = parseInt(document.getElementById('cash-received').value, 10) || 0;
    btn.disabled = received < total;
  } else {
    btn.disabled = false;
  }
}

async function recordSale() {
  if (!state.payment) return;
  const btn = document.getElementById('record-btn');
  if (btn.dataset.loading) return;
  btn.dataset.loading = '1';
  btn.disabled = true;
  btn.textContent = '送信中...';

  const items = Object.entries(state.cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const p = state.products.find(p => p.id === id);
      return { id, name: p.name, qty, price: p.price };
    });
  if (!items.length) { delete btn.dataset.loading; btn.disabled = false; btn.textContent = '記録する'; return; }

  const now = new Date();
  const tx = {
    tx_id: `tx_${now.getTime()}`,
    timestamp: now.toISOString(),
    staff_id: state.currentStaff.id,
    staff_name: state.currentStaff.name,
    items,
    total: calcCartTotal(),
    payment: state.payment,
    client_time: now.toISOString(),
    status: 'pending',
  };

  // Deduct from local stock immediately
  items.forEach(item => {
    state.currentStock[item.id] = Math.max(0, (state.currentStock[item.id] || 0) - item.qty);
  });

  await saveTransaction(tx);
  state.lastTx = tx;

  // 即座に完了画面へ遷移（送信はバックグラウンドで継続）
  delete btn.dataset.loading;
  btn.textContent = '記録する';
  state.cart = {};
  state.payment = null;
  updateCartFooter();
  renderComplete(false);
  showScreen('complete');

  // バックグラウンドで GAS 送信
  (async () => {
    try {
      const res = await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'sale', ...tx }),
      });
      const json = await res.json();
      if (json.status === 'ok') {
        const { markTransactionSynced } = await import('./db.js');
        await markTransactionSynced(tx.tx_id);
        // 完了画面が表示中なら同期ステータスを更新
        const syncEl = document.getElementById('sync-status');
        if (syncEl) {
          syncEl.className = 'sync-status sync-ok';
          syncEl.textContent = '✓ 送信済み';
        }
      }
    } catch (_) {}
  })();
}

// --- Complete Screen ---
function renderComplete(synced) {
  const tx = state.lastTx;
  const rows = tx.items.map(i =>
    `<div class="row"><span>${i.name} ×${i.qty}</span><span class="val">¥${(i.price * i.qty).toLocaleString()}</span></div>`
  ).join('');
  document.getElementById('complete-rows').innerHTML = rows;
  document.getElementById('complete-total').textContent = `¥${tx.total.toLocaleString()}`;
  document.getElementById('complete-payment').textContent =
    CONFIG.PAYMENT_TYPES[tx.payment]?.label || tx.payment;
  document.getElementById('sync-status').className = `sync-status ${synced ? 'sync-ok' : 'sync-pending'}`;
  document.getElementById('sync-status').textContent = synced ? '✓ 送信済み' : '⏳ オフライン保留中';
}

// --- Screen Management ---
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(`screen-${name}`);
  screen.classList.add('active');
  screen.scrollTop = 0;
  const scroll = screen.querySelector('.main-scroll');
  if (scroll) scroll.scrollTop = 0;
}

// --- Pending Badge ---
async function updatePendingBadge(count) {
  if (count === undefined) {
    const pending = await getPendingTransactions();
    count = pending.length;
  }
  const badge = document.getElementById('pending-badge');
  if (!badge) return;
  badge.textContent = `未送信 ${count}`;
  badge.classList.toggle('visible', count > 0);
}

// --- Toast ---
let _toastTimer;
function showToast(msg, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// --- DOM Ready ---
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('cart-footer').addEventListener('click', openCheckout);
  document.getElementById('back-btn').addEventListener('click', () => {
    renderProducts();
    showScreen('main');
  });
  document.getElementById('record-btn').addEventListener('click', recordSale);
  document.getElementById('next-btn').addEventListener('click', () => {
    renderProducts();
    showScreen('main');
  });
  document.getElementById('change-staff-btn').addEventListener('click', () => {
    localStorage.removeItem('currentStaff');
    state.currentStaff = null;
    state.cart = {};
    renderStaffScreen();
    showScreen('staff');
  });

  document.getElementById('variant-modal-close').addEventListener('click', closeVariantModal);
  document.getElementById('variant-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('variant-modal')) closeVariantModal();
  });

  document.getElementById('staff-display').textContent = '';
  init().then(() => {
    if (state.currentStaff) {
      document.getElementById('staff-display').textContent = state.currentStaff.name;
    }
  });
});

// Export for scanner
export { showToast, addToCart, state };
