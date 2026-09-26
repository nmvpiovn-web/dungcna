// src/lib/server/auth.js
// Cryptographically signed server-side authentication & RBAC authorization utilities for SvelteKit / Cloudflare Pages
// Fail-Closed Security Implementation: Zero hardcoded secrets, strict HMAC verification, no bypasses.

import { getAllUsers } from '../unifiedStore.js';

export const SUPERADMIN_USERNAMES = ['admin', 'msdung', 'nmvpiovn', 'codung'];
export const SUPERADMIN_EMAILS = ['nmvpiovn@gmail.com', 'msdung@timbk.io.vn'];

const enc = new TextEncoder();

/**
 * Retrieve auth secret from platform runtime environment with fail-closed defense.
 * Returns null if secret is not properly configured.
 */
export function getAuthSecret(platform) {
  const secret = platform?.env?.AUTH_SECRET || (typeof process !== 'undefined' ? process.env?.AUTH_SECRET : null);
  if (!secret || typeof secret !== 'string' || secret.trim() === '') {
    return null;
  }
  return secret.trim();
}

/**
 * Compute HMAC-SHA256 signature using standard Web Crypto API.
 * Fails closed if secret is missing or empty.
 */
export async function signData(data, secret) {
  if (!secret || typeof secret !== 'string' || secret.trim() === '') {
    throw new Error('HMAC secret is required and cannot be empty (Fail-Closed)');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Base64URL encoding helper
 */
export function base64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64URL decoding helper
 */
export function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return decodeURIComponent(escape(atob(base64)));
}

/**
 * Create a cryptographically signed auth token.
 * Requires an explicit, non-empty secret.
 */
export async function createSignedToken(user, secret, expiresInMs = 7 * 86400 * 1000) {
  if (!user || !user.id) return null;
  if (!secret || typeof secret !== 'string' || secret.trim() === '') {
    throw new Error('Cannot mint token: AUTH_SECRET is not configured (Fail-Closed)');
  }

  const payload = {
    id: user.id,
    username: user.username || '',
    role: user.role || 'student',
    exp: Date.now() + expiresInMs
  };
  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  const signature = await signData(payloadStr, secret);
  return `${payloadStr}.${signature}`;
}

/**
 * Verify a cryptographically signed auth token.
 * Returns null if signature does not match, token is expired, or secret is missing.
 */
export async function verifySignedToken(token, secret) {
  if (!token || typeof token !== 'string' || !secret || typeof secret !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadStr, providedSig] = parts;
  let expectedSig;
  try {
    expectedSig = await signData(payloadStr, secret);
  } catch {
    return null;
  }

  if (providedSig !== expectedSig) {
    return null; // Signature verification failed
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadStr));
    if (payload.exp && payload.exp < Date.now()) {
      return null; // Token expired
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Remove sensitive password and credential fields from a user object
 */
export function sanitizeUser(user) {
  if (!user) return null;
  const clone = { ...user };
  delete clone.password;
  delete clone.secret;
  return clone;
}

/**
 * Sanitize an array of user records
 */
export function sanitizeUserList(users) {
  if (!Array.isArray(users)) return [];
  return users.map(sanitizeUser);
}

/**
 * Check if a user has staff/admin privileges (superadmin, admin, leader, teacher)
 */
export function isStaffUser(user) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  const username = (user.username || '').toLowerCase();
  const email = (user.email || '').toLowerCase();

  return (
    role === 'superadmin' ||
    role === 'admin' ||
    role === 'leader' ||
    role === 'teacher' ||
    SUPERADMIN_USERNAMES.includes(username) ||
    SUPERADMIN_EMAILS.includes(email)
  );
}

/**
 * Verify server-side authentication
 * Requires a cryptographically valid HMAC token in Authorization header or session cookie.
 * Strictly prevents header spoofing and closes all arbitrary bypass paths.
 * Fail-Closed: returns 500 when AUTH_SECRET is not configured on platform runtime.
 */
export async function verifyServerAuth(request, platform) {
  const secret = getAuthSecret(platform);
  if (!secret) {
    return {
      authenticated: false,
      status: 500,
      user: null,
      error: 'Internal Server Error: AUTH_SECRET chưa được cấu hình trên server (Fail-Closed).'
    };
  }

  const authHeader = request.headers.get('authorization') || '';
  const cookieHeader = request.headers.get('cookie') || '';

  let token = null;
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token && cookieHeader) {
    const match = cookieHeader.match(/session_token=([^;]+)/);
    if (match) {
      try {
        token = decodeURIComponent(match[1]);
      } catch {}
    }
  }

  if (!token) {
    return {
      authenticated: false,
      status: 401,
      user: null,
      error: 'Unauthorized: Thiếu token xác thực hợp lệ (Authorization: Bearer <signed_token>)'
    };
  }

  // Verify cryptographic token signature
  const verifiedPayload = await verifySignedToken(token, secret);
  if (!verifiedPayload || !verifiedPayload.id) {
    return {
      authenticated: false,
      status: 401,
      user: null,
      error: 'Unauthorized: Chữ ký token xác thực không hợp lệ hoặc token đã hết hạn'
    };
  }

  const userId = verifiedPayload.id;

  // 1. Check Cloudflare D1 if available (Primary Production Source)
  if (platform?.env?.DB) {
    try {
      const d1Res = await platform.env.DB.prepare(`
        SELECT id, username, phone, email, name, role, avatar, status, metadata, created_at, updated_at
        FROM users
        WHERE id = ? OR username = ?
        LIMIT 1
      `).bind(userId, userId).first();

      if (!d1Res) {
        return {
          authenticated: false,
          status: 401,
          user: null,
          error: 'Unauthorized: Tài khoản trong token không tồn tại trong cơ sở dữ liệu D1.'
        };
      }

      if (d1Res.status === 'locked' || d1Res.status === 'disabled' || d1Res.status === 'suspended') {
        return {
          authenticated: false,
          status: 403,
          user: null,
          error: 'Forbidden: Tài khoản đã bị khóa hoặc vô hiệu hóa.'
        };
      }

      return {
        authenticated: true,
        status: 200,
        user: sanitizeUser(d1Res),
        tokenPayload: verifiedPayload,
        source: 'cloudflare_d1'
      };
    } catch (d1Err) {
      console.error('D1 auth query error:', d1Err);
      if (platform?.env?.ENABLE_LOCAL_MOCK === 'true' || process.env.ENABLE_LOCAL_MOCK === 'true') {
        const allUsers = typeof getAllUsers === 'function' ? getAllUsers() : [];
        const match = allUsers.find(u => u.id === userId || (u.username && u.username.toLowerCase() === userId.toLowerCase()));
        if (match) {
          if (match.status === 'locked' || match.status === 'disabled' || match.status === 'suspended') {
            return {
              authenticated: false,
              status: 403,
              user: null,
              error: 'Forbidden: Tài khoản đã bị khóa hoặc vô hiệu hóa.'
            };
          }
          return {
            authenticated: true,
            status: 200,
            user: sanitizeUser(match),
            tokenPayload: verifiedPayload,
            source: 'local_mock'
          };
        }
      }
      return {
        authenticated: false,
        status: 500,
        user: null,
        error: 'Lỗi truy vấn cơ sở dữ liệu xác thực: ' + (d1Err.message || String(d1Err))
      };
    }
  }

  // 2. Fallback to local users store ONLY when ENABLE_LOCAL_MOCK is explicitly configured (isolated dev/testing)
  if (platform?.env?.ENABLE_LOCAL_MOCK === 'true' || process.env.ENABLE_LOCAL_MOCK === 'true') {
    const allUsers = typeof getAllUsers === 'function' ? getAllUsers() : [];
    const match = allUsers.find(u => u.id === userId || (u.username && u.username.toLowerCase() === userId.toLowerCase()));

    if (match) {
      if (match.status === 'locked' || match.status === 'disabled' || match.status === 'suspended') {
        return {
          authenticated: false,
          status: 403,
          user: null,
          error: 'Forbidden: Tài khoản đã bị khóa hoặc vô hiệu hóa.'
        };
      }

      return {
        authenticated: true,
        status: 200,
        user: sanitizeUser(match),
        tokenPayload: verifiedPayload,
        source: 'local_store'
      };
    }

    return {
      authenticated: false,
      status: 401,
      user: null,
      error: 'Unauthorized: Tài khoản trong token không tồn tại trong hệ thống'
    };
  }

  // Fail-Closed: Production without DB binding must refuse access
  return {
    authenticated: false,
    status: 500,
    user: null,
    error: 'Lỗi cấu hình hệ thống: Thiếu binding cơ sở dữ liệu Cloudflare D1 (DB) trên môi trường production (Fail-Closed).'
  };
}
