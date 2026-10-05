import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSignedToken } from '../src/lib/server/auth.js';
import { POST as createQuiz } from '../src/routes/api/quiz-menu/+server.js';
import { POST as uploadSource } from '../src/routes/api/quiz-menu/[id]/upload/+server.js';
import { POST as importDrive } from '../src/routes/api/quiz-menu/[id]/from-drive/+server.js';
import { GET as listDrive } from '../src/routes/api/quiz-menu/drive-files/+server.js';
import { POST as submitQuiz } from '../src/routes/api/quiz-menu/[id]/submit/+server.js';
import { generateDraftQuestions, MAX_QUIZ_FILE_BYTES, sanitizeDriveFilename } from '../src/lib/server/quizDrive.js';

const secret = 'quiz-menu-phase-2-test-secret';

function d1Adapter(sqlite) {
  const wrap = (sql, params = []) => ({
    first: async () => sqlite.prepare(sql).get(...params) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => sqlite.prepare(sql).run(...params)
  });
  return {
    prepare(sql) { return { ...wrap(sql), bind(...params) { return wrap(sql, params); } }; },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
}

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT, phone TEXT, email TEXT, name TEXT,
      role TEXT, avatar TEXT, status TEXT, metadata TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, revoked_at TEXT, expires_at TEXT);
    CREATE TABLE homework_assignments (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, class_id TEXT NOT NULL, class_name TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT, due_date TEXT NOT NULL, total_points INTEGER DEFAULT 10,
      created_by TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, teacher_id TEXT, teacher_name TEXT,
      campus_id TEXT DEFAULT 'loc_codung', skill_type TEXT, assigned_date TEXT, deadline_date TEXT,
      deadline_time TEXT, max_score REAL DEFAULT 10, star_reward_on_time INTEGER DEFAULT 50,
      status TEXT DEFAULT 'published'
    );
    CREATE TABLE class_enrollments (id TEXT PRIMARY KEY, user_id TEXT, class_id TEXT, status TEXT);
    CREATE TABLE parent_student_links (id TEXT PRIMARY KEY, parent_user_id TEXT, student_user_id TEXT, verification_status TEXT);
    CREATE TABLE system_notifications (id TEXT PRIMARY KEY, target_role TEXT, target_user_id TEXT, title TEXT, body TEXT, category TEXT, reference_id TEXT);
  `);
  sqlite.exec(fs.readFileSync('migrations/0012_quiz_menu.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0014_quiz_guest_class.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0013_quiz_menu_drive.sql', 'utf8'));
  sqlite.prepare(`INSERT INTO users (id,username,name,role,status,metadata) VALUES ('teacher-1','teacher','Cô Giáo','teacher','active','{}'), ('student-1','student','Học Sinh','student','active','{}')`).run();
  sqlite.prepare(`INSERT INTO auth_sessions VALUES ('session-teacher',NULL,'2099-01-01T00:00:00.000Z'), ('session-student',NULL,'2099-01-01T00:00:00.000Z')`).run();
  const teacherToken = await createSignedToken({ id: 'teacher-1', username: 'teacher', role: 'teacher' }, secret, 60_000, 'session-teacher');
  const studentToken = await createSignedToken({ id: 'student-1', username: 'student', role: 'student' }, secret, 60_000, 'session-student');
  const platform = { env: {
    DB: d1Adapter(sqlite), AUTH_SECRET: secret, GOOGLE_DRIVE_ACCESS_TOKEN: 'test-token',
    QUIZ_DRIVE_PARENT_FOLDER_ID: 'parent-folder', QUIZ_DRIVE_ALLOWED_FOLDER_IDS: 'curriculum-folder'
  } };
  const response = await createQuiz({ request: jsonRequest('/api/quiz-menu', teacherToken, { title: 'Drive Quiz' }), platform });
  const quizId = (await response.json()).quiz.id;
  return { sqlite, platform, teacherToken, studentToken, quizId };
}

function jsonRequest(path, token, body, method = 'POST') {
  return new Request(`https://timbk.io.vn${path}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function uploadRequest(path, token, file) {
  const form = new FormData();
  if (file) form.set('file', file);
  return new Request(`https://timbk.io.vn${path}`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: form });
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function installDriveMock(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    assert.equal(init.headers.authorization, 'Bearer test-token');
    return handler(url, init, calls);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test('sanitize filename loại path traversal và ký tự nguy hiểm', () => {
  assert.equal(sanitizeDriveFilename('../../bài: kiểm tra?.txt'), 'bài_ kiểm tra_.txt');
});

test('rule parser tạo câu trắc nghiệm nháp và đọc answer key', () => {
  const questions = generateDraftQuestions(`1. Choose the correct answer\nA. goes\nB. go\nC. going\nD. gone\n\nĐÁP ÁN\n1. B`);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].type, 'multiple_choice');
  assert.equal(questions[0].correct_answer, 'B');
  assert.deepEqual(JSON.parse(questions[0].options_json), ['A. goes', 'B. go', 'C. going', 'D. gone']);
});

test('upload chỉ cho staff, validate loại và 10MB trước khi gọi Drive', async () => {
  const ctx = await fixture();
  let fetchCount = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => { fetchCount++; throw new Error('must not call'); };
  try {
    const student = await uploadSource({ params: { id: ctx.quizId }, request: uploadRequest(`/api/quiz-menu/${ctx.quizId}/upload`, ctx.studentToken, new File(['x'], 'a.txt', { type: 'text/plain' })), platform: ctx.platform });
    assert.equal(student.status, 403);
    const unsupported = await uploadSource({ params: { id: ctx.quizId }, request: uploadRequest(`/api/quiz-menu/${ctx.quizId}/upload`, ctx.teacherToken, new File(['x'], 'a.exe', { type: 'application/octet-stream' })), platform: ctx.platform });
    assert.equal(unsupported.status, 415);
    const tooLarge = { name: 'large.pdf', type: 'application/pdf', size: MAX_QUIZ_FILE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) };
    const largeForm = { get: () => tooLarge };
    const tooLargeResponse = await uploadSource({ params: { id: ctx.quizId }, request: { headers: new Headers({ authorization: `Bearer ${ctx.teacherToken}` }), formData: async () => largeForm }, platform: ctx.platform });
    assert.equal(tooLargeResponse.status, 413);
    assert.equal(fetchCount, 0);
  } finally { globalThis.fetch = original; }
});

test('upload TXT lưu vào Quiz Uploads, metadata và câu hỏi nháp trong D1', async () => {
  const ctx = await fixture();
  let uploadCount = 0;
  const mock = installDriveMock(async (url, init) => {
    if (url.includes('/drive/v3/files?q=')) return jsonResponse({ files: [{ id: 'quiz-folder', name: 'Quiz Uploads', parents: ['parent-folder'] }] });
    if (url.includes('/upload/drive/v3/files')) {
      uploadCount += 1;
      if (uploadCount === 1) return jsonResponse({ id: 'drive-source-1', name: 'safe.txt', mimeType: 'text/plain', size: '66', parents: ['quiz-folder'], webViewLink: 'https://drive.test/source' });
      if (uploadCount === 2) return jsonResponse({ id: 'canonical-doc', name: 'Drive Quiz - Bản giáo viên', mimeType: 'application/vnd.google-apps.document', parents: ['quiz-folder'], webViewLink: 'https://drive.test/doc' });
      return jsonResponse({ id: 'printable-docx', name: 'Drive Quiz.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', parents: ['quiz-folder'] });
    }
    if (url.includes('/drive/v3/files/canonical-doc/export')) return new Response(new Uint8Array([80, 75, 3, 4]));
    if (url.includes('/drive/v3/files/canonical-doc?fields=')) return jsonResponse({ id: 'canonical-doc', modifiedTime: '2026-10-05T00:00:00.000Z' });
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`);
  });
  try {
    const file = new File([`1. Choose\nA. cat\nB. dog\n\nĐÁP ÁN\n1. B`], '../safe.txt', { type: 'text/plain' });
    const response = await uploadSource({ params: { id: ctx.quizId }, request: uploadRequest(`/api/quiz-menu/${ctx.quizId}/upload`, ctx.teacherToken, file), platform: ctx.platform });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.source.id, 'drive-source-1');
    assert.equal(body.questions[0].correct_answer, 'B');
    const quiz = ctx.sqlite.prepare(`SELECT source_file_id, source_file_name, source_metadata_json, source_text_excerpt FROM quizzes WHERE id = ?`).get(ctx.quizId);
    assert.equal(quiz.source_file_id, 'drive-source-1');
    assert.equal(quiz.source_file_name, 'safe.txt');
    assert.match(quiz.source_text_excerpt, /Choose/);
    assert.equal(ctx.sqlite.prepare(`SELECT COUNT(*) count FROM quiz_questions WHERE quiz_id = ?`).get(ctx.quizId).count, 1);
    const linked = ctx.sqlite.prepare(`SELECT source_quiz_id, source_docx_file_id, status FROM homework_assignments WHERE source_quiz_id = ?`).get(ctx.quizId);
    assert.equal(linked.source_quiz_id, ctx.quizId);
    assert.equal(linked.source_docx_file_id, 'printable-docx');
    assert.equal(linked.status, 'draft');
    assert.equal(mock.calls.some((call) => call.url.includes('uploadType=multipart')), true);
  } finally { mock.restore(); }
});

test('from-drive chặn file ngoài allowlist trước khi tải nội dung', async () => {
  const ctx = await fixture();
  const mock = installDriveMock(async (url) => {
    if (url.includes('/drive/v3/files/external-file?fields=')) return jsonResponse({ id: 'external-file', name: 'outside.txt', mimeType: 'text/plain', size: '20', parents: ['unknown-folder'] });
    if (url.includes('/drive/v3/files?q=')) return jsonResponse({ files: [{ id: 'quiz-folder', name: 'Quiz Uploads', parents: ['parent-folder'] }] });
    throw new Error(`content must not be downloaded: ${url}`);
  });
  try {
    const response = await importDrive({ params: { id: ctx.quizId }, request: jsonRequest(`/api/quiz-menu/${ctx.quizId}/from-drive`, ctx.teacherToken, { file_id: 'external-file' }), platform: ctx.platform });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'DriveFolderForbidden');
    assert.equal(mock.calls.some((call) => call.url.includes('alt=media')), false);
  } finally { mock.restore(); }
});

test('from-drive export Google Doc trong allowlist và thay draft cũ atomically', async () => {
  const ctx = await fixture();
  ctx.sqlite.prepare(`INSERT INTO quiz_questions (id,quiz_id,type,prompt,points,q_order) VALUES ('old',?,'paragraph','old',1,0)`).run(ctx.quizId);
  let uploadCount = 0;
  const mock = installDriveMock(async (url) => {
    if (url.includes('/drive/v3/files/google-doc?fields=')) return jsonResponse({ id: 'google-doc', name: 'Unit 1', mimeType: 'application/vnd.google-apps.document', parents: ['curriculum-folder'], webViewLink: 'https://drive.test/doc' });
    if (url.includes('/drive/v3/files?q=')) return jsonResponse({ files: [{ id: 'quiz-folder', name: 'Quiz Uploads', parents: ['parent-folder'] }] });
    if (url.includes('/drive/v3/files/google-doc/export')) return new Response('Write a paragraph about your school and your best friend.', { status: 200 });
    if (url.includes('/upload/drive/v3/files')) {
      uploadCount += 1;
      return uploadCount === 1
        ? jsonResponse({ id: 'canonical-doc-2', mimeType: 'application/vnd.google-apps.document', parents: ['quiz-folder'] })
        : jsonResponse({ id: 'printable-docx-2', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', parents: ['quiz-folder'] });
    }
    if (url.includes('/drive/v3/files/canonical-doc-2/export')) return new Response(new Uint8Array([80, 75, 3, 4]));
    if (url.includes('/drive/v3/files/canonical-doc-2?fields=')) return jsonResponse({ id: 'canonical-doc-2', modifiedTime: '2026-10-05T00:00:00.000Z' });
    throw new Error(`unexpected ${url}`);
  });
  try {
    const response = await importDrive({ params: { id: ctx.quizId }, request: jsonRequest(`/api/quiz-menu/${ctx.quizId}/from-drive`, ctx.teacherToken, { file_id: 'google-doc' }), platform: ctx.platform });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.questions[0].type, 'paragraph');
    assert.equal(ctx.sqlite.prepare(`SELECT COUNT(*) count FROM quiz_questions WHERE id = 'old'`).get().count, 0);
    assert.equal(ctx.sqlite.prepare(`SELECT source_file_id FROM quizzes WHERE id = ?`).get(ctx.quizId).source_file_id, 'google-doc');
  } finally { mock.restore(); }
});

test('drive-files chỉ trả file trong các folder được phép và theo pagination', async () => {
  const ctx = await fixture();
  const mock = installDriveMock(async (url) => {
    if (url.includes("name%20%3D%20'Quiz%20Uploads'")) return jsonResponse({ files: [{ id: 'quiz-folder', name: 'Quiz Uploads' }] });
    if (url.includes('pageToken=next-page')) return jsonResponse({ files: [{ id: 'f2', name: 'two.pdf', mimeType: 'application/pdf', parents: ['quiz-folder'] }] });
    if (url.includes("'quiz-folder'%20in%20parents")) return jsonResponse({ nextPageToken: 'next-page', files: [{ id: 'f1', name: 'one.txt', mimeType: 'text/plain', parents: ['quiz-folder'] }] });
    if (url.includes("'curriculum-folder'%20in%20parents")) return jsonResponse({ files: [{ id: 'f1', name: 'one.txt', mimeType: 'text/plain', parents: ['curriculum-folder'] }] });
    throw new Error(`unexpected ${url}`);
  });
  try {
    const response = await listDrive({ request: jsonRequest('/api/quiz-menu/drive-files', ctx.teacherToken, undefined, 'GET'), platform: ctx.platform });
    assert.equal(response.status, 200);
    const files = (await response.json()).files;
    assert.deepEqual(files.map((file) => file.id).sort(), ['f1', 'f2']);
    assert.equal(mock.calls.some((call) => call.url.includes('pageToken=next-page')), true);
  } finally { mock.restore(); }
});

test('học sinh đánh dấu không hiểu và lưu để làm lại mà chưa bị chấm sai', async () => {
  const ctx = await fixture();
  ctx.sqlite.prepare(`INSERT INTO quiz_questions (id,quiz_id,type,prompt,options_json,correct_answer,points,q_order) VALUES ('q-defer',?,'multiple_choice','Choose','["A","B"]','B',1,0)`).run(ctx.quizId);
  ctx.sqlite.prepare(`UPDATE quizzes SET status = 'published' WHERE id = ?`).run(ctx.quizId);
  const started = await submitQuiz({
    params: { id: ctx.quizId }, platform: ctx.platform,
    request: jsonRequest(`/api/quiz-menu/${ctx.quizId}/submit`, ctx.studentToken, { action: 'start' })
  });
  const attempt = await started.json();
  const saved = await submitQuiz({
    params: { id: ctx.quizId }, platform: ctx.platform,
    request: jsonRequest(`/api/quiz-menu/${ctx.quizId}/submit`, ctx.studentToken, {
      action: 'save_for_later', attempt_id: attempt.attempt_id,
      answers: { 'q-defer': { state: 'not_understood' } }, deferred_question_ids: ['q-defer']
    })
  });
  assert.equal(saved.status, 200);
  const body = await saved.json();
  assert.equal(body.saved_for_later, true);
  assert.deepEqual(body.attempt.deferred_question_ids, ['q-defer']);
  const row = ctx.sqlite.prepare(`SELECT status, deferred_question_ids_json, final_score FROM quiz_attempts WHERE id = ?`).get(attempt.attempt_id);
  assert.equal(row.status, 'in_progress');
  assert.equal(row.deferred_question_ids_json, '["q-defer"]');
  assert.equal(row.final_score, null);
});
