/**
 * Helper utilities for Question Bank <-> Quiz bridging
 */

/**
 * Normalizes options from question_bank into a clean array of string options
 * @param {string|Array<any>} raw
 * @returns {string[]}
 */
export function normalizeBankOptions(raw) {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.map((item, idx) => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') {
      const text = String(item.text ?? '').trim();
      const letter = item.id || String.fromCharCode(65 + idx);
      if (/^[A-Za-z]\.\s*/.test(text)) return text;
      return `${letter}. ${text}`;
    }
    return String(item ?? '').trim();
  });
}

/**
 * Determines the correct answer string matching the normalized options
 * @param {string[]} options
 * @param {string} correctOptionId
 * @returns {string}
 */
export function determineCorrectAnswer(options, correctOptionId) {
  const normId = String(correctOptionId ?? '').trim().toUpperCase();
  if (!options || !options.length) return normId;

  const letterIndex = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].indexOf(normId);
  if (letterIndex >= 0 && options[letterIndex]) {
    return options[letterIndex];
  }

  // Look for option starting with "X. " or exact match
  const match = options.find((opt) => {
    const upper = opt.toUpperCase();
    return upper === normId || upper.startsWith(`${normId}.`) || upper.startsWith(`${normId} `);
  });

  return match || options[0] || normId;
}

/**
 * Formats question prompt, prepending reading passage if available
 * @param {string} questionText
 * @param {string|null} [readingPassage]
 * @returns {string}
 */
export function formatQuestionPrompt(questionText, readingPassage) {
  const text = String(questionText ?? '').trim();
  const passage = String(readingPassage ?? '').trim();
  if (!passage) return text;
  return `[Đoạn văn đọc]\n${passage}\n\n${text}`;
}

/**
 * Maps a question_bank row into a quiz_questions row
 * @param {object} bankRow
 * @param {string} quizId
 * @param {number} orderIndex
 * @returns {object}
 */
export function mapBankQuestionToQuizQuestion(bankRow, quizId, orderIndex) {
  const options = normalizeBankOptions(bankRow.options_json);
  const correctAnswer = determineCorrectAnswer(options, bankRow.correct_option_id);
  const prompt = formatQuestionPrompt(bankRow.question_text, bankRow.reading_passage);

  return {
    id: `qq_${quizId}_${bankRow.id}`,
    quiz_id: quizId,
    type: 'multiple_choice',
    prompt,
    prompt_image_url: null,
    options_json: JSON.stringify(options),
    correct_answer: correctAnswer,
    explanation: bankRow.explanation ? String(bankRow.explanation).trim() : null,
    points: 1.0,
    q_order: orderIndex,
    source_id: bankRow.id,
    source_type: 'question_bank'
  };
}

/**
 * Strips correct answer and explanation for safe client preview listing
 * @param {object} bankRow
 * @returns {object}
 */
export function safePublicBankQuestion(bankRow) {
  const options = normalizeBankOptions(bankRow.options_json);
  return {
    id: bankRow.id,
    grade_level: bankRow.grade_level,
    curriculum_id: bankRow.curriculum_id || null,
    topic: bankRow.topic || null,
    skill_category: bankRow.skill_category || 'grammar',
    cognitive_level: bankRow.cognitive_level || 'thong_hieu',
    question_type: bankRow.question_type || 'multiple_choice',
    prompt: formatQuestionPrompt(bankRow.question_text, bankRow.reading_passage),
    options,
    reading_passage: bankRow.reading_passage || null,
    created_at: bankRow.created_at || null
  };
}
