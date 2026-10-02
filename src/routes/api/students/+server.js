import { json } from '@sveltejs/kit';
import { getAllUsers, addStudent, removeStudent, updateUserGradeAndClass, enrollStudentAdditionalGrade, removeStudentEnrolledGrade, requestUnlockClass } from '../../../lib/unifiedStore.js';
import { verifyServerAuth, isStaffUser, isManager, sanitizeUser, sanitizeUserList, hashPassword } from '../../../lib/server/auth.js';

export const prerender = false;
// EP-M2: isManager is now the shared, lowercase-normalized helper in lib/server/auth.js
const GRADE_ACTIONS = new Set(['change_grade', 'add_enrolled_grade', 'remove_enrolled_grade']);
const localMockEnabled = (platform) => platform?.env?.ENABLE_LOCAL_MOCK === 'true' || (typeof process !== 'undefined' && process.env?.ENABLE_LOCAL_MOCK === 'true');
const parseMetadata = (value) => { try { return typeof value === 'string' ? JSON.parse(value || '{}') : { ...(value || {}) }; } catch { return {}; } };
const dbError = () => json({ success: false, error: 'DatabaseError: Thao tác Cloudflare D1 thất bại.' }, { status: 503 });

export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });
  const requestedId = url.searchParams.get('id');
  if (!isStaffUser(auth.user) && (!requestedId || requestedId !== auth.user.id)) {
    return json({ success: false, error: 'Forbidden: Học sinh chỉ được xem hồ sơ của chính mình.' }, { status: 403 });
  }
  const db = platform?.env?.DB;
  if (db) {
    try {
      if (requestedId) {
        const row = await db.prepare(`SELECT id, username, phone, email, name, role, avatar, status, metadata, COALESCE(profile_version,0) profile_version, created_at, updated_at FROM users WHERE role='student' AND (id=? OR username=?) LIMIT 1`).bind(requestedId, requestedId).first();
        if (!row) return json({ success: false, error: 'Không tìm thấy học sinh.' }, { status: 404 });
        return json({ success: true, student: sanitizeUser(row), source: 'cloudflare_d1' });
      }
      const result = await db.prepare(`SELECT id, username, phone, email, name, role, avatar, status, metadata, COALESCE(profile_version,0) profile_version, created_at, updated_at FROM users WHERE role='student' ORDER BY created_at DESC`).all();
      const students = result?.results || [];
      return json({ success: true, total: students.length, students: sanitizeUserList(students), source: 'cloudflare_d1' });
    } catch (error) { console.error('D1 students GET error:', error); return dbError(); }
  }
  if (!localMockEnabled(platform)) return json({ success: false, error: 'DatabaseUnavailable: Thiếu D1 binding.' }, { status: 503 });
  const students = getAllUsers().filter((user) => user.role === 'student');
  if (requestedId) {
    const row = students.find((user) => user.id === requestedId || user.username === requestedId);
    return row ? json({ success: true, student: sanitizeUser(row), source: 'local_mock' }) : json({ success: false, error: 'Không tìm thấy học sinh.' }, { status: 404 });
  }
  return json({ success: true, total: students.length, students: sanitizeUserList(students), source: 'local_mock' });
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });
  if (!isManager(auth.user)) return json({ success: false, error: 'Forbidden: Chỉ admin/leader/superadmin được tạo học sinh.' }, { status: 403 });
  let body; try { body = await request.json(); } catch { return json({ success: false, error: 'Invalid JSON.' }, { status: 400 }); }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const grade = typeof body.grade === 'string' ? body.grade.trim() : '';
  if (!name || !/^[a-z0-9_]{3,30}$/.test(username) || password.length < 6 || !grade) return json({ success: false, error: 'ValidationError: name, username, password >= 6 ký tự và grade tường minh là bắt buộc.' }, { status: 400 });
  const id = `usr_student_${crypto.randomUUID()}`;
  const metadata = { grade, enrolled_grades: [grade], school: String(body.school || '').trim(), target: String(body.target || '').trim(), parent_name: String(body.parent_name || '').trim(), parent_phone: String(body.parent_phone || '').trim(), parent_zalo_id: String(body.parent_zalo_id || '').trim(), class_id: String(body.class_id || '').trim() };
  const passwordHash = await hashPassword(password);
  const db = platform?.env?.DB;
  if (db) {
    try {
      await db.prepare(`INSERT INTO users (id,username,phone,password,email,name,role,avatar,status,metadata,profile_version) VALUES (?,?,?,?,?,?,'student',?,'active',?,0)`).bind(id, username, body.phone || null, passwordHash, body.email || null, name, body.avatar || '', JSON.stringify(metadata)).run();
    } catch (error) {
      console.error('D1 student POST error:', error);
      return /unique|constraint/i.test(String(error?.message || error)) ? json({ success: false, error: 'ConflictError: Username/phone/email đã tồn tại.' }, { status: 409 }) : dbError();
    }
    return json({ success: true, student: sanitizeUser({ id, username, name, phone: body.phone || null, email: body.email || null, role: 'student', status: 'active', metadata: JSON.stringify(metadata), profile_version: 0 }) }, { status: 201 });
  }
  if (!localMockEnabled(platform)) return json({ success: false, error: 'DatabaseUnavailable: Thiếu D1 binding.' }, { status: 503 });
  return json({ success: true, student: sanitizeUser(addStudent({ ...body, id, name, username, password: passwordHash, grade, class_id: metadata.class_id })), source: 'local_mock' }, { status: 201 });
}

export async function PATCH({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });
  let body; try { body = await request.json(); } catch { return json({ success: false, error: 'Invalid JSON.' }, { status: 400 }); }
  if (Object.prototype.hasOwnProperty.call(body, 'operator')) return json({ success: false, error: 'PrivilegeEscalationAttempt: operator chỉ được lấy từ session server.' }, { status: 400 });
  const action = body.action || 'change_grade';
  const studentId = body.student_id || body.id;
  if (!studentId) return json({ success: false, error: 'Thiếu student_id.' }, { status: 400 });
  if (action === 'update_profile') return json({ success: false, error: 'DeprecatedEndpoint: Dùng /api/users/profile với profile_version CAS.' }, { status: 410 });
  if (GRADE_ACTIONS.has(action) && !isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden: Chỉ staff được thay đổi phân lớp.' }, { status: 403 });
  if (action === 'request_class_transfer' && studentId !== auth.user.id && !isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden: Không được tạo yêu cầu cho học sinh khác.' }, { status: 403 });
  if (!GRADE_ACTIONS.has(action) && action !== 'request_class_transfer' && action !== 'set_status') return json({ success: false, error: `Hành động '${action}' không hợp lệ.` }, { status: 400 });
  const db = platform?.env?.DB;
  if (db) {
    try {
      const row = await db.prepare(`SELECT id,role,metadata,COALESCE(profile_version,0) profile_version FROM users WHERE id=? LIMIT 1`).bind(studentId).first();
      if (!row || row.role !== 'student') return json({ success: false, error: 'Không tìm thấy học sinh.' }, { status: 404 });
      // Khóa/mở tài khoản — chỉ staff
      if (action === 'set_status') {
        if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden: Chỉ staff được khóa/mở tài khoản.' }, { status: 403 });
        const status = String(body.status || '').trim();
        if (!['active', 'locked', 'suspended'].includes(status)) return json({ success: false, error: 'Trạng thái không hợp lệ (active/locked/suspended).' }, { status: 400 });
        const metadata = parseMetadata(row.metadata);
        metadata.account_status = status;
        const result = await db.prepare(`UPDATE users SET metadata=?,profile_version=COALESCE(profile_version,0)+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND COALESCE(profile_version,0)=?`).bind(JSON.stringify(metadata), studentId, row.profile_version).run();
        if ((result?.meta?.changes ?? result?.changes ?? 0) !== 1) return json({ success: false, error: 'ConcurrencyConflict: Hồ sơ đã thay đổi.' }, { status: 409 });
        return json({ success: true, action, student_id: studentId, status, profile_version: row.profile_version + 1 });
      }
      const metadata = parseMetadata(row.metadata);
      const enrolled = Array.isArray(metadata.enrolled_grades) ? [...new Set(metadata.enrolled_grades)] : (metadata.grade ? [metadata.grade] : []);
      if (action === 'change_grade') {
        const grade = typeof body.grade === 'string' ? body.grade.trim() : ''; if (!grade) return json({ success: false, error: 'Thiếu grade mới.' }, { status: 400 });
        metadata.grade = grade; metadata.class_id = String(body.class_id || '').trim(); metadata.enrolled_grades = [...new Set([...enrolled, grade])];
      } else if (action === 'add_enrolled_grade') {
        const grade = typeof body.grade === 'string' ? body.grade.trim() : ''; if (!grade) return json({ success: false, error: 'Thiếu grade cần thêm.' }, { status: 400 }); metadata.enrolled_grades = [...new Set([...enrolled, grade])];
      } else if (action === 'remove_enrolled_grade') {
        const grade = typeof body.grade === 'string' ? body.grade.trim() : ''; if (!grade) return json({ success: false, error: 'Thiếu grade cần gỡ.' }, { status: 400 }); if (grade === metadata.grade) return json({ success: false, error: 'ConflictError: Không thể gỡ khối lớp chính.' }, { status: 409 }); metadata.enrolled_grades = enrolled.filter((item) => item !== grade);
      } else {
        const targetGrade = typeof body.target_grade === 'string' ? body.target_grade.trim() : ''; if (!targetGrade) return json({ success: false, error: 'Thiếu target_grade.' }, { status: 400 }); metadata.pending_class_transfer = { target_grade: targetGrade, note: String(body.note || '').trim(), requested_by: auth.user.id, requested_at: new Date().toISOString() };
      }
      const result = await db.prepare(`UPDATE users SET metadata=?,profile_version=COALESCE(profile_version,0)+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND COALESCE(profile_version,0)=?`).bind(JSON.stringify(metadata), studentId, row.profile_version).run();
      if ((result?.meta?.changes ?? result?.changes ?? 0) !== 1) return json({ success: false, error: 'ConcurrencyConflict: Hồ sơ đã thay đổi.' }, { status: 409 });
      return json({ success: true, action, student_id: studentId, metadata, profile_version: row.profile_version + 1 });
    } catch (error) { console.error('D1 student PATCH error:', error); return dbError(); }
  }
  if (!localMockEnabled(platform)) return json({ success: false, error: 'DatabaseUnavailable: Thiếu D1 binding.' }, { status: 503 });
  let result;
  if (action === 'change_grade') result = updateUserGradeAndClass(studentId, body.grade, body.class_id || '', auth.user);
  if (action === 'add_enrolled_grade') result = enrollStudentAdditionalGrade(studentId, body.grade, auth.user);
  if (action === 'remove_enrolled_grade') result = removeStudentEnrolledGrade(studentId, body.grade, auth.user);
  if (action === 'request_class_transfer') result = await requestUnlockClass(studentId, body.target_grade, body.note || '');
  return result?.success ? json({ success: true, action, result: { ...result, user: sanitizeUser(result.user) }, source: 'local_mock' }) : json({ success: false, error: result?.error || 'Thao tác thất bại.' }, { status: 400 });
}

export const PUT = PATCH;

export async function DELETE({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });
  if (!isManager(auth.user)) return json({ success: false, error: 'Forbidden: Chỉ admin/leader/superadmin được xóa học sinh.' }, { status: 403 });
  const studentId = url.searchParams.get('id'); if (!studentId) return json({ success: false, error: 'Thiếu student id.' }, { status: 400 });
  const db = platform?.env?.DB;
  if (db) {
    try {
      const result = await db.prepare("DELETE FROM users WHERE id=? AND role='student'").bind(studentId).run();
      if ((result?.meta?.changes ?? result?.changes ?? 0) !== 1) return json({ success: false, error: 'Không tìm thấy học sinh.' }, { status: 404 });
      return json({ success: true, message: 'Xóa học sinh thành công.' });
    } catch (error) { console.error('D1 student DELETE error:', error); return dbError(); }
  }
  if (!localMockEnabled(platform)) return json({ success: false, error: 'DatabaseUnavailable: Thiếu D1 binding.' }, { status: 503 });
  const ok = removeStudent(studentId); return json({ success: ok, message: ok ? 'Xóa học sinh thành công.' : 'Không tìm thấy học sinh.' }, { status: ok ? 200 : 404 });
}
