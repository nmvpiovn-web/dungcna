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
 * Ensure parent_test_records table and indexes exist in D1.
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  try {
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_parent_test_records_child 
      ON parent_test_records(parent_user_id, student_user_id);
    `).run();
  } catch {}

  try {
    await db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_test_records_idem 
      ON parent_test_records(parent_user_id, idempotency_key) 
      WHERE idempotency_key IS NOT NULL;
    `).run();
  } catch {}
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

  if (db) {
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
        query += 'parent_user_id = ? ';
        params.push(user.id);
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

  return json({
    success: true,
    records: [],
    total: 0,
    source: 'empty_fallback'
  });
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
  const studentId = body.student_id ? String(body.student_id).trim() : '';
  if (!studentId) {
    return json({ success: false, error: 'Thiếu student_id học sinh liên kết.' }, { status: 400 });
  }

  // 2. Validate test_name
  const testName = body.test_name ? String(body.test_name).trim() : '';
  if (!testName || testName.length < 2 || testName.length > 200) {
    return json({ success: false, error: 'Tên bài kiểm tra phải từ 2 đến 200 ký tự.' }, { status: 400 });
  }

  // 3. Validate test_type
  const testType = body.test_type && ALLOWED_TEST_TYPES.includes(body.test_type) ? body.test_type : 'standard_45m';

  // 4. Validate max_score
  let maxScore = Number(body.max_score);
  if (isNaN(maxScore) || !isFinite(maxScore) || maxScore <= 0 || maxScore > 100) {
    maxScore = 10;
  }

  // 5. Validate score (strictly 0 <= score <= maxScore, finite number)
  if (body.score === undefined || body.score === null || body.score === '') {
    return json({ success: false, error: 'InvalidScore: Điểm số bài thi là bắt buộc.' }, { status: 400 });
  }
  const rawScore = Number(body.score);
  if (isNaN(rawScore) || !isFinite(rawScore) || rawScore < 0 || rawScore > maxScore) {
    return json({
      success: false,
      error: `InvalidScore: Điểm số phải là số thực hữu hạn trong khoảng từ 0 đến ${maxScore}.`
    }, { status: 400 });
  }
  const score = Number(rawScore.toFixed(2));

  // 6. Validate test_date (format YYYY-MM-DD)
  const testDate = body.test_date ? String(body.test_date).trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate)) {
    return json({ success: false, error: 'InvalidDate: Ngày làm bài phải theo định dạng YYYY-MM-DD.' }, { status: 400 });
  }
  const parsedDate = new Date(testDate);
  if (isNaN(parsedDate.getTime())) {
    return json({ success: false, error: 'InvalidDate: Ngày làm bài không hợp lệ.' }, { status: 400 });
  }

  // 7. Optional fields
  const teacherFeedback = body.teacher_feedback ? String(body.teacher_feedback).trim().slice(0, 1000) : '';
  const imageUrl = body.image_url ? String(body.image_url).trim().slice(0, 500000) : '';
  const idempotencyKey = body.idempotency_key ? String(body.idempotency_key).trim().slice(0, 128) : null;

  const db = platform?.env?.DB;

  if (db) {
    try {
      await ensureParentTestTable(db);

      // Parent actor: check verified parent-child link
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
          return json({
            success: true,
            message: 'Đã ghi nhận bài thi (Idempotent replay).',
            record: existing,
            replayed: true
          }, { status: 200 });
        }
      }

      const recordId = `ptr_${Date.now()}_${randomUUID().substring(0, 8)}`;

      // Strictly label: source='parent_manual', status='unverified'
      // This record is NEVER treated as teacher-verified and NEVER affects student stars or tuition!
      const insertRes = await db.prepare(`
        INSERT INTO parent_test_records (
          id, parent_user_id, student_user_id, test_name, test_type,
          score, max_score, test_date, teacher_feedback, image_url,
          source, status, version, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'parent_manual', 'unverified', 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
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
        idempotencyKey
      ).run();

      if (insertRes && insertRes.meta && typeof insertRes.meta.changes === 'number' && insertRes.meta.changes < 1) {
        throw new Error('D1 insert parent test record affected 0 rows');
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
  if (db) {
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

  return json({ success: true, message: 'Đã xóa hồ sơ bài thi (mock).' });
}
