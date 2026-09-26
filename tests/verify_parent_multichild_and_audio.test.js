/**
 * tests/verify_parent_multichild_and_audio.test.js
 * Verification suite for:
 * 1. Multi-Child Sổ Phụ Huynh (ActiveChildId, RBAC 403 isolation, linked children endpoint)
 * 2. Audio Catalog & HTTP 206 Partial Content Range Streaming from Google Drive 2,254 assets
 * 3. Exams Question Bank & Dynamic Random Exam Generator
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { GET as getParentChildren, POST as postParentChildren } from '../src/routes/api/parents/children/+server.js';
import { GET as getHomework } from '../src/routes/api/homework/+server.js';
import { GET as getAudioStream } from '../src/routes/api/audio/stream/+server.js';
import { GET as getAudioCatalog } from '../src/routes/api/audio/catalog/+server.js';
import { GET as getExams } from '../src/routes/api/exams/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';

function createD1Adapter(sqliteDb) {
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
          return { results: stmt.all(...boundArgs) };
        },
        async run() {
          const stmt = sqliteDb.prepare(sql);
          const res = stmt.run(...boundArgs);
          return { meta: { changes: Number(res.changes) } };
        }
      };
    },
    async batch(statements) {
      sqliteDb.exec('BEGIN TRANSACTION');
      try {
        const results = [];
        for (const s of statements) {
          const r = await s.run();
          results.push(r);
        }
        sqliteDb.exec('COMMIT');
        return results;
      } catch (err) {
        try { sqliteDb.exec('ROLLBACK'); } catch {}
        throw err;
      }
    }
  };
}

const TEST_SECRET = 'audit_secret_key_minimum_32_characters_valid!!';

describe('PARENT MULTI-CHILD, AUDIO STREAMING & EXAM BANK AUDIT SUITE', () => {
  let sqliteDb;
  let mockPlatform;
  let parentToken;
  let studentToken;

  before(async () => {
    sqliteDb = new DatabaseSync(':memory:');
    sqliteDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        name TEXT,
        role TEXT NOT NULL,
        avatar TEXT,
        status TEXT DEFAULT 'active',
        metadata TEXT,
        grade TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE parent_student_links (
        id TEXT PRIMARY KEY,
        parent_user_id TEXT NOT NULL,
        student_user_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE homework_assignments (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        class_name TEXT NOT NULL,
        teacher_id TEXT NOT NULL,
        teacher_name TEXT NOT NULL,
        campus_id TEXT NOT NULL DEFAULT 'loc_codung',
        skill_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        assigned_date TEXT NOT NULL,
        deadline_date TEXT NOT NULL,
        deadline_time TEXT NOT NULL,
        max_score REAL DEFAULT 10.0,
        star_reward_on_time INTEGER DEFAULT 50,
        status TEXT DEFAULT 'published',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE homework_submissions (
        id TEXT PRIMARY KEY,
        assignment_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        student_name TEXT NOT NULL,
        submission_type TEXT NOT NULL,
        content_text TEXT,
        audio_url TEXT,
        attachments_json TEXT DEFAULT '[]',
        submitted_at TEXT NOT NULL,
        is_on_time INTEGER DEFAULT 1,
        graded_by_teacher_id TEXT,
        graded_by_teacher_name TEXT,
        graded_at TEXT,
        score REAL,
        teacher_feedback TEXT,
        audio_feedback_url TEXT,
        stars_awarded INTEGER DEFAULT 0,
        star_awarded_reason TEXT,
        status TEXT DEFAULT 'submitted'
      );

      INSERT INTO users (id, username, role, name, status, grade) VALUES
        ('usr_parent_1', 'parent1', 'parent', 'Bác Nguyễn Văn Thành', 'active', NULL),
        ('usr_child_1', 'minhquan7a', 'student', 'Nguyễn Minh Quân', 'active', 'Lớp 7'),
        ('usr_child_2', 'baokhiem', 'student', 'Nguyễn Bảo Khiêm', 'active', 'Lớp 7'),
        ('usr_student_unlinked', 'stranger', 'student', 'Trần Văn Lạ', 'active', 'Lớp 8');

      INSERT INTO parent_student_links (id, parent_user_id, student_user_id) VALUES
        ('link_1', 'usr_parent_1', 'usr_child_1'),
        ('link_2', 'usr_parent_1', 'usr_child_2');

      INSERT INTO homework_assignments (id, session_id, class_id, class_name, teacher_id, teacher_name, campus_id, skill_type, title, description, assigned_date, deadline_date, deadline_time)
      VALUES
        ('hw_1', 'sess_1', 'cls_7a', 'Lớp 7A', 't_quynh', 'Cô Như Quỳnh', 'loc_codung', 'writing', 'Unit 1 Essay', 'Viết đoạn văn', '2026-10-01', '2026-10-05', '18:00');

      INSERT INTO homework_submissions (id, assignment_id, student_id, student_name, submission_type, content_text, submitted_at, is_on_time, score, stars_awarded, status)
      VALUES
        ('sub_1', 'hw_1', 'usr_child_1', 'Nguyễn Minh Quân', 'writing', 'Essay content child 1', '2026-10-02T10:00:00Z', 1, 9.0, 50, 'graded'),
        ('sub_2', 'hw_1', 'usr_child_2', 'Nguyễn Bảo Khiêm', 'writing', 'Essay content child 2', '2026-10-03T11:00:00Z', 1, 9.5, 50, 'graded'),
        ('sub_3', 'hw_1', 'usr_student_unlinked', 'Trần Văn Lạ', 'writing', 'Stranger essay', '2026-10-04T12:00:00Z', 1, 8.0, 0, 'graded');
    `);

    mockPlatform = {
      env: {
        DB: createD1Adapter(sqliteDb),
        AUTH_SECRET: TEST_SECRET
      }
    };

    parentToken = await createSignedToken({ id: 'usr_parent_1', username: 'parent1', role: 'parent', name: 'Bác Nguyễn Văn Thành', status: 'active' }, TEST_SECRET);
    studentToken = await createSignedToken({ id: 'usr_child_1', username: 'minhquan7a', role: 'student', name: 'Nguyễn Minh Quân', status: 'active' }, TEST_SECRET);
  });

  // =========================================================================
  // 1. PARENT MULTI-CHILD & STRICT RBAC ISOLATION
  // =========================================================================
  describe('1. Parent Multi-Child & Role Scoping', () => {
    test('PC-01: Unauthenticated request to /api/parents/children rejected with 401', async () => {
      const req = new Request('http://localhost/api/parents/children');
      const res = await getParentChildren({ request: req, platform: mockPlatform });
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.success, false);
    });

    test('PC-02: Student role calling /api/parents/children is strictly rejected with 403 Forbidden', async () => {
      const req = new Request('http://localhost/api/parents/children', {
        headers: {
          'Authorization': `Bearer ${studentToken}`
        }
      });
      const res = await getParentChildren({ request: req, platform: mockPlatform });
      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.match(json.error, /Forbidden/i);
    });

    test('PC-03: Parent role retrieves linked children successfully with summary stats', async () => {
      const req = new Request('http://localhost/api/parents/children', {
        headers: {
          'Authorization': `Bearer ${parentToken}`
        }
      });
      const res = await getParentChildren({ request: req, platform: mockPlatform });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.total, 2);
      assert.ok(json.children.some(c => c.name === 'Nguyễn Minh Quân'));
      assert.ok(json.children.some(c => c.name === 'Nguyễn Bảo Khiêm'));
    });

    test('PC-04: Homework API blocks parent querying non-linked student with 403 Forbidden (Fail-Closed)', async () => {
      const req = new Request('http://localhost/api/homework?child_id=usr_student_unlinked', {
        headers: {
          'Authorization': `Bearer ${parentToken}`
        }
      });
      const res = await getHomework({
        request: req,
        url: new URL(req.url),
        platform: mockPlatform
      });

      assert.strictEqual(res.status, 403, 'Must reject access to unlinked child with 403');
      const json = await res.json();
      assert.match(json.error, /Forbidden/i);
    });

    test('PC-05: Homework API returns scoped submissions for verified activeChildId', async () => {
      const req = new Request('http://localhost/api/homework?child_id=usr_child_1', {
        headers: {
          'Authorization': `Bearer ${parentToken}`
        }
      });
      const res = await getHomework({
        request: req,
        url: new URL(req.url),
        platform: mockPlatform
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.submissions.length, 1);
      assert.strictEqual(json.submissions[0].student_id, 'usr_child_1');
      assert.strictEqual(json.submissions[0].student_name, 'Nguyễn Minh Quân');
    });
  });

  // =========================================================================
  // 2. AUDIO CATALOG & HTTP 206 RANGE STREAMING
  // =========================================================================
  describe('2. Audio Catalog & HTTP 206 Range Streaming', () => {
    test('AUD-01: Audio catalog returns official Drive items and curriculum tracks', async () => {
      const url = new URL('http://localhost/api/audio/catalog');
      const res = await getAudioCatalog({ url });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.catalog_total_drive_items, 2254);
      assert.ok(json.tracks.length >= 10);
    });

    test('AUD-02: Audio catalog filters by grade correctly', async () => {
      const url = new URL('http://localhost/api/audio/catalog?grade=7');
      const res = await getAudioCatalog({ url });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(json.tracks.length > 0);
      assert.ok(json.tracks.every(t => t.grade === 7));
    });

    test('AUD-03: Track metadata query returns transcript and pedagogical vocabulary', async () => {
      const url = new URL('http://localhost/api/audio/stream?id=aud_g7_u1_track01&info=1');
      const req = new Request(url);
      const res = await getAudioStream({ url, request: req });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.track.id, 'aud_g7_u1_track01');
      assert.ok(json.track.transcript.includes('paper flowers'));
      assert.ok(json.track.key_vocabulary.includes('patient'));
    });

    test('AUD-04: Full audio stream returns 200 with audio/mpeg and Accept-Ranges', async () => {
      const url = new URL('http://localhost/api/audio/stream?id=aud_g7_u1_track01');
      const req = new Request(url);
      const res = await getAudioStream({ url, request: req });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('Content-Type'), 'audio/mpeg');
      assert.strictEqual(res.headers.get('Accept-Ranges'), 'bytes');
      assert.ok(Number(res.headers.get('Content-Length')) > 0);
      const buffer = await res.arrayBuffer();
      assert.ok(buffer.byteLength > 1000);
    });

    test('AUD-05: HTTP 206 Partial Content Range streaming works for audio seeking', async () => {
      const url = new URL('http://localhost/api/audio/stream?id=aud_g7_u1_track01');
      const req = new Request(url, {
        headers: {
          'Range': 'bytes=0-416' // Request exactly first frame (417 bytes)
        }
      });
      const res = await getAudioStream({ url, request: req });
      assert.strictEqual(res.status, 206, 'Must return HTTP 206 Partial Content');
      assert.strictEqual(res.headers.get('Content-Type'), 'audio/mpeg');
      assert.strictEqual(res.headers.get('Content-Length'), '417');
      assert.match(res.headers.get('Content-Range'), /^bytes 0-416\/\d+$/);
      const chunk = await res.arrayBuffer();
      assert.strictEqual(chunk.byteLength, 417);
    });

    test('AUD-06: Non-existent audio track returns 404', async () => {
      const url = new URL('http://localhost/api/audio/stream?id=aud_non_existent');
      const req = new Request(url);
      const res = await getAudioStream({ url, request: req });
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.success, false);
    });
  });

  // =========================================================================
  // 3. EXAMS QUESTION BANK & DYNAMIC GENERATOR
  // =========================================================================
  describe('3. Exams Question Bank & Dynamic Generator', () => {
    test('EX-01: Dynamic test generator produces 10 questions for Grade 7 (15m)', async () => {
      const url = new URL('http://localhost/api/exams?random=1&grade=7&duration=15');
      const res = await getExams({ url });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.is_generated, true);
      assert.strictEqual(json.grade, 7);
      assert.strictEqual(json.total_questions, 10);
      assert.ok(json.questions.every(q => q.grade === 7));
    });

    test('EX-02: Dynamic test generator produces 25 questions for Grade 12 (45m)', async () => {
      const url = new URL('http://localhost/api/exams?random=1&grade=12&duration=45');
      const res = await getExams({ url });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.grade, 12);
      assert.strictEqual(json.total_questions, 25);
      assert.ok(json.questions.every(q => q.grade === 12));
    });

    test('EX-03: Include questions flag returns pedagogical linkage for specific exam', async () => {
      const url = new URL('http://localhost/api/exams?exam_id=ex_g7_quick_5m&include_questions=1');
      const res = await getExams({ url });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(Array.isArray(json.questions));
      assert.ok(json.questions.length >= 5);
      assert.ok(json.questions[0].prompt);
      assert.ok(json.questions[0].correct_answer);
      assert.ok(json.questions[0].explanation);
    });
  });
});
