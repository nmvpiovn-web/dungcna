import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignedToken } from '../src/lib/server/auth.js';
import { GET } from '../src/routes/api/questions/+server.js';

const secret = 'questions-security-test-secret';

const mockQuestions = [
  {
    id: 1, grade_level: 'Lớp 5', skill_category: 'grammar', question_type: 'multiple_choice',
    question_text: 'Test question?', options_json: '["A","B","C","D"]',
    correct_option_id: 'B', explanation: 'Because B is correct', source_ref: 'exam:test1'
  },
  {
    id: 2, grade_level: 'Lớp 5', skill_category: 'vocab', question_type: 'multiple_choice',
    question_text: 'Another?', options_json: '["A","B"]',
    correct_option_id: 'A', explanation: 'Because A', source_ref: null
  }
];

function platformFor(user) {
  const DB = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() {
              // Trả questions mock; kiểm tra SQL có SELECT cột nhạy cảm không
              const selectsSensitive = sql.includes('correct_option_id');
              const results = mockQuestions.map(q => {
                if (selectsSensitive) return q;
                const { correct_option_id, explanation, ...rest } = q;
                return rest;
              });
              // Giả lập LIMIT
              const limit = params[0] || 100;
              return { results: results.slice(0, limit) };
            }
          };
        }
      };
    }
  };
  return { env: { DB, AUTH_SECRET: secret } };
}

function userPlatformFor(user) {
  const base = platformFor(user);
  const origPrepare = base.env.DB.prepare;
  base.env.DB.prepare = (sql) => {
    const stmt = origPrepare(sql);
    const origBind = stmt.bind;
    stmt.bind = (...params) => {
      const bound = origBind(...params);
      const origAll = bound.all;
      // Intercept để mock verifyServerAuth cần FROM users / auth_sessions
      return bound;
    };
    return stmt;
  };
  return base;
}

async function questionsQuery({ role = null, includeAnswers = false, limit = null, grade = null, examId = null }) {
  const platform = platformFor(null);
  // Mock verifyServerAuth bằng cách patch DB.prepare cho users/auth_sessions
  const realPrepare = platform.env.DB.prepare;
  const user = role ? { id: `user-${role}`, username: role, name: role, role, status: 'active', metadata: '{}' } : null;
  platform.env.DB.prepare = (sql) => {
    if (sql.includes('FROM users')) {
      return { bind: () => ({ async first() { return user; }, async all() { return { results: user ? [user] : [] }; } }) };
    }
    if (sql.includes('FROM auth_sessions')) {
      return { bind: () => ({ async first() { return user ? { id: 'test-session', revoked_at: null, expires_at: '2099-01-01T00:00:00.000Z' } : null; } }) };
    }
    return realPrepare(sql);
  };

  let token = null;
  if (user) {
    token = await createSignedToken(user, secret, 60_000, 'test-session');
  }
  let urlStr = 'https://timbk.io.vn/api/questions';
  const params = [];
  if (includeAnswers) params.push('include_answers=1');
  if (limit !== null) params.push(`limit=${limit}`);
  if (grade !== null) params.push(`grade=${grade}`);
  if (examId !== null) params.push(`exam_id=${encodeURIComponent(examId)}`);
  if (params.length) urlStr += '?' + params.join('&');

  const request = new Request(urlStr, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const response = await GET({ url: new URL(urlStr), request, platform });
  assert.equal(response.status, 200);
  return response.json();
}

function assertNoAnswers(data, label) {
  for (const q of data) {
    assert.ok(!('correct_answer' in q), `${label}: correct_answer bị lộ ở câu ${q.id}`);
    assert.ok(!('explanation' in q), `${label}: explanation bị lộ ở câu ${q.id}`);
    assert.ok(!('correct_option_id' in q), `${label}: correct_option_id bị lộ ở câu ${q.id}`);
  }
}

function assertHasAnswers(data, label) {
  assert.ok(data.length > 0, `${label}: không có dữ liệu`);
  for (const q of data) {
    assert.ok('correct_answer' in q, `${label}: thiếu correct_answer ở câu ${q.id}`);
    assert.ok('explanation' in q, `${label}: thiếu explanation ở câu ${q.id}`);
  }
}

test('anonymous không nhận đáp án', async () => {
  const body = await questionsQuery({ role: null });
  assert.equal(body.success, true);
  assertNoAnswers(body.data, 'anonymous');
});

test('student không nhận đáp án', async () => {
  const body = await questionsQuery({ role: 'student' });
  assertNoAnswers(body.data, 'student');
});

test('teacher không có include_answers=1 thì không nhận đáp án', async () => {
  const body = await questionsQuery({ role: 'teacher' });
  assertNoAnswers(body.data, 'teacher-no-flag');
});

test('teacher + include_answers=1 nhận đáp án', async () => {
  const body = await questionsQuery({ role: 'teacher', includeAnswers: true });
  assertHasAnswers(body.data, 'teacher-with-flag');
});

test('admin + include_answers=1 nhận đáp án', async () => {
  const body = await questionsQuery({ role: 'admin', includeAnswers: true });
  assertHasAnswers(body.data, 'admin-with-flag');
});

test('student + include_answers=1 vẫn không nhận đáp án', async () => {
  const body = await questionsQuery({ role: 'student', includeAnswers: true });
  assertNoAnswers(body.data, 'student-with-flag');
});

test('limit=-1 bị ép về 1', async () => {
  const body = await questionsQuery({ role: null, limit: -1 });
  assert.ok(body.data.length <= 1, `limit=-1 trả ${body.data.length} rows`);
});

test('limit=abc (NaN) dùng default', async () => {
  const body = await questionsQuery({ role: null, limit: 'abc' });
  assert.ok(body.success, 'limit NaN phải thành công với default');
});

test('limit=99999 bị ép về 200', async () => {
  const body = await questionsQuery({ role: null, limit: 99999 });
  assert.ok(body.data.length <= 200, `limit=99999 trả ${body.data.length} rows`);
});

test('exam_id và grade được lọc trong SQL trước LIMIT', async () => {
  const platform = platformFor(null);
  let capturedSql = '';
  let capturedParams = [];
  const originalPrepare = platform.env.DB.prepare;
  platform.env.DB.prepare = (sql) => {
    const statement = originalPrepare(sql);
    const originalBind = statement.bind;
    statement.bind = (...params) => {
      capturedSql = sql;
      capturedParams = params;
      return originalBind(...params);
    };
    return statement;
  };
  const url = new URL('https://timbk.io.vn/api/questions?exam_id=test1&grade=5&limit=10');
  const response = await GET({ url, request: new Request(url), platform });
  assert.equal(response.status, 200);
  assert.match(capturedSql, /source_ref = \?/);
  assert.match(capturedSql, /grade_level/);
  assert.deepEqual(capturedParams, ['exam:test1', 5, 10]);
});

test('grade ngoài 1..12 bị từ chối', async () => {
  const platform = platformFor(null);
  const url = new URL('https://timbk.io.vn/api/questions?grade=99');
  const response = await GET({ url, request: new Request(url), platform });
  assert.equal(response.status, 400);
});
