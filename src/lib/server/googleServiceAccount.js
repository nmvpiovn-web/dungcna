// src/lib/server/googleServiceAccount.js
// Google Service Account auth for Cloudflare Workers (Web Crypto API)
// Dùng để đọc Google Drive folder riêng tư mà không cần share link công khai

function base64UrlEncode(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Lấy access token từ service account (cache 55 phút)
let cachedToken = null;
let cachedExpiry = 0;

export async function getServiceAccountToken(platform) {
  // Test hook: trả token giả để test không cần crypto thật
  if (platform?.env?.DRIVE_TEST_TOKEN) {
    return platform.env.DRIVE_TEST_TOKEN;
  }
  // Issue #2 P1: private key CHỈ nằm trong Cloudflare secret, không đọc từ D1
  const email = platform?.env?.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = platform?.env?.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !privateKey) {
    return null; // Chưa cấu hình service account
  }

  // Dùng token cache nếu còn hạn
  if (cachedToken && Date.now() < cachedExpiry) {
    return cachedToken;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64UrlEncode(JSON.stringify({
      iss: email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    }));

    const keyData = pemToArrayBuffer(privateKey);
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      keyData,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(`${header}.${payload}`)
    );

    const jwt = `${header}.${payload}.${base64UrlEncode(signature)}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      }).toString()
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('[GSA] Token exchange failed:', tokenData.error);
      return null;
    }

    cachedToken = tokenData.access_token;
    cachedExpiry = Date.now() + (55 * 60 * 1000); // Cache 55 phút
    return cachedToken;
  } catch (err) {
    console.error('[GSA] Service account auth error:', err.message);
    return null;
  }
}

// Kiểm tra service account đã được cấu hình chưa (env hoặc D1)
export async function hasServiceAccount(platform) {
  // Issue #2 P1: chỉ kiểm tra Cloudflare secret, không dùng D1
  return !!(platform?.env?.GOOGLE_SERVICE_ACCOUNT_EMAIL && platform?.env?.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  return false;
}
