import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../../lib/server/auth.js';
import { canManageQuiz } from '../../../../../lib/server/quizMenu.js';
import {
  generateDraftQuestions,
  generateQuestionsWithAI,
  publishQuizBundle,
  QuizDriveError,
  saveQuizSourceAndDrafts,
  uploadQuizSource
} from '../../../../../lib/server/quizDrive.js';
import {
  validateMultiImages,
  concatenateMultiPageText,
  generateDeterministicQuiz,
  MAX_MULTI_IMAGES
} from '../../../../../lib/server/quizAutoBuilder.js';

export const prerender = false;

function parseJson(str, fallback = {}) {
  if (typeof str !== 'string') return str || fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

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

  // Extract files: support single 'file', array of 'files', or multiple 'file' entries
  const filesList = (
    typeof form.getAll === 'function'
      ? [...form.getAll('files'), ...form.getAll('file')]
      : [form.get('file'), form.get('files')]
  ).filter((f) => f && typeof f.arrayBuffer === 'function');
  if (filesList.length === 0) {
    return json({ success: false, error: 'FileRequired', message: 'Thiếu tệp upload' }, { status: 400 });
  }

  const typeMixRaw = form.get('type_mix');
  const typeMix = typeMixRaw ? parseJson(typeMixRaw, null) : null;
  const questionCount = Number(form.get('question_count') || 10);

  // Check if multiple images
  const isImageBatch = filesList.length > 1 || (filesList.length === 1 && String(filesList[0].type || '').startsWith('image/'));

  if (isImageBatch) {
    if (filesList.length > MAX_MULTI_IMAGES) {
      return json({ success: false, error: 'MaxSixImagesAllowed', message: 'Tối đa 6 ảnh cho một lần tạo Auto.' }, { status: 400 });
    }

    const validation = validateMultiImages(filesList);
    if (!validation.valid) {
      const status = validation.code === 'FileTooLarge' || validation.code === 'PayloadTooLarge' ? 413
        : validation.code === 'UnsupportedFileType' ? 415 : 400;
      return json({ success: false, error: validation.code, message: validation.message }, { status });
    }

    try {
      const extractedPages = [];
      let lastUploadedFile = null;

      for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        const source = await uploadQuizSource(platform, file);
        if (!source?.text || source.text.trim().length < 20) {
          throw new QuizDriveError(`Ảnh thứ ${i + 1} (${file.name || ''}) không đọc được nội dung chữ.`, 400, 'EmptyImageExtraction');
        }
        extractedPages.push(source.text);
        lastUploadedFile = source.file;
      }

      const combinedText = concatenateMultiPageText(extractedPages);
      let questions = null;

      // Try AI first if configured
      const aiQuestions = await generateQuestionsWithAI(combinedText, platform);
      if (aiQuestions && aiQuestions.length) {
        questions = aiQuestions;
      } else {
        const genResult = generateDeterministicQuiz(combinedText, {
          questionCount,
          typeMix: typeMix || undefined,
          hasImages: true
        });
        questions = genResult.questions;
      }

      const metadata = await saveQuizSourceAndDrafts(db, params.id, lastUploadedFile, combinedText, questions);
      return json({
        success: true,
        source: metadata,
        extracted_text_length: combinedText.length,
        image_count: filesList.length,
        questions,
        bundle: null,
        ai_generated: !!aiQuestions
      }, { status: 201 });
    } catch (error) {
      const status = error instanceof QuizDriveError ? error.status : 500;
      return json({ success: false, error: error.code || 'UploadFailed', message: error.message }, { status });
    }
  }

  // Single file (DOCX, PDF, TXT)
  const file = filesList[0];
  try {
    const source = await uploadQuizSource(platform, file);
    let questions = null;
    const aiQuestions = await generateQuestionsWithAI(source.text, platform);
    if (aiQuestions && aiQuestions.length) {
      questions = aiQuestions;
    } else if (typeMix) {
      const genResult = generateDeterministicQuiz(source.text, {
        questionCount,
        typeMix,
        hasImages: false
      });
      questions = genResult.questions;
    } else {
      questions = generateDraftQuestions(source.text);
    }

    const metadata = await saveQuizSourceAndDrafts(db, params.id, source.file, source.text, questions);
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
