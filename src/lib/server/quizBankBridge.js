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
 * Balances options deterministically so correct answers are distributed across A, B, C, D
 * @param {string|Array<any>} rawOptions
 * @param {string} rawCorrectId
 * @param {string|null} [targetLetter]
 * @returns {{ options: string[], correct_answer: string }}
 */
export function balanceBankOptions(rawOptions, rawCorrectId, targetLetter = null) {
  let parsed = rawOptions;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { parsed = []; }
  }
  if (!Array.isArray(parsed) || parsed.length < 2) {
    const opts = normalizeBankOptions(rawOptions);
    return {
      options: opts,
      correct_answer: determineCorrectAnswer(opts, rawCorrectId)
    };
  }

  // Extract clean text and original letter/id for each option
  const items = parsed.map((item, idx) => {
    let text = '';
    let letter = String.fromCharCode(65 + idx);
    if (typeof item === 'string') {
      text = item.trim().replace(/^[A-Za-z]\.\s*/, '');
    } else if (item && typeof item === 'object') {
      text = String(item.text ?? '').trim().replace(/^[A-Za-z]\.\s*/, '');
      if (item.id) letter = String(item.id).trim().toUpperCase();
    }
    return { letter, text, raw: item };
  });

  // Find correct option index
  const normCorrect = String(rawCorrectId ?? '').trim().toUpperCase();
  let correctIdx = items.findIndex((it) => it.letter === normCorrect);
  if (correctIdx === -1) {
    correctIdx = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(normCorrect);
  }
  if (correctIdx === -1 || !items[correctIdx]) {
    correctIdx = items.findIndex((it) => it.text.toUpperCase() === normCorrect);
  }
  if (correctIdx === -1) correctIdx = 0;

  const correctItem = items[correctIdx];
  const distractors = items.filter((_, idx) => idx !== correctIdx);

  if (targetLetter) {
    const letters = ['A', 'B', 'C', 'D'];
    const targetIdx = letters.indexOf(targetLetter.toUpperCase());
    if (targetIdx >= 0 && targetIdx < items.length) {
      const reordered = [];
      let distractorPointer = 0;
      for (let i = 0; i < items.length; i++) {
        if (i === targetIdx) {
          reordered.push(correctItem);
        } else {
          reordered.push(distractors[distractorPointer++]);
        }
      }
      const formattedOptions = reordered.map((it, idx) => `${letters[idx]}. ${it.text}`);
      const formattedCorrect = `${targetLetter.toUpperCase()}. ${correctItem.text}`;
      return {
        options: formattedOptions,
        correct_answer: formattedCorrect
      };
    }
  }

  const defaultFormatted = items.map((it, idx) => `${String.fromCharCode(65 + idx)}. ${it.text}`);
  return {
    options: defaultFormatted,
    correct_answer: `${String.fromCharCode(65 + correctIdx)}. ${correctItem.text}`
  };
}

/**
 * Maps a question_bank row into a quiz_questions row
 * @param {object} bankRow
 * @param {string} quizId
 * @param {number} orderIndex
 * @param {string|null} [targetLetter]
 * @returns {object}
 */
export function mapBankQuestionToQuizQuestion(bankRow, quizId, orderIndex, targetLetter = null) {
  let options, correctAnswer;
  if (targetLetter) {
    const balanced = balanceBankOptions(bankRow.options_json, bankRow.correct_option_id, targetLetter);
    options = balanced.options;
    correctAnswer = balanced.correct_answer;
  } else {
    options = normalizeBankOptions(bankRow.options_json);
    correctAnswer = determineCorrectAnswer(options, bankRow.correct_option_id);
  }
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
