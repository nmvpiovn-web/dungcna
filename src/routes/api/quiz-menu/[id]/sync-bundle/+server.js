import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../../lib/server/auth.js';
import { importGoogleDocToQuizBundle, publishBundleHomework, publishQuizBundle, QuizDriveError } from '../../../../../lib/server/quizDrive.js';

export const prerender = false;

export async function POST({ params, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  let body = {};
  try { body = await request.json(); } catch { return json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }
  const direction = body.direction || null;
  if (direction && !['import_docs_to_quiz', 'publish_quiz_to_docs', 'publish_homework'].includes(direction)) {
    return json({ success: false, error: 'InvalidSyncDirection' }, { status: 400 });
  }
  try {
    const bundle = direction === 'import_docs_to_quiz'
      ? await importGoogleDocToQuizBundle(platform, db, params.id)
      : direction === 'publish_homework'
        ? await publishBundleHomework(db, params.id, auth.user, body)
        : await publishQuizBundle(platform, db, params.id, { force: direction === 'publish_quiz_to_docs' });
    return json({ success: true, direction: direction || 'publish_quiz_to_docs', bundle });
  } catch (error) {
    const status = error instanceof QuizDriveError ? error.status : 500;
    return json({ success: false, error: error.code || 'BundleSyncFailed', message: error.message }, { status });
  }
}
