import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../../../../lib/server/auth.js';
import { canManageQuiz } from '../../../../../../lib/server/quizMenu.js';
import { downloadDriveFile, QuizDriveError } from '../../../../../../lib/server/quizDrive.js';

export const prerender = false;

const ALLOWED_ASSET_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

async function optionalAuth(request, platform) {
  if (!request.headers.get('authorization') && !request.headers.get('cookie')?.includes('session_token=')) return null;
  const auth = await verifyServerAuth(request, platform);
  return auth.authenticated ? auth : null;
}

export async function GET({ params, request, platform }) {
  const quizId = params.id;
  const assetId = params.assetId;

  // P1-4: Strict format validation of assetId (prevent SQL/path injection & reject invalid IDs early)
  if (!assetId || !/^[A-Za-z0-9_-]{6,200}$/.test(assetId)) {
    return json({ success: false, error: 'InvalidAssetId' }, { status: 404 });
  }

  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  }
  const db = platform.env.DB;
  const quiz = await db.prepare(`SELECT * FROM quizzes WHERE id = ? LIMIT 1`).bind(quizId).first();
  if (!quiz) {
    return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
  }

  // P1-5: Authorization aligned 100% with GET /api/quiz-menu/[id]
  const auth = await optionalAuth(request, platform);
  const staff = !!(auth && isStaffUser(auth.user));

  if (quiz.status !== 'published') {
    if (!staff || !canManageQuiz(auth.user, quiz)) {
      return json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
  }

  // Student isolation: must have active enrollment in a published homework assignment for this quiz
  if (auth?.authenticated && !staff && String(auth.user.role || '').toLowerCase() === 'student') {
    const assigned = await db.prepare(`
      SELECT 1 FROM homework_assignments ha
      JOIN class_enrollments ce ON ce.class_id = ha.class_id
      WHERE ha.source_quiz_id = ? AND ha.status = 'published'
        AND ce.user_id = ? AND ce.status = 'active'
      LIMIT 1
    `).bind(quizId, auth.user.id).first();
    if (!assigned) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  // P1-3 & P1-4: Strict Asset Membership (No LIKE wildcard, No source_file_id leakage)
  // Only authorize assets that are strictly question image assets for this quiz.
  let assetBelongs = false;

  // 1. Direct prompt_image_url canonical equality
  const canonicalUrl = `/api/quiz-menu/${quizId}/assets/${assetId}`;
  const qRow = await db.prepare(`SELECT 1 FROM quiz_questions WHERE quiz_id = ? AND prompt_image_url = ? LIMIT 1`)
    .bind(quizId, canonicalUrl).first();
  if (qRow) {
    assetBelongs = true;
  }

  // 2. Exact equality in quiz_question_sources joined with quiz_questions
  // Guest/student access strictly requires prompt_image_url canonical equality OR picture_guess type
  if (!assetBelongs) {
    try {
      const sRow = await db.prepare(`
        SELECT 1 FROM quiz_question_sources qqs
        JOIN quiz_questions qq ON qq.quiz_id = qqs.quiz_id AND qq.id = qqs.question_id
        WHERE qqs.quiz_id = ? AND qqs.source_sub_id = ?
          AND (qq.type = 'picture_guess' OR qq.prompt_image_url = ?)
        LIMIT 1
      `).bind(quizId, assetId, canonicalUrl).first();
      if (sRow) assetBelongs = true;
    } catch {}
  }

  // 3. Exact equality in source_metadata_json manifest or owner provenance preview (staff owner only, never for guest/student)
  const isOwner = staff && canManageQuiz(auth?.user, quiz);
  if (!assetBelongs && isOwner) {
    try {
      const sRow = await db.prepare(`SELECT 1 FROM quiz_question_sources WHERE quiz_id = ? AND source_sub_id = ? LIMIT 1`)
        .bind(quizId, assetId).first();
      if (sRow) assetBelongs = true;
    } catch {}

    if (!assetBelongs && quiz.source_metadata_json) {
      try {
        const meta = typeof quiz.source_metadata_json === 'string' ? JSON.parse(quiz.source_metadata_json) : quiz.source_metadata_json;
        if (Array.isArray(meta.manifest)) {
          const item = meta.manifest.find((m) => (m.drive_file_id === assetId || m.id === assetId));
          if (item && String(item.mime_type || '').startsWith('image/')) {
            assetBelongs = true;
          }
        }
      } catch {}
    }
  }

  if (!assetBelongs) {
    return json({ success: false, error: 'AssetNotFound', message: 'Asset does not belong to this quiz' }, { status: 404 });
  }

  try {
    const file = await downloadDriveFile(platform, assetId);

    // P1-3: Strictly verify downloaded MIME is an allowed image format (reject DOCX/PDF/TXT source leaks)
    const mime = String(file.mimeType || '').toLowerCase();
    if (!ALLOWED_ASSET_MIMES.has(mime)) {
      return json({ success: false, error: 'InvalidAssetMimeType', message: 'Chỉ cho phép tải hình ảnh câu hỏi' }, { status: 403 });
    }

    return new Response(file.bytes, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': quiz.status === 'published' ? 'public, max-age=86400' : 'private, no-cache',
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.name || 'asset')}"`
      }
    });
  } catch (err) {
    const status = err instanceof QuizDriveError ? err.status : 500;
    return json({ success: false, error: err.code || 'AssetDownloadFailed', message: err.message }, { status });
  }
}
