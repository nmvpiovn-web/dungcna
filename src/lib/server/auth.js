// src/lib/server/auth.js
// Server-side authentication & RBAC authorization utilities for SvelteKit / Cloudflare Pages

import { getAllUsers } from '../unifiedStore.js';

export const SUPERADMIN_USERNAMES = ['admin', 'msdung', 'nmvpiovn', 'codung'];
export const SUPERADMIN_EMAILS = ['nmvpiovn@gmail.com', 'msdung@timbk.io.vn'];

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
 * Extract auth identity from incoming request headers or cookies
 */
export function extractAuthCredentials(request) {
  const authHeader = request.headers.get('authorization') || '';
  const xUserId = request.headers.get('x-user-id');
  const xUserRole = request.headers.get('x-user-role');
  const cookieHeader = request.headers.get('cookie') || '';

  let token = null;
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // Parse cookie for session_user if present
  let cookieUserId = null;
  if (cookieHeader) {
    const match = cookieHeader.match(/session_user=([^;]+)/);
    if (match) {
      try {
        cookieUserId = decodeURIComponent(match[1]);
      } catch {}
    }
  }

  return {
    token,
    userId: xUserId || cookieUserId,
    userRole: xUserRole
  };
}

/**
 * Verify server-side authentication
 * Validates against Cloudflare D1 (if available) or local store fallback.
 * Returns { authenticated: boolean, user: Object | null, error?: string }
 */
export async function verifyServerAuth(request, platform) {
  const { token, userId } = extractAuthCredentials(request);

  let candidateIdentifier = userId;

  // If token is provided, attempt decoding if base64/JSON or match token string
  if (token) {
    try {
      if (token.startsWith('{') && token.endsWith('}')) {
        const parsed = JSON.parse(token);
        candidateIdentifier = parsed.id || parsed.username || candidateIdentifier;
      } else if (token.includes('.')) {
        // Simple JWT/payload check or base64
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1]));
          candidateIdentifier = payload.id || payload.username || candidateIdentifier;
        }
      } else {
        // Plain ID or username token
        candidateIdentifier = candidateIdentifier || token;
      }
    } catch {
      candidateIdentifier = candidateIdentifier || token;
    }
  }

  if (!candidateIdentifier) {
    return {
      authenticated: false,
      user: null,
      error: 'Unauthorized: Thiếu thông tin phiên đăng nhập (Authorization hoặc x-user-id header)'
    };
  }

  // 1. Check Cloudflare D1 if available
  if (platform?.env?.DB) {
    try {
      const d1Res = await platform.env.DB.prepare(`
        SELECT id, username, phone, email, name, role, avatar, status, metadata, created_at, updated_at
        FROM users
        WHERE id = ? OR username = ? OR email = ?
        LIMIT 1
      `).bind(candidateIdentifier, candidateIdentifier, candidateIdentifier).first();

      if (d1Res) {
        return {
          authenticated: true,
          user: sanitizeUser(d1Res),
          source: 'cloudflare_d1'
        };
      }
    } catch (d1Err) {
      console.error('D1 auth query error:', d1Err);
    }
  }

  // 2. Check local users store
  const allUsers = typeof getAllUsers === 'function' ? getAllUsers() : [];
  const match = allUsers.find(u => 
    u.id === candidateIdentifier || 
    (u.username && u.username.toLowerCase() === candidateIdentifier.toLowerCase()) ||
    (u.email && u.email.toLowerCase() === candidateIdentifier.toLowerCase())
  );

  if (match) {
    return {
      authenticated: true,
      user: sanitizeUser(match),
      source: 'local_store'
    };
  }

  return {
    authenticated: false,
    user: null,
    error: 'Unauthorized: Phiên đăng nhập không hợp lệ hoặc tài khoản không tồn tại'
  };
}
