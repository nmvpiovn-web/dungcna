import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../../lib/server/auth.js';
import { canManageQuiz } from '../../../../../lib/server/quizMenu.js';
import { generateDraftQuestions, generateQuestionsWithAI, publishQuizBundle, QuizDriveError, saveQuizSourceAndDrafts, uploadQuizSource } from '../../../../../lib/server/quizDrive.js';

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
  let form;
  try { form = await request.formData(); } catch { return json({ success: false, error: 'InvalidMultipartBody' }, { status: 400 }); }
  const file = form.get('file');
  try {
    const source = await uploadQuizSource(platform, file);
    const aiQuestions = await generateQuestionsWithAI(source.text, platform);
    const questions = aiQuestions || generateDraftQuestions(source.text);
    const metadata = await saveQuizSourceAndDrafts(db, params.id, source.file, source.text, questions);
    // Bundle creation is best-effort (requires Drive write which service accounts lack)
    let bundle = null;
    if (questions.length) {
      try {
        bundle = await publishQuizBundle(platform, db, params.id);
      } catch (e) {
        console.warn('[quiz-upload] Bundle creation skipped:', e.message);
      }
    }
    return json({ success: true, source: metadata, extracted_text_length: source.text.length, questions, bundle, ai_generated: !!aiQuestions }, { status: 201 });
  } catch (error) {
    const status = error instanceof QuizDriveError ? error.status : 500;
    return json({ success: false, error: error.code || 'UploadFailed', message: error.message }, { status });
  }
}
