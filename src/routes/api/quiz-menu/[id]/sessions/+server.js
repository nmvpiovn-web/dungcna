import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../../../lib/server/auth.js';
import { canManageQuiz } from '../../../../../lib/server/quizMenu.js';
import { getValidTeachingSessions } from '../../../../../lib/server/quizDrive.js';

export const prerender = false;

// GET: endpoint trả danh sách class_sessions hợp lệ theo RBAC cho quiz
export async function GET({ params, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  const quiz = await db.prepare(`SELECT id, created_by FROM quizzes WHERE id = ? LIMIT 1`).bind(params.id).first();
  if (!quiz) return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
  if (!canManageQuiz(auth.user, quiz)) {
    return json({ success: false, error: 'Forbidden: Bạn chỉ được thao tác trên quiz do mình tạo' }, { status: 403 });
  }

  try {
    const sessions = await getValidTeachingSessions(db, auth.user, 50);
    return json({ success: true, sessions });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
