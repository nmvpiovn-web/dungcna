import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../../lib/server/auth.js';
import { canManageQuiz } from '../../../../../lib/server/quizMenu.js';
import {
  generateDraftQuestions,
  generateQuestionsWithAI,
  publishQuizBundle,
  QuizDriveError,
  readAllowedDriveSource,
  readDriveSourceFromUrl,
  saveQuizSourceAndDrafts
} from '../../../../../lib/server/quizDrive.js';
import { generateDeterministicQuiz } from '../../../../../lib/server/quizAutoBuilder.js';

export const prerender = false;

export async function POST({ params, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  const quiz = await db.prepare(`SELECT id, status, created_by FROM quizzes WHERE id = ? LIMIT 1`).bind(params.id).first();
  if (!quiz) return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
  if (!canManageQuiz(auth.user, quiz)) return json({ success: false, error: 'Forbidden: Bạn chỉ được thao tác trên quiz do mình tạo' }, { status: 403 });
  if (quiz.status !== 'draft') return json({ success: false, error: 'QuizMustBeDraft' }, { status: 409 });
  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }
  try {
    const fileId = String(body.file_id || '').trim();
    const url = String(body.url || '').trim();
    if (!fileId && !url) {
      return json({ success: false, error: 'Thiếu file_id hoặc url', message: 'Hãy chọn file trong Drive hoặc dán link Google Drive/Docs.' }, { status: 400 });
    }
    // file_id trực tiếp: giữ nguyên allowlist (không nới lỏng).
    // url dán vào: parse link, copy vào Quiz Uploads nếu ngoài folder cho phép.
    const source = url ? await readDriveSourceFromUrl(platform, url) : await readAllowedDriveSource(platform, fileId);
    const questionCount = Number(body.question_count || 10);
    const typeMix = body.type_mix && typeof body.type_mix === 'object' ? body.type_mix : null;
    const difficulty = String(body.difficulty || 'medium');
    const mergeStrategy = String(body.merge_strategy || 'append') === 'replace' ? 'replace' : 'append';

    let questions = null;
    let requested_counts = typeMix;
    let generated_counts = null;
    let degraded_types = null;
    let degraded_reason = null;
    let ai_generated = false;

    if (typeMix && Object.keys(typeMix).length > 0) {
      const aiQuestions = await generateQuestionsWithAI(source.text, platform, { questionCount, typeMix, difficulty });
      if (aiQuestions && aiQuestions.length) {
        questions = aiQuestions;
        ai_generated = true;
      } else {
        const genResult = generateDeterministicQuiz(source.text, {
          questionCount,
          typeMix,
          hasImages: false,
          difficulty
        });
        questions = genResult.questions;
        requested_counts = genResult.requested_counts;
        generated_counts = genResult.generated_counts;
        degraded_types = genResult.degraded_types;
        degraded_reason = genResult.degraded_reason;
      }
    } else {
      const parsedDraft = generateDraftQuestions(source.text);
      if (parsedDraft && parsedDraft.length > 0) {
        questions = parsedDraft;
      } else {
        const genResult = generateDeterministicQuiz(source.text, {
          questionCount,
          typeMix: undefined,
          hasImages: false,
          difficulty
        });
        questions = genResult.questions;
        requested_counts = genResult.requested_counts;
        generated_counts = genResult.generated_counts;
        degraded_types = genResult.degraded_types;
        degraded_reason = genResult.degraded_reason;
      }
    }

    // Attach drive provenance metadata to questions
    const driveSourceId = fileId || source.file?.id || 'drive_doc';
    for (const q of questions) {
      q.source_type = 'drive';
      q.source_id = driveSourceId;
    }

    const metadata = await saveQuizSourceAndDrafts(db, params.id, source.file, source.text, questions, {
      mergeStrategy,
      sourceType: 'drive',
      sourceId: driveSourceId
    });
    const bundle = questions.length ? await publishQuizBundle(platform, db, params.id) : null;
    return json({
      success: true,
      source: metadata,
      extracted_text_length: source.text.length,
      questions,
      bundle,
      ai_generated,
      requested_counts,
      generated_counts,
      degraded_types,
      degraded_reason,
      merge_strategy: mergeStrategy
    });
  } catch (error) {
    const status = error instanceof QuizDriveError ? error.status : 500;
    return json({ success: false, error: error.code || 'DriveImportFailed', message: error.message }, { status });
  }
}
