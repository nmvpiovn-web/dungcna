// src/lib/server/rateLimit.js
// D1-backed sliding-window rate limiter.
//
// WHY: Cloudflare Workers run on many isolates and module-scope Maps are
// per-isolate. A per-isolate Map NEVER sees enough attempts to trigger a
// brute-force block (live audit 2026-10-06: 60 consecutive bad logins -> 0x429).
// Shared D1 state fixes it. On D1 failure we degrade to a per-isolate in-memory
// fallback (never fail-closed on rate-limit infra errors).

const FALLBACK = new Map(); // key -> { count, start }; D1-unavailable only

function fallbackCheck(key, limit, windowMs) {
  const now = Date.now();
  const rec = FALLBACK.get(key);
  if (rec && now - rec.start < windowMs) {
    if (rec.count >= limit) return false;
    rec.count += 1;
    return true;
  }
  if (FALLBACK.size > 5000) {
    for (const [k, v] of FALLBACK) {
      if (now - v.start >= windowMs) FALLBACK.delete(k);
    }
  }
  FALLBACK.set(key, { count: 1, start: now });
  return true;
}

/**
 * Sliding-window check backed by the `rate_limits` D1 table (migration 0015).
 * @param {object|null} db - platform.env.DB (or null)
 * @param {{key:string, limit:number, windowMs:number}} opts
 * @returns {Promise<boolean>} true if the attempt is allowed
 */
export async function checkRateLimit(db, { key, limit, windowMs }) {
  if (!key || typeof key !== 'string') return true;
  if (!db) return fallbackCheck(key, limit, windowMs);
  const now = Date.now();
  const expiredBefore = now - windowMs;
  try {
    // Atomic upsert: reset the window when expired, otherwise increment.
    await db.prepare(`
      INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN rate_limits.window_start < ? THEN 1 ELSE rate_limits.count + 1 END,
        window_start = CASE WHEN rate_limits.window_start < ? THEN ? ELSE rate_limits.window_start END
    `).bind(key, now, expiredBefore, expiredBefore, now).run();

    const row = await db.prepare(`SELECT count FROM rate_limits WHERE key = ?`).bind(key).first();
    const allowed = row ? row.count <= limit : true;

    // Opportunistic cleanup of long-expired rows (bounded table growth).
    if (Math.random() < 0.05) {
      try {
        await db.prepare(`DELETE FROM rate_limits WHERE window_start < ?`)
          .bind(now - 24 * 60 * 60 * 1000).run();
      } catch { /* cleanup is best-effort */ }
    }
    return allowed;
  } catch (e) {
    console.warn('rateLimit: D1 unavailable, in-memory fallback:', e?.message || e);
    return fallbackCheck(key, limit, windowMs);
  }
}

/** Best-effort client IP; returns 'unknown' when no header is present. */
export function getClientIp(request) {
  return request.headers.get('cf-connecting-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'unknown';
}
