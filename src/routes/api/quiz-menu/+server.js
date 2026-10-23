import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../lib/server/auth.js';
import { makeId } from '../../../lib/server/quizMenu.js';
import { checkQuizReadiness } from '../../../lib/server/quizReadiness.js';

export const prerender = false;

async function optionalAuth(request, platform) {
  if (!request.headers.get('authorization') && !request.headers.get('cookie')?.includes('session_token=')) return null;
  const auth = await verifyServerAuth(request, platform);
  return auth.authenticated ? auth : null;
}

export async function GET({ url, request, platform }) {
  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable' }, { status: 503 });
  }

  const auth = await optionalAuth(request, platform);
  const explicitReadiness = url.searchParams.get('readiness') === '1' || url.searchParams.get('include_readiness') === '1';

  async function resolveReadinessIfNeeded(quizzesList) {
    if (explicitReadiness || isStaffUser(auth?.user) || (!quizzesList || quizzesList.length === 0)) {
      try {
        return await checkQuizReadiness(platform, auth?.user || null);
      } catch {}
    }
    return null;
  }

  const mine = url.searchParams.get('mine') === '1';
  const assigned = url.searchParams.get('assigned') === '1';
  if (mine && (!auth || !isStaffUser(auth.user))) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 100);
  try {
    // Quiz được giao: student chỉ thấy quiz có homework_assignments (source_quiz_id)
    // cho lớp mà mình đang enrolled (class_enrollments active). Guest/staff không dùng.
    if (assigned) {
      if (!auth) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
      const role = String(auth.user.role || '').toLowerCase();
      if (role !== 'student') return json({ success: false, error: 'Forbidden: Chỉ học sinh dùng luồng quiz được giao' }, { status: 403 });
      const rows = await platform.env.DB.prepare(`
        SELECT q.id, q.title, q.description, q.creator_name, q.time_limit_minutes, q.status, q.created_at, q.updated_at,
               ha.class_name AS assigned_class_name, ha.due_date AS assigned_due_date, ha.id AS assignment_id
        FROM quizzes q
        JOIN homework_assignments ha ON ha.source_quiz_id = q.id
        WHERE q.status = 'published' AND ha.status = 'published'
          AND ha.class_id IN (
            SELECT class_id FROM class_enrollments WHERE user_id = ? AND status = 'active'
          )
        ORDER BY ha.due_date ASC, ha.created_at DESC
        LIMIT ?
      `).bind(auth.user.id, limit).all();
      const quizzesList = rows.results || [];
      const readiness = await resolveReadinessIfNeeded(quizzesList);
      const resPayload = { success: true, quizzes: quizzesList, assigned: true };
      if (readiness) resPayload.readiness = readiness;
      return json(resPayload);
    }
    const isManagerRole = auth?.authenticated && ['superadmin', 'admin', 'leader'].includes(String(auth.user.role || '').toLowerCase());
    const query = mine
      ? (isManagerRole
          ? `SELECT id, title, description, creator_name, time_limit_minutes, status, created_at, updated_at FROM quizzes ORDER BY updated_at DESC LIMIT ?`
          : `SELECT id, title, description, creator_name, time_limit_minutes, status, created_at, updated_at FROM quizzes WHERE created_by = ? OR status = 'published' ORDER BY CASE WHEN created_by = ? THEN 0 ELSE 1 END, updated_at DESC LIMIT ?`)
      : `SELECT id, title, description, creator_name, time_limit_minutes, status, created_at, updated_at FROM quizzes WHERE status = 'published' ORDER BY updated_at DESC LIMIT ?`;
    // Student đã đăng nhập: catalog public cũng lọc theo quiz được giao (chống bypass gỡ auth)
    const studentRole = auth?.authenticated && String(auth.user.role || '').toLowerCase() === 'student';
    if (!mine && !assigned && studentRole) {
      const rows = await platform.env.DB.prepare(`
        SELECT q.id, q.title, q.description, q.creator_name, q.time_limit_minutes, q.status, q.created_at, q.updated_at,
               ha.class_name AS assigned_class_name, ha.due_date AS assigned_due_date, ha.id AS assignment_id
        FROM quizzes q
        JOIN homework_assignments ha ON ha.source_quiz_id = q.id
        WHERE q.status = 'published' AND ha.status = 'published'
          AND ha.class_id IN (
            SELECT class_id FROM class_enrollments WHERE user_id = ? AND status = 'active'
          )
        ORDER BY ha.due_date ASC, ha.created_at DESC
        LIMIT ?
      `).bind(auth.user.id, limit).all();
      const quizzesList = rows.results || [];
      const readiness = await resolveReadinessIfNeeded(quizzesList);
      const resPayload = { success: true, quizzes: quizzesList, assigned: true };
      if (readiness) resPayload.readiness = readiness;
      return json(resPayload);
    }
    const rows = mine
      ? (isManagerRole
          ? await platform.env.DB.prepare(query).bind(limit).all()
          : await platform.env.DB.prepare(query).bind(auth.user.id, auth.user.id, limit).all())
      : await platform.env.DB.prepare(query).bind(limit).all();
    const quizzesList = rows.results || [];
    const readiness = await resolveReadinessIfNeeded(quizzesList);
    const resPayload = { success: true, quizzes: quizzesList };
    if (readiness) resPayload.readiness = readiness;
    return json(resPayload);
  } catch (err) {
    let fallbackReadiness = null;
    try {
      fallbackReadiness = await checkQuizReadiness(platform, auth?.user || null);
    } catch {}
    return json({ success: false, error: err.message, readiness: fallbackReadiness }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  if (body.action === 'delete') {
    const qid = String(body.id || body.quiz_id || '').trim();
    if (!qid) return json({ success: false, error: 'Thiếu id quiz cần xóa' }, { status: 400 });
    await platform.env.DB.prepare('DELETE FROM quiz_questions WHERE quiz_id = ?').bind(qid).run().catch(() => {});
    await platform.env.DB.prepare('DELETE FROM quizzes WHERE id = ?').bind(qid).run();
    return json({ success: true, id: qid, message: `🗑️ Đã xóa bộ đề Quiz (${qid}) khỏi Cloudflare D1!` });
  }

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

export async function DELETE({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  let body = {};
  try { body = await request.json(); } catch {}
  const qid = String(url.searchParams.get('id') || body.id || body.quiz_id || '').trim();
  if (!qid) return json({ success: false, error: 'Thiếu id quiz cần xóa' }, { status: 400 });
  await platform.env.DB.prepare('DELETE FROM quiz_questions WHERE quiz_id = ?').bind(qid).run().catch(() => {});
  await platform.env.DB.prepare('DELETE FROM quizzes WHERE id = ?').bind(qid).run();
  return json({ success: true, id: qid, message: `🗑️ Đã xóa bộ đề Quiz (${qid}) khỏi Cloudflare D1!` });
}
