# 模擬店レジ — 販売管理PWA

済々黌東京同窓会2026（2026/6/13 明治記念館）向け模擬店販売管理アプリ。

## 構成

| レイヤー | 技術 | 備考 |
|---|---|---|
| フロントエンド | Vanilla HTML/JS + IndexedDB | PWA、オフライン対応 |
| バックエンド | Google Apps Script | 無料枠 |
| DB | Google スプレッドシート | 4シート |
| ホスティング | GitHub Pages | HTTPS、無料 |

---

## セットアップ手順

### 1. スプレッドシートを作成する

Google スプレッドシートを新規作成し、以下の4シートを追加（タブ名は**完全一致**が必要）:

| シート名 | 用途 |
|---|---|
| `products` | 商品マスタ（手動入力） |
| `staff` | スタッフマスタ（手動入力） |
| `sales_log` | 販売記録（自動書き込み） |
| `stock_log` | 在庫変動ログ（自動書き込み） |

**`products` シートのヘッダー行（1行目）:**
```
product_id | name | price | barcode | emoji | init_stock | category
```

**`staff` シートのヘッダー行（1行目）:**
```
staff_id | name | area
```

スプレッドシートのURLから **スプレッドシートID** をコピーする:
```
https://docs.google.com/spreadsheets/d/<ここがID>/edit
```

---

### 2. Google Apps Script をデプロイする

1. スプレッドシートを開き、**拡張機能 → Apps Script**
2. `gas/Code.gs` の内容を貼り付ける
3. 1行目の `YOUR_SPREADSHEET_ID` を実際のIDに書き換える:
   ```js
   const SPREADSHEET_ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms'; // ← 例
   ```
4. **デプロイ → 新しいデプロイ**
   - 種類: **ウェブアプリ**
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
5. 表示されたURLをコピーする（例: `https://script.google.com/macros/s/AKfycb.../exec`）

---

### 3. `js/config.js` を更新する

```js
export const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/<YOUR_DEPLOYMENT_ID>/exec',
  // ... 他は変更不要
};
```

変更後、`main` ブランチに push すると GitHub Actions が自動デプロイします。

---

### 4. GitHub Pages を有効化する

リポジトリの **Settings → Pages**:
- **Source**: `GitHub Actions`

デプロイ完了後、以下のURLでアクセス可能:
```
https://<username>.github.io/<repo>/sales-app/
```

---

### 5. 動作確認

```bash
# ローカル確認（HTTPサーバーが必要）
cd sales-app
python -m http.server 8080
# → http://localhost:8080 で確認
```

**PWA動作確認チェックリスト:**
- [ ] Chrome → アドレスバーの「インストール」アイコンが表示される
- [ ] DevTools → Application → Service Workers: 登録済み
- [ ] DevTools → Network → Offline: 画面が起動する
- [ ] スマホ: 「ホーム画面に追加」でアイコンが表示される

---

## API テスト (curl)

```bash
# GAS_URL を変数に設定
GAS_URL="https://script.google.com/macros/s/YOUR_ID/exec"

# 商品一覧取得
curl "${GAS_URL}?action=products"

# スタッフ一覧取得
curl "${GAS_URL}?action=staff"

# 集計取得
curl "${GAS_URL}?action=summary"

# 販売記録POSTテスト
curl -X POST "${GAS_URL}" \
  -H "Content-Type: text/plain" \
  -d '{
    "action": "sale",
    "tx_id": "tx_test001",
    "timestamp": "2026-06-13T11:32:00",
    "staff_id": "s1",
    "staff_name": "テスト",
    "items": [{"id":"p1","name":"ビール","qty":2,"price":600}],
    "total": 1200,
    "payment": "cash",
    "client_time": "2026-06-13T11:31:55"
  }'

# テストデータ初期化（sales_log / stock_log をクリア）
# ※ RESET_SECRET はスクリプトプロパティで設定した値
curl -X POST "${GAS_URL}" \
  -H "Content-Type: text/plain" \
  -d '{"action":"reset_test","secret":"YOUR_RESET_SECRET"}'

# 商品シードデータ投入
curl -X POST "${GAS_URL}" \
  -H "Content-Type: text/plain" \
  -d '{"action":"seed_products","secret":"YOUR_RESET_SECRET"}'
```

---

## 当日運用フロー

### イベント前日
1. スプレッドシートに商品・スタッフデータを入力
2. GAS を再デプロイ（最新データを反映）
3. 各販売員のスマホでURLを開き「ホーム画面に追加」
4. 機内モードで起動確認

### イベント当日
1. 販売員: URLを開く → 担当者選択 → 販売開始
2. 本部: `dashboard.html` をPCで開く（30秒自動更新）
3. トラブル時: 在庫タブで手動調整

### イベント終了後
1. 上部の「未送信N件」バッジが消えるまで待つ（自動再送）
2. スプレッドシートの `sales_log` で最終集計確認

---

## ファイル構成

```
sales-app/
├── index.html          # 販売員PWA
├── dashboard.html      # 本部ダッシュボード
├── manifest.json       # PWAマニフェスト
├── sw.js               # Service Worker
├── icon.svg            # アプリアイコン
├── css/app.css         # スタイルシート
├── js/
│   ├── config.js       # GAS_URL・定数 ← ★要設定
│   ├── db.js           # IndexedDB
│   ├── sync.js         # GAS同期
│   ├── app.js          # 販売メイン
│   ├── scanner.js      # バーコードスキャン
│   └── dashboard.js    # ダッシュボード
└── gas/Code.gs         # GASバックエンド ← ★要デプロイ
```
