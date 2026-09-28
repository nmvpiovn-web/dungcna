// tests/verify_p1_modals_profile_ocr.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

import { GET as profileGet, POST as profilePost } from '../src/routes/api/users/profile/+server.js';
import { GET as parentTestsGet, POST as parentTestsPost } from '../src/routes/api/parents/tests/+server.js';
import { POST as guestExamPost } from '../src/routes/api/exams/guest/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';
import { simulateOcrFromImage, saveParentTestRecord } from '../src/lib/unifiedStore.js';

const secret = 'ephemeral_test_secret_hmac_2026_isolated_for_audit';

function createMockPlatform() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT,
      role TEXT,
      name TEXT,
      phone TEXT,
      email TEXT,
      password TEXT,
      avatar TEXT,
      status TEXT,
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    INSERT INTO users (id, username, role, name, phone, email, password, status, metadata) VALUES
      ('usr_parent_1', 'parent_mai', 'parent', 'Nguyễn Thị Mai', '0912345678', 'mai@example.com', 'pbkdf2:dummy', 'active', '{}'),
      ('usr_parent_2', 'parent_hung', 'parent', 'Trần Văn Hùng', '0987654321', 'hung@example.com', 'pbkdf2:dummy', 'active', '{}'),
      ('usr_student_1', 'student_an', 'student', 'Nguyễn Văn An', '0911223344', 'an@example.com', 'pbkdf2:dummy', 'active', '{"grade":"Lớp 7"}'),
      ('usr_student_2', 'student_binh', 'student', 'Trần Văn Bình', '0922334455', 'binh@example.com', 'pbkdf2:dummy', 'active', '{"grade":"Lớp 8"}'),
      ('usr_teacher_1', 'teacher_dung', 'teacher', 'Cô Dung', '0933445566', 'dung@example.com', 'pbkdf2:dummy', 'active', '{}');

    CREATE TABLE parent_student_links (
      id TEXT PRIMARY KEY,
      parent_user_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- usr_parent_1 has verified link with usr_student_1, pending link with usr_student_2
    INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status) VALUES
      ('psl_1', 'usr_parent_1', 'usr_student_1', 'verified'),
      ('psl_2', 'usr_parent_1', 'usr_student_2', 'pending');

    CREATE TABLE parent_test_records (
      id TEXT PRIMARY KEY,
      parent_user_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      test_name TEXT NOT NULL,
      test_type TEXT NOT NULL DEFAULT 'standard_45m',
      score REAL NOT NULL,
      max_score REAL NOT NULL DEFAULT 10,
      test_date TEXT NOT NULL,
      teacher_feedback TEXT,
      image_url TEXT,
      source TEXT NOT NULL DEFAULT 'parent_manual',
      status TEXT NOT NULL DEFAULT 'unverified',
      version INTEGER NOT NULL DEFAULT 1,
      idempotency_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE guest_exam_sessions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      grade TEXT NOT NULL,
      curriculum TEXT NOT NULL DEFAULT 'global_success',
      blueprint_json TEXT,
      candidate_name TEXT,
      duration_minutes INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      questions_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      answers_json TEXT,
      result_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const adapter = {
    prepare(sql) {
      let bound = [];
      return {
        bind(...args) {
          bound = args;
          return this;
        },
        async first() {
          const row = db.prepare(sql).get(...bound);
          return row || null;
        },
        async all() {
          const rows = db.prepare(sql).all(...bound);
          return { results: rows };
        },
        async run() {
          const res = db.prepare(sql).run(...bound);
          return { meta: { changes: res.changes } };
        }
      };
    }
  };

  return {
    platform: { env: { DB: adapter, AUTH_SECRET: secret } },
    rawDb: db
  };
}


test('AUDIT profile metadata preserves concurrent independent field', async () => {
 const {platform,rawDb}=createMockPlatform();
 const prepare=platform.env.DB.prepare.bind(platform.env.DB); let injected=false;
 platform.env.DB.prepare=(sql)=>{
  if(!injected && /UPDATE users SET/i.test(sql)) {
   injected=true;
   rawDb.prepare("UPDATE users SET metadata=? WHERE id='usr_parent_1'").run(JSON.stringify({target:'Concurrent target'}));
  }
  return prepare(sql);
 };
 const token=await createSignedToken({id:'usr_parent_1',role:'parent'},secret);
 const res=await profilePost({platform,request:new Request('http://localhost/api/users/profile',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({school:'New school'})})});
 const meta=JSON.parse(rawDb.prepare("SELECT metadata FROM users WHERE id='usr_parent_1'").get().metadata);
 console.log('AUDIT_PROFILE',res.status,meta); assert.equal(meta.target,'Concurrent target');
});
