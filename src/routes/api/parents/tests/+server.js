// src/routes/api/parents/tests/+server.js
import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { verifyServerAuth, isStaffUser } from '../../../../lib/server/auth.js';
import { saveParentTestRecord } from '../../../../lib/unifiedStore.js';

export const prerender = false;

const ALLOWED_TEST_TYPES = [
  'quick_15m',
  'standard_45m',
  'midterm_test',
  'final_test',
  'cambridge_test',
  'other'
];

/**
 * Checks whether explicit local mock fallback is permitted.
 */
function isMockAllowed(platform) {
  return process.env.ALLOW_LOCAL_MOCK_FALLBACK === 'true' || platform?.env?.MOCK_D1 === 'true';
}

/**
 * Ensure parent_test_records table and indexes exist in D1.
 * Fail-closed: errors propagate to caller, never swallowed silently.
 */
async function ensureParentTestTable(db) {
  if (!db) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS parent_test_records (
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
      payload_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  try {
    await db.prepare(`ALTER TABLE parent_test_records ADD COLUMN payload_hash TEXT;`).run();
  } catch (err) {
    if (!/duplicate column name/i.test(err?.message || '')) {
      throw err;
    }
  }

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_parent_test_records_child 
    ON parent_test_records(parent_user_id, student_user_id);
  `).run();

  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_test_records_idem 
    ON parent_test_records(parent_user_id, idempotency_key) 
    WHERE idempotency_key IS NOT NULL;
  `).run();
}

/**
 * Computes canonical SHA-256 hash of test record payload.
 */
async function computeCanonicalPayloadHash(payload) {
  const canonicalObj = {
    image_url: payload.image_url || '',
    max_score: Number(payload.max_score),
    score: Number(payload.score),
    student_user_id: String(payload.student_user_id),
    teacher_feedback: payload.teacher_feedback || '',
    test_date: String(payload.test_date),
    test_name: String(payload.test_name),
    test_type: String(payload.test_type)
  };
  const str = JSON.stringify(canonicalObj);
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compares an existing record against incoming payload.
 */
function isPayloadIdentical(existing, incoming) {
  return (
    String(existing.student_user_id) === String(incoming.student_user_id) &&
    String(existing.test_name) === String(incoming.test_name) &&
    String(existing.test_type) === String(incoming.test_type) &&
    Math.abs(Number(existing.score) - Number(incoming.score)) < 0.0001 &&
    Math.abs(Number(existing.max_score) - Number(incoming.max_score)) < 0.0001 &&
    String(existing.test_date) === String(incoming.test_date) &&
    String(existing.teacher_feedback || '') === String(incoming.teacher_feedback || '') &&
    String(existing.image_url || '') === String(incoming.image_url || '')
  );
}

/**
 * Handles idempotent replay and enforces permission on the stored record's child.
 */
async function resolveIdempotencyReplay(existing, currentPayload, currentHash, db, user) {
  const isMatch = (existing.payload_hash && existing.payload_hash === currentHash) || isPayloadIdentical(existing, currentPayload);
  if (!isMatch) {
    return json({
      success: false,
      error: 'IdempotencyConflict: Idempotency-Key đã được sử dụng với nội dung hồ sơ bài thi khác.'
    }, { status: 409 });
  }

  // P1-03: Replay MUST verify permission of the ALREADY-STORED record's child!
  // Prevents using child B verified to replay child A revoked!
  if (user.role === 'parent') {
    const replayLink = await db.prepare(`
      SELECT verification_status FROM parent_student_links
      WHERE parent_user_id = ? AND student_user_id = ?
      LIMIT 1;
    `).bind(user.id, existing.student_user_id).first();

    if (!replayLink || replayLink.verification_status !== 'verified') {
      return json({
        success: false,
        error: 'ForbiddenChildAccess: Học sinh trong bản ghi được phát lại (replay) không còn liên kết xác thực với phụ huynh.'
      }, { status: 403 });
    }
  }

  return json({
    success: true,
    message: 'Đã ghi nhận bài thi (Idempotent replay).',
    record: existing,
    replayed: true
  }, { status: 200 });
}

/**
 * GET /api/parents/tests
 * Query parent self-reported test records.
 * Scoped strictly to verified parent-child links.
 */
export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({
      success: false,
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập.'
    }, { status: auth.status || 401 });
  }

  const user = auth.user;
  const isStaff = isStaffUser(user);

  if (user.role !== 'parent' && !isStaff) {
    return json({
      success: false,
      error: 'Forbidden: Chỉ phụ huynh hoặc giáo viên quản nhiệm mới có quyền xem hồ sơ bài thi.'
    }, { status: 403 });
  }

  const studentId = url.searchParams.get('student_id');
  const db = platform?.env?.DB;

  if (!db) {
    if (!isMockAllowed(platform)) {
      return json({
        success: false,
        error: 'ServiceUnavailable: Cơ sở dữ liệu Cloudflare D1 không khả dụng hoặc chưa được cấu hình binding (fail-closed).'
      }, { status: 503 });
    }
    return json({
      success: true,
      records: [],
      total: 0,
      source: 'empty_fallback'
    });
  }

  try {
    await ensureParentTestTable(db);

    // Parent actor: must verify parent-child relationship if studentId specified
    if (user.role === 'parent' && studentId) {
      const link = await db.prepare(`
        SELECT verification_status FROM parent_student_links
        WHERE parent_user_id = ? AND student_user_id = ?
        LIMIT 1;
      `).bind(user.id, studentId).first();

      if (!link || link.verification_status !== 'verified') {
        return json({
          success: false,
          error: 'ForbiddenChildAccess: Học sinh chưa được xác thực liên kết với tài khoản phụ huynh này.'
        }, { status: 403 });
      }
    }

    let query = 'SELECT * FROM parent_test_records WHERE ';
    const params = [];

    if (user.role === 'parent') {
      query += 'parent_user_id = ? AND student_user_id IN (SELECT student_user_id FROM parent_student_links WHERE parent_user_id = ? AND verification_status = \'verified\') ';
      params.push(user.id, user.id);
      if (studentId) {
        query += 'AND student_user_id = ? ';
        params.push(studentId);
      }
    } else {
      // Staff query
      if (studentId) {
        query += 'student_user_id = ? ';
        params.push(studentId);
      } else {
        query += '1 = 1 ';
      }
    }

    query += 'ORDER BY test_date DESC, created_at DESC';

    const res = await db.prepare(query).bind(...params).all();
    const records = res?.results || [];

    return json({
      success: true,
      records,
      total: records.length,
      source: 'cloudflare_d1'
    });
  } catch (e) {
    console.error('D1 parent tests fetch error:', e);
    return json({
      success: false,
      error: `DatabaseError: Không thể truy vấn hồ sơ bài thi (${e.message}).`
    }, { status: 500 });
  }
}

/**
 * POST /api/parents/tests
 * Saves a parent self-declared test record to D1.
 * Strict validation: verified link required, numeric score range, immutable audit status.
 */
export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({
      success: false,
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập.'
    }, { status: auth.status || 401 });
  }

  const user = auth.user;
  const isStaff = isStaffUser(user);

  if (user.role !== 'parent' && !isStaff) {
    return json({
      success: false,
      error: 'Forbidden: Chỉ phụ huynh mới có quyền khai báo điểm bài thi của con.'
    }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Dữ liệu gửi lên không đúng định dạng JSON.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ success: false, error: 'SchemaError: Payload phải là một JSON object.' }, { status: 400 });
  }

  // 1. Validate student_id
  if (body.student_id === undefined || body.student_id === null || typeof body.student_id !== 'string') {
    return json({ success: false, error: 'Thiếu student_id học sinh liên kết (phải là chuỗi ký tự).' }, { status: 400 });
  }
  const studentId = body.student_id.trim();
  if (!studentId) {
    return json({ success: false, error: 'Thiếu student_id học sinh liên kết.' }, { status: 400 });
  }

  // 2. Validate test_name
  if (body.test_name === undefined || body.test_name === null || typeof body.test_name !== 'string') {
    return json({ success: false, error: 'Tên bài kiểm tra là bắt buộc (phải là chuỗi ký tự).' }, { status: 400 });
  }
  const testName = body.test_name.trim();
  if (testName.length < 2 || testName.length > 200) {
    return json({ success: false, error: 'Tên bài kiểm tra phải từ 2 đến 200 ký tự.' }, { status: 400 });
  }

  // 3. Validate test_type (strict enum, no silent coercion)
  let testType = 'standard_45m';
  if (body.test_type !== undefined) {
    if (typeof body.test_type !== 'string' || !ALLOWED_TEST_TYPES.includes(body.test_type)) {
      return json({
        success: false,
        error: `InvalidTestType: Loại bài kiểm tra không hợp lệ. Cho phép: ${ALLOWED_TEST_TYPES.join(', ')}.`
      }, { status: 400 });
    }
    testType = body.test_type;
  }

  // 4. Validate max_score (strict number, no silent coercion)
  let maxScore = 10;
  if (body.max_score !== undefined) {
    if (typeof body.max_score !== 'number' || !Number.isFinite(body.max_score) || isNaN(body.max_score) || body.max_score <= 0 || body.max_score > 100) {
      return json({
        success: false,
        error: 'InvalidMaxScore: max_score phải là kiểu số hữu hạn trong khoảng từ 1 đến 100.'
      }, { status: 400 });
    }
    maxScore = body.max_score;
  }

  // 5. Validate score (strictly typeof number, no boolean/array coercion)
  if (body.score === undefined || body.score === null) {
    return json({ success: false, error: 'InvalidScore: Điểm số bài thi là bắt buộc.' }, { status: 400 });
  }
  if (typeof body.score !== 'number' || !Number.isFinite(body.score) || isNaN(body.score)) {
    return json({
      success: false,
      error: 'InvalidScore: Điểm số phải là kiểu số thực hợp lệ (number), không chấp nhận boolean, array hoặc chuỗi ký tự.'
    }, { status: 400 });
  }
  if (body.score < 0 || body.score > maxScore) {
    return json({
      success: false,
      error: `InvalidScore: Điểm số phải trong khoảng từ 0 đến ${maxScore}.`
    }, { status: 400 });
  }
  const score = Number(body.score.toFixed(2));

  // 6. Validate test_date (format YYYY-MM-DD + strict round-trip calendar check)
  if (body.test_date === undefined || body.test_date === null || typeof body.test_date !== 'string') {
    return json({ success: false, error: 'InvalidDate: Ngày làm bài là bắt buộc (YYYY-MM-DD).' }, { status: 400 });
  }
  const testDate = body.test_date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate)) {
    return json({ success: false, error: 'InvalidDate: Ngày làm bài phải theo định dạng YYYY-MM-DD.' }, { status: 400 });
  }
  const [yearStr, monthStr, dayStr] = testDate.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const d = parseInt(dayStr, 10);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  if (
    dateObj.getUTCFullYear() !== y ||
    dateObj.getUTCMonth() !== m - 1 ||
    dateObj.getUTCDate() !== d
  ) {
    return json({
      success: false,
      error: 'InvalidDate: Ngày làm bài không tồn tại theo lịch thực tế (ví dụ: ngày 31 tháng 2 không hợp lệ).'
    }, { status: 400 });
  }

  // 7. Optional fields strict string validation
  if (body.teacher_feedback !== undefined && body.teacher_feedback !== null && typeof body.teacher_feedback !== 'string') {
    return json({ success: false, error: 'InvalidType: teacher_feedback phải là chuỗi ký tự (string).' }, { status: 400 });
  }
  if (body.image_url !== undefined && body.image_url !== null && typeof body.image_url !== 'string') {
    return json({ success: false, error: 'InvalidType: image_url phải là chuỗi ký tự (string).' }, { status: 400 });
  }
  if (body.idempotency_key !== undefined && body.idempotency_key !== null && typeof body.idempotency_key !== 'string') {
    return json({ success: false, error: 'InvalidType: idempotency_key phải là chuỗi ký tự (string).' }, { status: 400 });
  }

  const teacherFeedback = body.teacher_feedback ? body.teacher_feedback.trim().slice(0, 1000) : '';
  const imageUrl = body.image_url ? body.image_url.trim().slice(0, 500000) : '';
  const idempotencyKey = body.idempotency_key ? body.idempotency_key.trim().slice(0, 128) : null;

  const db = platform?.env?.DB;

  if (!db) {
    if (!isMockAllowed(platform)) {
      return json({
        success: false,
        error: 'ServiceUnavailable: Cơ sở dữ liệu Cloudflare D1 không khả dụng hoặc chưa được cấu hình binding (fail-closed).'
      }, { status: 503 });
    }
    // Fallback for non-D1 test / dev environment
    const mockRecord = saveParentTestRecord({
      student_id: studentId,
      test_name: testName,
      test_type: testType,
      score,
      max_score: maxScore,
      test_date: testDate,
      teacher_feedback: teacherFeedback,
      image_url: imageUrl,
      source: 'parent_manual',
      status: 'unverified',
      ocr_status: 'manual_entry'
    });
    return json({
      success: true,
      message: 'Lưu hồ sơ điểm bài thi thành công (mock mode)!',
      record: mockRecord
    }, { status: 201 });
  }

  try {
    await ensureParentTestTable(db);

    const payloadHash = await computeCanonicalPayloadHash({
      student_user_id: studentId,
      test_name: testName,
      test_type: testType,
      score,
      max_score: maxScore,
      test_date: testDate,
      teacher_feedback: teacherFeedback,
      image_url: imageUrl
    });

    // Parent actor: pre-check verified parent-child link
    if (user.role === 'parent') {
      const link = await db.prepare(`
        SELECT verification_status FROM parent_student_links
        WHERE parent_user_id = ? AND student_user_id = ?
        LIMIT 1;
      `).bind(user.id, studentId).first();

      if (!link || link.verification_status !== 'verified') {
        return json({
          success: false,
          error: 'ForbiddenChildAccess: Học sinh chưa được phê duyệt liên kết chính thức với tài khoản của bạn.'
        }, { status: 403 });
      }
    }

    // Check idempotency replay
    if (idempotencyKey) {
      const existing = await db.prepare(`
        SELECT * FROM parent_test_records
        WHERE parent_user_id = ? AND idempotency_key = ?
        LIMIT 1;
      `).bind(user.id, idempotencyKey).first();

      if (existing) {
        return await resolveIdempotencyReplay(existing, {
          student_user_id: studentId,
          test_name: testName,
          test_type: testType,
          score,
          max_score: maxScore,
          test_date: testDate,
          teacher_feedback: teacherFeedback,
          image_url: imageUrl
        }, payloadHash, db, user);
      }
    }

    const recordId = `ptr_${Date.now()}_${randomUUID().substring(0, 8)}`;

    let insertRes;
    try {
      if (user.role === 'parent') {
        // Atomic write-time verification: ensures link was not revoked between precheck and INSERT!
        insertRes = await db.prepare(`
          INSERT INTO parent_test_records (
            id, parent_user_id, student_user_id, test_name, test_type,
            score, max_score, test_date, teacher_feedback, image_url,
            source, status, version, idempotency_key, payload_hash, created_at, updated_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'parent_manual', 'unverified', 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          WHERE EXISTS (
            SELECT 1 FROM parent_student_links 
            WHERE parent_user_id = ? AND student_user_id = ? AND verification_status = 'verified'
          );
        `).bind(
          recordId,
          user.id,
          studentId,
          testName,
          testType,
          score,
          maxScore,
          testDate,
          teacherFeedback,
          imageUrl,
          idempotencyKey,
          payloadHash,
          user.id,
          studentId
        ).run();

        if (insertRes && insertRes.meta && typeof insertRes.meta.changes === 'number' && insertRes.meta.changes < 1) {
          return json({
            success: false,
            error: 'ForbiddenChildAccess: Liên kết phụ huynh - học sinh không còn hiệu lực xác thực tại thời điểm ghi nhận.'
          }, { status: 403 });
        }
      } else {
        // Staff insertion
        insertRes = await db.prepare(`
          INSERT INTO parent_test_records (
            id, parent_user_id, student_user_id, test_name, test_type,
            score, max_score, test_date, teacher_feedback, image_url,
            source, status, version, idempotency_key, payload_hash, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'parent_manual', 'unverified', 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        `).bind(
          recordId,
          user.id,
          studentId,
          testName,
          testType,
          score,
          maxScore,
          testDate,
          teacherFeedback,
          imageUrl,
          idempotencyKey,
          payloadHash
        ).run();
      }
    } catch (insertErr) {
      const errMsg = insertErr?.message || '';
      if (idempotencyKey && /UNIQUE constraint failed/i.test(errMsg)) {
        // Concurrent race condition on same idempotency_key
        const collisionRecord = await db.prepare(`
          SELECT * FROM parent_test_records
          WHERE parent_user_id = ? AND idempotency_key = ?
          LIMIT 1;
        `).bind(user.id, idempotencyKey).first();

        if (collisionRecord) {
          return await resolveIdempotencyReplay(collisionRecord, {
            student_user_id: studentId,
            test_name: testName,
            test_type: testType,
            score,
            max_score: maxScore,
            test_date: testDate,
            teacher_feedback: teacherFeedback,
            image_url: imageUrl
          }, payloadHash, db, user);
        }
      }
      throw insertErr;
    }

    const savedRecord = await db.prepare(`
      SELECT * FROM parent_test_records WHERE id = ?
    `).bind(recordId).first();

    // Mirror to local store cache for active session if in browser
    try {
      saveParentTestRecord({
        id: recordId,
        parent_user_id: user.id,
        student_id: studentId,
        test_name: testName,
        test_type: testType,
        score,
        max_score: maxScore,
        test_date: testDate,
        teacher_feedback: teacherFeedback,
        image_url: imageUrl,
        source: 'parent_manual',
        status: 'unverified',
        ocr_status: 'manual_entry'
      });
    } catch {}

    return json({
      success: true,
      message: 'Lưu hồ sơ điểm bài thi (Phụ huynh tự khai báo) thành công!',
      record: savedRecord
    }, { status: 201 });
  } catch (dbErr) {
    console.error('D1 save parent test error:', dbErr);
    return json({
      success: false,
      error: `DatabaseError (Fail-Closed): Không thể lưu trữ hồ sơ bài thi vào cơ sở dữ liệu (${dbErr.message}).`
    }, { status: 500 });
  }
}

/**
 * DELETE /api/parents/tests
 * Deletes a parent test record owned by the authenticated parent.
 */
export async function DELETE({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập.' }, { status: 401 });
  }

  const recordId = url.searchParams.get('id');
  if (!recordId) {
    return json({ success: false, error: 'Thiếu id hồ sơ bài thi cần xóa.' }, { status: 400 });
  }

  const db = platform?.env?.DB;
  if (!db) {
    if (!isMockAllowed(platform)) {
      return json({
        success: false,
        error: 'ServiceUnavailable: Cơ sở dữ liệu Cloudflare D1 không khả dụng hoặc chưa được cấu hình binding (fail-closed).'
      }, { status: 503 });
    }
    return json({ success: true, message: 'Đã xóa hồ sơ bài thi (mock).' });
  }

  try {
    await ensureParentTestTable(db);
    const isStaff = isStaffUser(auth.user);

    let deleteRes;
    if (isStaff) {
      deleteRes = await db.prepare('DELETE FROM parent_test_records WHERE id = ?').bind(recordId).run();
    } else {
      deleteRes = await db.prepare('DELETE FROM parent_test_records WHERE id = ? AND parent_user_id = ?')
        .bind(recordId, auth.user.id).run();
    }

    const changes = deleteRes?.meta?.changes || 0;
    if (changes < 1) {
      return json({ success: false, error: 'Không tìm thấy hồ sơ hoặc bạn không có quyền xóa hồ sơ này.' }, { status: 404 });
    }

    return json({ success: true, message: 'Đã xóa hồ sơ bài thi thành công.' });
  } catch (e) {
    console.error('D1 delete parent test error:', e);
    return json({ success: false, error: `DatabaseError: ${e.message}` }, { status: 500 });
  }
}
