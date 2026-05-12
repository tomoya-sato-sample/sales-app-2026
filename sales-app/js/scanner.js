import { showToast, addToCart, state } from './app.js';

const ZXING_CDN = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/esm/index.min.js';

let _codeReader = null;

async function loadZXing() {
  const mod = await import(ZXING_CDN);
  return mod.BrowserMultiFormatReader;
}

export async function startScanner() {
  const modal = document.getElementById('scanner-modal');
  modal.classList.remove('hidden');

  const video = document.getElementById('scanner-video');

  try {
    const BrowserMultiFormatReader = await loadZXing();
    _codeReader = new BrowserMultiFormatReader();

    await _codeReader.decodeFromVideoDevice(null, video, (result, err) => {
      if (result) {
        const text = result.getText();
        onBarcodeDetected(text);
      }
    });
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      modal.classList.add('hidden');
      showCameraPermissionError();
    } else {
      modal.classList.add('hidden');
      showToast('スキャナーの起動に失敗しました');
    }
  }
}

export function stopScanner() {
  if (_codeReader) {
    try { _codeReader.reset(); } catch (_) {}
    _codeReader = null;
  }
  document.getElementById('scanner-modal').classList.add('hidden');
}

function onBarcodeDetected(barcode) {
  stopScanner();
  const product = state.products.find(p => p.barcode === barcode);
  if (!product) {
    showToast('この商品は登録されていません');
    return;
  }
  addToCart(product.id);
  showToast(`${product.emoji || ''} ${product.name} をカートに追加しました`);
}

function showCameraPermissionError() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.7);
    display:flex;align-items:center;justify-content:center;padding:24px;
  `;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px;max-width:320px;text-align:center;">
      <div style="font-size:40px">📷</div>
      <h3 style="margin:12px 0 8px;font-size:18px">カメラへのアクセスを許可してください</h3>
      <p style="font-size:13px;color:#666;margin-bottom:16px">
        ブラウザのアドレスバーのカメラアイコンをタップして、アクセスを許可してください。
      </p>
      <button onclick="this.closest('div').parentElement.remove()"
        style="background:#1a1714;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:15px;cursor:pointer;">
        閉じる
      </button>
    </div>`;
  document.body.appendChild(overlay);
}
