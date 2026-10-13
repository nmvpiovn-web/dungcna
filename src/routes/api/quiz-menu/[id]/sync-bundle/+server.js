import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../../lib/server/auth.js';
import { canManageQuiz } from '../../../../../lib/server/quizMenu.js';
import {
  acquireBundleLock,
  importGoogleDocToQuizBundle,
  inspectBundleHealth,
  logBundleSyncEvent,
  parseStrictExpectedRevision,
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
  const validDirections = ['import_docs_to_quiz', 'publish_quiz_to_docs', 'publish_homework'];
  if (direction && !validDirections.includes(direction)) {
    return json({ success: false, error: 'InvalidSyncDirection' }, { status: 400 });
  }
  const syncDirection = direction || 'publish_quiz_to_docs';

  let parsedExpectedRevision = null;
  if (body.expected_revision !== undefined && body.expected_revision !== null) {
    try {
      parsedExpectedRevision = parseStrictExpectedRevision(body.expected_revision);
    } catch (revErr) {
      const status = revErr instanceof QuizDriveError ? revErr.status : 400;
      return json({
        success: false,
        error: revErr.code || 'InvalidExpectedRevision',
        message: revErr.message || 'expected_revision không hợp lệ'
      }, { status });
    }
  }

  const resolution = body.resolution !== undefined && body.resolution !== null ? String(body.resolution).trim() : null;
  const validResolutions = ['keep_quiz', 'keep_docs'];
  if (resolution !== null && !validResolutions.includes(resolution)) {
    return json({ success: false, error: 'InvalidResolution', message: 'resolution phải là keep_quiz hoặc keep_docs' }, { status: 400 });
  }

  if (syncDirection === 'publish_homework' && resolution !== null) {
    return json({ success: false, error: 'ResolutionNotApplicable', message: 'Giao bài không nhận resolution' }, { status: 400 });
  }

  if (syncDirection === 'publish_quiz_to_docs' && resolution !== null && resolution !== 'keep_quiz') {
    return json({ success: false, error: 'DirectionResolutionMismatch', message: 'Chiều publish_quiz_to_docs chỉ chấp nhận resolution keep_quiz' }, { status: 400 });
  }

  if (syncDirection === 'import_docs_to_quiz' && resolution !== null && resolution !== 'keep_docs') {
    return json({ success: false, error: 'DirectionResolutionMismatch', message: 'Chiều import_docs_to_quiz chỉ chấp nhận resolution keep_docs' }, { status: 400 });
  }

  if (resolution !== null) {
    const health = await inspectBundleHealth(platform, db, params.id);
    if (health.status === 'clean') {
      return json({ success: false, error: 'ResolutionNotRequired', message: 'Nội dung giữa Quiz và Docs đã khớp, không cần xử lý xung đột' }, { status: 400 });
    }
    if (resolution === 'keep_quiz' && !health.docs_changed) {
      return json({ success: false, error: 'ResolutionNotRequired', message: 'Google Docs không có thay đổi nào để ghi đè' }, { status: 400 });
    }
    if (resolution === 'keep_docs' && !health.quiz_changed) {
      return json({ success: false, error: 'ResolutionNotRequired', message: 'Quiz không có thay đổi nào để ghi đè' }, { status: 400 });
    }
  }

  let lock;
  try {
    lock = await acquireBundleLock(db, params.id, auth.user.id);
  } catch (lockErr) {
    const status = lockErr instanceof QuizDriveError ? lockErr.status : 503;
    return json({ success: false, error: lockErr.code || 'BundleSyncLockUnavailable', message: lockErr.message }, { status });
  }

  if (!lock.acquired) {
    return json({
      success: false,
      error: 'BundleSyncBusy',
      message: 'Một tiến trình đồng bộ khác đang chạy cho quiz này'
    }, { status: 409 });
  }

  try {
    try {
      await logBundleSyncEvent(db, {
        quizId: params.id,
        eventType: 'started',
        actor: auth.user.id,
        direction: syncDirection,
        resolution,
        fromRevision: parsedExpectedRevision
      }, { throwOnError: true });
    } catch (auditErr) {
      return json({
        success: false,
        error: auditErr.code || 'BundleSyncAuditUnavailable',
        message: auditErr.message || 'Hệ thống kiểm toán không khả dụng'
      }, { status: 503 });
    }

    let bundle;
    if (syncDirection === 'import_docs_to_quiz') {
      bundle = await importGoogleDocToQuizBundle(platform, db, params.id, {
        expectedRevision: parsedExpectedRevision,
        resolution,
        actor: auth.user.id,
        lockToken: lock.lockToken
      });
    } else if (syncDirection === 'publish_homework') {
      bundle = await publishBundleHomework(platform, db, params.id, auth.user, {
        ...body,
        expected_revision: parsedExpectedRevision
      });
    } else {
      bundle = await publishQuizBundle(platform, db, params.id, {
        expectedRevision: parsedExpectedRevision,
        resolution,
        actor: auth.user.id,
        lockToken: lock.lockToken
      });
    }

    return json({ success: true, direction: syncDirection, bundle });
  } catch (error) {
    const isConflict = error.code === 'BundleSyncConflict' || error.code === 'BundleRevisionConflict' || error.code === 'MissingExpectedRevision' || error.code === 'BundleSyncLockLost';
    await logBundleSyncEvent(db, {
      quizId: params.id,
      eventType: isConflict ? 'conflict' : 'failed',
      actor: auth.user.id,
      direction: syncDirection,
      resolution,
      fromRevision: parsedExpectedRevision ?? body.expected_revision ?? null,
      errorCode: error.code || 'BundleSyncFailed',
      errorMessage: error.message
    });
    const status = error instanceof QuizDriveError ? error.status : 500;
    return json({ success: false, error: error.code || 'BundleSyncFailed', message: error.message }, { status });
  } finally {
    if (lock?.lockToken) {
      try {
        await releaseBundleLock(db, params.id, lock.lockToken);
      } catch (relErr) {
        await logBundleSyncEvent(db, {
          quizId: params.id,
          eventType: 'cleanup_warning',
          actor: auth.user.id,
          direction: syncDirection,
          resolution,
          fromRevision: parsedExpectedRevision ?? body.expected_revision ?? null,
          errorCode: 'ReleaseLockFailed',
          errorMessage: relErr?.message || 'Failed to release lock'
        });
      }
    }
  }
}
