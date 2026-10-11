import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../../../../lib/server/auth.js';
import { canManageQuiz } from '../../../../../../lib/server/quizMenu.js';
import { downloadDriveFile, QuizDriveError } from '../../../../../../lib/server/quizDrive.js';

export const prerender = false;

async function optionalAuth(request, platform) {
  if (!request.headers.get('authorization') && !request.headers.get('cookie')?.includes('session_token=')) return null;
  const auth = await verifyServerAuth(request, platform);
  return auth.authenticated ? auth : null;
}

export async function GET({ params, request, platform }) {
  const quizId = params.id;
  const assetId = params.assetId;

  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  }
  const db = platform.env.DB;
  const quiz = await db.prepare(`SELECT * FROM quizzes WHERE id = ? LIMIT 1`).bind(quizId).first();
  if (!quiz) {
    return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
  }

  const auth = await optionalAuth(request, platform);
  const staff = !!(auth && isStaffUser(auth.user));
  const isOwner = staff && canManageQuiz(auth.user, quiz);

  if (quiz.status !== 'published' && !isOwner) {
    return json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  // Student isolation for published quiz if assigned
  if (auth?.authenticated && !staff && String(auth.user.role || '').toLowerCase() === 'student') {
    const hasAssignments = await db.prepare(`SELECT 1 FROM homework_assignments WHERE source_quiz_id = ? LIMIT 1`).bind(quizId).first();
    if (hasAssignments) {
      const assigned = await db.prepare(`
        SELECT 1 FROM homework_assignments ha
        JOIN class_enrollments ce ON ce.class_id = ha.class_id
        WHERE ha.source_quiz_id = ? AND ha.status = 'published'
          AND ce.user_id = ? AND ce.status = 'active'
        LIMIT 1
      `).bind(quizId, auth.user.id).first();
      if (!assigned) return json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
  }

  // Verify asset belongs strictly to this quiz (never leak arbitrary Drive files)
  let assetBelongs = false;
  if (quiz.source_file_id === assetId) {
    assetBelongs = true;
  }
  if (!assetBelongs && quiz.source_metadata_json) {
    try {
      const meta = typeof quiz.source_metadata_json === 'string' ? JSON.parse(quiz.source_metadata_json) : quiz.source_metadata_json;
      if (meta.id === assetId) assetBelongs = true;
      if (Array.isArray(meta.manifest)) {
        if (meta.manifest.some((item) => item.drive_file_id === assetId || item.id === assetId)) {
          assetBelongs = true;
        }
      }
    } catch {}
  }
  if (!assetBelongs) {
    const qRow = await db.prepare(`SELECT 1 FROM quiz_questions WHERE quiz_id = ? AND prompt_image_url LIKE ? LIMIT 1`)
      .bind(quizId, `%${assetId}%`).first();
    if (qRow) assetBelongs = true;
  }
  if (!assetBelongs) {
    try {
      const sRow = await db.prepare(`SELECT 1 FROM quiz_question_sources WHERE quiz_id = ? AND (source_id = ? OR source_sub_id = ?) LIMIT 1`)
        .bind(quizId, assetId, assetId).first();
      if (sRow) assetBelongs = true;
    } catch {}
  }

  if (!assetBelongs) {
    return json({ success: false, error: 'AssetNotFound', message: 'Asset does not belong to this quiz' }, { status: 404 });
  }

  try {
    const file = await downloadDriveFile(platform, assetId);
    return new Response(file.bytes, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Cache-Control': quiz.status === 'published' ? 'public, max-age=86400' : 'private, no-cache',
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.name || 'asset')}"`
      }
    });
  } catch (err) {
    const status = err instanceof QuizDriveError ? err.status : 500;
    return json({ success: false, error: err.code || 'AssetDownloadFailed', message: err.message }, { status });
  }
}
