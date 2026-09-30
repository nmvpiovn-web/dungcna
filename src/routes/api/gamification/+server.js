// src/routes/api/gamification/+server.js
// Academic Warmth Phase 4 (2026-09-30): persist streak/xp/badges.
// DEFENSIVE CONTRACT: migration 0008 chua apply tren production D1 -> moi truy van
// deu boc try/catch; thieu bang/cot thi tra du lieu mac dinh, KHONG BAO GIO 500.
import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '$lib/server/auth.js';

export const prerender = false;

const DEFAULT_STATE = { streak_days: 0, last_active_date: null, xp_total: 0, badges: [] };

export async function GET({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });
  if (!platform?.env?.DB) return json({ success: true, ...DEFAULT_STATE, persisted: false });

  try {
    const row = await platform.env.DB.prepare(
      'SELECT streak_days, last_active_date, xp_total, badges FROM gamification WHERE user_id = ? LIMIT 1'
    )
      .bind(auth.user.id)
      .first();
    if (!row) return json({ success: true, ...DEFAULT_STATE, persisted: true });
    let badges = [];
    try {
      badges = JSON.parse(row.badges || '[]');
    } catch {}
    return json({
      success: true,
      streak_days: row.streak_days || 0,
      last_active_date: row.last_active_date || null,
      xp_total: row.xp_total || 0,
      badges: Array.isArray(badges) ? badges : [],
      persisted: true
    });
  } catch {
    // Bang chua ton tai (migration 0008 chua apply) -> tra mac dinh, khong 500
    return json({ success: true, ...DEFAULT_STATE, persisted: false });
  }
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'JSON không hợp lệ' }, { status: 400 });
  }
  if (!platform?.env?.DB) return json({ success: true, persisted: false });

  const streak_days = Math.max(0, parseInt(body.streak_days, 10) || 0);
  const xp_total = Math.max(0, parseInt(body.xp_total, 10) || 0);
  const last_active_date = typeof body.last_active_date === 'string' ? body.last_active_date.slice(0, 10) : null;
  const badges = Array.isArray(body.badges) ? JSON.stringify(body.badges.slice(0, 50)) : '[]';

  try {
    await platform.env.DB.prepare(
      `INSERT INTO gamification (user_id, streak_days, last_active_date, xp_total, badges, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         streak_days = excluded.streak_days,
         last_active_date = excluded.last_active_date,
         xp_total = excluded.xp_total,
         badges = excluded.badges,
         updated_at = CURRENT_TIMESTAMP`
    )
      .bind(auth.user.id, streak_days, last_active_date, xp_total, badges)
      .run();
    return json({ success: true, persisted: true });
  } catch {
    // Bang chua ton tai -> van 200, client giu localStorage
    return json({ success: true, persisted: false });
  }
}
