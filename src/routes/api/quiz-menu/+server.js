import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../lib/server/auth.js';
import { makeId } from '../../../lib/server/quizMenu.js';

export const prerender = false;

async function optionalAuth(request, platform) {
  if (!request.headers.get('authorization') && !request.headers.get('cookie')?.includes('session_token=')) return null;
  const auth = await verifyServerAuth(request, platform);
  return auth.authenticated ? auth : null;
}

export async function GET({ url, request, platform }) {
  if (!platform?.env?.DB) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  const auth = await optionalAuth(request, platform);
  const mine = url.searchParams.get('mine') === '1';
  if (mine && (!auth || !isStaffUser(auth.user))) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 100);
  try {
    const query = mine
      ? `SELECT id, title, description, creator_name, time_limit_minutes, status, created_at, updated_at FROM quizzes WHERE created_by = ? ORDER BY updated_at DESC LIMIT ?`
      : `SELECT id, title, description, creator_name, time_limit_minutes, status, created_at, updated_at FROM quizzes WHERE status = 'published' ORDER BY updated_at DESC LIMIT ?`;
    const rows = mine
      ? await platform.env.DB.prepare(query).bind(auth.user.id, limit).all()
      : await platform.env.DB.prepare(query).bind(limit).all();
    return json({ success: true, quizzes: rows.results || [] });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const timeLimit = Number(body.time_limit_minutes ?? 30);
  if (!title || title.length > 150) return json({ success: false, error: 'Tiêu đề phải có 1-150 ký tự' }, { status: 400 });
  if (description.length > 2000) return json({ success: false, error: 'Mô tả quá dài' }, { status: 400 });
  if (!Number.isInteger(timeLimit) || timeLimit < 1 || timeLimit > 180) return json({ success: false, error: 'Thời gian phải từ 1-180 phút' }, { status: 400 });
  const id = makeId('quiz');
  try {
    await platform.env.DB.prepare(`
      INSERT INTO quizzes (id, title, description, created_by, creator_name, time_limit_minutes, status)
      VALUES (?, ?, ?, ?, ?, ?, 'draft')
    `).bind(id, title, description || null, auth.user.id, auth.user.name || auth.user.username || '', timeLimit).run();
    return json({ success: true, quiz: { id, title, description, time_limit_minutes: timeLimit, status: 'draft' } }, { status: 201 });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
