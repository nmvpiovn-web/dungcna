import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSignedToken } from '../src/lib/server/auth.js';
import { GET as listQuizzes, POST as createQuiz } from '../src/routes/api/quiz-menu/+server.js';
import { GET as getQuiz, PUT as updateQuiz, DELETE as deleteQuiz } from '../src/routes/api/quiz-menu/[id]/+server.js';
import { POST as submitQuiz } from '../src/routes/api/quiz-menu/[id]/submit/+server.js';

const secret = 'quiz-menu-phase-1-test-secret';

function d1Adapter(sqlite) {
  function prepare(sql) {
    return {
      bind(...params) {
        const statement = sqlite.prepare(sql);
        return {
          first: async () => statement.get(...params) || null,
          all: async () => ({ results: statement.all(...params) }),
          run: async () => statement.run(...params)
        };
      },
      first: async () => sqlite.prepare(sql).get() || null,
      all: async () => ({ results: sqlite.prepare(sql).all() }),
      run: async () => sqlite.prepare(sql).run()
    };
  }
  return {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
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
  `);
  sqlite.exec(fs.readFileSync('migrations/0012_quiz_menu.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0014_quiz_guest_class.sql', 'utf8'));
  const users = [
    ['teacher-1', 'teacher', 'Cô Giáo', 'teacher'],
    ['student-1', 'student', 'Học Sinh', 'student']
  ];
  for (const [id, username, name, role] of users) {
    sqlite.prepare(`INSERT INTO users (id, username, name, role, status, metadata) VALUES (?, ?, ?, ?, 'active', '{}')`).run(id, username, name, role);
  }
  sqlite.prepare(`INSERT INTO auth_sessions (id, expires_at) VALUES ('session-teacher', '2099-01-01T00:00:00.000Z'), ('session-student', '2099-01-01T00:00:00.000Z')`).run();
  const teacherToken = await createSignedToken({ id: 'teacher-1', username: 'teacher', role: 'teacher' }, secret, 60_000, 'session-teacher');
  const studentToken = await createSignedToken({ id: 'student-1', username: 'student', role: 'student' }, secret, 60_000, 'session-student');
  return { sqlite, platform: { env: { DB: d1Adapter(sqlite), AUTH_SECRET: secret } }, teacherToken, studentToken };
}

function request(path, { token, body, ip = '203.0.113.10', method = body ? 'POST' : 'GET' } = {}) {
  return new Request(`https://timbk.io.vn${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      'cf-connecting-ip': ip
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

async function buildPublishedQuiz(ctx, { subjective = false } = {}) {
  const createReq = request('/api/quiz-menu', { token: ctx.teacherToken, body: { title: 'Quiz Unit 1', time_limit_minutes: 15 } });
  const created = await createQuiz({ request: createReq, platform: ctx.platform });
  assert.equal(created.status, 201);
  const quiz = (await created.json()).quiz;
  const questions = [
    { id: 'q1', type: 'multiple_choice', prompt: 'Choose', options_json: ['A', 'B'], correct_answer: 'B', points: 2 },
    { id: 'q2', type: 'fill_blank', prompt: 'Hello ___', correct_answer: 'world', points: 1 },
    { id: 'q3', type: 'matching', prompt: 'Match', options_json: { left: ['cat'], right: ['mèo'] }, correct_answer: { cat: 'mèo' }, points: 2 },
    ...(subjective ? [{ id: 'q4', type: 'paragraph', prompt: 'Write a paragraph', points: 5 }] : [])
  ];
  const updateReq = request(`/api/quiz-menu/${quiz.id}`, { token: ctx.teacherToken, method: 'PUT', body: { status: 'published', questions } });
  const updated = await updateQuiz({ params: { id: quiz.id }, request: updateReq, platform: ctx.platform });
  assert.equal(updated.status, 200);
  return quiz.id;
}

test('migration tạo đủ bốn bảng Quiz Menu', async () => {
  const ctx = await fixture();
  const tables = ctx.sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'quiz_%' ORDER BY name`).all().map((r) => r.name);
  assert.deepEqual(tables, ['quiz_attempts', 'quiz_questions', 'quiz_reviews', 'quizzes']);
});

test('chỉ staff được tạo quiz và draft không lộ công khai', async () => {
  const ctx = await fixture();
  const forbidden = await createQuiz({ request: request('/api/quiz-menu', { token: ctx.studentToken, body: { title: 'No' } }), platform: ctx.platform });
  assert.equal(forbidden.status, 403);
  const created = await createQuiz({ request: request('/api/quiz-menu', { token: ctx.teacherToken, body: { title: 'Draft' } }), platform: ctx.platform });
  const id = (await created.json()).quiz.id;
  const hidden = await getQuiz({ params: { id }, url: new URL(`https://timbk.io.vn/api/quiz-menu/${id}`), request: request(`/api/quiz-menu/${id}`), platform: ctx.platform });
  assert.equal(hidden.status, 404);
});

test('API public không lộ đáp án; staff phải yêu cầu include_answers rõ ràng', async () => {
  const ctx = await fixture();
  const id = await buildPublishedQuiz(ctx);
  const publicRes = await getQuiz({ params: { id }, url: new URL(`https://timbk.io.vn/api/quiz-menu/${id}`), request: request(`/api/quiz-menu/${id}`), platform: ctx.platform });
  const publicBody = await publicRes.json();
  assert.equal(publicRes.status, 200);
  assert.equal('correct_answer' in publicBody.quiz.questions[0], false);
  assert.equal('explanation' in publicBody.quiz.questions[0], false);

  const staffUrl = new URL(`https://timbk.io.vn/api/quiz-menu/${id}?include_answers=1`);
  const staffRes = await getQuiz({ params: { id }, url: staffUrl, request: request(staffUrl.pathname + staffUrl.search, { token: ctx.teacherToken }), platform: ctx.platform });
  assert.equal((await staffRes.json()).quiz.questions[0].correct_answer, 'B');
});

test('guest start được sanitize và submit được server chấm tự động', async () => {
  const ctx = await fixture();
  const id = await buildPublishedQuiz(ctx);
  const start = await submitQuiz({
    params: { id },
    request: request(`/api/quiz-menu/${id}/submit`, { body: { action: 'start', guest_class: '7A', guest_name: ' <b> Bé   An </b> ' } }),
    platform: ctx.platform
  });
  assert.equal(start.status, 201);
  const started = await start.json();
  const stored = ctx.sqlite.prepare(`SELECT guest_name, guest_class, started_at, guest_token_hash FROM quiz_attempts WHERE id = ?`).get(started.attempt_id);
  assert.equal(stored.guest_name, 'Bé An');
  assert.equal(stored.guest_class, '7A');
  assert.ok(Number.isFinite(Date.parse(stored.started_at)));
  assert.notEqual(stored.guest_token_hash, started.attempt_token);
  assert.ok(started.attempt_token);

  const submit = await submitQuiz({
    params: { id },
    request: request(`/api/quiz-menu/${id}/submit`, { body: {
      action: 'submit', attempt_id: started.attempt_id, attempt_token: started.attempt_token,
      answers: { q1: 'b', q2: '  WORLD ', q3: { cat: 'MÈO' } }
    } }),
    platform: ctx.platform
  });
  const body = await submit.json();
  assert.equal(submit.status, 200);
  assert.equal(body.attempt.auto_score, 5);
  assert.equal(body.attempt.final_score, 5);
  assert.equal(body.attempt.status, 'graded');
  const log = ctx.sqlite.prepare('SELECT started_at, submitted_at FROM quiz_attempts WHERE id = ?').get(started.attempt_id);
  assert.ok(Date.parse(log.submitted_at) >= Date.parse(log.started_at));
  assert.equal(body.grading[0].correct_answer, 'B');

  const repeated = await submitQuiz({
    params: { id },
    request: request(`/api/quiz-menu/${id}/submit`, { body: {
      action: 'submit', attempt_id: started.attempt_id, attempt_token: started.attempt_token, answers: { q1: 'B' }
    } }),
    platform: ctx.platform
  });
  assert.equal(repeated.status, 409);
});

test('câu tự luận chuyển review_pending và không tự cấp final_score', async () => {
  const ctx = await fixture();
  const id = await buildPublishedQuiz(ctx, { subjective: true });
  const start = await submitQuiz({ params: { id }, request: request(`/api/quiz-menu/${id}/submit`, { body: { action: 'start', guest_class: '7A', guest_name: 'Lan' } }), platform: ctx.platform });
  const a = await start.json();
  const submit = await submitQuiz({ params: { id }, request: request(`/api/quiz-menu/${id}/submit`, { body: { action: 'submit', attempt_id: a.attempt_id, attempt_token: a.attempt_token, answers: { q1: 'B', q2: 'world', q3: { cat: 'mèo' }, q4: 'My paragraph' } } }), platform: ctx.platform });
  const body = await submit.json();
  assert.equal(body.attempt.status, 'review_pending');
  assert.equal(body.attempt.final_score, null);
});

test('deadline và guest attempt token được server enforce', async () => {
  const ctx = await fixture();
  const id = await buildPublishedQuiz(ctx);
  const start = await submitQuiz({ params: { id }, request: request(`/api/quiz-menu/${id}/submit`, { body: { action: 'start', guest_class: '7A', guest_name: 'Minh' } }), platform: ctx.platform });
  const a = await start.json();
  const wrongToken = await submitQuiz({ params: { id }, request: request(`/api/quiz-menu/${id}/submit`, { body: { action: 'submit', attempt_id: a.attempt_id, attempt_token: 'wrong', answers: {} } }), platform: ctx.platform });
  assert.equal(wrongToken.status, 403);
  ctx.sqlite.prepare(`UPDATE quiz_attempts SET deadline_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`).run(a.attempt_id);
  const expired = await submitQuiz({ params: { id }, request: request(`/api/quiz-menu/${id}/submit`, { body: { action: 'submit', attempt_id: a.attempt_id, attempt_token: a.attempt_token, answers: {} } }), platform: ctx.platform });
  assert.equal(expired.status, 409);
  assert.equal((await expired.json()).error, 'TimeLimitExceeded');
});

test('rate limit chặn attempt thứ 11 trong một phút trên cùng IP', async () => {
  const ctx = await fixture();
  const id = await buildPublishedQuiz(ctx);
  for (let i = 0; i < 10; i++) {
    const res = await submitQuiz({ params: { id }, request: request(`/api/quiz-menu/${id}/submit`, { ip: '198.51.100.7', body: { action: 'start', guest_class: '7A', guest_name: `Guest ${i}` } }), platform: ctx.platform });
    assert.equal(res.status, 201);
  }
  const limited = await submitQuiz({ params: { id }, request: request(`/api/quiz-menu/${id}/submit`, { ip: '198.51.100.7', body: { action: 'start', guest_class: '7A', guest_name: 'Guest 11' } }), platform: ctx.platform });
  assert.equal(limited.status, 429);
});

test('staff xóa quiz và dữ liệu con cascade', async () => {
  const ctx = await fixture();
  const id = await buildPublishedQuiz(ctx);
  const deleted = await deleteQuiz({ params: { id }, request: request(`/api/quiz-menu/${id}`, { token: ctx.teacherToken, method: 'DELETE' }), platform: ctx.platform });
  assert.equal(deleted.status, 200);
  assert.equal(ctx.sqlite.prepare(`SELECT COUNT(*) AS count FROM quiz_questions WHERE quiz_id = ?`).get(id).count, 0);
  const list = await listQuizzes({ url: new URL('https://timbk.io.vn/api/quiz-menu'), request: request('/api/quiz-menu'), platform: ctx.platform });
  assert.equal((await list.json()).quizzes.length, 0);
});

 test('guest requires name and class; identity uses sanitized input and server clock', async () => {
  const ctx = await fixture();
  const id = await buildPublishedQuiz(ctx);
  for (const identity of [{ guest_name: 'An' }, { guest_class: '7A' }, { guest_name: 'An', guest_class: '<b> </b>' }]) {
    const response = await submitQuiz({ params: { id }, request: request(`/api/quiz-menu/${id}/submit`, { body: { action: 'start', ...identity } }), platform: ctx.platform });
    assert.equal(response.status, 400);
  }
  assert.equal(ctx.sqlite.prepare('SELECT count(*) n FROM quiz_attempts').get().n, 0);
  const response = await submitQuiz({ params: { id }, request: request(`/api/quiz-menu/${id}/submit`, { body: { action: 'start', guest_name: 'An', guest_class: ' <b>7A</b>  tối ', started_at: '2000-01-01', submitted_at: '2000-01-01' } }), platform: ctx.platform });
  assert.equal(response.status, 201);
  const created = await response.json();
  const row = ctx.sqlite.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(created.attempt_id);
  assert.equal(row.guest_class, '7A tối');
  assert.ok(Date.parse(row.started_at) > Date.parse('2020-01-01'));
  assert.equal(row.submitted_at, null);
});

test('authenticated student starts without guest identity', async () => {
  const ctx = await fixture();
  const id = await buildPublishedQuiz(ctx);
  const response = await submitQuiz({ params: { id }, request: request(`/api/quiz-menu/${id}/submit`, { token: ctx.studentToken, body: { action: 'start' } }), platform: ctx.platform });
  assert.equal(response.status, 201);
  const created = await response.json();
  const row = ctx.sqlite.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(created.attempt_id);
  assert.equal(row.user_id, 'student-1');
  assert.equal(row.guest_class, null);
  assert.equal(created.attempt_token, null);
});
