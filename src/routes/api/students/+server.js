import { json } from '@sveltejs/kit';
import { 
  getAllUsers, 
  addStudent, 
  removeStudent, 
  updateUserGradeAndClass, 
  enrollStudentAdditionalGrade, 
  removeStudentEnrolledGrade, 
  requestUnlockClass, 
  updateUserProfile,
  isTeacherOrAdmin, 
} from '../../../lib/unifiedStore.js';

export const prerender = false;

export async function GET({ url, platform }) {
  if (platform?.env?.DB) {
    try {
      const d1Res = await platform.env.DB.prepare("SELECT * FROM users WHERE role = 'student' ORDER BY created_at DESC").all();
      if (d1Res?.results?.length > 0) {
        return json({
          success: true,
          total: d1Res.results.length,
          students: d1Res.results,
          source: 'cloudflare_d1'
        });
      }
    } catch (e) {
      console.error('D1 students query error:', e);
    }
  }

  const users = getAllUsers();
  const students = users.filter(u => u.role === 'student');
  return json({
    success: true,
    total: students.length,
    students,
    source: 'local_store'
  });
}

export async function POST({ request, platform }) {
  try {
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
      }
    }

    return json({
      success: true,
      message: 'Thêm học sinh thành công vào hệ thống!',
      student: newStudent
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH({ request, platform }) {
  try {
    const body = await request.json();
    const action = body.action || 'change_grade';
    const studentId = body.student_id || body.id;
    const operator = body.operator || null;

    if (!studentId && action !== 'bulk_sync') {
      return json({ success: false, error: 'Thiếu student_id' }, { status: 400 });
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
      result
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export const PUT = PATCH;

export async function DELETE({ url, platform }) {
  try {
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
