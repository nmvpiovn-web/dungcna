import { makeId, QUIZ_TYPES, OBJECTIVE_TYPES, validateQuestion } from './quizMenu.js';

export const MAX_MULTI_IMAGES = 6;
export const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_TOTAL_IMAGE_PAYLOAD_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_QUIZ_QUESTIONS = 200;

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Validates a batch of image files for Auto builder.
 * Enforces 1..6 count, bounds per file and total size, and MIME whitelist.
 */
export function validateMultiImages(files) {
  if (!files || !Array.isArray(files) || files.length === 0) {
    return { valid: false, code: 'NoImagesProvided', message: 'Vui lòng cung cấp ít nhất 1 ảnh.' };
  }
  if (files.length > MAX_MULTI_IMAGES) {
    return { valid: false, code: 'MaxSixImagesAllowed', message: 'Tối đa 6 ảnh cho một lần tạo Auto.' };
  }

  let totalBytes = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const size = Number(file?.size || 0);
    const mime = String(file?.type || '').toLowerCase();

    if (size <= 0) {
      return { valid: false, code: 'EmptyFile', message: `Ảnh thứ ${i + 1} rỗng.` };
    }
    if (size > MAX_IMAGE_FILE_BYTES) {
      return { valid: false, code: 'FileTooLarge', message: `Ảnh "${file.name || i + 1}" vượt quá giới hạn 10MB.` };
    }
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_IMAGE_PAYLOAD_BYTES) {
      return { valid: false, code: 'PayloadTooLarge', message: 'Tổng dung lượng các ảnh vượt quá 20MB.' };
    }

    if (mime && !ALLOWED_IMAGE_MIMES.has(mime)) {
      // Check extension if MIME might be missing or octet-stream
      const name = String(file?.name || '').toLowerCase();
      const hasValidExt = name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
      if (!hasValidExt) {
        return { valid: false, code: 'UnsupportedFileType', message: `Ảnh "${file.name || i + 1}" không đúng định dạng (chỉ nhận JPG, PNG, WebP).` };
      }
    }
  }

  return { valid: true, count: files.length, totalBytes };
}

/**
 * Concatenates text extracted from multiple pages/images with clear page delimiters.
 */
export function concatenateMultiPageText(pages) {
  if (!Array.isArray(pages)) return String(pages || '');
  const total = pages.length;
  const filtered = pages.map((p, idx) => {
    const content = String(p || '').trim();
    return `--- Trang ${idx + 1}/${total} ---\n${content}`;
  });
  return filtered.join('\n\n');
}

/**
 * Distributes total question count across requested types according to weights/counts.
 * Guarantees sum of returned allocation strictly equals totalCount.
 */
export function allocateTypeMix(totalCount, requestedMix = {}) {
  const boundedTotal = Math.max(1, Math.min(MAX_QUIZ_QUESTIONS, Math.round(Number(totalCount) || 10)));
  const entries = Object.entries(requestedMix)
    .filter(([type, count]) => QUIZ_TYPES.has(type) && Number(count) > 0)
    .map(([type, count]) => [type, Number(count)]);

  if (entries.length === 0) {
    return { multiple_choice: boundedTotal };
  }

  const requestedSum = entries.reduce((acc, [, count]) => acc + count, 0);
  if (requestedSum === boundedTotal) {
    return Object.fromEntries(entries);
  }

  // Scale proportionally to boundedTotal
  const result = {};
  let currentSum = 0;
  for (let i = 0; i < entries.length; i++) {
    const [type, count] = entries[i];
    if (i === entries.length - 1) {
      // Last entry receives the remainder to guarantee exact sum
      const remainder = Math.max(1, boundedTotal - currentSum);
      result[type] = (result[type] || 0) + remainder;
      currentSum += remainder;
    } else {
      const share = Math.max(1, Math.round((count / requestedSum) * boundedTotal));
      result[type] = share;
      currentSum += share;
    }
  }

  // If currentSum exceeded boundedTotal due to Math.max(1), adjust
  let diff = currentSum - boundedTotal;
  const keys = Object.keys(result);
  while (diff > 0) {
    let reduced = false;
    for (const key of keys) {
      if (result[key] > 1 && diff > 0) {
        result[key]--;
        diff--;
        reduced = true;
      }
    }
    if (!reduced) break;
  }
  while (diff < 0) {
    result[keys[0]]++;
    diff++;
  }

  return result;
}

/**
 * Parses sentences, vocabulary items, and Q&A blocks from grounded source text.
 */
function parseSourceContent(text) {
  const clean = String(text || '').replace(/\r/g, '').trim();
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);

  const vocabulary = [];
  const mcqBlocks = [];
  const sentences = [];

  let currentMcq = null;

  function flushCurrentMcq() {
    if (!currentMcq) return;
    if (currentMcq.options.length >= 2) {
      mcqBlocks.push(currentMcq);
    } else if (currentMcq.prompt && currentMcq.prompt.length >= 15) {
      sentences.push(currentMcq.prompt);
    }
    currentMcq = null;
  }

  for (const line of lines) {
    // Page boundary markers
    if (/^---\s*Trang\s*\d+\/\d+\s*---$/i.test(line)) continue;

    // MCQ options: A. ... B. ...
    const optMatch = line.match(/^([A-Da-d])[.)]\s*(.+)$/);
    if (optMatch && currentMcq) {
      currentMcq.options.push(line);
      continue;
    }

    // Answer key: "Answer: B" or "Đáp án: B"
    const ansMatch = line.match(/^(?:Answer|Đáp\s*án)[:=]\s*([A-Da-d])/i);
    if (ansMatch && currentMcq) {
      currentMcq.answer = ansMatch[1].toUpperCase();
      continue;
    }

    // Vocab definition: "word: definition" or "- word: definition"
    const vocabMatch = line.match(/^[-*•]?\s*([a-zA-Z\s]{2,25})\s*[:=–—]\s*(.+)$/);
    if (vocabMatch) {
      flushCurrentMcq();
      const word = vocabMatch[1].trim();
      const def = vocabMatch[2].trim();
      if (word.length >= 2 && def.length >= 4) {
        vocabulary.push({ word, definition: def });
        continue;
      }
    }

    // MCQ question start: "1. What is..." or "Question 1: ..."
    const qStartMatch = line.match(/^(?:(?:Question|Câu)\s*\d+[:.]|\d+[.)])\s*(.+)$/i);
    if (qStartMatch) {
      flushCurrentMcq();
      currentMcq = { prompt: qStartMatch[1].trim(), options: [], answer: null };
      continue;
    }

    flushCurrentMcq();

    // Regular informative sentence for True/False, Blank, Ordering
    if (line.length >= 15 && /[.?!]$/.test(line) && !line.includes(':')) {
      sentences.push(line);
    }
  }

  flushCurrentMcq();

  return { vocabulary, mcqBlocks, sentences, rawText: clean };
}

function deterministicId(prefix, text, index) {
  let hash = 0x811c9dc5;
  const str = `${text}::${index}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `${prefix}_det_${hex}_${index}`;
}

function deterministicShuffle(tokens, seedStr = '') {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  const result = [...tokens];
  for (let i = result.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  if (result.length > 1 && result.every((val, idx) => val === tokens[idx])) {
    [result[0], result[1]] = [result[1], result[0]];
  }
  return result;
}

/**
 * Deterministic Quiz Generator running 100% offline.
 * Strictly grounded in source text, prevents hallucinations and adheres to typeMix.
 */
export function generateDeterministicQuiz(text, options = {}) {
  const questionCount = Math.max(1, Math.min(MAX_QUIZ_QUESTIONS, Number(options.questionCount) || 10));
  const hasImages = Boolean(options.hasImages);
  const imageAssets = Array.isArray(options.imageAssets) ? options.imageAssets : [];
  const difficulty = String(options.difficulty || 'medium');
  let requestedMix = { ...(options.typeMix || { multiple_choice: questionCount }) };

  const degradedTypes = [];
  let degradedReason = null;

  // Check if picture_guess is requested but no valid image assets exist
  const groundableAssets = imageAssets.filter((a) => a && a.url && (a.answer || a.label || a.name || a.ocr_text));
  if (requestedMix.picture_guess && (!hasImages || groundableAssets.length === 0)) {
    degradedTypes.push('picture_guess');
    degradedReason = 'Tài liệu không có tệp ảnh hợp lệ để tạo câu hỏi nhìn hình đoán chữ (picture_guess).';
  }

  const allocation = allocateTypeMix(questionCount, requestedMix);
  const parsed = parseSourceContent(text);
  const questions = [];
  const seenPrompts = new Set();

  function addQuestionSafely(candidate) {
    const normPrompt = candidate.prompt.toLowerCase().trim();
    if (seenPrompts.has(normPrompt)) return false;
    const validated = validateQuestion(candidate, questions.length);
    if (validated.error) return false;
    seenPrompts.add(normPrompt);
    const qId = candidate.id || deterministicId('qq', candidate.prompt, questions.length);
    questions.push({ ...validated.value, id: qId, q_order: questions.length });
    return true;
  }

  // 1. Generate Multiple Choice
  const targetMcq = allocation.multiple_choice || 0;
  let mcqAdded = 0;
  // Use parsed MCQ blocks first
  for (const block of parsed.mcqBlocks) {
    if (mcqAdded >= targetMcq) break;
    let correctOpt = block.options[0];
    if (block.answer) {
      const idx = block.answer.charCodeAt(0) - 65;
      if (block.options[idx]) correctOpt = block.options[idx];
    }
    const added = addQuestionSafely({
      type: 'multiple_choice',
      prompt: block.prompt,
      options_json: block.options,
      correct_answer: correctOpt,
      points: 1
    });
    if (added) mcqAdded++;
  }
  // If not enough parsed MCQs, synthesize from vocabulary or sentences
  if (mcqAdded < targetMcq && parsed.vocabulary.length > 0) {
    for (let i = 0; i < parsed.vocabulary.length && mcqAdded < targetMcq; i++) {
      const item = parsed.vocabulary[i];
      const distractors = parsed.vocabulary
        .filter((_, idx) => idx !== i)
        .map((v) => v.definition)
        .slice(0, 3);
      while (distractors.length < 3) distractors.push(`Không phải nghĩa của từ ${item.word}`);
      const opts = [item.definition, ...distractors].sort();
      const added = addQuestionSafely({
        type: 'multiple_choice',
        prompt: `Nghĩa chính xác của từ "${item.word}" là gì?`,
        options_json: opts,
        correct_answer: item.definition,
        points: 1
      });
      if (added) mcqAdded++;
    }
  }
  if (mcqAdded < targetMcq && parsed.sentences.length > 0) {
    for (let i = 0; i < parsed.sentences.length && mcqAdded < targetMcq; i++) {
      const s = parsed.sentences[i];
      const correct = s;
      const distractors = [
        s.replace(/\b(is|are|was|were|can|will|should)\b/i, '$1 not'),
        s.replace(/\b(protect|major|rare|threat|wildlife|animals)\b/i, 'other'),
        `Nhận định không có trong bài học [${i + 1}]`
      ];
      const opts = [correct, ...distractors.slice(0, 3)].sort();
      const added = addQuestionSafely({
        type: 'multiple_choice',
        prompt: `Theo bài học, nhận định nào sau đây là chính xác? [${i + 1}]`,
        options_json: opts,
        correct_answer: correct,
        points: 1
      });
      if (added) mcqAdded++;
    }
  }

  // 2. Generate True / False
  const targetTf = allocation.true_false || 0;
  let tfAdded = 0;
  for (let i = 0; i < parsed.sentences.length && tfAdded < targetTf; i++) {
    const s = parsed.sentences[i];
    const isTrue = i % 2 === 0;
    const prompt = isTrue ? s : `Theo bài học: "${s.replace(/\b(is|are|was|were|can|will|should)\b/i, '$1 not')}"`;
    const added = addQuestionSafely({
      type: 'true_false',
      prompt: `Xác định tính Đúng / Sai của nhận định sau: "${prompt}"`,
      options_json: ['Đúng', 'Sai'],
      correct_answer: isTrue ? 'Đúng' : 'Sai',
      points: 1
    });
    if (added) tfAdded++;
  }

  // 3. Generate Fill in the Blank
  const targetFill = allocation.fill_blank || 0;
  let fillAdded = 0;
  for (const s of parsed.sentences) {
    if (fillAdded >= targetFill) break;
    const words = s.split(/\s+/).filter((w) => w.length >= 4 && !/[.,?!]/.test(w));
    if (words.length > 0) {
      const targetWord = words[Math.floor(words.length / 2)];
      const blanked = s.replace(targetWord, '______');
      const added = addQuestionSafely({
        type: 'fill_blank',
        prompt: `Điền từ thích hợp vào chỗ trống:\n"${blanked}"`,
        correct_answer: targetWord,
        points: 1
      });
      if (added) fillAdded++;
    }
  }

  // 4. Generate Word Guess
  const targetWg = allocation.word_guess || 0;
  let wgAdded = 0;
  for (const v of parsed.vocabulary) {
    if (wgAdded >= targetWg) break;
    const masked = v.word.split('').map((c, idx) => (idx % 2 === 0 ? c : '_')).join('');
    const added = addQuestionSafely({
      type: 'word_guess',
      prompt: `Đoán từ tiếng Anh phù hợp với định nghĩa (${masked}): "${v.definition}"`,
      correct_answer: v.word,
      points: 1
    });
    if (added) wgAdded++;
  }

  // 5. Generate Ordering
  const targetOrd = allocation.ordering || 0;
  let ordAdded = 0;
  for (const s of parsed.sentences) {
    if (ordAdded >= targetOrd) break;
    const tokens = s.replace(/[.?!]$/, '').split(/\s+/).filter(Boolean);
    if (tokens.length >= 3 && tokens.length <= 10) {
      const scrambled = deterministicShuffle(tokens, s);
      const added = addQuestionSafely({
        type: 'ordering',
        prompt: 'Sắp xếp các từ sau thành câu hoàn chỉnh:',
        options_json: { items: scrambled },
        correct_answer: tokens,
        points: 1
      });
      if (added) ordAdded++;
    }
  }

  // 6. Generate Matching
  const targetMatch = allocation.matching || 0;
  let matchAdded = 0;
  if (targetMatch > 0 && parsed.vocabulary.length >= 2) {
    const pairs = parsed.vocabulary.slice(0, 4);
    const left = pairs.map((p) => p.word);
    const right = pairs.map((p) => p.definition).sort();
    const correctMap = Object.fromEntries(pairs.map((p) => [p.word, p.definition]));
    const added = addQuestionSafely({
      type: 'matching',
      prompt: 'Nối các từ tiếng Anh với nghĩa tương ứng:',
      options_json: { left, right },
      correct_answer: correctMap,
      points: 2
    });
    if (added) matchAdded++;
  }

  // 7. Generate Memory Match
  const targetMm = allocation.memory_match || 0;
  let mmAdded = 0;
  if (targetMm > 0 && parsed.vocabulary.length >= 2) {
    const pairList = parsed.vocabulary.slice(0, 4).map((p) => ({ a: p.word, b: p.definition }));
    const correctMap = Object.fromEntries(pairList.map((p) => [p.a, p.b]));
    const added = addQuestionSafely({
      type: 'memory_match',
      prompt: 'Ghép đôi các thẻ từ vựng tương ứng:',
      options_json: { pairs: pairList },
      correct_answer: correctMap,
      points: 2
    });
    if (added) mmAdded++;
  }

  // 8. Generate Rewrite
  const targetRewrite = allocation.rewrite || 0;
  let rwAdded = 0;
  for (const s of parsed.sentences) {
    if (rwAdded >= targetRewrite) break;
    const added = addQuestionSafely({
      type: 'rewrite',
      prompt: `Viết lại câu sau bằng cách sử dụng cấu trúc tương đương:\n"${s}"`,
      correct_answer: s,
      points: 2
    });
    if (added) rwAdded++;
  }

  // 9. Generate Paragraph / Essay
  const targetPara = (allocation.paragraph || 0) + (allocation.essay || 0);
  let paraAdded = 0;
  if (targetPara > 0 && parsed.rawText.length >= 50) {
    const paragraphs = parsed.rawText.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length >= 40);
    for (const p of paragraphs) {
      if (paraAdded >= targetPara) break;
      const added = addQuestionSafely({
        type: 'paragraph',
        prompt: `Đọc đoạn văn sau và trả lời câu hỏi bằng tiếng Anh:\n\n"${p.slice(0, 1000)}"\n\nCâu hỏi: Tóm tắt nội dung chính của đoạn văn trên bằng 2-3 câu.`,
        correct_answer: null,
        points: 3
      });
      if (added) paraAdded++;
    }
  }

  // 10. Generate Picture Guess
  const targetPic = allocation.picture_guess || 0;
  let picAdded = 0;
  if (targetPic > 0) {
    for (const asset of groundableAssets) {
      if (picAdded >= targetPic) break;
      let answer = String(asset.answer || asset.label || '').trim();
      if (!answer && asset.name) {
        const cleanName = String(asset.name).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
        if (cleanName.length >= 2 && /^[a-zA-Z\s]+$/.test(cleanName)) {
          answer = cleanName;
        }
      }
      if (!answer && asset.ocr_text) {
        const words = String(asset.ocr_text).split(/\s+/).filter((w) => w.length >= 3 && /^[a-zA-Z]+$/.test(w));
        if (words.length > 0) answer = words[0];
      }
      if (!answer) continue;

      const picPrompt = asset.prompt || (asset.name ? `Nhìn hình ảnh (${asset.name}) và viết từ tiếng Anh thích hợp:` : `Nhìn hình ảnh [${picAdded + 1}] và viết từ tiếng Anh thích hợp:`);
      const added = addQuestionSafely({
        type: 'picture_guess',
        prompt: picPrompt,
        prompt_image_url: asset.url,
        correct_answer: answer,
        points: 1
      });
      if (added) picAdded++;
    }

    if (picAdded < targetPic) {
      if (!degradedTypes.includes('picture_guess')) degradedTypes.push('picture_guess');
      const note = `Không đủ tài liệu hình ảnh có đáp án xác thực cho ${targetPic} câu nhìn hình đoán chữ (chỉ tạo được ${picAdded} câu).`;
      degradedReason = degradedReason ? `${degradedReason}; ${note}` : note;
    }
  }

  if (questions.length < questionCount) {
    const note = `Nội dung tài liệu chỉ trích xuất được ${questions.length} câu grounded thay vì ${questionCount} câu yêu cầu.`;
    degradedReason = degradedReason ? `${degradedReason}; ${note}` : note;
  }

  const generated_counts = {};
  for (const k of Object.keys(requestedMix)) {
    generated_counts[k] = 0;
  }
  for (const q of questions) {
    generated_counts[q.type] = (generated_counts[q.type] || 0) + 1;
  }

  return {
    questions: questions.slice(0, questionCount),
    requested_counts: requestedMix,
    generated_counts,
    degraded_types: degradedTypes,
    degraded_reason: degradedReason || null,
    allocation
  };
}
