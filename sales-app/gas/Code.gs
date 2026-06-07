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
    // 管理系エンドポイント（secret はリクエストボディで渡す）
    if (data.action === 'reset_test') {
      return resetTestData(data.secret);
    }
    if (data.action === 'seed_products') {
      return seedProducts(data.secret);
    }
    return jsonResponse({ status: 'error', message: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'products')   return getProducts();
    if (action === 'staff')      return getStaff();
    if (action === 'summary')    return getSummary();
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
      category: r[6],
      cost: Number(r[7]) || 0,
      sort_order: i
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
    productMap[r[0]] = {
      id: r[0], name: r[1], price: Number(r[2]), emoji: r[4],
      init_stock: Number(r[5]), cost: Number(r[7]) || 0
    };
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
  const hourlyMap = {};

  for (let i = 1; i < salesRows.length; i++) {
    const r = salesRows[i];
    if (!r[0]) continue;
    totalTx++;
    const total = Number(r[5]);
    totalAmount += total;

    // 時間帯別集計
    try {
      const hour = new Date(r[1]).getHours();
      if (!hourlyMap[hour]) hourlyMap[hour] = 0;
      hourlyMap[hour] += total;
    } catch (_) {}

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
          amount: 0,
          cost_total: 0
        };
      }
      byProduct[item.id].qty += Number(item.qty);
      byProduct[item.id].amount += Number(item.qty) * Number(item.price);
      byProduct[item.id].cost_total += Number(item.qty) * ((productMap[item.id] || {}).cost || 0);
    });
  }

  // 粗利計算
  let totalProfit = 0;
  Object.values(byProduct).forEach(p => {
    p.profit = p.amount - p.cost_total;
    totalProfit += p.profit;
  });

  // 時間帯別を配列化（存在する時間のみ）
  const hourly = Object.entries(hourlyMap)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([hour, amount]) => ({ hour: Number(hour), amount }));

  // 商品名・在庫詳細（ダッシュボード表示用）
  const stockDetail = Object.values(productMap).map(p => ({
    id: p.id,
    name: p.name,
    init_stock: p.init_stock,
    current: currentStock[p.id] ?? p.init_stock,
  }));

  return jsonResponse({
    action: 'summary',
    data: {
      total_amount: totalAmount,
      total_tx: totalTx,
      total_profit: totalProfit,
      by_product: Object.values(byProduct).sort((a, b) => b.amount - a.amount),
      by_payment: byPayment,
      by_staff: Object.values(byStaff),
      current_stock: currentStock,
      stock_detail: stockDetail,
      hourly,
      updated_at: new Date().toISOString()
    }
  });
}

// ---------------------------------------------------------------
// reset_test: テスト前の断面初期化
//   secret はスクリプトプロパティ RESET_SECRET で管理
//   products シートは変更せず、sales_log / stock_log だけクリア
//   ※ GASエディタ > プロジェクトの設定 > スクリプトプロパティ に
//     キー: RESET_SECRET  値: <任意の文字列> を登録してください
// ---------------------------------------------------------------
function resetTestData(secret) {
  const props = PropertiesService.getScriptProperties();
  const validSecret = props.getProperty('RESET_SECRET');
  if (!validSecret || secret !== validSecret) {
    return jsonResponse({ status: 'error', message: 'Unauthorized' });
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // sales_log: ヘッダ行(1行目)を残して全削除
  const salesSheet = ss.getSheetByName('sales_log');
  const salesLastRow = salesSheet.getLastRow();
  const clearedSales = Math.max(0, salesLastRow - 1);
  if (salesLastRow > 1) {
    salesSheet.deleteRows(2, salesLastRow - 1);
  }

  // stock_log: ヘッダ行(1行目)を残して全削除
  const stockSheet = ss.getSheetByName('stock_log');
  const stockLastRow = stockSheet.getLastRow();
  const clearedStock = Math.max(0, stockLastRow - 1);
  if (stockLastRow > 1) {
    stockSheet.deleteRows(2, stockLastRow - 1);
  }

  return jsonResponse({
    status: 'ok',
    cleared_sales: clearedSales,
    cleared_stock: clearedStock,
    reset_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------
// seed_products: productsシートをテストデータで初期化
//   secret はスクリプトプロパティ RESET_SECRET で管理（reset_testと共用）
// ---------------------------------------------------------------
function seedProducts(secret) {
  const props = PropertiesService.getScriptProperties();
  const validSecret = props.getProperty('RESET_SECRET');
  if (!validSecret || secret !== validSecret) {
    return jsonResponse({ status: 'error', message: 'Unauthorized' });
  }

  const IMG = 'https://ssk2026.bam-o-rama.com/buppan/img/';
  // id, name, price, barcode, emoji, init_stock, category, cost
  const SEED = [
    ['id',                  'name',                       'price', 'barcode', 'emoji',                         'init_stock', 'category',   'cost'],
    ['ecobag_kuro_logo',    'エコバッグ（黒）済々黌ロゴ',    1000,    '',        IMG+'ecobag.webp',               31,           'ecobag',     411.67],
    ['ecobag_aka_kinako',   'エコバッグ（赤）きなこ',         1000,    '',        IMG+'ecobag.webp',               40,           'ecobag',     411.67],
    ['ecobag_kuro_senta',   'エコバッグ（黒）せんた',         1000,    '',        IMG+'ecobag.webp',               34,           'ecobag',     411.67],
    ['ecobag_khaki_kinasen','エコバッグ（カーキ）きなせん',   1000,    '',        IMG+'ecobag.webp',               16,           'ecobag',     411.67],
    ['hashi_001',           '架箸',                          1500,    '',        IMG+'chopstick.webp',            47,           'other',      709.50],
    ['towel_001',           'タオル',                        1500,    '',        IMG+'towel.webp',                47,           'other',      711.00],
    ['quo_001',             'QUOカード',                     1000,    '',        '💳',                            48,           'other',      684.60],
    ['ramen_001',           '黄亭ラーメン',                  2000,    '',        IMG+'ramen.webp',                226,          'other',      972.00],
    ['pen_001',             'ロゴ単色ボールペン',              300,    '',        IMG+'pen.webp',                  68,           'other',      169.40],
    ['memo_001',            'メモ帳',                         500,    '',        IMG+'memocho.webp',              163,          'other',      165.35],
    ['shoehorn_kurokane',   '靴ベラ　黒金',                  3000,    '',        IMG+'kutsubera.webp',            17,           'shoehorn',  2250.00],
    ['shoehorn_kuroemboss', '靴ベラ　黒エンボス',            3000,    '',        IMG+'kutsubera.webp',            18,           'shoehorn',  2250.00],
    ['shoehorn_aokane',     '靴ベラ　青金',                  3000,    '',        IMG+'kutsubera.webp',            19,           'shoehorn',  2250.00],
    ['shoehorn_aoemboss',   '靴ベラ　青エンボス',            3000,    '',        IMG+'kutsubera.webp',            16,           'shoehorn',  2250.00],
    ['book_signed',         '大竹本（サイン入り）',           2000,    '',        IMG+'book.webp',                 19,           'other',     1980.00],
    ['book_unsigned',       '大竹本（サインなし）',           2000,    '',        IMG+'book.webp',                 30,           'other',     1584.00],
    ['kumamoto_set',        '熊本名産品セット',               1000,    '',        '🎁',                            50,           'other',      695.84],
  ];

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('products');
  sheet.clearContents();
  sheet.getRange(1, 1, SEED.length, SEED[0].length).setValues(SEED);

  return jsonResponse({ status: 'ok', seeded: SEED.length - 1, seeded_at: new Date().toISOString() });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
