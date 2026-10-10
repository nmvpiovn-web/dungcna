import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { isStaffUser } from '../src/lib/server/auth.js';

test('Migration 0017: applies cleanly on legacy 13-column users schema and backfills safely', () => {
  const sqlite = new DatabaseSync(':memory:');

  // Schema production cũ: 13 cột, chưa có approval_status
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      phone TEXT,
      email TEXT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar TEXT,
      status TEXT DEFAULT 'active',
      metadata TEXT,
      grade TEXT,
      password TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const initialPragma = sqlite.prepare("PRAGMA table_info(users)").all();
  assert.equal(initialPragma.length, 13);
  assert.equal(initialPragma.some(col => col.name === 'approval_status'), false);

  // Seed các loại tài khoản: trial, pending, rejected, teacher active/official, student, admin
  sqlite.prepare(`
    INSERT INTO users (id, username, role, name, status) VALUES
      ('u_trial', 'trial_user', 'student', 'Trial Student', 'trial'),
      ('u_pending', 'pending_user', 'student', 'Pending Student', 'pending'),
      ('u_rejected', 'rejected_user', 'teacher', 'Rejected Candidate', 'rejected'),
      ('u_teach_act', 'teacher_act', 'teacher', 'Active Teacher', 'active'),
      ('u_teach_off', 'teacher_off', 'teacher', 'Official Teacher', 'official'),
      ('u_admin', 'admin_user', 'admin', 'Admin User', 'active'),
      ('u_student', 'normal_student', 'student', 'Normal Student', 'active');
  `).run();

  // Đọc và chạy migration 0017
  const migrationPath = path.resolve('migrations/0017_users_approval_status.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  sqlite.exec(migrationSql);

  // Xác minh cột approval_status đã xuất hiện (14 cột)
  const afterPragma = sqlite.prepare("PRAGMA table_info(users)").all();
  assert.equal(afterPragma.length, 14);
  assert.equal(afterPragma.some(col => col.name === 'approval_status'), true);

  // Xác minh backfill:
  const getCol = (id) => sqlite.prepare('SELECT role, status, approval_status FROM users WHERE id = ?').get(id);

  // 1. status trial -> approval_status = 'trial'
  assert.equal(getCol('u_trial').approval_status, 'trial');

  // 2. status pending -> approval_status = 'pending'
  assert.equal(getCol('u_pending').approval_status, 'pending');

  // 3. status rejected -> approval_status = 'rejected'
  assert.equal(getCol('u_rejected').approval_status, 'rejected');

  // 4. teacher active/official -> approval_status = 'approved'
  assert.equal(getCol('u_teach_act').approval_status, 'approved');
  assert.equal(getCol('u_teach_off').approval_status, 'approved');

  // 5. admin & student active -> approval_status = 'approved'
  assert.equal(getCol('u_admin').approval_status, 'approved');
  assert.equal(getCol('u_student').approval_status, 'approved');

  // Kiểm tra tương thích với isStaffUser:
  assert.equal(isStaffUser(getCol('u_teach_act')), true);
  assert.equal(isStaffUser(getCol('u_teach_off')), true);
  assert.equal(isStaffUser(getCol('u_rejected')), false);
  assert.equal(isStaffUser(getCol('u_admin')), true);
  assert.equal(isStaffUser(getCol('u_student')), false);
});
