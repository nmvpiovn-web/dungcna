// src/routes/api/students/+server.js
import { json } from '@sveltejs/kit';
import { 
  getAllUsers, 
  addStudent, 
  removeStudent, 
  updateUserGradeAndClass, 
  enrollStudentAdditionalGrade, 
  removeStudentEnrolledGrade, 
  requestUnlockClass, 
  updateUserProfile 
} from '../../../lib/unifiedStore.js';
import { verifyServerAuth, isStaffUser, sanitizeUser, sanitizeUserList } from '../../../lib/server/auth.js';

export const prerender = false;

/**
 * GET /api/students
 * Server-side authentication and role-scoping.
 * Excludes sensitive fields (passwords) from all returned payloads.
 */
export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ 
      success: false, 
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập để truy cập dữ liệu học sinh.' 
    }, { status: auth.status || 401 });
  }

  const requestedStudentId = url.searchParams.get('id');
  const isStaff = isStaffUser(auth.user);

  // If requester is a student, they are ONLY allowed to access their own profile
  if (!isStaff) {
    if (!requestedStudentId || requestedStudentId !== auth.user.id) {
      return json({ 
        success: false, 
        error: 'Forbidden: Học sinh chỉ có quyền xem thông tin cá nhân của chính mình.' 
      }, { status: 403 });
    }
  }

  // 1. Try Cloudflare D1 if available
  if (platform?.env?.DB) {
    try {
      if (requestedStudentId) {
        const d1Student = await platform.env.DB.prepare(`
          SELECT id, username, phone, email, name, role, avatar, status, metadata, created_at, updated_at
          FROM users 
          WHERE role = 'student' AND (id = ? OR username = ?)
          LIMIT 1
        `).bind(requestedStudentId, requestedStudentId).first();

        if (d1Student) {
          return json({
            success: true,
            student: sanitizeUser(d1Student),
            source: 'cloudflare_d1'
          });
        }
      } else {
        const d1Res = await platform.env.DB.prepare(`
          SELECT id, username, phone, email, name, role, avatar, status, metadata, created_at, updated_at
          FROM users 
          WHERE role = 'student' 
          ORDER BY created_at DESC
        `).all();

        if (d1Res?.results?.length > 0) {
          return json({
            success: true,
            total: d1Res.results.length,
            students: sanitizeUserList(d1Res.results),
            source: 'cloudflare_d1'
          });
        }
      }
    } catch (e) {
      console.error('D1 students query error:', e);
      return json({ success: false, error: 'Lỗi truy vấn cơ sở dữ liệu Cloudflare D1: ' + (e.message || String(e)) }, { status: 500 });
    }
  } else if (platform?.env?.ENABLE_LOCAL_MOCK === 'true' || process.env.ENABLE_LOCAL_MOCK === 'true') {
    // 2. Fallback to local store with strict password sanitization (Mock environment only)
    const users = getAllUsers();
    const students = users.filter(u => u.role === 'student');

    if (requestedStudentId) {
      const single = students.find(s => s.id === requestedStudentId || s.username === requestedStudentId);
      if (!single) {
        return json({ success: false, error: 'Không tìm thấy thông tin học sinh' }, { status: 404 });
      }
      return json({
        success: true,
        student: sanitizeUser(single),
        source: 'local_store'
      });
    }

    return json({
      success: true,
      total: students.length,
      students: sanitizeUserList(students),
      source: 'local_store'
    });
  } else {
    return json({
      success: false,
      error: 'Lỗi cấu hình hệ thống: Thiếu binding cơ sở dữ liệu Cloudflare D1 (DB) trên môi trường production (Fail-Closed).'
    }, { status: 500 });
  }
}

/**
 * POST /api/students
 * Creates a new student record (Staff only: Admin, Leader, Teacher).
 */
export async function POST({ request, platform }) {
  try {
    const auth = await verifyServerAuth(request, platform);
    if (!auth.authenticated) {
      return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập.' }, { status: auth.status || 401 });
    }

    if (!isStaffUser(auth.user)) {
      return json({ success: false, error: 'Forbidden: Chỉ giáo viên hoặc quản trị viên mới có quyền thêm học sinh.' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.name) {
      return json({ success: false, error: 'Tên học sinh là bắt buộc' }, { status: 400 });
    }

    const newStudent = addStudent({
      name: body.name,
      username: body.username,
      phone: body.phone,
      password: body.password || '123',
      email: body.email,
      grade: body.grade || 'Lớp 7',
      school: body.school || '',
      target: body.target || '',
      parent_name: body.parent_name || '',
      parent_phone: body.parent_phone || '',
      parent_zalo_id: body.parent_zalo_id || '',
      class_id: body.class_id || 'GENERAL'
    });

    if (platform?.env?.DB) {
      try {
        await platform.env.DB.prepare(`
          INSERT INTO users (id, username, phone, password, email, name, role, avatar, status, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP;
        `).bind(
          newStudent.id, newStudent.username, newStudent.phone, newStudent.password,
          newStudent.email, newStudent.name, 'student', newStudent.avatar,
          'active', newStudent.metadata
        ).run();
      } catch (d1Err) {
        console.error('D1 insert error:', d1Err);
        return json({
          success: false,
          error: 'Lỗi ghi cơ sở dữ liệu Cloudflare D1: ' + (d1Err.message || String(d1Err))
        }, { status: 500 });
      }
    }

    return json({
      success: true,
      message: 'Thêm học sinh thành công vào hệ thống!',
      student: sanitizeUser(newStudent)
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/students
 * Performs profile updates, grade transfers, and enrollment modifications.
 */
export async function PATCH({ request, platform }) {
  try {
    const auth = await verifyServerAuth(request, platform);
    if (!auth.authenticated) {
      return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập.' }, { status: auth.status || 401 });
    }

    const body = await request.json();
    const action = body.action || 'change_grade';
    const studentId = body.student_id || body.id;
    const operator = body.operator || auth.user;
    const isStaff = isStaffUser(auth.user);

    if (!studentId && action !== 'bulk_sync') {
      return json({ success: false, error: 'Thiếu student_id' }, { status: 400 });
    }

    // Role-scoping checks:
    // Only staff can change primary grade or add/remove enrolled grades
    if (['change_grade', 'add_enrolled_grade', 'remove_enrolled_grade'].includes(action)) {
      if (!isStaff) {
        return json({ 
          success: false, 
          error: 'Forbidden: Chỉ giáo viên hoặc quản trị viên mới có quyền thay đổi phân quyền lớp học.' 
        }, { status: 403 });
      }
    }

    // For updating profile: students can only update their own profile
    if (action === 'update_profile') {
      if (!isStaff && studentId !== auth.user.id) {
        return json({ 
          success: false, 
          error: 'Forbidden: Bạn chỉ có thể cập nhật hồ sơ của chính mình.' 
        }, { status: 403 });
      }
    }

    let result = null;

    switch (action) {
      case 'change_grade': {
        if (!body.grade) return json({ success: false, error: 'Thiếu grade mới' }, { status: 400 });
        result = updateUserGradeAndClass(studentId, body.grade, body.class_id || '', operator);
        if (platform?.env?.DB && result.success) {
          try {
            await platform.env.DB.prepare(`
              UPDATE users SET metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `).bind(result.user.metadata, studentId).run();
          } catch (e) {
            console.error('D1 update grade error:', e);
          }
        }
        break;
      }

      case 'add_enrolled_grade': {
        if (!body.grade) return json({ success: false, error: 'Thiếu grade cần set thêm' }, { status: 400 });
        result = enrollStudentAdditionalGrade(studentId, body.grade, operator);
        if (platform?.env?.DB && result.success) {
          try {
            await platform.env.DB.prepare(`
              UPDATE users SET metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `).bind(result.user.metadata, studentId).run();
          } catch (e) {
            console.error('D1 add enrolled grade error:', e);
          }
        }
        break;
      }

      case 'remove_enrolled_grade': {
        if (!body.grade) return json({ success: false, error: 'Thiếu grade cần gỡ' }, { status: 400 });
        result = removeStudentEnrolledGrade(studentId, body.grade, operator);
        if (platform?.env?.DB && result.success) {
          try {
            await platform.env.DB.prepare(`
              UPDATE users SET metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `).bind(result.user.metadata, studentId).run();
          } catch (e) {
            console.error('D1 remove enrolled grade error:', e);
          }
        }
        break;
      }

      case 'request_class_transfer': {
        if (!body.target_grade) return json({ success: false, error: 'Thiếu target_grade mong muốn' }, { status: 400 });
        result = await requestUnlockClass(studentId, body.target_grade, body.note || '');
        break;
      }

      case 'update_profile': {
        result = updateUserProfile(studentId, body.updates || {}, operator);
        if (platform?.env?.DB && result.success) {
          try {
            const u = result.user;
            await platform.env.DB.prepare(`
              UPDATE users SET name = ?, phone = ?, email = ?, avatar = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `).bind(u.name, u.phone, u.email, u.avatar, u.metadata, studentId).run();
          } catch (e) {
            console.error('D1 update profile error:', e);
          }
        }
        break;
      }

      default:
        return json({ success: false, error: `Hành động '${action}' không hợp lệ!` }, { status: 400 });
    }

    if (!result || !result.success) {
      return json({ success: false, error: result?.error || 'Thao tác không thành công!' }, { status: 400 });
    }

    return json({
      success: true,
      action,
      result: {
        ...result,
        user: sanitizeUser(result.user)
      }
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export const PUT = PATCH;

/**
 * DELETE /api/students
 * Staff only
 */
export async function DELETE({ url, request, platform }) {
  try {
    const auth = await verifyServerAuth(request, platform);
    if (!auth.authenticated) {
      return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập.' }, { status: 401 });
    }

    if (!isStaffUser(auth.user)) {
      return json({ success: false, error: 'Forbidden: Chỉ quản trị viên mới có quyền xóa học sinh.' }, { status: 403 });
    }

    const studentId = url.searchParams.get('id');
    if (!studentId) {
      return json({ success: false, error: 'Thiếu student id' }, { status: 400 });
    }

    const ok = removeStudent(studentId);

    if (platform?.env?.DB && ok) {
      try {
        await platform.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(studentId).run();
      } catch (e) {
        console.error('D1 delete user error:', e);
      }
    }

    return json({ success: ok, message: ok ? 'Xóa học sinh thành công' : 'Không tìm thấy học sinh' });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
