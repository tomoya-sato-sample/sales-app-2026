const SPREADSHEET_ID = '165lQB8-n8YA6VK50BlWIo3ynVqWIsEl2ycpljg9cfiU';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'sale') {
      return handleSale(data);
    }
    if (data.action === 'stock_adjust') {
      return handleStockAdjust(data);
    }
    return jsonResponse({ status: 'error', message: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'products') return getProducts();
    if (action === 'staff') return getStaff();
    if (action === 'summary') return getSummary();
    return jsonResponse({ status: 'error', message: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

function handleSale(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const salesSheet = ss.getSheetByName('sales_log');
    const stockSheet = ss.getSheetByName('stock_log');

    // 冪等性チェック
    const existing = salesSheet.getDataRange().getValues();
    for (let i = 1; i < existing.length; i++) {
      if (existing[i][0] === data.tx_id) {
        return jsonResponse({ status: 'ok', tx_id: data.tx_id });
      }
    }

    // sales_log 追記
    salesSheet.appendRow([
      data.tx_id,
      data.timestamp,
      data.staff_id,
      data.staff_name,
      JSON.stringify(data.items),
      data.total,
      data.payment,
      data.client_time
    ]);

    // stock_log 追記（商品ごと）
    const now = new Date().toISOString();
    data.items.forEach(item => {
      stockSheet.appendRow([
        now,
        item.id,
        -item.qty,
        'sale',
        data.tx_id
      ]);
    });

    return jsonResponse({ status: 'ok', tx_id: data.tx_id });
  } finally {
    lock.releaseLock();
  }
}

function handleStockAdjust(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const stockSheet = ss.getSheetByName('stock_log');
    stockSheet.appendRow([
      new Date().toISOString(),
      data.product_id,
      data.delta,
      'adjust',
      ''
    ]);
    return jsonResponse({ status: 'ok' });
  } finally {
    lock.releaseLock();
  }
}

function getProducts() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('products');
  const rows = sheet.getDataRange().getValues();
  const products = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    products.push({
      id: r[0],
      name: r[1],
      price: r[2],
      barcode: r[3],
      emoji: r[4],
      init_stock: r[5],
      category: r[6]
    });
  }
  return jsonResponse({ action: 'products', data: products });
}

function getStaff() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('staff');
  const rows = sheet.getDataRange().getValues();
  const staff = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    staff.push({ id: r[0], name: r[1], area: r[2] });
  }
  return jsonResponse({ action: 'staff', data: staff });
}

function getSummary() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const productsSheet = ss.getSheetByName('products');
  const salesSheet = ss.getSheetByName('sales_log');
  const stockSheet = ss.getSheetByName('stock_log');

  const productRows = productsSheet.getDataRange().getValues();
  const productMap = {};
  for (let i = 1; i < productRows.length; i++) {
    const r = productRows[i];
    if (!r[0]) continue;
    productMap[r[0]] = { id: r[0], name: r[1], emoji: r[4], init_stock: Number(r[5]) };
  }

  // stock_log から現在庫を計算
  const stockRows = stockSheet.getDataRange().getValues();
  const currentStock = {};
  Object.keys(productMap).forEach(id => {
    currentStock[id] = productMap[id].init_stock;
  });
  for (let i = 1; i < stockRows.length; i++) {
    const r = stockRows[i];
    if (!r[1]) continue;
    const pid = r[1];
    if (currentStock[pid] !== undefined) {
      currentStock[pid] += Number(r[2]);
    }
  }

  // sales_log から集計
  const salesRows = salesSheet.getDataRange().getValues();
  let totalAmount = 0;
  let totalTx = 0;
  const byProduct = {};
  const byPayment = { cash: 0, ic: 0, qr: 0, card: 0 };
  const byStaff = {};

  for (let i = 1; i < salesRows.length; i++) {
    const r = salesRows[i];
    if (!r[0]) continue;
    totalTx++;
    const total = Number(r[5]);
    totalAmount += total;

    const payment = r[6];
    if (byPayment[payment] !== undefined) byPayment[payment] += total;

    const staffId = r[2];
    const staffName = r[3];
    if (!byStaff[staffId]) byStaff[staffId] = { id: staffId, name: staffName, tx_count: 0, amount: 0 };
    byStaff[staffId].tx_count++;
    byStaff[staffId].amount += total;

    let items = [];
    try { items = JSON.parse(r[4]); } catch (_) {}
    items.forEach(item => {
      if (!byProduct[item.id]) {
        byProduct[item.id] = {
          id: item.id,
          name: item.name,
          emoji: (productMap[item.id] || {}).emoji || '',
          qty: 0,
          amount: 0
        };
      }
      byProduct[item.id].qty += Number(item.qty);
      byProduct[item.id].amount += Number(item.qty) * Number(item.price);
    });
  }

  return jsonResponse({
    action: 'summary',
    data: {
      total_amount: totalAmount,
      total_tx: totalTx,
      by_product: Object.values(byProduct).sort((a, b) => b.amount - a.amount),
      by_payment: byPayment,
      by_staff: Object.values(byStaff),
      current_stock: currentStock,
      updated_at: new Date().toISOString()
    }
  });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
