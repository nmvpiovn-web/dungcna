import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../../lib/server/auth.js';
import { canManageQuiz } from '../../../../../lib/server/quizMenu.js';
import {
  generateDraftQuestions,
  generateQuestionsWithAI,
  publishQuizBundle,
  QuizDriveError,
  removeDriveFile,
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
  const difficulty = String(form.get('difficulty') || 'medium');
  const mergeStrategy = String(form.get('merge_strategy') || 'append') === 'replace' ? 'replace' : 'append';

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

    const uploadedDriveIds = [];
    try {
      const extractedPages = [];
      let lastUploadedFile = null;
      const uploadedSources = [];

      for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        const source = await uploadQuizSource(platform, file);
        if (source?.file?.id) {
          uploadedDriveIds.push(source.file.id);
        }
        uploadedSources.push(source);
        if (!source?.text || source.text.trim().length < 20) {
          throw new QuizDriveError(`Ảnh thứ ${i + 1} (${file.name || ''}) không đọc được nội dung chữ.`, 400, 'EmptyImageExtraction');
        }
        extractedPages.push(source.text);
        lastUploadedFile = source.file;
      }

      const combinedText = concatenateMultiPageText(extractedPages);
      let questions = null;
      let requested_counts = typeMix;
      let generated_counts = null;
      let degraded_types = null;
      let degraded_reason = null;
      let ai_generated = false;

      let rawImageLabels = null;
      try {
        const lbls = form.get('image_labels') || form.get('labels_json');
        if (lbls) rawImageLabels = typeof lbls === 'string' ? JSON.parse(lbls) : lbls;
      } catch {}

      const imageAssets = filesList.map((f, idx) => {
        let label = '';
        if (Array.isArray(rawImageLabels)) {
          const item = rawImageLabels[idx];
          label = typeof item === 'string' ? item : (item?.label || item?.answer || '');
        } else if (rawImageLabels && typeof rawImageLabels === 'object') {
          label = rawImageLabels[f.name] || rawImageLabels[idx] || '';
        }
        label = String(label || '').trim();
        const assetId = uploadedSources[idx]?.file?.id || `img_${idx}`;
        const assetUrl = `/api/quiz-menu/${params.id}/assets/${assetId}`;
        return {
          id: assetId,
          name: f.name || `image_${idx + 1}`,
          url: assetUrl,
          label,
          answer: label,
          ocr_text: extractedPages[idx] || ''
        };
      });

      // Try AI first if configured, validating output against typeMix
      const aiQuestions = await generateQuestionsWithAI(combinedText, platform, { questionCount, typeMix, difficulty });
      if (aiQuestions && aiQuestions.length) {
        questions = aiQuestions;
        ai_generated = true;
      } else {
        const genResult = generateDeterministicQuiz(combinedText, {
          questionCount,
          typeMix: typeMix || undefined,
          hasImages: true,
          imageAssets,
          difficulty
        });
        questions = genResult.questions;
        requested_counts = genResult.requested_counts;
        generated_counts = genResult.generated_counts;
        degraded_types = genResult.degraded_types;
        degraded_reason = genResult.degraded_reason;
      }

      const manifest = filesList.map((f, idx) => ({
        index: idx + 1,
        name: f.name || `image_${idx + 1}`,
        mime_type: f.type || 'image/jpeg',
        size: Number(f.size || 0),
        drive_file_id: uploadedSources[idx]?.file?.id || null
      }));

      const sourceInfo = {
        ...(lastUploadedFile || {}),
        manifest,
        pages_count: filesList.length
      };

      const primarySourceId = uploadedSources[0]?.file?.id || 'upload_batch';
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        q.source_type = 'upload';
        q.source_id = primarySourceId;
        if (!q.source_sub_id && filesList.length > 1) {
          q.source_sub_id = `page_${(i % filesList.length) + 1}`;
        }
      }

      const metadata = await saveQuizSourceAndDrafts(db, params.id, sourceInfo, combinedText, questions, {
        mergeStrategy,
        sourceType: 'upload',
        sourceId: primarySourceId
      });
      return json({
        success: true,
        source: metadata,
        extracted_text_length: combinedText.length,
        image_count: filesList.length,
        questions,
        bundle: null,
        ai_generated,
        requested_counts,
        generated_counts,
        degraded_types,
        degraded_reason,
        merge_strategy: mergeStrategy
      }, { status: 201 });
    } catch (error) {
      for (const fileId of uploadedDriveIds) {
        try { await removeDriveFile(platform, fileId); } catch {}
      }
      const status = error instanceof QuizDriveError ? error.status : 500;
      return json({ success: false, error: error.code || 'UploadFailed', message: error.message }, { status });
    }
  }

  // Single file (DOCX, PDF, TXT)
  const file = filesList[0];
  try {
    const source = await uploadQuizSource(platform, file);
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

    const uploadSourceId = source.file?.id || 'upload_file';
    for (const q of questions) {
      q.source_type = 'upload';
      q.source_id = uploadSourceId;
    }
    const metadata = await saveQuizSourceAndDrafts(db, params.id, source.file, source.text, questions, {
      mergeStrategy,
      sourceType: 'upload',
      sourceId: uploadSourceId
    });
    let bundle = null;
    if (questions.length) {
      try {
        bundle = await publishQuizBundle(platform, db, params.id);
      } catch (e) {
        console.warn('[quiz-upload] Bundle creation skipped:', e.message);
      }
    }
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
    }, { status: 201 });
  } catch (error) {
    const status = error instanceof QuizDriveError ? error.status : 500;
    return json({ success: false, error: error.code || 'UploadFailed', message: error.message }, { status });
  }
}
