import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { POST as postSchedule } from '../src/routes/api/schedule/+server.js';
import { POST as postAttendance } from '../src/routes/api/attendance/+server.js';
import { POST as postHomework } from '../src/routes/api/homework/+server.js';
import { POST as postQuizSubmit } from '../src/routes/api/quiz-menu/[id]/submit/+server.js';
import { GET as getSessionAudit, POST as postSessionAudit } from '../src/routes/api/session-audit/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';

const TEST_SECRET = 'e2e_session_audit_regression_secret_2026';

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

function initAuditTestDb() {
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
      enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'active',
      UNIQUE(user_id, class_id)
    );

    CREATE TABLE attendance_records (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      session_date TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT,
      class_id TEXT,
      status TEXT DEFAULT 'present',
      notes TEXT,
      in_class_attitude TEXT,
      instant_stars_rewarded INTEGER DEFAULT 5,
      marked_by_teacher_id TEXT,
      marked_by_teacher_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE knowledge_vault (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT,
      folder TEXT,
      tags TEXT,
      content_markdown TEXT,
      status TEXT DEFAULT 'published'
    );

    CREATE TABLE quizzes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      created_by TEXT,
      creator_name TEXT,
      time_limit_minutes INTEGER DEFAULT 15,
      status TEXT DEFAULT 'published',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE quiz_questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      prompt_image_url TEXT,
      options_json TEXT,
      correct_answer TEXT,
      explanation TEXT,
      points INTEGER DEFAULT 1,
      q_order INTEGER DEFAULT 0
    );

    CREATE TABLE quiz_attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      user_id TEXT,
      guest_name TEXT,
      guest_class TEXT,
      guest_token_hash TEXT,
      client_ip_hash TEXT,
      answers_json TEXT DEFAULT '{}',
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
  `);

  db.exec(`
    INSERT INTO users (id, username, email, name, role, status, approval_status) VALUES
      ('usr_teacher_1', 'teacher1', 'teacher1@timbk.io.vn', 'Mr. Johnathan Miller', 'teacher', 'active', 'official'),
      ('usr_stu_1', 'baoanh', 'baoanh@timbk.io.vn', 'Lê Bảo Anh', 'student', 'active', 'official'),
      ('usr_stu_2', 'giahuy', 'giahuy@timbk.io.vn', 'Trần Gia Huy', 'student', 'active', 'official');

    INSERT INTO auth_sessions (id, user_id, expires_at) VALUES
      ('sess_teacher_1', 'usr_teacher_1', '2099-01-01T00:00:00.000Z'),
      ('sess_stu_1', 'usr_stu_1', '2099-01-01T00:00:00.000Z'),
      ('sess_stu_2', 'usr_stu_2', '2099-01-01T00:00:00.000Z');

    INSERT INTO knowledge_vault (id, title, category, folder, content_markdown, status) VALUES
      ('kv_unit7_traffic', 'Unit 7: Traffic & Road Safety - Global Success Lớp 7', 'Tiếng Anh Lớp 7', 'GRAMMAR', 'Cấu trúc It indicating distance, should/shouldn''t và từ vựng giao thông.', 'published');

    INSERT INTO quizzes (id, title, description, created_by, creator_name, time_limit_minutes, status) VALUES
      ('quiz_unit7_audit', 'Đề Kiểm Tra 15 Phút Unit 7 Traffic', 'Kiểm tra từ vựng & ngữ pháp Unit 7', 'usr_teacher_1', 'Mr. Johnathan Miller', 15, 'published');

    INSERT INTO quiz_questions (id, quiz_id, type, prompt, options_json, correct_answer, points, q_order) VALUES
      ('qq_u7_1', 'quiz_unit7_audit', 'multiple_choice', 'How far ___ it from your house to school?', '["is","are","be","was"]', '"is"', 5, 0),
      ('qq_u7_2', 'quiz_unit7_audit', 'true_false', 'You should wear a helmet when riding a motorbike.', '["Đúng","Sai"]', '"Đúng"', 5, 1);
  `);

  return db;
}

describe('Session Quality Audit & Curriculum Reconciliation Regression Suite', () => {
  let sqliteDb;
  let platform;
  let teacherHeaders;
  let stu1Headers;
  let createdSessionId;

  before(async () => {
    sqliteDb = initAuditTestDb();
    platform = {
      env: {
        DB: createD1Adapter(sqliteDb),
        AUTH_SECRET: TEST_SECRET
      }
    };

    const teacherToken = await createSignedToken(
      { id: 'usr_teacher_1', role: 'teacher', name: 'Mr. Johnathan Miller', sid: 'sess_teacher_1' },
      TEST_SECRET
    );
    const stu1Token = await createSignedToken(
      { id: 'usr_stu_1', role: 'student', name: 'Lê Bảo Anh', sid: 'sess_stu_1' },
      TEST_SECRET
    );

    teacherHeaders = { 'content-type': 'application/json', authorization: `Bearer ${teacherToken}` };
    stu1Headers = { 'content-type': 'application/json', authorization: `Bearer ${stu1Token}` };
  });

  test('1. Teacher saves session -> marks attendance (1 present, 1 late) -> assigns Homework+Quiz -> Student completes Quiz -> Session Audit computes full 5-part dossier & suitability %', async () => {
    // Step 1: Create session via POST /api/schedule
    const schedRes = await postSchedule({
      request: new Request('https://timbk.io.vn/api/schedule', {
        method: 'POST',
        headers: teacherHeaders,
        body: JSON.stringify({
          action: 'save_session',
          class_name: 'Lớp 7 - Global Success & KET A2',
          grade_level: 'Lớp 7',
          subject_topic: 'Unit 7: Traffic & Road Safety',
          teacher_id: 'usr_teacher_1',
          teacher_name: 'Mr. Johnathan Miller',
          assistant_teacher_name: 'Cô Nguyễn Hương',
          day_of_week: 2,
          day_name: 'Thứ Ba',
          session_date: '2026-10-20',
          start_time: '18:00',
          end_time: '19:30',
          room_notes: 'Phòng VIP 202',
          student_ids: ['usr_stu_1', 'usr_stu_2']
        })
      }),
      platform
    });
    assert.equal(schedRes.status, 200);
    const schedData = await schedRes.json();
    createdSessionId = schedData.session.id;

    // Step 2: Teacher marks attendance (1 present, 1 late -> roll_call_status = 'complete')
    const attRes = await postAttendance({
      request: new Request('https://timbk.io.vn/api/attendance', {
        method: 'POST',
        headers: teacherHeaders,
        body: JSON.stringify({
          session_id: createdSessionId,
          session_date: '2026-10-20',
          students: [
            { student_id: 'usr_stu_1', student_name: 'Lê Bảo Anh', class_id: 'cls_g7', status: 'present', instant_stars_rewarded: 10 },
            { student_id: 'usr_stu_2', student_name: 'Trần Gia Huy', class_id: 'cls_g7', status: 'late', instant_stars_rewarded: 0 }
          ]
        })
      }),
      platform
    });
    assert.equal(attRes.status, 200);

    // Step 3: Teacher assigns Homework linked to Knowledge Vault & Quiz
    const hwRes = await postHomework({
      request: new Request('https://timbk.io.vn/api/homework', {
        method: 'POST',
        headers: teacherHeaders,
        body: JSON.stringify({
          action: 'assign',
          session_id: createdSessionId,
          class_id: 'cls_g7',
          class_name: 'Lớp 7 - Global Success & KET A2',
          skill_type: 'writing',
          title: 'BTVN Unit 7: Traffic & Quiz 15p',
          description: 'Làm đề Quiz đính kèm và ôn tập bài học trong Kho Tri Thức',
          source_quiz_id: 'quiz_unit7_audit',
          obsidian_note_id: 'kv_unit7_traffic',
          obsidian_note_title: 'Unit 7: Traffic & Road Safety - Global Success Lớp 7',
          deadline_date: '2026-10-25'
        })
      }),
      platform
    });
    assert.equal(hwRes.status, 200);

    // Step 4: Student 1 starts & submits the Quiz (100% score)
    const startRes = await postQuizSubmit({
      params: { id: 'quiz_unit7_audit' },
      request: new Request('https://timbk.io.vn/api/quiz-menu/quiz_unit7_audit/submit', {
        method: 'POST',
        headers: stu1Headers,
        body: JSON.stringify({ action: 'start' })
      }),
      platform
    });
    const startData = await startRes.json();

    const subQuizRes = await postQuizSubmit({
      params: { id: 'quiz_unit7_audit' },
      request: new Request('https://timbk.io.vn/api/quiz-menu/quiz_unit7_audit/submit', {
        method: 'POST',
        headers: stu1Headers,
        body: JSON.stringify({
          action: 'submit',
          attempt_id: startData.attempt_id,
          answers: { qq_u7_1: 'is', qq_u7_2: 'Đúng' }
        })
      }),
      platform
    });
    assert.equal(subQuizRes.status, 200);

    // Step 5: Teacher saves Session Quality Audit (attaching Drive file, manual suitability %, parent & internal interactions, roadmap)
    const saveAuditRes = await postSessionAudit({
      request: new Request('https://timbk.io.vn/api/session-audit', {
        method: 'POST',
        headers: teacherHeaders,
        body: JSON.stringify({
          action: 'save_audit',
          session_id: createdSessionId,
          vault_article_id: 'kv_unit7_traffic',
          vault_article_title: 'Unit 7: Traffic & Road Safety - Global Success Lớp 7',
          drive_file_id: 'drv_u7_worksheet',
          drive_file_name: 'Phiếu Bài Tập Bổ Trợ Unit 7 Traffic.docx',
          drive_file_url: 'https://drive.google.com/file/d/drv_u7_worksheet/view',
          lesson_plan_content: '1. Warm-up 10p\n2. Ngữ pháp It indicating distance 30p\n3. Luyện đề Quiz 20p',
          manual_suitability_pct: 90,
          effectiveness_rating: 'excellent',
          effectiveness_notes: 'Học sinh nắm vững cấu trúc ngữ pháp, phản xạ nhanh.',
          parent_interaction_notes: 'Đã thông báo phụ huynh em Gia Huy đi muộn 10 phút do tắc đường.',
          internal_interaction_notes: 'Trợ giảng Nguyễn Hương kèm riêng Gia Huy 15 phút cuối giờ.',
          roadmap_recommendation: 'Buổi tới tăng 20% bài tập viết lại câu nâng cao từ Ngân hàng câu hỏi D1.',
          notify_internal: true
        })
      }),
      platform
    });
    assert.equal(saveAuditRes.status, 200);
    const saveAuditData = await saveAuditRes.json();
    assert.equal(saveAuditData.success, true);

    // Step 6: GET /api/session-audit and verify complete regression metrics & 5-part dossier
    const getAuditRes = await getSessionAudit({
      url: new URL(`https://timbk.io.vn/api/session-audit?session_id=${createdSessionId}`),
      request: new Request(`https://timbk.io.vn/api/session-audit?session_id=${createdSessionId}`, {
        headers: teacherHeaders
      }),
      platform
    });
    assert.equal(getAuditRes.status, 200);
    const auditPayload = await getAuditRes.json();
    assert.equal(auditPayload.success, true);
    assert.equal(auditPayload.sessions.length, 1);

    const rep = auditPayload.sessions[0];
    // Verify attendance metrics
    assert.equal(rep.metrics.enrolled_count, 2);
    assert.equal(rep.metrics.marked_count, 2);
    assert.equal(rep.metrics.present_count, 1);
    assert.equal(rep.metrics.late_count, 1);
    assert.equal(rep.metrics.roll_call_status, 'complete');
    assert.equal(rep.metrics.attendance_punctuality_pct, 85); // (100 + 70) / 2

    // Verify homework & quiz metrics
    assert.equal(rep.metrics.quiz_mastery_pct, 100);
    assert.equal(rep.metrics.hw_submission_rate_pct, 50); // 1 of 2 students submitted
    assert.equal(rep.metrics.hw_quality_score_pct, 100); // 10/10 score
    assert.equal(rep.metrics.homework_fulfillment_pct, 75); // 50% * 0.5 + 100% * 0.5
    assert.equal(rep.metrics.manual_suitability_pct, 90);
    assert.ok(rep.metrics.overall_suitability_pct >= 80);

    // Verify 5 Dossier Sections
    assert.equal(rep.materials.vault_article_id, 'kv_unit7_traffic');
    assert.equal(rep.materials.drive_file_name, 'Phiếu Bài Tập Bổ Trợ Unit 7 Traffic.docx');
    assert.ok(rep.dossier.homework_and_quiz_fulfillment.overall_suitability_pct >= 80);
    assert.ok(rep.dossier.lesson_plan_and_materials.lesson_plan_content.includes('Ngữ pháp It indicating distance'));
    assert.equal(rep.dossier.effectiveness_evaluation.rating, 'excellent');
    assert.deepEqual(rep.dossier.parent_interaction.late_students, ['Trần Gia Huy']);
    assert.ok(rep.dossier.internal_interaction_and_roadmap.roadmap_recommendation.includes('Ngân hàng câu hỏi D1'));
  });

  test('2. Static wiring: /schedule and /session-audit include attendance filters and 5-part dossier export', () => {
    const scheduleSrc = fs.readFileSync('src/routes/schedule/+page.svelte', 'utf8');
    assert.ok(scheduleSrc.includes('id="schedule-attendance-filter"'), 'Schedule page must have attendance status filter');
    assert.ok(scheduleSrc.includes('/session-audit'), 'Schedule page must link to /session-audit');

    const auditPageSrc = fs.readFileSync('src/routes/session-audit/+page.svelte', 'utf8');
    assert.ok(auditPageSrc.includes('data-testid="save-session-audit-btn"'), 'Session audit page must have save button');
    assert.ok(auditPageSrc.includes('data-testid="export-session-dossier-btn"'), 'Session audit page must have 5-part dossier export button');
  });

  test('3. Fixed Floating Dockbar (DockBar.svelte), Top Dockbar Capsule & Smooth Zoom In-Out Physics', () => {
    const dockBarSrc = fs.readFileSync('src/lib/components/ui/DockBar.svelte', 'utf8');
    assert.ok(dockBarSrc.includes('id="floating-dockbar"'), 'DockBar must have id="floating-dockbar"');
    assert.ok(dockBarSrc.includes('data-testid="floating-dockbar"'), 'DockBar must have data-testid="floating-dockbar"');
    assert.ok(dockBarSrc.includes('getItemTransform'), 'DockBar must implement proximity magnification physics');
    assert.ok(dockBarSrc.includes('scale('), 'DockBar must apply smooth scale transform');

    const layoutSrc = fs.readFileSync('src/routes/+layout.svelte', 'utf8');
    assert.ok(layoutSrc.includes('<DockBar'), 'Root layout must mount <DockBar />');
    assert.ok(layoutSrc.includes('data-testid="top-dock-nav"'), 'Root layout must include top-dock-nav capsule');
    assert.ok(layoutSrc.includes('top-dock-pill'), 'Root layout nav items must use top-dock-pill zoom class');

    const appCss = fs.readFileSync('src/app.css', 'utf8');
    assert.ok(appCss.includes('.dockbar-item'), 'app.css must define .dockbar-item transition');
    assert.ok(appCss.includes('.top-dock-pill:hover'), 'app.css must define .top-dock-pill:hover zoom magnification');
  });

  test('4. Zalo Bot Platform Token Verification (verify_bot_config) & Webhook Subscriber Capture', async () => {
    const verifyRes = await postSessionAudit({
      request: new Request('https://timbk.io.vn/api/session-audit', {
        method: 'POST',
        headers: teacherHeaders,
        body: JSON.stringify({
          action: 'verify_bot_config',
          id: 'bot_primary'
        })
      }),
      platform
    });
    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.success, true);
    assert.equal(verifyData.verified, true);
    assert.equal(verifyData.bot_profile?.id, '2267052943606876676');
    assert.equal(verifyData.bot_profile?.account_name, 'bot.ynKabJAc');
  });
});

