// src/routes/api/gamification/+server.js
// Academic Warmth Phase 4 (2026-09-30): persist streak/xp/badges.
// DEFENSIVE CONTRACT: migration 0008 chua apply tren production D1 -> moi truy van
// deu boc try/catch; thieu bang/cot thi tra du lieu mac dinh, KHONG BAO GIO 500.
import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '$lib/server/auth.js';
import { bangkokDate } from '$lib/server/bangkokTime.js';

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

  if (body.action !== 'record_activity') {
    return json({ success: false, error: 'Gamification state is server-owned.' }, { status: 400 });
  }
  const eventId = String(body.event_id || '').trim().slice(0, 128);
  const eventType = String(body.event_type || 'learning_activity').trim().slice(0, 50);
  const requestedXp = Math.max(1, Math.min(50, parseInt(body.xp_gain, 10) || 10));
  if (!eventId || !/^[a-zA-Z0-9:_-]+$/.test(eventId)) {
    return json({ success: false, error: 'event_id không hợp lệ.' }, { status: 400 });
  }

  try {
    const today = bangkokDate();
    const daily = await platform.env.DB.prepare(`
      SELECT COALESCE(SUM(xp_delta), 0) AS xp FROM gamification_events
      WHERE user_id = ? AND activity_date = ?
    `).bind(auth.user.id, today).first();
    const grantedXp = Math.max(0, Math.min(requestedXp, 200 - Number(daily?.xp || 0)));
    const eventInsert = await platform.env.DB.prepare(`
      INSERT INTO gamification_events (id, user_id, event_type, xp_delta, activity_date)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, id) DO NOTHING
    `).bind(eventId, auth.user.id, eventType, grantedXp, today).run();

    if (Number(eventInsert.meta?.changes || 0) > 0) {
      const existing = await platform.env.DB.prepare(`SELECT * FROM gamification WHERE user_id = ? LIMIT 1`).bind(auth.user.id).first();
      const previousDate = existing?.last_active_date || null;
      const previous = previousDate ? new Date(`${previousDate}T00:00:00+07:00`) : null;
      const current = new Date(`${today}T00:00:00+07:00`);
      const dayGap = previous ? Math.round((current - previous) / 86400000) : null;
      const streak = previousDate === today ? Number(existing?.streak_days || 1) : (dayGap === 1 ? Number(existing?.streak_days || 0) + 1 : 1);
      const xpTotal = Number(existing?.xp_total || 0) + grantedXp;
      const badges = [];
      if (xpTotal >= 100) badges.push('xp-100');
      if (xpTotal >= 500) badges.push('xp-500');
      if (streak >= 7) badges.push('streak-7');
      await platform.env.DB.prepare(`
        INSERT INTO gamification (user_id, streak_days, last_active_date, xp_total, badges, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET streak_days = excluded.streak_days,
          last_active_date = excluded.last_active_date, xp_total = excluded.xp_total,
          badges = excluded.badges, updated_at = CURRENT_TIMESTAMP
      `).bind(auth.user.id, streak, today, xpTotal, JSON.stringify(badges)).run();
    }
    const state = await platform.env.DB.prepare(`SELECT streak_days, last_active_date, xp_total, badges FROM gamification WHERE user_id = ?`).bind(auth.user.id).first();
    let parsedBadges = [];
    try { parsedBadges = JSON.parse(state?.badges || '[]'); } catch {}
    return json({ success: true, persisted: true, idempotent_replay: Number(eventInsert.meta?.changes || 0) === 0, ...state, badges: parsedBadges });
  } catch {
    // Bang chua ton tai -> van 200, client giu localStorage
    return json({ success: true, persisted: false });
  }
}
