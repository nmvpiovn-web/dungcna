import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../../lib/server/auth.js';
import { canManageQuiz } from '../../../../../lib/server/quizMenu.js';
import { generateDraftQuestions, generateQuestionsWithAI, publishQuizBundle, QuizDriveError, readAllowedDriveSource, readDriveSourceFromUrl, saveQuizSourceAndDrafts } from '../../../../../lib/server/quizDrive.js';

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
    const aiQuestions = await generateQuestionsWithAI(source.text, platform);
    const questions = aiQuestions || generateDraftQuestions(source.text);
    const metadata = await saveQuizSourceAndDrafts(db, params.id, source.file, source.text, questions);
    const bundle = questions.length ? await publishQuizBundle(platform, db, params.id) : null;
    return json({ success: true, source: metadata, extracted_text_length: source.text.length, questions, bundle, ai_generated: !!aiQuestions });
  } catch (error) {
    const status = error instanceof QuizDriveError ? error.status : 500;
    return json({ success: false, error: error.code || 'DriveImportFailed', message: error.message }, { status });
  }
}
