import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../../lib/server/auth.js';
import { canManageQuiz } from '../../../../../lib/server/quizMenu.js';
import { getBundleSyncEvents, inspectBundleHealth, QuizDriveError } from '../../../../../lib/server/quizDrive.js';

export const prerender = false;

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
    const health = await inspectBundleHealth(platform, db, params.id);
    if (health.status === 'bundle_missing' || !health.bundle) {
      return json({ success: false, error: 'BundleNotFound', message: 'Quiz chưa có bundle DOCX' }, { status: 404 });
    }
    const events = await getBundleSyncEvents(db, params.id, 5);
    return json({ success: true, bundle: health.bundle, health, events });
  } catch (error) {
    const status = error instanceof QuizDriveError ? error.status : 500;
    return json({ success: false, error: error.code || 'BundleReadFailed', message: error.message }, { status });
  }
}
