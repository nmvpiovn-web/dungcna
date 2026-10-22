const DEFAULT_BANK_BIN = '970422'; // MBBank
const DEFAULT_ACCOUNT_NO = '0901234567';
const DEFAULT_ACCOUNT_NAME = 'NGUYEN MINH VU';

function parseVietQrParams(filename = '', searchParams) {
  const cleanFile = String(filename || '')
    .replace(/\.(png|jpg|jpeg|webp)$/i, '')
    .trim();

  let bank = searchParams.get('bank') || searchParams.get('acqId') || '';
  let account = searchParams.get('account') || searchParams.get('accountNo') || '';
  let amount = searchParams.get('amount') || '';
  let addInfo = searchParams.get('addInfo') || '';
  let accountName = searchParams.get('accountName') || searchParams.get('name') || DEFAULT_ACCOUNT_NAME;

  // Format 1: 970422-0901234567-1770000-HP_NGUYENBAOKHI_T10.png
  const fullMatch = cleanFile.match(/^(\d{6})-(\d{6,20})-(\d+)-([A-Za-z0-9_-]+)$/);
  if (fullMatch) {
    if (!bank) bank = fullMatch[1];
    if (!account) account = fullMatch[2];
    if (!amount) amount = fullMatch[3];
    if (!addInfo) addInfo = fullMatch[4];
  } else {
    // Format 2: HP_NGUYENBAOKHI_T10-1770000.png or HP_NGUYENBAOKHI_T10_1770000.png
    const shortMatch = cleanFile.match(/^([A-Za-z0-9_-]+?)[-_](\d{4,12})$/);
    if (shortMatch) {
      if (!addInfo) addInfo = shortMatch[1];
      if (!amount) amount = shortMatch[2];
    } else if (cleanFile && cleanFile !== 'qr' && cleanFile !== 'vietqr') {
      if (!addInfo) addInfo = cleanFile;
    }
  }

  bank = String(bank || DEFAULT_BANK_BIN).trim();
  if (!/^\d{6}$/.test(bank)) bank = DEFAULT_BANK_BIN;

  account = String(account || DEFAULT_ACCOUNT_NO).replace(/[^0-9]/g, '') || DEFAULT_ACCOUNT_NO;
  const numericAmount = Math.max(0, Math.round(Number(amount) || 0));
  const cleanAddInfo = String(addInfo || 'HP T10')
    .replace(/_/g, ' ')
    .replace(/[^A-Za-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50) || 'HP T10';

  const safeFileSlug = cleanAddInfo.replace(/\s+/g, '_');

  return {
    bank,
    account,
    amount: numericAmount,
    addInfo: cleanAddInfo,
    safeFileSlug,
    accountName: String(accountName || DEFAULT_ACCOUNT_NAME).trim().toUpperCase()
  };
}

function base64ToUint8Array(b64 = '') {
  const binaryStr = atob(b64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

async function generateOfficialVietQrPngBytes({ bank, account, amount, addInfo, accountName }) {
  // Primary: Official VietQR v2 API -> returns true 540x640 raster PNG (data:image/png;base64,...)
  try {
    const res = await fetch('https://api.vietqr.io/v2/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        accountNo: account,
        accountName,
        acqId: bank,
        amount,
        addInfo,
        format: 'text',
        template: 'compact2'
      })
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      const dataUrl = json?.data?.qrDataURL || '';
      const prefix = 'data:image/png;base64,';
      if (dataUrl.startsWith(prefix)) {
        const b64 = dataUrl.slice(prefix.length).replace(/\s+/g, '');
        const bytes = base64ToUint8Array(b64);
        if (bytes.byteLength > 1000 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
          return bytes;
        }
      }
    }
  } catch {}

  // Fallback: Pure raster PNG QR code generator
  const qrPayload = `MBBank ${account} (${accountName}) | Amount: ${amount} VND | Content: ${addInfo}`;
  const fallbackRes = await fetch(
    `https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=png&margin=16&data=${encodeURIComponent(qrPayload)}`
  );
  const ab = await fallbackRes.arrayBuffer();
  return new Uint8Array(ab);
}

export async function GET({ params, url }) {
  const parsed = parseVietQrParams(params.filename, url.searchParams);
  const isDownload = url.searchParams.get('download') === '1' || url.searchParams.get('dl') === '1';

  const pngBytes = await generateOfficialVietQrPngBytes(parsed);

  const headers = {
    'Content-Type': 'image/png',
    'Content-Length': String(pngBytes.byteLength),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff'
  };

  if (isDownload) {
    headers['Content-Disposition'] = `attachment; filename="VietQR_${parsed.safeFileSlug}_${parsed.amount}.png"`;
  }

  return new Response(pngBytes, {
    status: 200,
    headers
  });
}

export async function HEAD({ params, url }) {
  const parsed = parseVietQrParams(params.filename, url.searchParams);
  const pngBytes = await generateOfficialVietQrPngBytes(parsed);
  return new Response(null, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(pngBytes.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
