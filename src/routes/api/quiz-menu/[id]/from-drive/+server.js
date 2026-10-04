import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../../lib/server/auth.js';
import { generateDraftQuestions, publishQuizBundle, QuizDriveError, readAllowedDriveSource, saveQuizSourceAndDrafts } from '../../../../../lib/server/quizDrive.js';

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
  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }
  try {
    const source = await readAllowedDriveSource(platform, body.file_id);
    const questions = generateDraftQuestions(source.text);
    const metadata = await saveQuizSourceAndDrafts(db, params.id, source.file, source.text, questions);
    const bundle = questions.length ? await publishQuizBundle(platform, db, params.id) : null;
    return json({ success: true, source: metadata, extracted_text_length: source.text.length, questions, bundle });
  } catch (error) {
    const status = error instanceof QuizDriveError ? error.status : 500;
    return json({ success: false, error: error.code || 'DriveImportFailed', message: error.message }, { status });
  }
}
