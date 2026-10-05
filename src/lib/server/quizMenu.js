export const QUIZ_TYPES = new Set([
  'multiple_choice', 'fill_blank', 'matching', 'paragraph', 'picture_guess', 'rewrite'
]);
export const OBJECTIVE_TYPES = new Set(['multiple_choice', 'fill_blank', 'matching', 'picture_guess']);

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
  const type = String(input?.type || '');
  const prompt = String(input?.prompt || '').trim();
  const points = Number(input?.points ?? 1);
  if (!QUIZ_TYPES.has(type)) return { error: `Loại câu hỏi không hợp lệ tại vị trí ${index + 1}` };
  if (!prompt || prompt.length > 5000) return { error: `Nội dung câu hỏi không hợp lệ tại vị trí ${index + 1}` };
  if (!Number.isFinite(points) || points < 0 || points > 100) return { error: `Điểm câu hỏi không hợp lệ tại vị trí ${index + 1}` };
  if (type === 'picture_guess' && !String(input.prompt_image_url || '').trim()) {
    return { error: `Câu nhìn hình thiếu ảnh tại vị trí ${index + 1}` };
  }
  if (OBJECTIVE_TYPES.has(type) && (input.correct_answer === undefined || input.correct_answer === null || input.correct_answer === '')) {
    return { error: `Câu khách quan thiếu đáp án tại vị trí ${index + 1}` };
  }
  const options = type === 'matching'
    ? parseJson(input.options_json, input.options_json)
    : parseJson(input.options_json, []);
  if (type === 'multiple_choice' && (!Array.isArray(options) || options.length < 2 || options.length > 8)) {
    return { error: `Câu trắc nghiệm cần 2-8 lựa chọn tại vị trí ${index + 1}` };
  }
  if (type === 'matching' && (!options || !Array.isArray(options.left) || !Array.isArray(options.right))) {
    return { error: `Câu nối từ thiếu hai danh sách tại vị trí ${index + 1}` };
  }
  return {
    value: {
      id: String(input.id || makeId('qq')),
      type,
      prompt,
      prompt_image_url: String(input.prompt_image_url || '').trim() || null,
      options_json: options == null ? null : JSON.stringify(options),
      correct_answer: typeof input.correct_answer === 'string' ? input.correct_answer : JSON.stringify(input.correct_answer ?? ''),
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
      correct = row.type === 'matching'
        ? matchingEqual(submitted, row.correct_answer)
        : normalizeAnswer(submitted) === normalizeAnswer(parseJson(row.correct_answer, row.correct_answer));
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
