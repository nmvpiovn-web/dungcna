import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSignedToken } from '../src/lib/server/auth.js';
import { sha256 } from '../src/lib/server/quizMenu.js';
import { GET as listAttempts } from '../src/routes/api/quiz-menu/[id]/attempts/+server.js';
import { GET as getAttempt } from '../src/routes/api/quiz-menu/attempts/[id]/+server.js';
import { POST as reviewAttempt } from '../src/routes/api/quiz-menu/attempts/[id]/review/+server.js';

const secret = 'quiz-menu-phase-4-test-secret';

function d1Adapter(sqlite) {
  const prepare = (sql) => ({
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
  });
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
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, phone TEXT, email TEXT, name TEXT, role TEXT, avatar TEXT, status TEXT, metadata TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, revoked_at TEXT, expires_at TEXT);
  `);
  sqlite.exec(fs.readFileSync('migrations/0012_quiz_menu.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0014_quiz_guest_class.sql', 'utf8'));
  sqlite.exec(`ALTER TABLE quiz_attempts ADD COLUMN deferred_question_ids_json TEXT; ALTER TABLE quiz_attempts ADD COLUMN saved_for_later_at TEXT;`);
  const users = [
    ['teacher-1', 'teacher1', 'Cô Một', 'teacher'],
    ['teacher-2', 'teacher2', 'Cô Hai', 'teacher'],
    ['leader-1', 'leader', 'Trưởng nhóm', 'leader'],
    ['student-1', 'student1', 'Học sinh Một', 'student'],
    ['student-2', 'student2', 'Học sinh Hai', 'student']
  ];
  const tokens = {};
  for (const [id, username, name, role] of users) {
    const sid = `session-${id}`;
    sqlite.prepare(`INSERT INTO users (id, username, name, role, status, metadata) VALUES (?, ?, ?, ?, 'active', '{}')`).run(id, username, name, role);
    sqlite.prepare(`INSERT INTO auth_sessions (id, expires_at) VALUES (?, '2099-01-01T00:00:00.000Z')`).run(sid);
    tokens[id] = await createSignedToken({ id, username, role }, secret, 60_000, sid);
  }
  sqlite.prepare(`INSERT INTO quizzes (id, title, created_by, creator_name, status) VALUES ('quiz-1', 'Writing test', 'teacher-1', 'Cô Một', 'published')`).run();
  sqlite.prepare(`INSERT INTO quiz_questions (id, quiz_id, type, prompt, correct_answer, points, q_order) VALUES ('q-objective', 'quiz-1', 'fill_blank', 'Hello ___', 'world', 5, 0)`).run();
  sqlite.prepare(`INSERT INTO quiz_questions (id, quiz_id, type, prompt, points, q_order) VALUES ('q-paragraph', 'quiz-1', 'paragraph', 'Write about your family', 5, 1)`).run();
  sqlite.prepare(`
    INSERT INTO quiz_attempts (id, quiz_id, user_id, client_ip_hash, answers_json, auto_score, max_score, status, deadline_at, submitted_at)
    VALUES ('attempt-user', 'quiz-1', 'student-1', 'private-ip-hash', '{"q-objective":"world","q-paragraph":"My family"}', 5, 10, 'review_pending', '2099-01-01T00:00:00.000Z', '2026-10-04T00:00:00.000Z')
  `).run();
  sqlite.prepare(`UPDATE quiz_attempts SET deferred_question_ids_json = '["q-paragraph"]', saved_for_later_at = '2026-10-04T00:01:00.000Z' WHERE id = 'attempt-user'`).run();
  const guestToken = 'guest-secret-token';
  sqlite.prepare(`
    INSERT INTO quiz_attempts (id, quiz_id, guest_name, guest_token_hash, client_ip_hash, answers_json, auto_score, max_score, status, deadline_at, submitted_at)
    VALUES ('attempt-guest', 'quiz-1', 'Bé Guest', ?, 'another-private-hash', '{"q-objective":"world","q-paragraph":"Guest essay"}', 5, 10, 'review_pending', '2099-01-01T00:00:00.000Z', '2026-10-04T00:00:00.000Z')
  `).run(await sha256(guestToken));
  return { sqlite, platform: { env: { DB: d1Adapter(sqlite), AUTH_SECRET: secret } }, tokens, guestToken };
}

function request(path, { token, guestToken, body, method = body ? 'POST' : 'GET' } = {}) {
  return new Request(`https://timbk.io.vn${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(guestToken ? { 'x-quiz-attempt-token': guestToken } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

const reviewBody = (points = 4, override = null) => ({
  feedback: { summary: 'Bài rõ ý.', questions: [{ question_id: 'q-paragraph', awarded_points: points, comment: 'Thêm từ nối.' }] },
  score_override: override
});

test('danh sách bài làm chỉ mở cho quản lý hoặc giáo viên sở hữu quiz', async () => {
  const ctx = await fixture();
  const call = (token) => listAttempts({ params: { id: 'quiz-1' }, request: request('/api/quiz-menu/quiz-1/attempts', { token }), platform: ctx.platform });
  assert.equal((await call(ctx.tokens['student-1'])).status, 403);
  assert.equal((await call(ctx.tokens['teacher-2'])).status, 403);
  const owner = await call(ctx.tokens['teacher-1']);
  assert.equal(owner.status, 200);
  const ownerBody = await owner.json();
  assert.equal(ownerBody.attempts.length, 2);
  assert.deepEqual(ownerBody.attempts.find((item) => item.id === 'attempt-user').deferred_question_ids, ['q-paragraph']);
  assert.equal('guest_token_hash' in ownerBody.attempts[0], false);
  assert.equal('client_ip_hash' in ownerBody.attempts[0], false);
  assert.equal((await call(ctx.tokens['leader-1'])).status, 200);
});

test('review chặn học sinh và giáo viên không sở hữu quiz', async () => {
  const ctx = await fixture();
  const call = (token) => reviewAttempt({ params: { id: 'attempt-user' }, request: request('/api/quiz-menu/attempts/attempt-user/review', { token, body: reviewBody() }), platform: ctx.platform });
  assert.equal((await call(ctx.tokens['student-1'])).status, 403);
  assert.equal((await call(ctx.tokens['teacher-2'])).status, 403);
  assert.equal(ctx.sqlite.prepare(`SELECT COUNT(*) AS count FROM quiz_reviews`).get().count, 0);
});

test('server kiểm tra đủ điểm tự luận và giới hạn score override', async () => {
  const ctx = await fixture();
  const incomplete = await reviewAttempt({
    params: { id: 'attempt-user' },
    request: request('/api/quiz-menu/attempts/attempt-user/review', { token: ctx.tokens['teacher-1'], body: { feedback: { summary: 'Thiếu điểm', questions: [] } } }),
    platform: ctx.platform
  });
  assert.equal(incomplete.status, 400);
  assert.equal((await incomplete.json()).error, 'SubjectiveScoresIncomplete');
  const outOfRange = await reviewAttempt({ params: { id: 'attempt-user' }, request: request('/api/quiz-menu/attempts/attempt-user/review', { token: ctx.tokens['teacher-1'], body: reviewBody(4, 11) }), platform: ctx.platform });
  assert.equal(outOfRange.status, 400);
  assert.equal((await outOfRange.json()).error, 'ScoreOverrideOutOfRange');
  assert.equal(ctx.sqlite.prepare(`SELECT COUNT(*) AS count FROM quiz_reviews`).get().count, 0);
});

test('review tính điểm cuối trên server và lưu audit bất biến qua nhiều lần chấm', async () => {
  const ctx = await fixture();
  const first = await reviewAttempt({ params: { id: 'attempt-user' }, request: request('/api/quiz-menu/attempts/attempt-user/review', { token: ctx.tokens['teacher-1'], body: reviewBody(4) }), platform: ctx.platform });
  assert.equal(first.status, 201);
  assert.equal((await first.json()).attempt.final_score, 9);
  const second = await reviewAttempt({ params: { id: 'attempt-user' }, request: request('/api/quiz-menu/attempts/attempt-user/review', { token: ctx.tokens['leader-1'], body: reviewBody(3, 7.5) }), platform: ctx.platform });
  assert.equal(second.status, 201);
  assert.equal((await second.json()).attempt.final_score, 7.5);
  const rows = ctx.sqlite.prepare(`SELECT reviewer_id, feedback_json, score_override FROM quiz_reviews WHERE attempt_id = 'attempt-user' ORDER BY rowid`).all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].reviewer_id, 'teacher-1');
  assert.equal(JSON.parse(rows[0].feedback_json).computed_score, 9);
  assert.equal(rows[1].reviewer_id, 'leader-1');
  assert.equal(rows[1].score_override, 7.5);
});

test('học sinh chỉ đọc được kết quả của chính mình và nhận feedback sau chấm', async () => {
  const ctx = await fixture();
  await reviewAttempt({ params: { id: 'attempt-user' }, request: request('/api/quiz-menu/attempts/attempt-user/review', { token: ctx.tokens['teacher-1'], body: reviewBody(4) }), platform: ctx.platform });
  const own = await getAttempt({ params: { id: 'attempt-user' }, request: request('/api/quiz-menu/attempts/attempt-user', { token: ctx.tokens['student-1'] }), platform: ctx.platform });
  assert.equal(own.status, 200);
  const body = await own.json();
  assert.equal(body.attempt.final_score, 9);
  assert.equal(body.attempt.reviews[0].feedback.summary, 'Bài rõ ý.');
  assert.equal(body.attempt.questions[0].correct_answer, 'world');
  const other = await getAttempt({ params: { id: 'attempt-user' }, request: request('/api/quiz-menu/attempts/attempt-user', { token: ctx.tokens['student-2'] }), platform: ctx.platform });
  assert.equal(other.status, 404);
});

test('guest token bảo vệ riêng từng bài làm và không lộ đáp án trước khi graded', async () => {
  const ctx = await fixture();
  const denied = await getAttempt({ params: { id: 'attempt-guest' }, request: request('/api/quiz-menu/attempts/attempt-guest', { guestToken: 'wrong' }), platform: ctx.platform });
  assert.equal(denied.status, 404);
  const own = await getAttempt({ params: { id: 'attempt-guest' }, request: request('/api/quiz-menu/attempts/attempt-guest', { guestToken: ctx.guestToken }), platform: ctx.platform });
  assert.equal(own.status, 200);
  const body = await own.json();
  assert.equal(body.attempt.guest_name, 'Bé Guest');
  assert.equal('correct_answer' in body.attempt.questions[0], false);
  const userTryingGuest = await getAttempt({ params: { id: 'attempt-guest' }, request: request('/api/quiz-menu/attempts/attempt-guest', { token: ctx.tokens['student-1'] }), platform: ctx.platform });
  assert.equal(userTryingGuest.status, 404);
});
