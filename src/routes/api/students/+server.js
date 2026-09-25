import { json } from '@sveltejs/kit';
import { getAllUsers, addStudent, removeStudent, isTeacherOrAdmin, getCurrentUser } from '$lib/unifiedStore';

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

export async function DELETE({ url }) {
  try {
    const studentId = url.searchParams.get('id');
    if (!studentId) {
      return json({ success: false, error: 'Thiếu student id' }, { status: 400 });
    }

    const ok = removeStudent(studentId);
    return json({ success: ok, message: ok ? 'Xóa học sinh thành công' : 'Không tìm thấy học sinh' });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
