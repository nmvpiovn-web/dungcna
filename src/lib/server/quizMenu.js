export const QUIZ_TYPES = new Set([
  'multiple_choice', 'fill_blank', 'matching', 'paragraph', 'picture_guess', 'rewrite',
  'true_false', 'word_guess', 'ordering', 'memory_match', 'essay'
]);
export const OBJECTIVE_TYPES = new Set([
  'multiple_choice', 'fill_blank', 'matching', 'picture_guess',
  'true_false', 'word_guess', 'ordering', 'memory_match'
]);

export function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

export function sanitizeGuestName(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

export function normalizeAnswer(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

function parseJson(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function validateQuestion(input, index = 0) {
  let type = String(input?.type || '');
  if (type === 'essay') type = 'paragraph'; // normalize essay to paragraph internally if needed, or preserve
  const prompt = String(input?.prompt || '').trim();
  const points = Number(input?.points ?? 1);
  if (!QUIZ_TYPES.has(type)) return { error: `Loại câu hỏi không hợp lệ tại vị trí ${index + 1}` };
  if (!prompt || prompt.length > 5000) return { error: `Nội dung câu hỏi không hợp lệ tại vị trí ${index + 1}` };
  if (!Number.isFinite(points) || points < 0 || points > 100) return { error: `Điểm câu hỏi không hợp lệ tại vị trí ${index + 1}` };
  if (type === 'picture_guess' && !String(input.prompt_image_url || '').trim()) {
    return { error: `Câu nhìn hình thiếu ảnh tại vị trí ${index + 1}` };
  }
  if (OBJECTIVE_TYPES.has(type)) {
    const rawAnswer = input.correct_answer;
    const answerBlank = rawAnswer === undefined || rawAnswer === null ||
      (typeof rawAnswer === 'string' && rawAnswer.trim() === '') ||
      (typeof rawAnswer === 'object' && !Array.isArray(rawAnswer) && Object.keys(rawAnswer).length === 0) ||
      (Array.isArray(rawAnswer) && rawAnswer.length === 0);
    if (answerBlank) {
      return { error: `Câu khách quan thiếu đáp án tại vị trí ${index + 1}` };
    }
    if (type === 'matching' || type === 'memory_match') {
      const parsed = parseJson(typeof rawAnswer === 'string' ? rawAnswer : JSON.stringify(rawAnswer), null);
      if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
        return { error: `Câu ghép nối thiếu đáp án tại vị trí ${index + 1}` };
      }
    }
  }
  let options = input.options_json;
  if (typeof options === 'string') {
    options = parseJson(options, options);
  }
  if (type === 'multiple_choice') {
    if (!Array.isArray(options) || options.length < 2 || options.length > 8) {
      return { error: `Câu trắc nghiệm cần 2-8 lựa chọn tại vị trí ${index + 1}` };
    }
  } else if (type === 'true_false') {
    if (!options) options = ['Đúng', 'Sai'];
    if (!Array.isArray(options) || options.length !== 2) {
      return { error: `Câu Đúng/Sai cần đúng 2 lựa chọn tại vị trí ${index + 1}` };
    }
  } else if (type === 'matching') {
    if (!options || !Array.isArray(options.left) || !Array.isArray(options.right)) {
      return { error: `Câu nối từ thiếu hai danh sách tại vị trí ${index + 1}` };
    }
  } else if (type === 'ordering') {
    const items = Array.isArray(options?.items) ? options.items : (Array.isArray(options) ? options : null);
    if (!items || items.length < 2) {
      return { error: `Câu sắp xếp thứ tự cần ít nhất 2 mục tại vị trí ${index + 1}` };
    }
    if (!options.items) options = { items };
  } else if (type === 'memory_match') {
    const pairs = Array.isArray(options?.pairs) ? options.pairs : (Array.isArray(options) ? options : null);
    if (!pairs || pairs.length < 1) {
      return { error: `Câu ghép trí nhớ cần ít nhất 1 cặp thẻ tại vị trí ${index + 1}` };
    }
    if (!options.pairs) options = { pairs };
  }

  return {
    value: {
      id: String(input.id || makeId('qq')),
      type,
      prompt,
      prompt_image_url: String(input.prompt_image_url || '').trim() || null,
      options_json: options == null ? null : JSON.stringify(options),
      correct_answer: typeof input.correct_answer === 'string' ? input.correct_answer.trim() : JSON.stringify(input.correct_answer ?? ''),
      explanation: String(input.explanation || '').trim() || null,
      points,
      q_order: Number.isInteger(Number(input.q_order)) ? Number(input.q_order) : index
    }
  };
}

export function publicQuestion(row, includeAnswers = false) {
  const question = {
    id: row.id,
    quiz_id: row.quiz_id,
    type: row.type,
    prompt: row.prompt,
    prompt_image_url: row.prompt_image_url || null,
    options: parseJson(row.options_json, row.options_json ? [] : null),
    points: Number(row.points || 0),
    order: Number(row.q_order || 0)
  };
  if (includeAnswers) {
    question.correct_answer = parseJson(row.correct_answer, row.correct_answer);
    question.explanation = row.explanation || null;
    if (row.source_type) question.source_type = row.source_type;
    if (row.source_id) question.source_id = row.source_id;
  }
  return question;
}

function matchingEqual(actual, expected) {
  const a = parseJson(actual, actual);
  const e = parseJson(expected, expected);
  if (!a || !e || typeof a !== 'object' || typeof e !== 'object' || Array.isArray(a) || Array.isArray(e)) return false;
  const keys = Object.keys(e);
  return keys.length === Object.keys(a).length && keys.every((key) => normalizeAnswer(a[key]) === normalizeAnswer(e[key]));
}

function orderingEqual(actual, expected) {
  const a = parseJson(actual, actual);
  const e = parseJson(expected, expected);
  if (Array.isArray(a) && Array.isArray(e)) {
    if (a.length !== e.length) return false;
    return a.every((item, idx) => normalizeAnswer(item) === normalizeAnswer(e[idx]));
  }
  return normalizeAnswer(a) === normalizeAnswer(e);
}

export function gradeAnswers(questionRows, answers) {
  const safeAnswers = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
  let autoScore = 0;
  let maxScore = 0;
  let needsReview = false;
  const grading = [];
  for (const row of questionRows) {
    const points = Number(row.points || 0);
    maxScore += points;
    const submitted = safeAnswers[row.id];
    const objective = OBJECTIVE_TYPES.has(row.type);
    let correct = null;
    if (objective) {
      if (row.type === 'matching' || row.type === 'memory_match') {
        correct = matchingEqual(submitted, row.correct_answer);
      } else if (row.type === 'ordering') {
        correct = orderingEqual(submitted, row.correct_answer);
      } else {
        correct = normalizeAnswer(submitted) === normalizeAnswer(parseJson(row.correct_answer, row.correct_answer));
      }
      if (correct) autoScore += points;
    } else {
      needsReview = true;
    }
    grading.push({
      question_id: row.id,
      type: row.type,
      correct,
      awarded_points: correct === true ? points : (objective ? 0 : null),
      max_points: points,
      correct_answer: parseJson(row.correct_answer, row.correct_answer),
      explanation: row.explanation || null
    });
  }
  return { autoScore, maxScore, needsReview, grading };
}

export async function sha256(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function requestIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export function canManageQuiz(user, quiz) {
  if (!user || !quiz) return false;
  const role = String(user.role || '').toLowerCase();
  if (role === 'superadmin' || role === 'admin' || role === 'leader') return true;
  return role === 'teacher' && String(quiz.created_by || '') === String(user.id || '');
}

export function parseStoredJson(value, fallback = null) {
  return parseJson(value, fallback);
}
