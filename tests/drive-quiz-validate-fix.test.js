// Regression tests cho fix quiz validation (DeepSeek data worker, 2026-10-06):
// 1. validateQuestion từ chối correct_answer chỉ toàn whitespace (câu khách quan)
// 2. generateDraftQuestions loại câu trắc nghiệm correct_answer null (bypass validation cũ)
// 3. upload ảnh / import Drive khi extraction rỗng -> 400 EmptyExtraction (không lưu quiz 0 câu)
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestion, gradeAnswers, normalizeAnswer } from '../src/lib/server/quizMenu.js';
import { generateDraftQuestions, uploadQuizSource, QuizDriveError } from '../src/lib/server/quizDrive.js';

const MC = {
  type: 'multiple_choice',
  prompt: 'Choose the correct answer',
  options_json: JSON.stringify(['A. cat', 'B. dog']),
  points: 1
};

test('validateQuestion: từ chối correct_answer chỉ toàn whitespace (multiple_choice)', () => {
  const r = validateQuestion({ ...MC, correct_answer: '   ' });
  assert.ok(r.error, 'phải báo lỗi thiếu đáp án');
  assert.match(r.error, /thiếu đáp án/);
});

test('validateQuestion: từ chối correct_answer whitespace (fill_blank, matching)', () => {
  const fb = validateQuestion({ type: 'fill_blank', prompt: 'Điền từ ___', correct_answer: '\t\n ' });
  assert.ok(fb.error);
  const mt = validateQuestion({
    type: 'matching', prompt: 'Nối từ',
    options_json: JSON.stringify({ left: ['a'], right: ['b'] }),
    correct_answer: '  '
  });
  assert.ok(mt.error);
});

test('validateQuestion: từ chối matching answer object rỗng', () => {
  const r = validateQuestion({
    type: 'matching', prompt: 'Nối từ',
    options_json: JSON.stringify({ left: ['a'], right: ['b'] }),
    correct_answer: {}
  });
  assert.ok(r.error);
});

test('validateQuestion: đáp án hợp lệ vẫn pass và được trim khi lưu', () => {
  const r = validateQuestion({ ...MC, correct_answer: ' B ' });
  assert.ok(!r.error);
  assert.equal(r.value.correct_answer, 'B');
  const mt = validateQuestion({
    type: 'matching', prompt: 'Nối từ',
    options_json: JSON.stringify({ left: ['a'], right: ['b'] }),
    correct_answer: { a: 'b' }
  });
  assert.ok(!mt.error);
  const para = validateQuestion({ type: 'paragraph', prompt: 'Viết đoạn văn', correct_answer: null });
  assert.ok(!para.error, 'câu tự luận được phép null đáp án');
});

test('normalizeAnswer: whitespace-only chuẩn hoá thành chuỗi rỗng (lý do phải chặn ở validate)', () => {
  // Trước fix: câu có correct_answer='   ' sẽ chấm mọi bài bỏ trống là ĐÚNG
  assert.equal(normalizeAnswer('   '), '');
  assert.equal(normalizeAnswer(''), '');
});

test('gradeAnswers: bài bỏ trống không được điểm khi đáp án là ký tự cụ thể', () => {
  const rows = [{ id: 'q1', type: 'multiple_choice', points: 2, correct_answer: 'B' }];
  const s = gradeAnswers(rows, { q1: '' });
  assert.equal(s.autoScore, 0);
  assert.equal(s.grading[0].correct, false);
});

test('generateDraftQuestions: loại câu trắc nghiệm không có answer key (correct null)', () => {
  const text = '1. What is 2+2?\nA. 3\nB. 4\nC. 5\n\n2. Capital of France?\nA. London\nB. Paris';
  const qs = generateDraftQuestions(text);
  // Không có answer key -> cả 2 câu multiple_choice đều bị loại, không còn câu invalid
  assert.equal(qs.length, 0);
  for (const q of qs) {
    const checked = validateQuestion(q);
    assert.ok(!checked.error, 'mọi câu trả về phải hợp lệ');
  }
});

test('generateDraftQuestions: giữ câu có answer key đầy đủ', () => {
  const text = '1. What is 2+2?\nA. 3\nB. 4\nC. 5\n\nĐÁP ÁN\n1. B';
  const qs = generateDraftQuestions(text);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].type, 'multiple_choice');
  assert.equal(qs[0].correct_answer, 'B');
});

test('generateDraftQuestions: fallback paragraph vẫn hợp lệ (correct null được phép)', () => {
  const text = 'Đoạn văn dài mô tả con mèo đang ngồi trên thảm trong phòng khách đầy nắng sớm mai.';
  const qs = generateDraftQuestions(text);
  assert.ok(qs.length >= 1);
  assert.equal(qs[0].type, 'paragraph');
  const checked = validateQuestion(qs[0]);
  assert.ok(!checked.error);
});

// --- upload ảnh: OCR/extraction rỗng -> 400 EmptyExtraction, không lưu quiz 0 câu ---
function installFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}
function jsonRes(obj, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
    json: async () => obj,
    text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)),
    arrayBuffer: async () => new TextEncoder().encode(typeof obj === 'string' ? obj : JSON.stringify(obj)).buffer
  };
}

test('uploadQuizSource: ảnh không đọc được nội dung -> EmptyExtraction 400', async () => {
  const restore = installFetch(async (url) => {
    if (String(url).includes('/drive/v3/files?q=')) return jsonRes({ files: [{ id: 'quiz-folder' }] });
    if (String(url).includes('/upload/drive/v3/files')) return jsonRes({ id: 'up1', name: 'a.png' });
    if (String(url).includes('/export?')) return jsonRes(''); // OCR về rỗng
    if (String(url).includes('/drive/v3/files/')) return jsonRes({});
    throw new Error('unexpected ' + url);
  });
  try {
    const platform = { env: { GOOGLE_SERVICE_ACCOUNT_EMAIL: 't@t.iam.gserviceaccount.com', GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'k', DRIVE_TEST_TOKEN: 'tok', QUIZ_DRIVE_PARENT_FOLDER_ID: 'p1' } };
    const file = { name: 'a.png', type: 'image/png', size: 2048, arrayBuffer: async () => new Uint8Array(2048).buffer };
    await assert.rejects(() => uploadQuizSource(platform, file), (e) => {
      assert.ok(e instanceof QuizDriveError);
      assert.equal(e.code, 'EmptyExtraction');
      assert.equal(e.status, 400);
      return true;
    });
  } finally { restore(); }
});
