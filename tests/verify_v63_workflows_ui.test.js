import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSignedToken } from '../src/lib/server/auth.js';
import { GET as childrenGet, PATCH as childrenPatch } from '../src/routes/api/parents/children/+server.js';
import { POST as staffPost } from '../src/routes/api/teachers/staff/+server.js';
import { POST as workflowPost } from '../src/routes/api/teachers/workflows/+server.js';

const SECRET = 'v63-contract-secret-long-enough';

function makeD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT, phone TEXT, email TEXT, name TEXT, role TEXT, avatar TEXT,
      status TEXT, metadata TEXT, created_at TEXT, updated_at TEXT, grade TEXT
    );
    CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT, revoked_at TEXT);
    INSERT INTO users (id,username,name,role,status,avatar,grade,metadata) VALUES
      ('parent_1','parent','Phụ huynh','parent','active',NULL,NULL,'{}'),
      ('student_1','student','Học sinh thật','student','active','avatar.png','Lớp 7','{}'),
      ('admin_1','admin','Quản trị','superadmin','active',NULL,NULL,'{}'),
      ('teacher_1','teacher','Giáo viên thật','teacher','active',NULL,NULL,'{}');
    INSERT INTO auth_sessions VALUES
      ('sid_parent','parent_1','2030-01-01T00:00:00Z',NULL),
      ('sid_admin','admin_1','2030-01-01T00:00:00Z',NULL);
    CREATE TABLE parent_student_links (
      id TEXT PRIMARY KEY, parent_user_id TEXT NOT NULL, student_user_id TEXT NOT NULL,
      verification_status TEXT DEFAULT 'pending', verified_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );
    INSERT INTO parent_student_links (id,parent_user_id,student_user_id) VALUES ('link_1','parent_1','student_1');
    CREATE TABLE teacher_profiles (
      id TEXT PRIMARY KEY, teacher_id TEXT UNIQUE, user_id TEXT, teacher_name TEXT, username TEXT,
      role_type TEXT, role_title TEXT, salary_type TEXT, base_salary_vnd REAL, rate_per_session_vnd REAL,
      total_sessions_taught INTEGER, leader_rating REAL, leader_appraisal TEXT, bonuses TEXT,
      private_reminders TEXT, updated_at TEXT
    );
    INSERT INTO teacher_profiles VALUES
      ('teacher_1','teacher_1','teacher_1','Giáo viên thật','teacher','lead','Giáo viên','per_session',10000000,300000,0,5,'','[]','[]',CURRENT_TIMESTAMP);
    CREATE TABLE teacher_recruitment (
      id TEXT PRIMARY KEY, full_name TEXT NOT NULL, candidate_name TEXT, phone TEXT NOT NULL, email TEXT,
      role_type TEXT, experience_years INTEGER, certificates TEXT, status TEXT, interview_notes TEXT,
      selected_grades_json TEXT DEFAULT '[]', selected_subjects_json TEXT DEFAULT '[]',
      interview_preference TEXT, availability TEXT, cv_link TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE system_notifications (id TEXT PRIMARY KEY, target_role TEXT, title TEXT, body TEXT, category TEXT, reference_id TEXT);
  `);
  return {
    sqlite,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; }
      };
    }
  };
}

async function token(user, sid) {
  return createSignedToken(user, SECRET, 3600000, sid);
}

function request(url, method, authToken, body) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...(authToken ? { authorization: `Bearer ${authToken}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('V63-PARENT-01: pending link is redacted, manager verifies it, then parent sees the real child', async () => {
  const d1 = makeD1();
  const parentToken = await token({ id: 'parent_1', username: 'parent', role: 'parent' }, 'sid_parent');
  const adminToken = await token({ id: 'admin_1', username: 'admin', role: 'superadmin' }, 'sid_admin');
  const platform = { env: { DB: d1, AUTH_SECRET: SECRET } };

  let req = request('http://local/api/parents/children', 'GET', parentToken);
  let res = await childrenGet({ request: req, url: new URL(req.url), platform });
  let data = await res.json();
  assert.equal(data.children[0].is_verified, false);
  assert.equal(data.children[0].username, null);
  assert.equal(data.children[0].name, 'Yêu cầu liên kết đang chờ xác minh');

  req = request('http://local/api/parents/children?status=pending', 'GET', adminToken);
  res = await childrenGet({ request: req, url: new URL(req.url), platform });
  data = await res.json();
  assert.equal(data.total, 1);
  assert.equal(data.links[0].parent_name, 'Phụ huynh');
  assert.equal(data.links[0].student_name, 'Học sinh thật');

  req = request('http://local/api/parents/children', 'PATCH', parentToken, { link_id: 'link_1', verification_status: 'verified' });
  res = await childrenPatch({ request: req, platform });
  assert.equal(res.status, 403);

  req = request('http://local/api/parents/children', 'PATCH', adminToken, { link_id: 'link_1', verification_status: 'verified' });
  res = await childrenPatch({ request: req, platform });
  assert.equal(res.status, 200);

  req = request('http://local/api/parents/children', 'GET', parentToken);
  res = await childrenGet({ request: req, url: new URL(req.url), platform });
  data = await res.json();
  assert.equal(data.children[0].is_verified, true);
  assert.equal(data.children[0].name, 'Học sinh thật');
  assert.equal(data.children[0].grade, 'Lớp 7');
});

test('V63-SALARY-02: manager updates only an existing real teacher and D1 confirms exact VND values', async () => {
  const d1 = makeD1();
  const adminToken = await token({ id: 'admin_1', username: 'admin', role: 'superadmin' }, 'sid_admin');
  const platform = { env: { DB: d1, AUTH_SECRET: SECRET } };
  let req = request('http://local/api/teachers/staff', 'POST', adminToken, {
    action: 'update_role_salary', teacher_id: 'teacher_1', role_type: 'lead', role_title: 'Giáo viên',
    salary_type: 'per_session', base_salary_vnd: 12340000, rate_per_session_vnd: 456000, leader_rating: 5
  });
  let res = await staffPost({ request: req, platform });
  let data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.persisted, true);
  assert.equal(data.profile.base_salary_vnd, 12340000);
  assert.equal(data.profile.rate_per_session_vnd, 456000);

  req = request('http://local/api/teachers/staff', 'POST', adminToken, {
    action: 'update_role_salary', teacher_id: 'teacher_fake', base_salary_vnd: 1, rate_per_session_vnd: 1
  });
  res = await staffPost({ request: req, platform });
  assert.equal(res.status, 404);
});

test('V63-RECRUIT-03: multiple grades and subjects are persisted in structured columns', async () => {
  const d1 = makeD1();
  const platform = { env: { DB: d1, AUTH_SECRET: SECRET } };
  const req = request('http://local/api/teachers/workflows', 'POST', null, {
    action: 'candidate_apply', candidate_name: 'Ứng viên QA', phone: '0900000000',
    selected_grades: ['Lớp 1', 'Lớp 7', 'Lớp 12'], selected_subjects: ['Phonics', 'IELTS'],
    interview_preference: 'online', availability: 'Tối', cv_link: 'https://example.test/cv'
  });
  const res = await workflowPost({ request: req, platform });
  const data = await res.json();
  assert.equal(res.status, 200);
  const row = d1.sqlite.prepare('SELECT * FROM teacher_recruitment WHERE id = ?').get(data.recruitment_id);
  assert.deepEqual(JSON.parse(row.selected_grades_json), ['Lớp 1', 'Lớp 7', 'Lớp 12']);
  assert.deepEqual(JSON.parse(row.selected_subjects_json), ['Phonics', 'IELTS']);
});

test('V63-UI-04: flashcard, evaluation modal, and site theme keep the repaired contracts', () => {
  const flash = fs.readFileSync('src/routes/flashcards/+page.svelte', 'utf8');
  const evaluation = fs.readFileSync('src/routes/evaluations/+page.svelte', 'utf8');
  const store = fs.readFileSync('src/lib/unifiedStore.js', 'utf8');
  assert.match(flash, /display: grid/);
  assert.match(flash, /\.flashcard\.flipped \.card-back/);
  assert.doesNotMatch(flash, /\.card-container\s*\{[^}]*height:\s*520px/s);
  assert.match(evaluation, /aria-label="Đóng bảng đánh giá"/);
  assert.match(evaluation, /max-h-\[calc\(100vh-1rem\)\]/);
  assert.match(evaluation, /evaluation-modal bg-white/);
  assert.doesNotMatch(store, /classList\.add\('dark'\)/);
  assert.match(store, /saved === 'light' \|\| saved === 'sky'/);
});
