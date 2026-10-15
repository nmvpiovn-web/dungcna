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

function stripOptionPrefix(opt) {
  return String(opt ?? '').trim().replace(/^[A-Ha-h][.)]\s*/, '').trim();
}

function shuffleTokensDeterministically(tokens, seedText = '') {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const arr = [...tokens];
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (arr.length > 1 && arr.every((v, idx) => v === tokens[idx])) {
    [arr[0], arr[1]] = [arr[1], arr[0]];
  }
  return arr;
}

/**
 * Converts a list of question_bank rows into a multi-type list of quiz_questions rows
 * according to a requested type_mix map.
 * @param {object[]} bankRows
 * @param {string} quizId
 * @param {number} startOrder
 * @param {Record<string, number>|null} [typeMix]
 * @returns {object[]}
 */
export function convertBankRowsToTypeMix(bankRows, quizId, startOrder = 0, typeMix = null) {
  if (!Array.isArray(bankRows) || bankRows.length === 0) return [];

  const validTypes = [
    'multiple_choice', 'true_false', 'fill_blank', 'matching',
    'memory_match', 'ordering', 'word_guess', 'rewrite', 'paragraph'
  ];
  const activeEntries = typeMix && typeof typeMix === 'object'
    ? Object.entries(typeMix)
        .filter(([k, v]) => validTypes.includes(k) && Number(v) > 0)
        .map(([k, v]) => [k, Math.round(Number(v))])
    : [];

  // Default behavior when no typeMix or 100% multiple_choice is requested
  if (activeEntries.length === 0 || (activeEntries.length === 1 && activeEntries[0][0] === 'multiple_choice')) {
    return bankRows.map((row, idx) => mapBankQuestionToQuizQuestion(row, quizId, startOrder + idx));
  }

  const totalRows = bankRows.length;
  const sumRequested = activeEntries.reduce((acc, [, c]) => acc + c, 0);
  const typeQueue = [];

  for (let i = 0; i < activeEntries.length; i++) {
    const [type, count] = activeEntries[i];
    const target = i === activeEntries.length - 1
      ? Math.max(1, totalRows - typeQueue.length)
      : Math.max(1, Math.round((count / sumRequested) * totalRows));
    for (let k = 0; k < target && typeQueue.length < totalRows; k++) {
      typeQueue.push(type);
    }
  }
  while (typeQueue.length < totalRows) {
    typeQueue.push(activeEntries[0][0]);
  }

  // Pre-extract clean question stems and answers for pairing in matching / memory_match
  const parsedItems = bankRows.map((row) => {
    const options = normalizeBankOptions(row.options_json);
    const correctOpt = determineCorrectAnswer(options, row.correct_option_id || row.correct_answer);
    const cleanAns = stripOptionPrefix(correctOpt) || 'Answer';
    const wrongOptObj = options.find((o) => o !== correctOpt) || options[1] || ' None';
    const cleanWrong = stripOptionPrefix(wrongOptObj) || 'incorrect';
    const qText = String(row.question_text || '').trim();
    const hasBlank = /_{2,}|\.{3,}/.test(qText);
    const fullSentence = hasBlank
      ? qText.replace(/_{2,}|\.{3,}/, cleanAns)
      : `${qText.replace(/[?:.]+$/, '')}: ${cleanAns}`;
    const shortStem = qText.length > 75 ? `${qText.slice(0, 72)}...` : qText;
    return {
      row,
      options,
      correctOpt,
      cleanAns,
      cleanWrong,
      qText,
      hasBlank,
      fullSentence,
      shortStem
    };
  });

  const results = [];
  for (let i = 0; i < parsedItems.length; i++) {
    const item = parsedItems[i];
    const targetType = typeQueue[i] || 'multiple_choice';
    const orderIdx = startOrder + i;
    const baseId = `qq_${quizId}_${item.row.id}`;
    const explanation = item.row.explanation ? String(item.row.explanation).trim() : null;

    if (targetType === 'multiple_choice') {
      results.push(mapBankQuestionToQuizQuestion(item.row, quizId, orderIdx));
      continue;
    }

    if (targetType === 'true_false') {
      const isTrue = i % 2 === 0;
      const chosenWord = isTrue ? item.cleanAns : item.cleanWrong;
      const statement = item.hasBlank
        ? item.qText.replace(/_{2,}|\.{3,}/, `[${chosenWord}]`)
        : `${item.qText} → Đáp án là "${chosenWord}".`;
      results.push({
        id: baseId,
        quiz_id: quizId,
        type: 'true_false',
        prompt: `Xác định nhận định sau là Đúng hay Sai:\n"${statement}"`,
        prompt_image_url: null,
        options_json: JSON.stringify(['Đúng', 'Sai']),
        correct_answer: isTrue ? 'Đúng' : 'Sai',
        explanation,
        points: 1.0,
        q_order: orderIdx,
        source_id: item.row.id,
        source_type: 'question_bank'
      });
      continue;
    }

    if (targetType === 'fill_blank') {
      const blankPrompt = item.hasBlank
        ? item.qText
        : item.fullSentence.replace(item.cleanAns, '______');
      results.push({
        id: baseId,
        quiz_id: quizId,
        type: 'fill_blank',
        prompt: `Điền từ hoặc cụm từ tiếng Anh chính xác vào chỗ trống:\n"${blankPrompt}"`,
        prompt_image_url: null,
        options_json: JSON.stringify([]),
        correct_answer: item.cleanAns,
        explanation,
        points: 1.0,
        q_order: orderIdx,
        source_id: item.row.id,
        source_type: 'question_bank'
      });
      continue;
    }

    if (targetType === 'word_guess') {
      const masked = item.cleanAns
        .split('')
        .map((ch, idx) => (ch === ' ' ? ' ' : (idx % 2 === 0 ? ch : '_')))
        .join('');
      results.push({
        id: baseId,
        quiz_id: quizId,
        type: 'word_guess',
        prompt: `Đoán từ/cụm từ tiếng Anh (${masked}) hoàn thành câu sau:\n"${item.qText}"`,
        prompt_image_url: null,
        options_json: JSON.stringify([]),
        correct_answer: item.cleanAns,
        explanation,
        points: 1.0,
        q_order: orderIdx,
        source_id: item.row.id,
        source_type: 'question_bank'
      });
      continue;
    }

    if (targetType === 'ordering') {
      const cleanSent = item.fullSentence.replace(/[.?!]+$/, '').trim();
      let tokens = cleanSent.split(/\s+/).filter(Boolean);
      if (tokens.length > 9) {
        tokens = tokens.slice(0, 8);
      }
      if (tokens.length < 3) {
        tokens = ['Answer', 'is', item.cleanAns];
      }
      const scrambled = shuffleTokensDeterministically(tokens, item.row.id);
      results.push({
        id: baseId,
        quiz_id: quizId,
        type: 'ordering',
        prompt: `Sắp xếp các từ sau thành câu/cụm từ đúng (${item.shortStem}):`,
        prompt_image_url: null,
        options_json: JSON.stringify({ items: scrambled }),
        correct_answer: JSON.stringify(tokens),
        explanation,
        points: 1.0,
        q_order: orderIdx,
        source_id: item.row.id,
        source_type: 'question_bank'
      });
      continue;
    }

    if (targetType === 'matching' || targetType === 'memory_match') {
      const pairItems = [];
      const seenLeft = new Set();
      for (let offset = 0; offset < parsedItems.length && pairItems.length < 4; offset++) {
        const cand = parsedItems[(i + offset) % parsedItems.length];
        const leftKey = cand.shortStem;
        if (!seenLeft.has(leftKey) && cand.cleanAns) {
          seenLeft.add(leftKey);
          pairItems.push({ left: leftKey, right: cand.cleanAns });
        }
      }
      if (pairItems.length < 2) {
        pairItems.push({ left: item.shortStem, right: item.cleanAns });
        pairItems.push({ left: `Từ trái nghĩa / Phương án nhiễu của "${item.cleanAns}"`, right: item.cleanWrong });
      }
      const correctMap = Object.fromEntries(pairItems.map((p) => [p.left, p.right]));

      if (targetType === 'matching') {
        const left = pairItems.map((p) => p.left);
        const right = shuffleTokensDeterministically(pairItems.map((p) => p.right), item.row.id);
        results.push({
          id: baseId,
          quiz_id: quizId,
          type: 'matching',
          prompt: `Nối câu hỏi/ngữ cảnh ở cột trái với đáp án đúng ở cột phải [#${i + 1}]:`,
          prompt_image_url: null,
          options_json: JSON.stringify({ left, right }),
          correct_answer: JSON.stringify(correctMap),
          explanation,
          points: 2.0,
          q_order: orderIdx,
          source_id: item.row.id,
          source_type: 'question_bank'
        });
      } else {
        const pairs = pairItems.map((p) => ({ a: p.left, b: p.right }));
        results.push({
          id: baseId,
          quiz_id: quizId,
          type: 'memory_match',
          prompt: `Ghép đôi thẻ câu hỏi và đáp án tương ứng [#${i + 1}]:`,
          prompt_image_url: null,
          options_json: JSON.stringify({ pairs }),
          correct_answer: JSON.stringify(correctMap),
          explanation,
          points: 2.0,
          q_order: orderIdx,
          source_id: item.row.id,
          source_type: 'question_bank'
        });
      }
      continue;
    }

    if (targetType === 'rewrite') {
      results.push({
        id: baseId,
        quiz_id: quizId,
        type: 'rewrite',
        prompt: `Hoàn thiện hoặc viết lại câu hoàn chỉnh với từ/cụm từ gợi ý:\n"${item.qText}" (Từ khóa: ${item.cleanAns})`,
        prompt_image_url: null,
        options_json: JSON.stringify([]),
        correct_answer: item.cleanAns,
        explanation,
        points: 2.0,
        q_order: orderIdx,
        source_id: item.row.id,
        source_type: 'question_bank'
      });
      continue;
    }

    if (targetType === 'paragraph') {
      results.push({
        id: baseId,
        quiz_id: quizId,
        type: 'paragraph',
        prompt: `Đọc câu hỏi/ngữ cảnh sau và viết 2-3 câu giải thích hoặc đặt câu mở rộng bằng tiếng Anh:\n"${formatQuestionPrompt(item.row.question_text, item.row.reading_passage)}"`,
        prompt_image_url: null,
        options_json: JSON.stringify([]),
        correct_answer: '',
        explanation,
        points: 3.0,
        q_order: orderIdx,
        source_id: item.row.id,
        source_type: 'question_bank'
      });
      continue;
    }

    results.push(mapBankQuestionToQuizQuestion(item.row, quizId, orderIdx));
  }

  return results;
}
