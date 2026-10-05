import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../../lib/server/auth.js';
import { generateDraftQuestions, generateQuestionsWithAI, publishQuizBundle, QuizDriveError, saveQuizSourceAndDrafts, uploadQuizSource } from '../../../../../lib/server/quizDrive.js';

export const prerender = false;

export async function POST({ params, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  const quiz = await db.prepare(`SELECT id, status FROM quizzes WHERE id = ? LIMIT 1`).bind(params.id).first();
  if (!quiz) return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
  if (quiz.status !== 'draft') return json({ success: false, error: 'QuizMustBeDraft' }, { status: 409 });
  let form;
  try { form = await request.formData(); } catch { return json({ success: false, error: 'InvalidMultipartBody' }, { status: 400 }); }
  const file = form.get('file');
  try {
    const source = await uploadQuizSource(platform, file);
    const aiQuestions = await generateQuestionsWithAI(source.text, platform);
    const questions = aiQuestions || generateDraftQuestions(source.text);
    const metadata = await saveQuizSourceAndDrafts(db, params.id, source.file, source.text, questions);
    const bundle = questions.length ? await publishQuizBundle(platform, db, params.id) : null;
    return json({ success: true, source: metadata, extracted_text_length: source.text.length, questions, bundle, ai_generated: !!aiQuestions }, { status: 201 });
  } catch (error) {
    const status = error instanceof QuizDriveError ? error.status : 500;
    return json({ success: false, error: error.code || 'UploadFailed', message: error.message }, { status });
  }
}
