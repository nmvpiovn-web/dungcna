import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../../lib/server/auth.js';
import { canManageQuiz } from '../../../../../lib/server/quizMenu.js';
import { generateDeterministicQuiz } from '../../../../../lib/server/quizAutoBuilder.js';
import { saveQuizSourceAndDrafts } from '../../../../../lib/server/quizDrive.js';

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

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSONBody' }, { status: 400 });
  }

  const vaultId = String(body.vault_id || '').trim();
  if (!vaultId) {
    return json({ success: false, error: 'VaultIdRequired', message: 'Thiếu ID bài học từ Kho tri thức' }, { status: 400 });
  }

  const article = await db.prepare(
    `SELECT id, title, content_markdown FROM knowledge_vault WHERE id = ? AND (status = 'active' OR status IS NULL) LIMIT 1`
  ).bind(vaultId).first();

  if (!article) {
    return json({ success: false, error: 'ArticleNotFound', message: 'Không tìm thấy bài học trong Kho tri thức' }, { status: 404 });
  }

  const text = String(article.content_markdown || '').trim();
  if (text.length < 20) {
    return json({ success: false, error: 'ContentTooShort', message: 'Nội dung bài học quá ngắn để tạo quiz' }, { status: 400 });
  }

  const questionCount = Math.max(1, Math.min(200, Number(body.question_count) || 10));
  const typeMix = body.type_mix && typeof body.type_mix === 'object' ? body.type_mix : null;
  const difficulty = String(body.difficulty || 'medium');
  const mergeStrategy = String(body.merge_strategy || 'append') === 'replace' ? 'replace' : 'append';

  const genResult = generateDeterministicQuiz(text, {
    questionCount,
    typeMix,
    difficulty,
    hasImages: false
  });

  const questions = genResult.questions;
  for (const q of questions) {
    q.source_type = 'knowledge_vault';
    q.source_id = vaultId;
  }

  await saveQuizSourceAndDrafts(
    db,
    params.id,
    {
      id: vaultId,
      name: article.title,
      mimeType: 'text/markdown',
      webViewLink: null
    },
    text,
    questions,
    {
      mergeStrategy,
      sourceType: 'knowledge_vault',
      sourceId: vaultId
    }
  );

  return json({
    success: true,
    questions,
    requested_counts: genResult.requested_counts,
    generated_counts: genResult.generated_counts,
    degraded_types: genResult.degraded_types,
    degraded_reason: genResult.degraded_reason,
    vault_id: vaultId,
    article_title: article.title,
    merge_strategy: mergeStrategy
  });
}
