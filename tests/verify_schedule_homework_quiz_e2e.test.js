import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { GET as getSchedule, POST as postSchedule } from '../src/routes/api/schedule/+server.js';
import { GET as getHomework, POST as postHomework } from '../src/routes/api/homework/+server.js';
import { GET as getQuizMenu } from '../src/routes/api/quiz-menu/+server.js';
import { POST as postQuizSubmit } from '../src/routes/api/quiz-menu/[id]/submit/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';

const TEST_SECRET = 'e2e_schedule_homework_quiz_secret_2026';

function createD1Adapter(sqliteDb) {
  let txLock = Promise.resolve();
  return {
    prepare(sql) {
      let boundArgs = [];
      return {
        bind(...args) {
          boundArgs = args;
          return this;
        },
        async first() {
          const stmt = sqliteDb.prepare(sql);
          return stmt.get(...boundArgs) || null;
        },
        async all() {
          const stmt = sqliteDb.prepare(sql);
          const rows = stmt.all(...boundArgs);
          return { results: rows };
        },
        async run() {
          const stmt = sqliteDb.prepare(sql);
          const result = stmt.run(...boundArgs);
          return { meta: { changes: Number(result.changes) } };
        }
      };
    },
    async batch(statements) {
      const prevLock = txLock;
      let release;
      txLock = new Promise((r) => (release = r));
      await prevLock;
      try {
        sqliteDb.exec('BEGIN TRANSACTION');
        const results = [];
        for (const s of statements) {
          results.push(await s.run());
        }
        sqliteDb.exec('COMMIT');
        return results;
      } catch (err) {
        try {
          sqliteDb.exec('ROLLBACK');
        } catch {}
        throw err;
      } finally {
        release();
      }
    }
  };
}

function initE2EDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT,
      phone TEXT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar TEXT,
      status TEXT DEFAULT 'active',
      approval_status TEXT DEFAULT 'official',
      metadata TEXT,
      password TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      revoked_at TEXT,
      last_active_at TEXT,
      user_agent TEXT,
      ip_address TEXT,
      device_model TEXT,
      app_mode TEXT
    );

    CREATE TABLE class_sessions (
      id TEXT PRIMARY KEY,
      class_id TEXT,
      class_name TEXT NOT NULL,
      grade_level TEXT DEFAULT 'Lớp 7',
      subject_topic TEXT,
      topic TEXT,
      teacher_id TEXT NOT NULL,
      teacher_name TEXT,
      teacher_role TEXT DEFAULT 'lead',
      assistant_teacher_id TEXT,
      assistant_teacher_name TEXT,
      substitute_teacher_id TEXT,
      substitute_teacher_name TEXT,
      substitute_notes TEXT,
      location TEXT,
      day_of_week INTEGER,
      day_name TEXT,
      session_date TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      notify_minutes_before INTEGER DEFAULT 10,
      room_notes TEXT,
      room TEXT,
      status TEXT DEFAULT 'scheduled',
      student_ids TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE class_enrollments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      role_in_class TEXT DEFAULT 'student',
      enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'active',
      UNIQUE(user_id, class_id)
    );

    CREATE TABLE parent_student_links (
      id TEXT PRIMARY KEY,
      parent_user_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      verification_status TEXT DEFAULT 'verified',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      verified_at TEXT
    );

    CREATE TABLE quizzes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      grade_band TEXT DEFAULT 'Lớp 7',
      creator_name TEXT DEFAULT 'Thầy John',
      time_limit_minutes INTEGER DEFAULT 15,
      status TEXT DEFAULT 'published',
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE quiz_questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      q_order INTEGER DEFAULT 1,
      type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      options_json TEXT,
      correct_answer TEXT,
      points REAL DEFAULT 5,
      explanation TEXT
    );

    CREATE TABLE quiz_attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      user_id TEXT,
      guest_name TEXT,
      guest_class TEXT,
      guest_token_hash TEXT,
      client_ip_hash TEXT,
      answers_json TEXT,
      deferred_question_ids_json TEXT,
      saved_for_later_at TEXT,
      auto_score REAL,
      manual_score REAL,
      final_score REAL,
      max_score REAL,
      status TEXT DEFAULT 'in_progress',
      duration_seconds INTEGER,
      started_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      deadline_at TEXT,
      submitted_at TEXT
    );

    INSERT INTO users (id, username, email, name, role, status, approval_status, metadata) VALUES
      ('usr_teach_1', 'teacher.john', 'john@timbk.io.vn', 'Thầy John', 'teacher', 'active', 'official', '{}'),
      ('usr_stu_1', 'hs.minhanh', 'minhanh@timbk.io.vn', 'Nguyễn Minh Anh', 'student', 'active', 'official', '{"grade":"Lớp 7"}'),
      ('usr_stu_2', 'hs.baolong', 'baolong@timbk.io.vn', 'Trần Bảo Long', 'student', 'active', 'official', '{"grade":"Lớp 7"}'),
      ('usr_stu_other', 'hs.khac', 'khac@timbk.io.vn', 'Lê Học Sinh Khác', 'student', 'active', 'official', '{"grade":"Lớp 8"}'),
      ('usr_par_1', 'ph.minhanh', 'ph_minhanh@timbk.io.vn', 'Phụ huynh Minh Anh', 'parent', 'active', 'official', '{}');

    INSERT INTO auth_sessions (id, user_id, expires_at) VALUES
      ('sid_teach_1', 'usr_teach_1', '2099-12-31T23:59:59Z'),
      ('sid_stu_1', 'usr_stu_1', '2099-12-31T23:59:59Z'),
      ('sid_stu_other', 'usr_stu_other', '2099-12-31T23:59:59Z'),
      ('sid_par_1', 'usr_par_1', '2099-12-31T23:59:59Z');

    INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status) VALUES
      ('link_p1_s1', 'usr_par_1', 'usr_stu_1', 'verified');

    INSERT INTO quizzes (id, title, description, grade_band, creator_name, time_limit_minutes, status, created_by) VALUES
      ('quiz_pub_grade_7_u7', 'Đề Kiểm Tra Unit 7: Traffic & Used to', 'Kiểm tra ngữ pháp và từ vựng Unit 7 Lớp 7', 'Lớp 7', 'Thầy John', 15, 'published', 'usr_teach_1');

    INSERT INTO quiz_questions (id, quiz_id, q_order, type, prompt, options_json, correct_answer, points, explanation) VALUES
      ('qq_1', 'quiz_pub_grade_7_u7', 1, 'multiple_choice', 'My father ___ go to work by motorbike, but now he cycles.', '["used to","use to","uses to","using to"]', '"used to"', 5, 'Used to + V nguyên thể'),
      ('qq_2', 'quiz_pub_grade_7_u7', 2, 'true_false', 'Pedestrians should walk on the pavement.', '["True","False"]', '"True"', 5, 'Người đi bộ đi trên vỉa hè');
  `);
  return db;
}

describe('FULL E2E REGRESSION: SCHEDULE -> ENROLLMENT -> HOMEWORK -> QUIZ -> STUDENT -> TEACHER & PARENT', () => {
  let sqlite;
  let d1;
  let platform;
  let teacherToken;
  let studentToken;
  let otherStudentToken;
  let parentToken;
  let savedSessionId;
  let savedClassId;
  let createdHomeworkId;

  before(async () => {
    sqlite = initE2EDatabase();
    d1 = createD1Adapter(sqlite);
    platform = { env: { DB: d1, AUTH_SECRET: TEST_SECRET } };

    teacherToken = await createSignedToken(
      { id: 'usr_teach_1', username: 'teacher.john', role: 'teacher', name: 'Thầy John', sid: 'sid_teach_1' },
      TEST_SECRET
    );
    studentToken = await createSignedToken(
      { id: 'usr_stu_1', username: 'hs.minhanh', role: 'student', name: 'Nguyễn Minh Anh', sid: 'sid_stu_1' },
      TEST_SECRET
    );
    otherStudentToken = await createSignedToken(
      { id: 'usr_stu_other', username: 'hs.khac', role: 'student', name: 'Lê Học Sinh Khác', sid: 'sid_stu_other' },
      TEST_SECRET
    );
    parentToken = await createSignedToken(
      { id: 'usr_par_1', username: 'ph.minhanh', role: 'parent', name: 'Phụ huynh Minh Anh', sid: 'sid_par_1' },
      TEST_SECRET
    );
  });

  test('1. Teacher saves a new session on /api/schedule -> persists to D1, derives canonical class_id, and syncs student_ids into class_enrollments', async () => {
    const req = new Request('http://localhost/api/schedule', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        action: 'save_session',
        allow_upsert: true,
        class_id: '', // intentionally empty to verify auto-derivation
        class_name: 'Lớp 7 - Global Success & KET A2',
        grade_level: 'Lớp 7',
        subject_topic: 'Unit 7: Traffic & Used to',
        teacher_id: 'usr_teach_1',
        teacher_name: 'Thầy John',
        session_date: '2026-10-19',
        day_of_week: 1,
        day_name: 'Thứ Hai',
        start_time: '18:00',
        end_time: '19:30',
        room_notes: 'Phòng VIP 201',
        student_ids: ['usr_stu_1', 'usr_stu_2']
      })
    });

    const res = await postSchedule({ request: req, platform });
    const data = await res.json();

    assert.strictEqual(res.status, 200, `Expected 200 OK on schedule save, got ${res.status}: ${data.error}`);
    assert.strictEqual(data.success, true);
    assert.ok(data.session?.id, 'Saved session must have an ID');
    assert.strictEqual(data.session.class_id, 'cls_g7', 'Canonical class_id must be auto-derived as cls_g7');

    savedSessionId = data.session.id;
    savedClassId = data.session.class_id;

    // Verify D1 persistence in class_sessions
    const dbSession = sqlite.prepare('SELECT * FROM class_sessions WHERE id = ?').get(savedSessionId);
    assert.ok(dbSession, 'Session must exist in D1 class_sessions');
    assert.strictEqual(dbSession.class_id, 'cls_g7');
    assert.strictEqual(dbSession.session_date, '2026-10-19');

    // Verify student_ids were automatically synced into class_enrollments
    const enrollments = sqlite.prepare('SELECT user_id, class_id, status FROM class_enrollments WHERE class_id = ? ORDER BY user_id ASC').all('cls_g7');
    assert.strictEqual(enrollments.length, 2, 'Both assigned students must be synced into class_enrollments');
    assert.deepStrictEqual(
      enrollments.map((e) => ({ user_id: e.user_id, status: e.status })),
      [
        { user_id: 'usr_stu_1', status: 'active' },
        { user_id: 'usr_stu_2', status: 'active' }
      ]
    );
  });

  test('2. Editing a local/seeded session ID with allow_upsert=true inserts cleanly into D1, while omitting allow_upsert returns 404', async () => {
    // Without allow_upsert -> 404
    const req404 = new Request('http://localhost/api/schedule', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        action: 'save_session',
        id: 'sess_nonexistent_strict',
        class_name: 'Lớp 7 Strict',
        session_date: '2026-10-20',
        day_of_week: 2,
        start_time: '18:00',
        end_time: '19:30',
        room_notes: 'Phòng VIP 202'
      })
    });
    const res404 = await postSchedule({ request: req404, platform });
    assert.strictEqual(res404.status, 404, 'Must return 404 when allow_upsert is not set');

    // With allow_upsert: true (SessionEditModal behavior) -> 200 OK upsert
    const reqUpsert = new Request('http://localhost/api/schedule', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        action: 'save_session',
        allow_upsert: true,
        id: 'sess_local_seed_tue',
        class_name: 'Lớp 7 - Ca Thứ Ba',
        grade_level: 'Lớp 7',
        session_date: '2026-10-20',
        day_of_week: 2,
        start_time: '19:35',
        end_time: '21:05',
        room_notes: 'Phòng VIP 202',
        student_ids: ['usr_stu_1']
      })
    });
    const resUpsert = await postSchedule({ request: reqUpsert, platform });
    const dataUpsert = await resUpsert.json();
    assert.strictEqual(resUpsert.status, 200);
    assert.strictEqual(dataUpsert.success, true);
    assert.strictEqual(dataUpsert.session.id, 'sess_local_seed_tue');
  });

  test('3. Teacher assigns Homework linked with Quiz (source_quiz_id) for the saved session via POST /api/homework', async () => {
    const req = new Request('http://localhost/api/homework', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        action: 'assign',
        session_id: savedSessionId,
        class_id: savedClassId,
        class_name: 'Lớp 7 - Global Success & KET A2',
        skill_type: 'writing',
        title: 'BTVN & Quiz Unit 7: Traffic & Used to',
        description: 'Hoàn thành bài Quiz đính kèm và viết 5 câu với cấu trúc Used to.',
        source_quiz_id: 'quiz_pub_grade_7_u7',
        obsidian_note_id: 'UNIT_7_TRAFFIC',
        obsidian_note_title: 'Unit 7: Traffic',
        deadline_date: '2026-10-25',
        deadline_time: '18:00',
        star_reward_on_time: 50
      })
    });

    const res = await postHomework({ request: req, platform });
    const data = await res.json();

    assert.strictEqual(res.status, 200, `Expected 200 on homework assign, got ${res.status}: ${data.error}`);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.assignment?.source_quiz_id, 'quiz_pub_grade_7_u7');
    createdHomeworkId = data.assignment.id;
  });

  test('4. Enrolled Student sees both Homework (with source_quiz_id) and Assigned Quiz, while Unenrolled Student sees neither', async () => {
    // Enrolled student checks GET /api/homework
    const hwReq = new Request('http://localhost/api/homework', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const hwRes = await getHomework({ request: hwReq, url: new URL(hwReq.url), platform });
    const hwData = await hwRes.json();
    assert.strictEqual(hwRes.status, 200);
    assert.strictEqual(hwData.assignments.length, 1);
    assert.strictEqual(hwData.assignments[0].id, createdHomeworkId);
    assert.strictEqual(hwData.assignments[0].source_quiz_id, 'quiz_pub_grade_7_u7');

    // Enrolled student checks GET /api/quiz-menu?assigned=1
    const qzReq = new Request('http://localhost/api/quiz-menu?assigned=1', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const qzRes = await getQuizMenu({ request: qzReq, url: new URL(qzReq.url), platform });
    const qzData = await qzRes.json();
    assert.strictEqual(qzRes.status, 200);
    assert.strictEqual(qzData.assigned, true);
    assert.ok(qzData.quizzes.some((q) => q.id === 'quiz_pub_grade_7_u7'), 'Enrolled student must see the assigned quiz');

    // Unenrolled student checks GET /api/homework & GET /api/quiz-menu?assigned=1
    const otherHwReq = new Request('http://localhost/api/homework', {
      headers: { Authorization: `Bearer ${otherStudentToken}` }
    });
    const otherHwRes = await getHomework({ request: otherHwReq, url: new URL(otherHwReq.url), platform });
    const otherHwData = await otherHwRes.json();
    assert.strictEqual(otherHwData.assignments.length, 0, 'Unenrolled student must not see class_g7 homework');

    const otherQzReq = new Request('http://localhost/api/quiz-menu?assigned=1', {
      headers: { Authorization: `Bearer ${otherStudentToken}` }
    });
    const otherQzRes = await getQuizMenu({ request: otherQzReq, url: new URL(otherQzReq.url), platform });
    const otherQzData = await otherQzRes.json();
    assert.strictEqual(otherQzData.quizzes.length, 0, 'Unenrolled student must not see class_g7 assigned quiz');
  });

  test('5. Enrolled Student starts and submits the Linked Quiz -> Quiz is graded AND homework_submissions is automatically synced!', async () => {
    // Step 5a: Start quiz attempt
    const startReq = new Request('http://localhost/api/quiz-menu/quiz_pub_grade_7_u7/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ action: 'start' })
    });
    const startRes = await postQuizSubmit({
      params: { id: 'quiz_pub_grade_7_u7' },
      request: startReq,
      platform
    });
    const startData = await startRes.json();
    assert.strictEqual(startRes.status, 201, `Expected 201 on quiz start, got ${startRes.status}: ${startData.error}`);
    assert.ok(startData.attempt_id);

    // Step 5b: Submit quiz answers (both correct -> 10/10)
    const submitReq = new Request('http://localhost/api/quiz-menu/quiz_pub_grade_7_u7/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        action: 'submit',
        attempt_id: startData.attempt_id,
        answers: {
          qq_1: 'used to',
          qq_2: 'True'
        }
      })
    });
    const submitRes = await postQuizSubmit({
      params: { id: 'quiz_pub_grade_7_u7' },
      request: submitReq,
      platform
    });
    const submitData = await submitRes.json();
    assert.strictEqual(submitRes.status, 200);
    assert.strictEqual(submitData.success, true);
    assert.strictEqual(submitData.attempt.final_score, 10);
    assert.strictEqual(submitData.synced_homework_count, 1, 'Quiz submission must auto-sync to linked homework_submissions');
  });

  test('6. Student, Teacher, and Verified Parent all see the auto-synced Homework & Quiz submission and score', async () => {
    // Student view
    const stuReq = new Request('http://localhost/api/homework', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const stuRes = await getHomework({ request: stuReq, url: new URL(stuReq.url), platform });
    const stuData = await stuRes.json();
    assert.strictEqual(stuData.submissions.length, 1);
    assert.strictEqual(stuData.submissions[0].assignment_id, createdHomeworkId);
    assert.strictEqual(stuData.submissions[0].score, 10);
    assert.strictEqual(stuData.submissions[0].status, 'graded');

    // Teacher view
    const tchReq = new Request('http://localhost/api/homework', {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const tchRes = await getHomework({ request: tchReq, url: new URL(tchReq.url), platform });
    const tchData = await tchRes.json();
    const matchedSub = tchData.submissions.find((s) => s.assignment_id === createdHomeworkId && s.student_id === 'usr_stu_1');
    assert.ok(matchedSub, 'Teacher must see the synced homework submission from Quiz');
    assert.strictEqual(matchedSub.score, 10);

    // Verified Parent view
    const parReq = new Request('http://localhost/api/homework?child_id=usr_stu_1', {
      headers: { Authorization: `Bearer ${parentToken}` }
    });
    const parRes = await getHomework({ request: parReq, url: new URL(parReq.url), platform });
    const parData = await parRes.json();
    assert.strictEqual(parData.assignments.length, 1);
    assert.strictEqual(parData.submissions.length, 1);
    assert.strictEqual(parData.submissions[0].score, 10);
  });

  test('7. UI Source Contracts: Schedule Save Modal, Quick-Add Shift Cell, and Teacher/Student/Parent Homework-Quiz Bridges', () => {
    const modalSrc = fs.readFileSync('src/lib/components/SessionEditModal.svelte', 'utf8');
    const schedSrc = fs.readFileSync('src/routes/schedule/+page.svelte', 'utf8');
    const teacherSrc = fs.readFileSync('src/routes/cpanel/teacher/+page.svelte', 'utf8');
    const studentSrc = fs.readFileSync('src/routes/cpanel/student/+page.svelte', 'utf8');
    const parentSrc = fs.readFileSync('src/routes/cpanel/parent/+page.svelte', 'utf8');

    assert.ok(modalSrc.includes('allow_upsert: true'), 'SessionEditModal must send allow_upsert: true');
    assert.ok(modalSrc.includes("credentials: 'include'"), 'SessionEditModal must include credentials');
    assert.ok(modalSrc.includes('resolveConflictAndSave'), 'SessionEditModal must provide 1-click conflict resolution');
    assert.ok(schedSrc.includes("defaultEnd: '19:30'"), 'Schedule SHIFTS must define defaultEnd so quickAddSession never sends empty end_time');
    assert.ok(schedSrc.includes('handleSessionSaved'), 'Schedule page must wire handleSessionSaved to SessionEditModal');
    assert.ok(teacherSrc.includes('assign-session-select') && teacherSrc.includes('assign-quiz-select'), 'Teacher CP must include session and quiz selectors in homework assignment form');
    assert.ok(studentSrc.includes('Làm Bài Quiz Đính Kèm'), 'Student CP must render direct button to launch linked Quiz from homework card');
    assert.ok(parentSrc.includes('source_quiz_id'), 'Parent CP must display linked Quiz on homework card');
  });
});
