import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../../lib/server/auth.js';
import { canManageQuiz } from '../../../../../lib/server/quizMenu.js';
import {
  acquireBundleLock,
  importGoogleDocToQuizBundle,
  logBundleSyncEvent,
  publishBundleHomework,
  publishQuizBundle,
  releaseBundleLock,
  QuizDriveError
} from '../../../../../lib/server/quizDrive.js';

export const prerender = false;

export async function POST({ params, request, platform }) {
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

  let body = {};
  try { body = await request.json(); } catch { return json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }
  const direction = body.direction || null;
  if (direction && !['import_docs_to_quiz', 'publish_quiz_to_docs', 'publish_homework'].includes(direction)) {
    return json({ success: false, error: 'InvalidSyncDirection' }, { status: 400 });
  }
  const syncDirection = direction || 'publish_quiz_to_docs';

  const lock = await acquireBundleLock(db, params.id, auth.user.id);
  if (!lock.acquired) {
    return json({
      success: false,
      error: 'BundleSyncBusy',
      message: 'Một tiến trình đồng bộ khác đang chạy cho quiz này'
    }, { status: 409 });
  }

  try {
    await logBundleSyncEvent(db, {
      quizId: params.id,
      eventType: 'started',
      actor: auth.user.id,
      direction: syncDirection,
      resolution: body.resolution || null,
      fromRevision: body.expected_revision ?? null
    });

    let bundle;
    if (syncDirection === 'import_docs_to_quiz') {
      bundle = await importGoogleDocToQuizBundle(platform, db, params.id, {
        expectedRevision: body.expected_revision,
        resolution: body.resolution,
        actor: auth.user.id
      });
    } else if (syncDirection === 'publish_homework') {
      bundle = await publishBundleHomework(db, params.id, auth.user, body);
    } else {
      bundle = await publishQuizBundle(platform, db, params.id, {
        expectedRevision: body.expected_revision,
        resolution: body.resolution,
        actor: auth.user.id
      });
    }

    return json({ success: true, direction: syncDirection, bundle });
  } catch (error) {
    const isConflict = error.code === 'BundleSyncConflict' || error.code === 'BundleRevisionConflict' || error.code === 'MissingExpectedRevision';
    await logBundleSyncEvent(db, {
      quizId: params.id,
      eventType: isConflict ? 'conflict' : 'failed',
      actor: auth.user.id,
      direction: syncDirection,
      resolution: body.resolution || null,
      fromRevision: body.expected_revision ?? null,
      errorCode: error.code || 'BundleSyncFailed',
      errorMessage: error.message
    });
    const status = error instanceof QuizDriveError ? error.status : 500;
    return json({ success: false, error: error.code || 'BundleSyncFailed', message: error.message }, { status });
  } finally {
    await releaseBundleLock(db, params.id, lock.lockToken);
  }
}
