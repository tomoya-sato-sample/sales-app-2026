import { CONFIG } from './config.js';

// --- HTML Escaping (XSS対策) ---
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

  const profit = data.total_profit ?? 0;
  const rate = data.total_amount > 0 ? (profit / data.total_amount * 100) : 0;
  document.getElementById('kpi-profit').textContent = `¥${Math.round(profit).toLocaleString()}`;
  document.getElementById('kpi-profit-rate').textContent = `${rate.toFixed(1)}%`;

  const avg = data.total_tx > 0 ? Math.round(data.total_amount / data.total_tx) : 0;
  document.getElementById('kpi-avg').textContent = `¥${avg.toLocaleString()}`;
}

function renderProductChart(data) {
  const labels = data.by_product.slice(0, 10).map(p => p.name);
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

function getCategoryLabel(id) {
  if (id.startsWith('ecobag'))   return 'エコバッグ';
  if (id.startsWith('shoehorn')) return '靴ベラ';
  if (id === 'ramen_001')        return 'ラーメン';
  if (id.startsWith('book'))     return '本';
  return 'その他';
}

function renderCategoryChart(data) {
  const cats = ['エコバッグ', '靴ベラ', 'ラーメン', '本', 'その他'];
  const catMap = Object.fromEntries(cats.map(c => [c, 0]));
  (data.by_product || []).forEach(p => { catMap[getCategoryLabel(p.id)] += p.amount; });

  const values = cats.map(c => catMap[c]);
  const colors = ['#d4611b', '#2980b9', '#f39c12', '#8e44ad', '#7f8c8d'];

  if (charts.category) {
    charts.category.data.datasets[0].data = values;
    charts.category.update();
    return;
  }
  const ctx = document.getElementById('chart-category').getContext('2d');
  charts.category = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: cats, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' },
        tooltip: { callbacks: { label: ctx => ` ¥${ctx.raw.toLocaleString()}` } },
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
        <td>${esc(s.name)}</td>
        <td style="text-align:right">${s.tx_count}</td>
        <td style="text-align:right">¥${s.amount.toLocaleString()}</td>
      </tr>`).join('');
}

function renderStockAlerts(data) {
  const LOW = CONFIG.LOW_STOCK_THRESHOLD;
  const detail = data.stock_detail || [];
  const alerts = detail.filter(p => p.current <= LOW).sort((a, b) => a.current - b.current);

  const el = document.getElementById('stock-alerts');
  if (!alerts.length) {
    el.innerHTML = '<p style="color:#666;font-size:14px">在庫アラートなし</p>';
    document.title = '本部ダッシュボード — 物販レジ';
    return;
  }
  document.title = '(!) 本部ダッシュボード — 物販レジ';
  el.innerHTML = alerts.map(p => {
    const icon = p.current <= 0 ? '🔴' : '🟡';
    const label = p.current <= 0 ? '売り切れ' : `残${p.current}`;
    return `<div class="alert-item">${icon} <strong>${esc(p.name)}</strong> — ${label}</div>`;
  }).join('');
}

function renderProfitTable(data) {
  const tbody = document.getElementById('profit-tbody');
  const products = (data.by_product || []).filter(p => p.qty > 0);
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:#aaa">データなし</td></tr>';
    return;
  }

  // 粗利の高い順に並べる
  const sorted = [...products].sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));
  tbody.innerHTML = sorted.map(p => {
    const profit = p.profit ?? 0;
    const costTotal = p.cost_total ?? 0;
    const color = profit >= 0 ? '#27ae60' : '#c0392b';
    return `<tr>
      <td>${esc(p.name)}</td>
      <td style="text-align:right">${p.qty}</td>
      <td style="text-align:right">¥${p.amount.toLocaleString()}</td>
      <td style="text-align:right">¥${Math.round(costTotal).toLocaleString()}</td>
      <td style="text-align:right;font-weight:700;color:${color}">¥${Math.round(profit).toLocaleString()}</td>
    </tr>`;
  }).join('');
}

function renderStockTable(data) {
  const detail = data.stock_detail || [];
  const tbody = document.getElementById('stock-tbody');
  if (!detail.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:#aaa">データなし</td></tr>';
    return;
  }
  // 消化率の高い順に表示
  const sorted = [...detail].sort((a, b) => {
    const ra = a.init_stock > 0 ? (a.init_stock - a.current) / a.init_stock : 0;
    const rb = b.init_stock > 0 ? (b.init_stock - b.current) / b.init_stock : 0;
    return rb - ra;
  });
  tbody.innerHTML = sorted.map(p => {
    const sold = p.init_stock - p.current;
    const consumePct = p.init_stock > 0 ? Math.round((p.init_stock - p.current) / p.init_stock * 100) : 0;
    const color = p.current <= 0 ? '#c0392b' : p.current <= CONFIG.LOW_STOCK_THRESHOLD ? '#e67e22' : '#27ae60';
    const label = p.current <= 0 ? '売切' : p.current <= CONFIG.LOW_STOCK_THRESHOLD ? '残少' : '在庫あり';
    const barColor = consumePct >= 80 ? '#c0392b' : consumePct >= 50 ? '#e67e22' : '#27ae60';
    return `<tr>
      <td>${esc(p.name)}</td>
      <td style="text-align:right">${p.init_stock}</td>
      <td style="text-align:right;font-weight:700;color:${color}">${p.current}</td>
      <td style="text-align:right">${sold >= 0 ? sold : '—'}</td>
      <td style="text-align:right;min-width:80px">
        <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end">
          <div style="width:48px;height:6px;background:#e8e2d9;border-radius:3px;overflow:hidden">
            <div style="width:${consumePct}%;height:100%;background:${barColor};border-radius:3px"></div>
          </div>
          <span style="font-weight:700;color:${barColor};font-size:13px">${consumePct}%</span>
        </div>
      </td>
      <td style="text-align:right;color:${color};font-weight:700">${label}</td>
    </tr>`;
  }).join('');
}

async function refresh() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = '更新中...';
  try {
    const json = await fetchSummary();
    const data = json.data;
    // 各セクションを個別に try して、1か所のエラーが全体を止めないようにする
    const run = (fn) => { try { fn(data); } catch (e) { console.error(fn.name, e); } };
    run(updateKPIs);
    run(renderProductChart);
    run(renderPaymentChart);
    run(renderCategoryChart);
    run(renderStaffTable);
    run(renderStockAlerts);
    run(renderStockTable);
    run(renderProfitTable);
  } catch (err) {
    console.error('fetchSummary failed:', err);
    document.getElementById('updated-at').textContent = '更新失敗（通信エラー）';
    document.getElementById('stock-tbody').innerHTML = '<tr><td colspan="5" style="color:#c0392b">取得失敗</td></tr>';
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
