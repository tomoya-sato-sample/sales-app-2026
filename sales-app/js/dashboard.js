import { CONFIG } from './config.js';

let charts = {};
let pollTimer = null;

async function fetchSummary() {
  const res = await fetch(`${CONFIG.GAS_URL}?action=summary`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function updateKPIs(data) {
  document.getElementById('kpi-amount').textContent = `¥${data.total_amount.toLocaleString()}`;
  document.getElementById('kpi-tx').textContent = `${data.total_tx} 件`;
  document.getElementById('updated-at').textContent = `更新: ${formatTime(data.updated_at)}`;
}

function renderProductChart(data) {
  const labels = data.by_product.slice(0, 10).map(p => `${p.emoji} ${p.name}`);
  const values = data.by_product.slice(0, 10).map(p => p.amount);

  if (charts.product) {
    charts.product.data.labels = labels;
    charts.product.data.datasets[0].data = values;
    charts.product.update();
    return;
  }
  const ctx = document.getElementById('chart-product').getContext('2d');
  charts.product = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '売上 (円)',
        data: values,
        backgroundColor: '#d4611b',
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { callback: v => `¥${v.toLocaleString()}` } },
      },
    },
  });
}

function renderPaymentChart(data) {
  const labels = Object.entries(CONFIG.PAYMENT_TYPES).map(([, v]) => v.label);
  const keys = Object.keys(CONFIG.PAYMENT_TYPES);
  const values = keys.map(k => data.by_payment[k] || 0);
  const colors = ['#d4611b', '#2980b9', '#27ae60', '#8e44ad'];

  if (charts.payment) {
    charts.payment.data.datasets[0].data = values;
    charts.payment.update();
    return;
  }
  const ctx = document.getElementById('chart-payment').getContext('2d');
  charts.payment = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
    },
  });
}

function renderHourlyChart(data) {
  // Build hourly buckets from sales timestamps via by_product data isn't enough —
  // we use total_tx and total_amount as static values when no hourly breakdown is available.
  // If GAS provides hourly data in the future, replace this.
  if (!data.hourly) return;

  const labels = data.hourly.map(h => `${h.hour}時`);
  const values = data.hourly.map(h => h.amount);

  if (charts.hourly) {
    charts.hourly.data.labels = labels;
    charts.hourly.data.datasets[0].data = values;
    charts.hourly.update();
    return;
  }
  const ctx = document.getElementById('chart-hourly').getContext('2d');
  charts.hourly = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '売上 (円)',
        data: values,
        borderColor: '#d4611b',
        backgroundColor: 'rgba(212,97,27,.1)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: v => `¥${(v / 1000).toFixed(0)}k` } },
      },
    },
  });
}

function renderStaffTable(data) {
  const tbody = document.getElementById('staff-tbody');
  tbody.innerHTML = data.by_staff
    .sort((a, b) => b.amount - a.amount)
    .map(s => `
      <tr>
        <td>${s.name}</td>
        <td style="text-align:right">${s.tx_count}</td>
        <td style="text-align:right">¥${s.amount.toLocaleString()}</td>
      </tr>`).join('');
}

function renderStockAlerts(data) {
  const LOW = CONFIG.LOW_STOCK_THRESHOLD;
  const alerts = Object.entries(data.current_stock)
    .filter(([, v]) => v <= LOW)
    .sort((a, b) => a[1] - b[1]);

  const el = document.getElementById('stock-alerts');
  if (!alerts.length) {
    el.innerHTML = '<p style="color:#666;font-size:14px">在庫アラートなし</p>';
    document.title = '本部ダッシュボード — 模擬店レジ';
    return;
  }
  document.title = '(!) 本部ダッシュボード — 模擬店レジ';
  el.innerHTML = alerts.map(([id, stock]) => {
    const icon = stock <= 0 ? '🔴' : '🟡';
    const label = stock <= 0 ? '売り切れ' : `残${stock}`;
    return `<div class="alert-item">${icon} <strong>${id}</strong> — ${label}</div>`;
  }).join('');
}

async function refresh() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = '更新中...';
  try {
    const json = await fetchSummary();
    const data = json.data;
    updateKPIs(data);
    renderProductChart(data);
    renderPaymentChart(data);
    renderHourlyChart(data);
    renderStaffTable(data);
    renderStockAlerts(data);
  } catch (err) {
    document.getElementById('updated-at').textContent = '更新失敗';
  } finally {
    btn.disabled = false;
    btn.textContent = '手動更新';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh-btn').addEventListener('click', refresh);
  refresh();
  pollTimer = setInterval(refresh, CONFIG.DASHBOARD_POLL_MS);
});
