// tests/helpers.js
// Shared test helpers cho issue #2 PR4
// - Mock D1 platform với đầy đủ bảng auth (users, auth_sessions)
// - Không nới lỏng auth production
import { createSignedToken } from '../src/lib/server/auth.js';

/**
 * Tạo mock D1 platform với user và session hợp lệ.
 * @param {object} opts - { role, userId, extraTables }
 * @returns {{ platform, user, token, queries }}
 */
export async function createAuthMockPlatform(opts = {}) {
  const secret = opts.secret || 'test-helper-secret';
  const role = opts.role || 'student';
  const userId = opts.userId || `user-${role}`;
  const user = {
    id: userId,
    username: opts.username || role,
    name: opts.name || role,
    role,
    status: 'active',
    metadata: '{}'
  };
  const queries = [];

  const DB = {
    prepare(sql) {
      const stmt = {
        bind(...params) {
          return {
            async first() {
              queries.push({ sql, params, op: 'first' });
              if (sql.includes('FROM users')) return { ...user };
              if (sql.includes('FROM auth_sessions')) {
                return { id: 'test-session', revoked_at: null, expires_at: '2099-01-01T00:00:00.000Z' };
              }
              if (opts.firstHandler) {
                const r = opts.firstHandler(sql, params);
                if (r !== undefined) return r;
              }
              return null;
            },
            async all() {
              queries.push({ sql, params, op: 'all' });
              if (opts.allHandler) {
                const r = opts.allHandler(sql, params);
                if (r !== undefined) return r;
              }
              return { results: [] };
            },
            async run() {
              queries.push({ sql, params, op: 'run' });
              if (opts.failWrite) throw new Error('D1 write failed (test fault injection)');
              return { meta: { last_row_id: 1, changes: 1 } };
            }
          };
        },
        // Hỗ trợ gọi trực tiếp .first()/.all()/.run() không qua bind
        async first() {
          queries.push({ sql, params: [], op: 'first' });
          if (sql.includes('FROM users')) return { ...user };
          if (sql.includes('FROM auth_sessions')) {
            return { id: 'test-session', revoked_at: null, expires_at: '2099-01-01T00:00:00.000Z' };
          }
          return null;
        },
        async all() { return { results: [] }; },
        async run() {
          if (opts.failWrite) throw new Error('D1 write failed (test fault injection)');
          return { meta: { last_row_id: 1 } };
        }
      };
      return stmt;
    }
  };

  const platform = { env: { DB, AUTH_SECRET: secret, ...(opts.env || {}) } };
  const token = await createSignedToken(user, secret, 60_000, 'test-session');

  return { platform, user, token, queries, secret };
}

/**
 * Tạo Request với Bearer token.
 */
export function authedRequest(url, token, opts = {}) {
  return new Request(url, {
    method: opts.method || 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {})
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {})
  });
}
