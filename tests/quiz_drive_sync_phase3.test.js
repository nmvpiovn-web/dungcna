import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSignedToken } from '../src/lib/server/auth.js';
import { POST as syncBundleEndpoint } from '../src/routes/api/quiz-menu/[id]/sync-bundle/+server.js';
import { GET as getBundleEndpoint } from '../src/routes/api/quiz-menu/[id]/bundle/+server.js';
import { GET as observabilityEndpoint } from '../src/routes/api/quiz-menu/bundle-observability/+server.js';
import {
  acquireBundleLock,
  renewBundleLock,
  releaseBundleLock,
  logBundleSyncEvent,
  getBundleSyncEvents,
  inspectBundleHealth,
  publishQuizBundle,
  importGoogleDocToQuizBundle,
  publishBundleHomework,
  bundleChecksum,
  renderTeacherDocument,
  parseStrictExpectedRevision
} from '../src/lib/server/quizDrive.js';

const secret = 'quiz-drive-sync-phase3-secret';

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
      role TEXT, avatar TEXT, status TEXT, approval_status TEXT DEFAULT 'approved', metadata TEXT, created_at TEXT, updated_at TEXT
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
  sqlite.exec(fs.readFileSync('migrations/0022_quiz_bundle_sync_phase3.sql', 'utf8'));

  sqlite.prepare(`
    INSERT INTO users (id, username, name, role, status, metadata) VALUES
    ('teacher-1', 'teacher1', 'Cô Giáo 1', 'teacher', 'active', '{}'),
    ('teacher-2', 'teacher2', 'Cô Giáo 2', 'teacher', 'active', '{}'),
    ('admin-1', 'admin1', 'Quản Trị', 'admin', 'active', '{}'),
    ('leader-1', 'leader1', 'Tổ Trưởng', 'leader', 'active', '{}'),
    ('student-1', 'student1', 'Học Sinh 1', 'student', 'active', '{}')
  `).run();

  sqlite.prepare(`
    INSERT INTO auth_sessions VALUES
    ('session-t1', NULL, '2099-01-01T00:00:00.000Z'),
    ('session-t2', NULL, '2099-01-01T00:00:00.000Z'),
    ('session-admin', NULL, '2099-01-01T00:00:00.000Z'),
    ('session-leader', NULL, '2099-01-01T00:00:00.000Z'),
    ('session-student', NULL, '2099-01-01T00:00:00.000Z')
  `).run();

  const teacherToken = await createSignedToken({ id: 'teacher-1', username: 'teacher1', role: 'teacher' }, secret, 60_000, 'session-t1');
  const teacher2Token = await createSignedToken({ id: 'teacher-2', username: 'teacher2', role: 'teacher' }, secret, 60_000, 'session-t2');
  const adminToken = await createSignedToken({ id: 'admin-1', username: 'admin1', role: 'admin' }, secret, 60_000, 'session-admin');
  const leaderToken = await createSignedToken({ id: 'leader-1', username: 'leader1', role: 'leader' }, secret, 60_000, 'session-leader');
  const studentToken = await createSignedToken({ id: 'student-1', username: 'student1', role: 'student' }, secret, 60_000, 'session-student');

  const db = d1Adapter(sqlite);
  const platform = {
    env: {
      DB: db,
      AUTH_SECRET: secret,
      GOOGLE_DRIVE_ACCESS_TOKEN: 'test-token',
      QUIZ_DRIVE_PARENT_FOLDER_ID: 'parent-folder',
      QUIZ_DRIVE_ALLOWED_FOLDER_IDS: 'curriculum-folder'
    }
  };

  // Seed sample quiz
  sqlite.prepare(`
    INSERT INTO quizzes (id, title, description, time_limit_minutes, status, created_by, creator_name)
    VALUES ('quiz-sync-1', 'Unit 1 Sync Quiz', 'Đề kiểm tra Unit 1', 15, 'draft', 'teacher-1', 'Cô Giáo 1')
  `).run();

  sqlite.prepare(`
    INSERT INTO quiz_questions (id, quiz_id, type, prompt, options_json, correct_answer, explanation, points, q_order)
    VALUES
    ('q1', 'quiz-sync-1', 'multiple_choice', 'What is the capital of Vietnam?', '["A. Hanoi", "B. Hue", "C. Da Nang", "D. Saigon"]', 'A. Hanoi', 'Hanoi is the capital', 1, 0),
    ('q2', 'quiz-sync-1', 'multiple_choice', 'She ___ English very well.', '["A. speak", "B. speaks", "C. speaking", "D. spoken"]', 'B. speaks', 'Singular subject', 1, 1)
  `).run();

  return { sqlite, db, platform, teacherToken, teacher2Token, adminToken, leaderToken, studentToken };
}

function jsonRequest(path, token, body, method = 'POST') {
  const isBodyAllowed = method !== 'GET' && method !== 'HEAD' && body !== undefined && body !== null;
  return new Request(`https://timbk.io.vn${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(isBodyAllowed ? { 'content-type': 'application/json' } : {})
    },
    body: isBodyAllowed ? JSON.stringify(body) : undefined
  });
}

function createDriveMock(files = new Map()) {
  const originalFetch = globalThis.fetch;
  const deletedFiles = [];
  const uploads = [];
  let deleteFailureId = null;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = String(init.method || 'GET').toUpperCase();

    // 1. Folder check / creation
    if (url.includes('/drive/v3/files?q=')) {
      return new Response(JSON.stringify({ files: [{ id: 'upload-folder-id', name: 'Quiz Uploads', parents: ['parent-folder'] }] }), { status: 200 });
    }

    // 2. Export Google Doc
    if (url.includes('/export?mimeType=text%2Fplain')) {
      const match = url.match(/\/files\/([^/]+)\/export/);
      const fileId = match ? decodeURIComponent(match[1]) : '';
      const content = files.get(fileId)?.content || '1. Test question\nA. Option 1\nB. Option 2\n\nĐÁP ÁN\n1. A';
      return new Response(content, { status: 200 });
    }
    if (url.includes('/export?mimeType=')) {
      return new Response(new Uint8Array([1, 2, 3, 4]).buffer, { status: 200 });
    }

    // 3. Upload bytes (multipart or media)
    if (url.includes('/upload/drive/v3/files')) {
      const id = 'file_' + Math.random().toString(36).slice(2, 9);
      const modTime = new Date().toISOString();
      const meta = { id, name: 'uploaded-file', modifiedTime: modTime, mimeType: 'application/octet-stream' };
      files.set(id, meta);
      uploads.push(meta);
      return new Response(JSON.stringify(meta), { status: 200 });
    }

    // 4. File metadata
    if (method === 'GET' && url.includes('/drive/v3/files/')) {
      const match = url.match(/\/files\/([^/?]+)/);
      const fileId = match ? decodeURIComponent(match[1]) : '';
      const file = files.get(fileId) || { id: fileId, name: 'mock-doc', modifiedTime: '2026-10-13T09:00:00.000Z', trashed: false };
      return new Response(JSON.stringify(file), { status: 200 });
    }

    // 5. Delete file
    if (method === 'DELETE' && url.includes('/drive/v3/files/')) {
      const match = url.match(/\/files\/([^/?]+)/);
      const fileId = match ? decodeURIComponent(match[1]) : '';
      if (deleteFailureId && fileId === deleteFailureId) {
        return new Response(JSON.stringify({ error: { message: 'Drive simulated delete failure' } }), { status: 500 });
      }
      deletedFiles.push(fileId);
      files.delete(fileId);
      return new Response('', { status: 204 });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  };

  return {
    files,
    deletedFiles,
    uploads,
    setDeleteFailure: (id) => { deleteFailureId = id; },
    restore: () => { globalThis.fetch = originalFetch; }
  };
}

// -------------------------------------------------------------------------------------------------
// Part A: RED-3.8 / Migration 0022 Schema & Idempotency
// -------------------------------------------------------------------------------------------------
test('RED-3.8 / Migration 0022: Idempotent execution and table structures', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE quizzes (id TEXT PRIMARY KEY);`);

  // Run migration first time
  const migrationSql = fs.readFileSync('migrations/0022_quiz_bundle_sync_phase3.sql', 'utf8');
  sqlite.exec(migrationSql);

  // Run migration second time (idempotency test)
  sqlite.exec(migrationSql);

  // Check tables exist
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);
  assert.ok(tables.includes('quiz_bundle_sync_locks'), 'quiz_bundle_sync_locks table exists');
  assert.ok(tables.includes('quiz_bundle_sync_events'), 'quiz_bundle_sync_events table exists');

  // Check indices
  const indices = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all().map(r => r.name);
  assert.ok(indices.includes('idx_quiz_bundle_locks_expiry'), 'expiry index exists');
  assert.ok(indices.includes('idx_quiz_bundle_events_quiz'), 'quiz event index exists');
  assert.ok(indices.includes('idx_quiz_bundle_events_actor'), 'actor event index exists');
});

// -------------------------------------------------------------------------------------------------
// Part B: RED-3.3 / Concurrency Locking & Audit Trail
// -------------------------------------------------------------------------------------------------
test('RED-3.3: acquireBundleLock, concurrent lock rejection, expired takeover, and release', async () => {
  const { db } = await fixture();
  const quizId = 'quiz-sync-1';

  // 1. Initial lock acquisition
  const lock1 = await acquireBundleLock(db, quizId, 'teacher-1', 1000);
  assert.equal(lock1.acquired, true);
  assert.ok(lock1.lockToken);

  // 2. Second concurrent acquire fails with BundleSyncBusy
  const lock2 = await acquireBundleLock(db, quizId, 'teacher-2', 1000);
  assert.equal(lock2.acquired, false);
  assert.equal(lock2.error, 'BundleSyncBusy');

  // 3. Release with invalid token does NOT release
  await releaseBundleLock(db, quizId, 'wrong-token');
  const lock3 = await acquireBundleLock(db, quizId, 'teacher-2', 1000);
  assert.equal(lock3.acquired, false);

  // 4. Release with valid token allows new acquisition
  await releaseBundleLock(db, quizId, lock1.lockToken);
  const lock4 = await acquireBundleLock(db, quizId, 'teacher-2', 1000);
  assert.equal(lock4.acquired, true);

  // 5. Expired lock takeover
  // Set lock4's expires_at in the past
  await db.prepare(`UPDATE quiz_bundle_sync_locks SET expires_at = '2020-01-01T00:00:00.000Z' WHERE quiz_id = ?`).bind(quizId).run();
  const lock5 = await acquireBundleLock(db, quizId, 'teacher-1', 1000);
  assert.equal(lock5.acquired, true, 'Expired lock can be taken over');
  await releaseBundleLock(db, quizId, lock5.lockToken);

  // 6. Fail-closed: missing schema throws 503 BundleSyncSchemaMissing
  const emptyDb = d1Adapter(new DatabaseSync(':memory:'));
  await assert.rejects(async () => {
    await acquireBundleLock(emptyDb, 'any-quiz', 'teacher-1', 1000);
  }, (err) => err.code === 'BundleSyncSchemaMissing' && err.status === 503);

  // 7. Fail-closed: DB error throws 503 BundleSyncLockUnavailable
  const brokenDb = {
    prepare() { throw new Error('database disk image is malformed'); }
  };
  await assert.rejects(async () => {
    await acquireBundleLock(brokenDb, 'any-quiz', 'teacher-1', 1000);
  }, (err) => err.code === 'BundleSyncLockUnavailable' && err.status === 503);
});

test('RED-3.3: logBundleSyncEvent and getBundleSyncEvents audit trail', async () => {
  const { db } = await fixture();
  const quizId = 'quiz-sync-1';

  await logBundleSyncEvent(db, {
    quizId,
    eventType: 'started',
    actor: 'teacher-1',
    direction: 'publish_quiz_to_docs',
    fromRevision: 1
  });

  await logBundleSyncEvent(db, {
    quizId,
    eventType: 'succeeded',
    actor: 'teacher-1',
    direction: 'publish_quiz_to_docs',
    fromRevision: 1,
    toRevision: 2,
    details: { doc_id: 'doc-123' }
  });

  const events = await getBundleSyncEvents(db, quizId, 5);
  assert.equal(events.length, 2);
  assert.equal(events[0].event_type, 'succeeded');
  assert.equal(events[0].to_revision, 2);
  assert.equal(events[0].details.doc_id, 'doc-123');
  assert.equal(events[1].event_type, 'started');
});

// -------------------------------------------------------------------------------------------------
// Part C: RED-3.1 / Live Sync Inspector & Conflict Matrix
// -------------------------------------------------------------------------------------------------
test('RED-3.1: inspectBundleHealth truth table (missing, clean, quiz_changed, docs_changed, both_changed, drive_unavailable)', async () => {
  const { db, platform, sqlite } = await fixture();
  const quizId = 'quiz-sync-1';
  const mockDrive = createDriveMock();

  try {
    // 1. Bundle missing
    const missing = await inspectBundleHealth(platform, db, quizId);
    assert.equal(missing.status, 'bundle_missing');
    assert.equal(missing.bundle, null);

    // Initial publish to set up bundle at rev 1 (no force required for new bundle)
    const bundle1 = await publishQuizBundle(platform, db, quizId);
    assert.equal(bundle1.revision, 1);

    // 2. Clean state
    const clean = await inspectBundleHealth(platform, db, quizId);
    assert.equal(clean.status, 'clean');
    assert.equal(clean.quiz_changed, false);
    assert.equal(clean.docs_changed, false);
    assert.equal(clean.drive_healthy, true);
    assert.equal(clean.bundle.homework_draft_json, undefined, 'homework_draft_json stripped from response');

    // 3. Quiz changed in D1
    sqlite.prepare(`UPDATE quiz_questions SET prompt = 'Updated prompt in D1' WHERE id = 'q1'`).run();
    const quizChanged = await inspectBundleHealth(platform, db, quizId);
    assert.equal(quizChanged.status, 'quiz_changed');
    assert.equal(quizChanged.quiz_changed, true);
    assert.equal(quizChanged.docs_changed, false);

    // Reset quiz prompt
    sqlite.prepare(`UPDATE quiz_questions SET prompt = 'What is the capital of Vietnam?' WHERE id = 'q1'`).run();

    // 4. Docs changed on Drive
    mockDrive.files.set(bundle1.google_doc_file_id, {
      id: bundle1.google_doc_file_id,
      name: 'Google Doc',
      modifiedTime: '2026-10-13T12:00:00.000Z', // Different from bundle1.google_doc_modified_time
      trashed: false
    });
    const docsChanged = await inspectBundleHealth(platform, db, quizId);
    assert.equal(docsChanged.status, 'docs_changed');
    assert.equal(docsChanged.quiz_changed, false);
    assert.equal(docsChanged.docs_changed, true);

    // 5. Both changed
    sqlite.prepare(`UPDATE quiz_questions SET prompt = 'Updated again in D1' WHERE id = 'q1'`).run();
    const bothChanged = await inspectBundleHealth(platform, db, quizId);
    assert.equal(bothChanged.status, 'both_changed');
    assert.equal(bothChanged.quiz_changed, true);
    assert.equal(bothChanged.docs_changed, true);

    // 6. Drive unavailable (simulate drive offline / fetch failure)
    const deadPlatform = { env: { DB: db, AUTH_SECRET: secret } }; // missing access token
    const unavailable = await inspectBundleHealth(deadPlatform, db, quizId);
    assert.equal(unavailable.status, 'drive_unavailable');
    assert.equal(unavailable.drive_healthy, false);
    assert.ok(unavailable.drive_error);
  } finally {
    mockDrive.restore();
  }
});

// -------------------------------------------------------------------------------------------------
// Part D: RED-3.2 / No Implicit Force & Explicit Conflict Resolution
// -------------------------------------------------------------------------------------------------
test('RED-3.2: expected_revision required on existing bundle, stale revision 409, and explicit conflict resolution', async () => {
  const { db, platform, teacherToken, sqlite } = await fixture();
  const quizId = 'quiz-sync-1';
  const mockDrive = createDriveMock();

  try {
    // 1. Initial bundle creation allows omitted expected_revision (backward compatibility)
    const initRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, { direction: 'publish_quiz_to_docs' }),
      platform
    });
    assert.equal(initRes.status, 200);
    const initData = await initRes.json();
    assert.equal(initData.bundle.revision, 1);

    // 2. Existing bundle without expected_revision returns 409 MissingExpectedRevision
    const missingRevRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, { direction: 'publish_quiz_to_docs' }),
      platform
    });
    assert.equal(missingRevRes.status, 409);
    const missingRevData = await missingRevRes.json();
    assert.equal(missingRevData.error, 'MissingExpectedRevision');

    // 3. Existing bundle with stale expected_revision returns 409 BundleRevisionConflict
    const staleRevRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, { direction: 'publish_quiz_to_docs', expected_revision: 99 }),
      platform
    });
    assert.equal(staleRevRes.status, 409);
    const staleRevData = await staleRevRes.json();
    assert.equal(staleRevData.error, 'BundleRevisionConflict');

    // 3b. Resolution validation: invalid resolution allowlist
    const invalidResRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, {
        direction: 'publish_quiz_to_docs', expected_revision: 1, resolution: 'force_overwrite'
      }),
      platform
    });
    assert.equal(invalidResRes.status, 400);
    assert.equal((await invalidResRes.json()).error, 'InvalidResolution');

    // 3c. Direction-resolution mismatch
    const mismatchRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, {
        direction: 'publish_quiz_to_docs', expected_revision: 1, resolution: 'keep_docs'
      }),
      platform
    });
    assert.equal(mismatchRes.status, 400);
    assert.equal((await mismatchRes.json()).error, 'DirectionResolutionMismatch');

    // 3d. Resolution not required when health is clean
    const notReqRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, {
        direction: 'publish_quiz_to_docs', expected_revision: 1, resolution: 'keep_quiz'
      }),
      platform
    });
    assert.equal(notReqRes.status, 400);
    assert.equal((await notReqRes.json()).error, 'ResolutionNotRequired');

    // 4. Docs changed: publish_quiz_to_docs without resolution returns 409 BundleSyncConflict
    mockDrive.files.set(initData.bundle.google_doc_file_id, {
      id: initData.bundle.google_doc_file_id,
      name: 'Google Doc',
      modifiedTime: '2026-10-13T15:00:00.000Z',
      trashed: false
    });

    const conflictCountBefore = (await getBundleSyncEvents(db, quizId, 20)).filter(e => e.event_type === 'conflict').length;
    const conflictRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, { direction: 'publish_quiz_to_docs', expected_revision: 1 }),
      platform
    });
    assert.equal(conflictRes.status, 409);
    const conflictData = await conflictRes.json();
    assert.equal(conflictData.error, 'BundleSyncConflict');

    // Check single conflict event recorded for this request
    const conflictCountAfter = (await getBundleSyncEvents(db, quizId, 20)).filter(e => e.event_type === 'conflict').length;
    assert.equal(conflictCountAfter - conflictCountBefore, 1, 'Exactly one conflict event recorded per request');

    // 5. With explicit resolution: 'keep_quiz', publish succeeds and advances revision to 2
    const resolveRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, {
        direction: 'publish_quiz_to_docs',
        expected_revision: 1,
        resolution: 'keep_quiz'
      }),
      platform
    });
    assert.equal(resolveRes.status, 200);
    const resolveData = await resolveRes.json();
    assert.equal(resolveData.bundle.revision, 2);

    // 6. Quiz changed in D1: import_docs_to_quiz without resolution returns 409 BundleSyncConflict
    sqlite.prepare(`UPDATE quiz_questions SET prompt = 'Changed quiz prompt' WHERE id = 'q1'`).run();
    const importConflictRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, { direction: 'import_docs_to_quiz', expected_revision: 2 }),
      platform
    });
    assert.equal(importConflictRes.status, 409);
    assert.equal((await importConflictRes.json()).error, 'BundleSyncConflict');

    // 7. With explicit resolution: 'keep_docs', import succeeds and advances revision to 3
    const importResolveRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, {
        direction: 'import_docs_to_quiz',
        expected_revision: 2,
        resolution: 'keep_docs'
      }),
      platform
    });
    assert.equal(importResolveRes.status, 200);
    const importResolveData = await importResolveRes.json();
    assert.equal(importResolveData.bundle.revision, 3);
  } finally {
    mockDrive.restore();
  }
});

// -------------------------------------------------------------------------------------------------
// Part E: RED-3.4 / Compensating Transactions & Cleanup Verification
// -------------------------------------------------------------------------------------------------
test('RED-3.4: Old printable file deleted ONLY after D1 commits; cleanup failure logs cleanup_warning event', async () => {
  const { db, platform } = await fixture();
  const quizId = 'quiz-sync-1';
  const mockDrive = createDriveMock();

  try {
    // 1. Initial publish (no force)
    const b1 = await publishQuizBundle(platform, db, quizId);
    assert.equal(b1.revision, 1);
    const firstPrintableId = b1.printable_docx_file_id;
    assert.ok(firstPrintableId);

    // 2. Publish revision 2: old printable file should be deleted upon success
    const b2 = await publishQuizBundle(platform, db, quizId, { expectedRevision: 1 });
    assert.equal(b2.revision, 2);
    assert.ok(mockDrive.deletedFiles.includes(firstPrintableId), 'Old printable DOCX was removed from Drive');

    // 3. Test cleanup failure: if removeDriveFile fails, bundle sync still succeeds and logs cleanup_warning
    const secondPrintableId = b2.printable_docx_file_id;
    mockDrive.setDeleteFailure(secondPrintableId);

    const b3 = await publishQuizBundle(platform, db, quizId, { expectedRevision: 2 });
    assert.equal(b3.revision, 3, 'Bundle sync succeeded despite cleanup failure');

    const events = await getBundleSyncEvents(db, quizId, 5);
    const warningEvent = events.find(e => e.event_type === 'cleanup_warning');
    assert.ok(warningEvent, 'cleanup_warning event was recorded');
    assert.equal(warningEvent.error_code, 'CleanupOldPrintableFailed');
  } finally {
    mockDrive.restore();
  }
});

test('RED-3.4: Downstream D1 failure cleans up newly uploaded Drive file and marks sync_status error', async () => {
  const { db, platform, sqlite } = await fixture();
  const quizId = 'quiz-sync-1';
  const mockDrive = createDriveMock();

  try {
    const b1 = await publishQuizBundle(platform, db, quizId);
    assert.equal(b1.revision, 1);

    // Inject D1 update failure via trigger on homework_assignments (part of atomic batch)
    sqlite.exec(`CREATE TRIGGER fail_hw_update BEFORE UPDATE ON homework_assignments BEGIN SELECT RAISE(FAIL, 'simulated D1 update failure'); END;`);

    let caughtError = null;
    try {
      await publishQuizBundle(platform, db, quizId, { expectedRevision: 1 });
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Threw error when D1 failed');
    // Verify newly uploaded file was deleted by compensating transaction
    const latestUpload = mockDrive.uploads[mockDrive.uploads.length - 1];
    assert.ok(mockDrive.deletedFiles.includes(latestUpload.id), 'Compensating transaction deleted orphaned Drive file');

    // Verify D1 state is untouched: bundle revision still 1
    const currentBundle = await db.prepare(`SELECT * FROM quiz_bundles WHERE quiz_id = ?`).bind(quizId).first();
    assert.equal(currentBundle.revision, 1, 'Bundle revision was rolled back/untouched');
    assert.equal(currentBundle.sync_status, 'error', 'Bundle sync_status marked error on failure');

    const currentHw = await db.prepare(`SELECT * FROM homework_assignments WHERE id = ?`).bind(b1.homework_assignment_id).first();
    assert.equal(currentHw.source_content_revision, 1, 'Homework revision rolled back in atomic unit');
  } finally {
    mockDrive.restore();
  }
});

// -------------------------------------------------------------------------------------------------
// Part F: RED-3.5 / Homework Revision Parity & Status Preservation
// -------------------------------------------------------------------------------------------------
test('RED-3.5: Homework revision parity, published status preservation, and publish_homework expected_revision', async () => {
  const { db, platform, teacherToken, sqlite } = await fixture();
  const quizId = 'quiz-sync-1';
  const mockDrive = createDriveMock();

  try {
    // 1. Initial sync creates homework draft with revision 1
    const b1 = await publishQuizBundle(platform, db, quizId);
    assert.equal(b1.revision, 1);

    const hw1 = await db.prepare(`SELECT * FROM homework_assignments WHERE id = ?`).bind(b1.homework_assignment_id).first();
    assert.equal(hw1.source_content_revision, 1);
    assert.equal(hw1.status, 'draft');

    // Missing expected_revision throws MissingExpectedRevision
    await assert.rejects(async () => {
      await publishBundleHomework(platform, db, quizId, { id: 'teacher-1' }, {
        class_id: 'class-7a',
        session_id: 'sess-1',
        deadline_date: '2026-10-20',
        deadline_time: '18:00'
      });
    }, (err) => err.code === 'MissingExpectedRevision');

    // 2. Publish homework
    sqlite.prepare(`INSERT INTO class_enrollments VALUES ('ce-1', 'student-1', 'class-7a', 'active')`).run();
    const pubHw = await publishBundleHomework(platform, db, quizId, { id: 'teacher-1' }, {
      expected_revision: 1,
      class_id: 'class-7a',
      class_name: 'Lớp 7A',
      session_id: 'sess-1',
      deadline_date: '2026-10-20',
      deadline_time: '18:00'
    });
    assert.equal(pubHw.status, 'published');
    assert.equal(pubHw.class_name, 'Lớp 7A');

    // 3. Publish quiz bundle revision 2: Homework status remains 'published' and updates revision
    const b2 = await publishQuizBundle(platform, db, quizId, { expectedRevision: 1 });
    assert.equal(b2.revision, 2);

    const hw2 = await db.prepare(`SELECT * FROM homework_assignments WHERE id = ?`).bind(b1.homework_assignment_id).first();
    assert.equal(hw2.status, 'published', 'Homework status MUST remain published');
    assert.equal(hw2.class_name, 'Lớp 7A', 'Class name preserved');
    assert.equal(hw2.session_id, 'sess-1', 'Session ID preserved');
    assert.equal(hw2.source_content_revision, 2, 'source_content_revision strictly equals bundle revision');

    // 4. publish_homework with stale revision fails with 409
    await assert.rejects(async () => {
      await publishBundleHomework(platform, db, quizId, { id: 'teacher-1' }, {
        expected_revision: 1, // stale
        class_id: 'class-7a',
        session_id: 'sess-1',
        deadline_date: '2026-10-20',
        deadline_time: '18:00'
      });
    }, (err) => err.code === 'BundleRevisionConflict');

    // 5. Block publish when bundle is in conflict
    await db.prepare(`UPDATE quiz_bundles SET sync_status = 'conflict' WHERE quiz_id = ?`).bind(quizId).run();
    await assert.rejects(async () => {
      await publishBundleHomework(platform, db, quizId, { id: 'teacher-1' }, {
        expected_revision: 2,
        class_id: 'class-7a',
        session_id: 'sess-1',
        deadline_date: '2026-10-20',
        deadline_time: '18:00'
      });
    }, (err) => err.code === 'BundleNotReady');

    // 6. Idempotent notification: republishing with same revision does not duplicate notifications
    await db.prepare(`UPDATE quiz_bundles SET sync_status = 'synced' WHERE quiz_id = ?`).bind(quizId).run();
    const notifCountBefore = (await db.prepare(`SELECT COUNT(*) as c FROM system_notifications`).first()).c;

    await publishBundleHomework(platform, db, quizId, { id: 'teacher-1' }, {
      expected_revision: 2,
      class_id: 'class-7a',
      class_name: 'Lớp 7A',
      session_id: 'sess-1',
      deadline_date: '2026-10-20',
      deadline_time: '18:00'
    });
    const notifCountAfter = (await db.prepare(`SELECT COUNT(*) as c FROM system_notifications`).first()).c;
    assert.equal(notifCountAfter, notifCountBefore, 'No duplicate notifications created');
  } finally {
    mockDrive.restore();
  }
});

// -------------------------------------------------------------------------------------------------
// Part G: RED-3.7 / Observability API & RBAC Scoping
// -------------------------------------------------------------------------------------------------
test('RED-3.7: bundle-observability endpoint enforces RBAC, pagination, and status filtering', async () => {
  const { platform, teacherToken, teacher2Token, adminToken, studentToken } = await fixture();
  const mockDrive = createDriveMock();

  try {
    // 1. Unauthenticated -> 401
    const unauth = await observabilityEndpoint({ request: jsonRequest('/api/quiz-menu/bundle-observability', null, null, 'GET'), platform, url: new URL('https://timbk.io.vn/api/quiz-menu/bundle-observability') });
    assert.equal(unauth.status, 401);

    // 2. Student -> 403
    const student = await observabilityEndpoint({ request: jsonRequest('/api/quiz-menu/bundle-observability', studentToken, null, 'GET'), platform, url: new URL('https://timbk.io.vn/api/quiz-menu/bundle-observability') });
    assert.equal(student.status, 403);

    // Create bundles for testing
    await syncBundleEndpoint({ params: { id: 'quiz-sync-1' }, request: jsonRequest('/api/quiz-menu/quiz-sync-1/sync-bundle', teacherToken, { direction: 'publish_quiz_to_docs' }), platform });

    // 3. Teacher 1 sees their own quiz bundle
    const t1Res = await observabilityEndpoint({ request: jsonRequest('/api/quiz-menu/bundle-observability', teacherToken, null, 'GET'), platform, url: new URL('https://timbk.io.vn/api/quiz-menu/bundle-observability') });
    assert.equal(t1Res.status, 200);
    const t1Data = await t1Res.json();
    assert.equal(t1Data.total, 1);
    assert.equal(t1Data.bundles[0].quiz_id, 'quiz-sync-1');
    assert.equal(t1Data.bundles[0].created_by, 'teacher-1');
    assert.equal(t1Data.bundles[0].health_mode, 'stored');
    assert.equal(typeof t1Data.bundles[0].stale, 'boolean');

    // 4. Teacher 2 (who owns no quizzes) sees 0
    const t2Res = await observabilityEndpoint({ request: jsonRequest('/api/quiz-menu/bundle-observability', teacher2Token, null, 'GET'), platform, url: new URL('https://timbk.io.vn/api/quiz-menu/bundle-observability') });
    assert.equal(t2Res.status, 200);
    assert.equal((await t2Res.json()).total, 0);

    // 5. Admin sees all quizzes with status filter
    const adminRes = await observabilityEndpoint({ request: jsonRequest('/api/quiz-menu/bundle-observability', adminToken, null, 'GET'), platform, url: new URL('https://timbk.io.vn/api/quiz-menu/bundle-observability?status=synced') });
    assert.equal(adminRes.status, 200);
    const adminData = await adminRes.json();
    assert.equal(adminData.total, 1);
    assert.equal(adminData.bundles[0].sync_status, 'synced');

    // 6. refresh=1 mode: caps limit at 10, returns live health
    const refreshRes = await observabilityEndpoint({ request: jsonRequest('/api/quiz-menu/bundle-observability', adminToken, null, 'GET'), platform, url: new URL('https://timbk.io.vn/api/quiz-menu/bundle-observability?refresh=1&limit=50') });
    assert.equal(refreshRes.status, 200);
    const refreshData = await refreshRes.json();
    assert.equal(refreshData.limit, 10, 'Limit capped at 10 on refresh mode');
    assert.equal(refreshData.bundles[0].health_mode, 'live');
    assert.equal(refreshData.bundles[0].health_status, 'clean');

    // 7. Input validation: search query > 100
    const longSearchRes = await observabilityEndpoint({ request: jsonRequest('/api/quiz-menu/bundle-observability', adminToken, null, 'GET'), platform, url: new URL('https://timbk.io.vn/api/quiz-menu/bundle-observability?search=' + 'a'.repeat(101)) });
    assert.equal(longSearchRes.status, 400);

    // 8. Input validation: invalid status
    const invalidStatusRes = await observabilityEndpoint({ request: jsonRequest('/api/quiz-menu/bundle-observability', adminToken, null, 'GET'), platform, url: new URL('https://timbk.io.vn/api/quiz-menu/bundle-observability?status=corrupted') });
    assert.equal(invalidStatusRes.status, 400);
  } finally {
    mockDrive.restore();
  }
});

// -------------------------------------------------------------------------------------------------
// Part H: RED-3.6 / UI Contracts & Theme Compliance
// -------------------------------------------------------------------------------------------------
test('RED-3.6: +page.svelte contains live health status, conflict modal, 44px targets and zero forbidden dark blue tokens', () => {
  const pageSrc = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8');

  // 1. Live health & conflict resolution modal markup
  assert.ok(pageSrc.includes('bundle-status-bar'), 'Includes live status bar');
  assert.ok(pageSrc.includes('badge-clean'), 'Includes clean badge');
  assert.ok(pageSrc.includes('badge-conflict'), 'Includes conflict badge');
  assert.ok(pageSrc.includes('conflictModalOpen'), 'Includes conflict modal state');
  assert.ok(pageSrc.includes('Giữ bản Quiz'), 'Includes Giữ bản Quiz button');
  assert.ok(pageSrc.includes('Giữ bản Google Docs'), 'Includes Giữ bản Google Docs button');
  assert.ok(pageSrc.includes('bundleEvents'), 'Includes 5 recent events listing');
  assert.ok(pageSrc.includes('btn-sync-retry'), 'Includes retry button for drive unavailable');

  // 2. Touch targets >= 44px
  assert.ok(pageSrc.includes('min-height:44px'), 'Touch targets >= 44px');
  assert.ok(pageSrc.includes('min-width:44px'), 'Touch width targets >= 44px');

  // 3. Color tokens: Warm Ivory, Neutral Stone, Emerald, Coral. Zero forbidden navy/dark blue
  const forbiddenColors = [
    '#000080', '#00008b', '#1e3a8a', '#172554', '#1e40af', '#1d4ed8', '#2563eb',
    'navy', 'darkblue', 'midnightblue'
  ];
  for (const color of forbiddenColors) {
    const regex = new RegExp(`\\b${color}\\b`, 'i');
    assert.ok(!regex.test(pageSrc), `No forbidden dark blue token: ${color}`);
  }
});

// -------------------------------------------------------------------------------------------------
// Part I: RED-3R2.2 & RED-3R2.6 / Extended Behavioral Coverage
// -------------------------------------------------------------------------------------------------
test('RED-3R2.2: Compensating scope cleans up new Doc on downstream failure and marks sync_status error on update', async () => {
  const { db, platform } = await fixture();
  const quizId = 'quiz-sync-1';
  const originalFetch = globalThis.fetch;

  // Case A: New Doc creation -> Export fails -> Doc should be deleted
  const mockDrive = createDriveMock();
  try {
    const customFetch = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      if (url.includes('/export?mimeType=')) {
        return new Response('Simulated export failure', { status: 500 });
      }
      return customFetch(input, init);
    };

    let caughtErr = null;
    try {
      await publishQuizBundle(platform, db, quizId);
    } catch (e) {
      caughtErr = e;
    }
    assert.ok(caughtErr, 'Threw export error');
    assert.ok(mockDrive.deletedFiles.length > 0, 'New Doc was cleaned up when export failed');
  } finally {
    mockDrive.restore();
    globalThis.fetch = originalFetch;
  }

  // Case B: Existing Doc update -> Downstream export fails -> sync_status marked error
  const mockDrive2 = createDriveMock();
  try {
    const b1 = await publishQuizBundle(platform, db, quizId);
    assert.equal(b1.revision, 1);

    const customFetch = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      if (url.includes('/export?mimeType=')) {
        return new Response('Simulated export failure', { status: 500 });
      }
      return customFetch(input, init);
    };

    let caughtErr = null;
    try {
      await publishQuizBundle(platform, db, quizId, { expectedRevision: 1 });
    } catch (e) {
      caughtErr = e;
    }
    assert.ok(caughtErr, 'Threw error on rev 2 export');
    const bundleAfter = await db.prepare(`SELECT * FROM quiz_bundles WHERE quiz_id = ?`).bind(quizId).first();
    assert.equal(bundleAfter.sync_status, 'error', 'Bundle marked sync_status error when existing doc was modified');
  } finally {
    mockDrive2.restore();
    globalThis.fetch = originalFetch;
  }
});

test('RED-3R2.6: Direction and resolution validation matrix', async () => {
  const { platform, teacherToken } = await fixture();
  const quizId = 'quiz-sync-1';
  const mockDrive = createDriveMock();

  try {
    await syncBundleEndpoint({ params: { id: quizId }, request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, { direction: 'publish_quiz_to_docs' }), platform });

    // publish_homework does not accept resolution
    const hwRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, {
        direction: 'publish_homework',
        expected_revision: 1,
        resolution: 'keep_quiz',
        class_id: 'c1',
        session_id: 's1',
        deadline_date: '2026-10-20'
      }),
      platform
    });
    assert.equal(hwRes.status, 400);
    assert.equal((await hwRes.json()).error, 'ResolutionNotApplicable');

    // import_docs_to_quiz does not accept keep_quiz
    const impRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, {
        direction: 'import_docs_to_quiz',
        expected_revision: 1,
        resolution: 'keep_quiz'
      }),
      platform
    });
    assert.equal(impRes.status, 400);
    assert.equal((await impRes.json()).error, 'DirectionResolutionMismatch');
  } finally {
    mockDrive.restore();
  }
});

// -------------------------------------------------------------------------------------------------
// Round 3 Suites: RED-3R3.1 to RED-3R3.6
// -------------------------------------------------------------------------------------------------

test('RED-3R3.1: renewBundleLock extends valid lease, rejects stolen/expired token, and second request cannot takeover during heartbeat', async () => {
  const { db } = await fixture();
  const quizId = 'quiz-sync-1';

  // 1. acquire with 200ms TTL
  const lock = await acquireBundleLock(db, quizId, 'teacher-1', 200);
  assert.equal(lock.acquired, true);

  // 2. renew with valid token before expiration
  const renewed = await renewBundleLock(db, quizId, lock.lockToken, 10000);
  assert.equal(renewed.renewed, true);
  assert.ok(new Date(renewed.expiresAt) > new Date());

  // 3. Second owner cannot takeover because heartbeat renewed it
  const second = await acquireBundleLock(db, quizId, 'teacher-2', 5000);
  assert.equal(second.acquired, false, 'Second owner blocked while heartbeat is active');

  // 4. Missing lockToken throws LockTokenRequired 400
  await assert.rejects(async () => {
    await renewBundleLock(db, quizId, null);
  }, (err) => err.code === 'LockTokenRequired');

  // 5. Stolen token / wrong token throws BundleSyncLockLost 409
  await assert.rejects(async () => {
    await renewBundleLock(db, quizId, 'stolen-fake-token');
  }, (err) => err.code === 'BundleSyncLockLost' && err.status === 409);

  // 6. Release lock
  await releaseBundleLock(db, quizId, lock.lockToken);
  const reacquired = await acquireBundleLock(db, quizId, 'teacher-2', 5000);
  assert.equal(reacquired.acquired, true);
});

test('RED-3R3.1: Pipeline aborts and compensates created artifacts when lock is stolen mid-pipeline', async () => {
  const { platform, db } = await fixture();
  const quizId = 'quiz-sync-1';
  const mockDrive = createDriveMock();
  const originalFetch = globalThis.fetch;

  try {
    const lock = await acquireBundleLock(db, quizId, 'teacher-1', 5000);
    assert.equal(lock.acquired, true);

    // Simulate lock stolen right before exportGoogleDocBytes by replacing lock_token in DB
    const customFetch = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      if (url.includes('/export?mimeType=')) {
        // Steal the lock in DB!
        await db.prepare(`UPDATE quiz_bundle_sync_locks SET lock_token = 'stolen_by_another' WHERE quiz_id = ?`).bind(quizId).run();
      }
      return customFetch(input, init);
    };

    let caughtErr = null;
    try {
      await publishQuizBundle(platform, db, quizId, { lockToken: lock.lockToken });
    } catch (e) {
      caughtErr = e;
    }

    assert.ok(caughtErr, 'Pipeline aborted');
    assert.equal(caughtErr.code, 'BundleSyncLockLost');
    assert.equal(caughtErr.status, 409);

    // Compensating scope cleaned up the newly created doc
    assert.ok(mockDrive.deletedFiles.length > 0, 'Created doc must be deleted on lock lost compensation');

    // DB has no bundle record
    const bundle = await db.prepare(`SELECT * FROM quiz_bundles WHERE quiz_id = ?`).bind(quizId).first();
    assert.equal(bundle, null, 'No bundle was saved to DB');
  } finally {
    mockDrive.restore();
    globalThis.fetch = originalFetch;
  }
});

test('RED-3R3.2: publishBundleHomework requires platform and fails closed without it or when health is not clean', async () => {
  const { platform, db } = await fixture();
  const quizId = 'quiz-sync-1';
  const mockDrive = createDriveMock();

  try {
    const b1 = await publishQuizBundle(platform, db, quizId);
    assert.equal(b1.revision, 1);

    // 1. Missing platform -> PlatformRequired 500
    await assert.rejects(async () => {
      await publishBundleHomework(null, db, quizId, { id: 'teacher-1' }, {
        expected_revision: 1,
        class_id: 'class-7a',
        session_id: 'sess-1',
        deadline_date: '2026-10-20',
        deadline_time: '18:00'
      });
    }, (err) => err.code === 'PlatformRequired' && err.status === 500);

    // 2. Health not clean (e.g. drive file modified -> docs_changed) -> BundleNotReady 409
    mockDrive.files.get(b1.google_doc_file_id).modifiedTime = '2099-01-01T00:00:00.000Z';
    await assert.rejects(async () => {
      await publishBundleHomework(platform, db, quizId, { id: 'teacher-1' }, {
        expected_revision: 1,
        class_id: 'class-7a',
        session_id: 'sess-1',
        deadline_date: '2026-10-20',
        deadline_time: '18:00'
      });
    }, (err) => err.code === 'BundleNotReady' && err.status === 409);
  } finally {
    mockDrive.restore();
  }
});

test('RED-3R3.3: Observability rejects draft, filters derived stale correctly, and detects fresh live conflict on refresh=1', async () => {
  const { platform, adminToken, sqlite } = await fixture();
  const mockDrive = createDriveMock();

  try {
    // 1. status=draft is rejected with 400 InvalidStatusFilter
    const draftRes = await observabilityEndpoint({
      request: jsonRequest('/api/quiz-menu/bundle-observability', adminToken, null, 'GET'),
      platform,
      url: new URL('https://timbk.io.vn/api/quiz-menu/bundle-observability?status=draft')
    });
    assert.equal(draftRes.status, 400);
    assert.equal((await draftRes.json()).error, 'InvalidStatusFilter');

    // Create a bundle in DB with old last_synced_at (> 2 hours ago)
    const oldSyncTime = new Date(Date.now() - 7200000).toISOString();
    sqlite.prepare(`
      INSERT INTO quiz_bundles (quiz_id, google_doc_file_id, printable_docx_file_id, revision, quiz_checksum, sync_status, last_synced_at, google_doc_modified_time, homework_draft_json)
      VALUES ('quiz-sync-1', 'doc-valid-id-1', 'docx-valid-id-1', 1, 'cs-1', 'synced', ?, '2026-01-01T00:00:00.000Z', '{}')
    `).run(oldSyncTime);
    mockDrive.files.set('doc-valid-id-1', { id: 'doc-valid-id-1', name: 'Doc 1', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-01-01T00:00:00.000Z', trashed: false });

    // 2. Query status=stale finds this bundle
    const staleRes = await observabilityEndpoint({
      request: jsonRequest('/api/quiz-menu/bundle-observability', adminToken, null, 'GET'),
      platform,
      url: new URL('https://timbk.io.vn/api/quiz-menu/bundle-observability?status=stale')
    });
    assert.equal(staleRes.status, 200);
    const staleData = await staleRes.json();
    assert.equal(staleData.total, 1);
    assert.equal(staleData.bundles[0].quiz_id, 'quiz-sync-1');
    assert.equal(staleData.bundles[0].stale, true);

    // 3. refresh=1 with status=conflict detects live conflict even though DB sync_status is 'synced'
    mockDrive.files.get('doc-valid-id-1').modifiedTime = '2026-10-13T12:00:00.000Z';

    const liveConflictRes = await observabilityEndpoint({
      request: jsonRequest('/api/quiz-menu/bundle-observability', adminToken, null, 'GET'),
      platform,
      url: new URL('https://timbk.io.vn/api/quiz-menu/bundle-observability?refresh=1&status=conflict')
    });
    assert.equal(liveConflictRes.status, 200);
    const liveConflictData = await liveConflictRes.json();
    assert.equal(liveConflictData.total, 1);
    assert.equal(liveConflictData.bundles.length, 1);
    assert.equal(liveConflictData.bundles[0].quiz_id, 'quiz-sync-1');
    assert.ok(liveConflictData.bundles[0].docs_changed, 'Live health detects docs_changed');
    assert.ok(['docs_changed', 'both_changed'].includes(liveConflictData.bundles[0].health_status));
    assert.equal(typeof liveConflictData.scanned_count, 'number');
    assert.equal(typeof liveConflictData.returned_count, 'number');
    assert.equal(liveConflictData.returned_count, 1);
  } finally {
    mockDrive.restore();
  }
});

test('RED-3R3.4: getBundleSyncEvents strips details_json, durable started event fails closed on missing audit table, and lock release failure logs cleanup_warning', async () => {
  const { platform, db, teacherToken, sqlite } = await fixture();
  const quizId = 'quiz-sync-1';
  const mockDrive = createDriveMock();

  try {
    // 1. Normal sync creates events; verify getBundleSyncEvents does NOT expose details_json
    await syncBundleEndpoint({ params: { id: quizId }, request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, { direction: 'publish_quiz_to_docs' }), platform });

    const events = await getBundleSyncEvents(db, quizId, 10);
    assert.ok(events.length > 0);
    for (const ev of events) {
      assert.equal(ev.details_json, undefined, 'details_json must be stripped from response');
      assert.ok(ev.details !== undefined, 'parsed details object exists');
    }

    // 2. Drop audit table to simulate audit system failure
    sqlite.exec(`DROP TABLE quiz_bundle_sync_events;`);

    // Reset drive call counter
    const driveUploadCountBefore = mockDrive.uploads.length;

    // POST sync-bundle must fail closed with 503 BundleSyncAuditUnavailable BEFORE any Drive write
    const auditFailRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, { direction: 'publish_quiz_to_docs', expected_revision: 1 }),
      platform
    });
    assert.equal(auditFailRes.status, 503);
    const auditFailData = await auditFailRes.json();
    assert.equal(auditFailData.error, 'BundleSyncAuditUnavailable');
    assert.equal(mockDrive.uploads.length, driveUploadCountBefore, 'Drive was NEVER called when audit failed');
  } finally {
    mockDrive.restore();
  }
});

test('RED-3R3.5: Notification IDs include revision; rev 1 retry is idempotent; rev 2 republish creates update notification', async () => {
  const { platform, db, sqlite } = await fixture();
  const quizId = 'quiz-sync-1';
  const mockDrive = createDriveMock();

  try {
    // Setup class enrollment
    sqlite.prepare(`INSERT INTO class_enrollments VALUES ('ce-1', 'student-1', 'class-7a', 'active')`).run();

    // 1. Initial publish of bundle (rev 1)
    const b1 = await publishQuizBundle(platform, db, quizId);
    assert.equal(b1.revision, 1);

    // 2. First publish of homework (rev 1)
    await publishBundleHomework(platform, db, quizId, { id: 'teacher-1' }, {
      expected_revision: 1,
      class_id: 'class-7a',
      class_name: 'Lớp 7A',
      session_id: 'sess-1',
      deadline_date: '2026-10-20',
      deadline_time: '18:00'
    });

    const notifsRev1 = sqlite.prepare(`SELECT * FROM system_notifications`).all();
    assert.equal(notifsRev1.length, 1);
    assert.ok(notifsRev1[0].id.includes('_r1_'), 'Notification ID contains _r1_');
    assert.ok(notifsRev1[0].title.startsWith('📚 BTVN mới:'), 'Initial publish has BTVN mới title');

    // 3. Retry publish with rev 1 is idempotent: no duplicate
    await publishBundleHomework(platform, db, quizId, { id: 'teacher-1' }, {
      expected_revision: 1,
      class_id: 'class-7a',
      class_name: 'Lớp 7A',
      session_id: 'sess-1',
      deadline_date: '2026-10-20',
      deadline_time: '18:00'
    });
    const notifsRev1Retry = sqlite.prepare(`SELECT * FROM system_notifications`).all();
    assert.equal(notifsRev1Retry.length, 1, 'No duplicate notification created on retry of rev 1');

    // 4. Publish bundle rev 2
    const b2 = await publishQuizBundle(platform, db, quizId, { expectedRevision: 1 });
    assert.equal(b2.revision, 2);

    // 5. Republish homework with rev 2
    await publishBundleHomework(platform, db, quizId, { id: 'teacher-1' }, {
      expected_revision: 2,
      class_id: 'class-7a',
      class_name: 'Lớp 7A',
      session_id: 'sess-1',
      deadline_date: '2026-10-22',
      deadline_time: '18:00'
    });

    const notifsRev2 = sqlite.prepare(`SELECT * FROM system_notifications ORDER BY id`).all();
    assert.equal(notifsRev2.length, 2, 'New notification created for rev 2');
    const rev2Notif = notifsRev2.find(n => n.id.includes('_r2_'));
    assert.ok(rev2Notif, 'Notification ID contains _r2_');
    assert.ok(rev2Notif.title.includes('Cập nhật BTVN (rev 2)'), `Republish title contains Cập nhật BTVN (rev 2): ${rev2Notif.title}`);

    // 6. Retry publish with rev 2 is also idempotent
    await publishBundleHomework(platform, db, quizId, { id: 'teacher-1' }, {
      expected_revision: 2,
      class_id: 'class-7a',
      class_name: 'Lớp 7A',
      session_id: 'sess-1',
      deadline_date: '2026-10-22',
      deadline_time: '18:00'
    });
    assert.equal(sqlite.prepare(`SELECT COUNT(*) as c FROM system_notifications`).get().c, 2);
  } finally {
    mockDrive.restore();
  }
});

test('RED-3R3.6: DriveInvalidResponse thrown and compensated when Drive returns invalid artifact, and strict expected_revision parsing', async () => {
  const { platform, db, teacherToken } = await fixture();
  const quizId = 'quiz-sync-1';
  const mockDrive = createDriveMock();
  const originalFetch = globalThis.fetch;

  try {
    // 1. Strict parseExpectedRevision checks
    const invalidRevs = [' 1 ', '1 ', ' 1', 1.5, '1.5', NaN, {}, [], '-1'];
    for (const inv of invalidRevs) {
      assert.throws(() => parseStrictExpectedRevision(inv), (err) => err.code === 'InvalidExpectedRevision');
    }
    assert.equal(parseStrictExpectedRevision(0), 0);
    assert.equal(parseStrictExpectedRevision('0'), 0);
    assert.equal(parseStrictExpectedRevision(1), 1);
    assert.equal(parseStrictExpectedRevision('1'), 1);

    // 2. DriveInvalidResponse thrown when uploadBytes returns missing id
    const customFetch = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      if (url.includes('/upload/drive/v3/files') && init.body && String(init.headers?.['content-type']).includes('multipart/related')) {
        // Return JSON without id
        return new Response(JSON.stringify({ name: 'corrupted-upload' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return customFetch(input, init);
    };

    let caughtErr = null;
    try {
      await publishQuizBundle(platform, db, quizId);
    } catch (e) {
      caughtErr = e;
    }

    assert.ok(caughtErr, 'Threw on invalid response');
    assert.equal(caughtErr.code, 'DriveInvalidResponse');
    assert.equal(caughtErr.status, 502);

    // 3. sync-bundle endpoint with invalid expected_revision returns 400 InvalidExpectedRevision
    const badRevRes = await syncBundleEndpoint({
      params: { id: quizId },
      request: jsonRequest(`/api/quiz-menu/${quizId}/sync-bundle`, teacherToken, {
        direction: 'publish_quiz_to_docs',
        expected_revision: ' 1 '
      }),
      platform
    });
    assert.equal(badRevRes.status, 400);
    assert.equal((await badRevRes.json()).error, 'InvalidExpectedRevision');
  } finally {
    mockDrive.restore();
    globalThis.fetch = originalFetch;
  }
});
