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
  uploadQuizSource,
  validateQuizFile
} from '../../../../../lib/server/quizDrive.js';
import {
  validateMultiImages,
  validateImageLabels,
  concatenateMultiPageText,
  generateDeterministicQuiz,
  parseGradeLevel,
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

  // Check if multiple images or single image batch
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
  } else {
    try {
      validateQuizFile(filesList[0]);
    } catch (err) {
      const status = err instanceof QuizDriveError ? err.status : 400;
      return json({ success: false, error: err.code || 'InvalidFile', message: err.message }, { status });
    }
  }

  const typeMixRaw = form.get('type_mix');
  const typeMix = typeMixRaw ? parseJson(typeMixRaw, null) : null;
  const questionCount = Number(form.get('question_count') || 10);
  const gradeValidation = parseGradeLevel(form.get('grade_level'));
  if (!gradeValidation.valid) {
    return json({ success: false, error: gradeValidation.code, message: gradeValidation.message }, { status: 400 });
  }
  const gradeLevel = gradeValidation.gradeLevel;
  const difficulty = String(form.get('difficulty') || 'medium');
  const mergeStrategy = String(form.get('merge_strategy') || 'append') === 'replace' ? 'replace' : 'append';

  if (isImageBatch) {
    const picTarget = Number(typeMix?.picture_guess || 0);
    const rawLabels = form.get('image_labels') || form.get('labels_json');
    const labelValidation = validateImageLabels(rawLabels, filesList.length, picTarget);
    if (!labelValidation.valid) {
      return json({ success: false, error: labelValidation.code, message: labelValidation.message }, { status: 400 });
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

      const imageAssets = filesList.map((f, idx) => {
        const label = String(labelValidation.labels?.[idx] || '').trim();
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
      const aiQuestions = await generateQuestionsWithAI(combinedText, platform, { questionCount, typeMix, difficulty, gradeLevel });
      if (aiQuestions && aiQuestions.length) {
        questions = aiQuestions;
        ai_generated = true;
      } else {
        const genResult = generateDeterministicQuiz(combinedText, {
          questionCount,
          typeMix: typeMix || undefined,
          hasImages: true,
          imageAssets,
          difficulty,
          gradeLevel
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
        // Exact provenance: picture questions preserve exact asset ID; OCR non-picture questions keep NULL
        if (q.type !== 'picture_guess') {
          q.source_sub_id = null;
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
  let uploadedDriveId = null;
  try {
    const source = await uploadQuizSource(platform, file);
    if (source?.file?.id) {
      uploadedDriveId = source.file.id;
    }
    let questions = null;
    let requested_counts = typeMix;
    let generated_counts = null;
    let degraded_types = null;
    let degraded_reason = null;
    let ai_generated = false;

    if (typeMix && Object.keys(typeMix).length > 0) {
      const aiQuestions = await generateQuestionsWithAI(source.text, platform, { questionCount, typeMix, difficulty, gradeLevel });
      if (aiQuestions && aiQuestions.length) {
        questions = aiQuestions;
        ai_generated = true;
      } else {
        const genResult = generateDeterministicQuiz(source.text, {
          questionCount,
          typeMix,
          hasImages: false,
          difficulty,
          gradeLevel
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
          difficulty,
          gradeLevel
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
    if (uploadedDriveId) {
      try { await removeDriveFile(platform, uploadedDriveId); } catch {}
    }
    const status = error instanceof QuizDriveError ? error.status : 500;
    return json({ success: false, error: error.code || 'UploadFailed', message: error.message }, { status });
  }
}
