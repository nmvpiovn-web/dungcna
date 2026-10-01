// src/routes/api/attendance/+server.js
import { json } from '@sveltejs/kit';
import { 
  getAllAttendanceRecords, 
  getAttendanceForSession, 
  saveSessionAttendanceBatch, 
  getAttendanceStatsForStudent,
  getAttendedStudentsForSession
} from '../../../lib/unifiedStore.js';
import { verifyServerAuth, isStaffUser, isManager } from '../../../lib/server/auth.js';

export const prerender = false;

/**
 * GET /api/attendance
 * Retrieves attendance records with strict authentication and role-scoping.
 * Queries Cloudflare D1 first, falling back to local unifiedStore.
 */
export async function GET({ url, request, platform }) {
  try {
    const auth = await verifyServerAuth(request, platform);
    if (!auth.authenticated) {
      return json({ 
        success: false, 
        error: auth.error || 'Unauthorized: Vui lòng đăng nhập để xem thông tin điểm danh.' 
      }, { status: auth.status || 401 });
    }

    const sessionId = url.searchParams.get('session_id');
    const date = url.searchParams.get('date') || url.searchParams.get('session_date');
    const studentId = url.searchParams.get('student_id');
    const attendedOnly = url.searchParams.get('attended_only') === 'true';
    const isStaff = isStaffUser(auth.user);
    const role = String(auth.user.role || '').toLowerCase();

    // Privacy isolation for students and verified parents.
    if (!isStaff) {
      if (!studentId) return json({ success: false, error: 'Forbidden: Cần chọn học sinh được phép xem.' }, { status: 403 });
      if (role === 'student' && studentId !== auth.user.id) {
        return json({ success: false, error: 'Forbidden: Học sinh chỉ được xem điểm danh của chính mình.' }, { status: 403 });
      }
      if (role === 'parent') {
        if (!platform?.env?.DB) return json({ success: false, error: 'Không thể xác minh liên kết phụ huynh.' }, { status: 503 });
        const link = await platform.env.DB.prepare(`
          SELECT 1 FROM parent_student_links
          WHERE parent_user_id = ? AND student_user_id = ? AND verification_status = 'verified'
          LIMIT 1
        `).bind(auth.user.id, studentId).first();
        if (!link) return json({ success: false, error: 'Forbidden: Liên kết phụ huynh chưa được xác minh.' }, { status: 403 });
      } else if (role !== 'student') {
        return json({ success: false, error: 'Forbidden: Vai trò không có quyền xem điểm danh.' }, { status: 403 });
      }
    }

    // 1. Try Cloudflare D1 Database
    if (platform?.env?.DB) {
      try {
        let query = 'SELECT * FROM attendance_records';
        let params = [];
        let conditions = [];

        if (sessionId) {
          conditions.push('session_id = ?');
          params.push(sessionId);
        }
        if (date) {
          conditions.push('session_date = ?');
          params.push(date);
        }
        if (studentId) {
          conditions.push('student_id = ?');
          params.push(studentId);
        }
        if (attendedOnly) {
          conditions.push("status = 'present'");
        }

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY session_date DESC, created_at DESC LIMIT 500';

        const d1Res = await platform.env.DB.prepare(query).bind(...params).all();
        if (d1Res?.results) {
          if (studentId) {
            const list = d1Res.results;
            const present = list.filter(r => r.status === 'present').length;
            const late = list.filter(r => r.status === 'late').length;
            const absentExcused = list.filter(r => r.status === 'absent_excused').length;
            const absentUnexcused = list.filter(r => r.status === 'absent_unexcused').length;
            const total = list.length;
            const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 100) : 100;

            return json({
              success: true,
              total,
              records: list,
              stats: {
                student_id: studentId,
                total_sessions: total,
                present_count: present,
                late_count: late,
                absent_excused: absentExcused,
                absent_unexcused: absentUnexcused,
                attendance_rate: attendanceRate
              },
              source: 'cloudflare_d1'
            });
          }

          if (sessionId && attendedOnly) {
            return json({
              success: true,
              total: d1Res.results.length,
              students: d1Res.results.map(r => ({
                id: r.student_id,
                name: r.student_name,
                class_id: r.class_id,
                status: r.status,
                attitude: r.in_class_attitude
              })),
              source: 'cloudflare_d1'
            });
          }

          return json({
            success: true,
            total: d1Res.results.length,
            records: d1Res.results,
            source: 'cloudflare_d1'
          });
        }
      } catch (d1Err) {
        console.error('D1 attendance GET error:', d1Err);
        return json({
          success: false,
          error: 'Lỗi truy vấn cơ sở dữ liệu Cloudflare D1: ' + (d1Err.message || String(d1Err))
        }, { status: 500 });
      }
    } else if (platform?.env?.ENABLE_LOCAL_MOCK === 'true' || process.env.ENABLE_LOCAL_MOCK === 'true') {
      // 2. Fallback to unifiedStore ONLY when ENABLE_LOCAL_MOCK is explicitly enabled
      if (sessionId && attendedOnly) {
        const students = getAttendedStudentsForSession(sessionId, date);
        return json({ success: true, total: students.length, students, source: 'local_store' });
      }

      if (studentId) {
        const stats = getAttendanceStatsForStudent(studentId);
        return json({ success: true, stats, source: 'local_store' });
      }

      if (sessionId) {
        const records = getAttendanceForSession(sessionId, date);
        return json({ success: true, total: records.length, records, source: 'local_store' });
      }

      const all = getAllAttendanceRecords();
      return json({ success: true, total: all.length, records: all, source: 'local_store' });
    } else {
      return json({
        success: false,
        error: 'Lỗi cấu hình hệ thống: Thiếu binding cơ sở dữ liệu Cloudflare D1 (DB) trên môi trường production (Fail-Closed).'
      }, { status: 500 });
    }
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/attendance
 * Saves attendance roll-call batch directly into Cloudflare D1 with strict auth.
 */
export async function POST({ request, platform }) {
  try {
    const auth = await verifyServerAuth(request, platform);
    if (!auth.authenticated) {
      return json({ 
        success: false, 
        error: auth.error || 'Unauthorized: Vui lòng đăng nhập.' 
      }, { status: auth.status || 401 });
    }

    if (!isStaffUser(auth.user)) {
      return json({ 
        success: false, 
        error: 'Forbidden: Chỉ giáo viên hoặc quản trị viên mới có quyền lưu điểm danh.' 
      }, { status: 403 });
    }

    const body = await request.json();
    const sessionId = body.session_id;
    const sessionDate = body.session_date || new Date().toISOString().slice(0, 10);
    const attendanceList = body.students || [];

    if (!sessionId || !Array.isArray(attendanceList) || attendanceList.length === 0) {
      return json({ 
        success: false, 
        error: 'Thiếu thông tin buổi học hoặc danh sách điểm danh (cần ít nhất 1 học sinh)' 
      }, { status: 400 });
    }

    if (!platform?.env?.DB) {
      return json({ success: false, error: 'Thiếu Cloudflare D1 DB; điểm danh bị từ chối để bảo toàn dữ liệu.' }, { status: 503 });
    }

    const session = await platform.env.DB.prepare('SELECT * FROM class_sessions WHERE id = ? LIMIT 1').bind(sessionId).first();
    if (!session) return json({ success: false, error: 'Không tìm thấy buổi học.' }, { status: 404 });
    if (!isManager(auth.user)) {
      const ownsSession = [session.teacher_id, session.assistant_teacher_id, session.substitute_teacher_id].includes(auth.user.id);
      if (!ownsSession) return json({ success: false, error: 'Forbidden: Bạn không phụ trách buổi học này.' }, { status: 403 });
    }

    const teacherUser = auth.user;
    const teacherId = auth.user.id;
    const teacherName = auth.user.name || auth.user.username || 'Giáo viên';
    const nowIso = new Date().toISOString();
    const allowedStatuses = new Set(['present', 'late', 'absent_excused', 'absent_unexcused']);
    const uniqueStudentIds = [...new Set(attendanceList.map((item) => item.student_id || item.id).filter(Boolean))];
    if (uniqueStudentIds.length !== attendanceList.length) {
      return json({ success: false, error: 'Danh sách điểm danh có học sinh thiếu ID hoặc bị trùng.' }, { status: 400 });
    }
    const enrollmentChecks = await Promise.all(uniqueStudentIds.map((studentId) =>
      platform.env.DB.prepare(`
        SELECT 1 FROM class_enrollments
        WHERE user_id = ? AND class_id = ? AND status = 'active' LIMIT 1
      `).bind(studentId, session.class_id).first()
    ));
    if (enrollmentChecks.some((row) => !row)) {
      return json({ success: false, error: 'Danh sách có học sinh không thuộc lớp của buổi học.' }, { status: 400 });
    }

    // Prepare standardized records with strict NaN defense
    const preparedRecords = attendanceList.map(item => {
      const studentId = item.student_id || item.id;
      const studentName = item.student_name || item.name || 'Học sinh';
      const status = allowedStatuses.has(item.status) ? item.status : 'present';
      const instantStars = status === 'present' ? 5 : 0;

      return {
        id: item.id || `att_${sessionId}_${sessionDate}_${studentId}`,
        session_id: sessionId,
        session_date: sessionDate,
        student_id: studentId,
        student_name: studentName,
        class_id: session.class_id || '',
        status: status,
        notes: item.notes || '',
        in_class_attitude: item.in_class_attitude || 'Tập trung học tập tốt',
        instant_stars_rewarded: instantStars,
        marked_by_teacher_id: teacherId,
        marked_by_teacher_name: teacherName,
        created_at: item.created_at || nowIso
      };
    });

    // 1. Persist directly to Cloudflare D1 Database
    let d1SavedCount = 0;
    if (platform?.env?.DB) {
      try {
        const statements = preparedRecords.map(r => 
          platform.env.DB.prepare(`
            INSERT INTO attendance_records (
              id, session_id, session_date, student_id, student_name, class_id,
              status, notes, in_class_attitude, instant_stars_rewarded,
              marked_by_teacher_id, marked_by_teacher_name, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              status = excluded.status,
              notes = excluded.notes,
              in_class_attitude = excluded.in_class_attitude,
              instant_stars_rewarded = excluded.instant_stars_rewarded,
              marked_by_teacher_id = excluded.marked_by_teacher_id,
              marked_by_teacher_name = excluded.marked_by_teacher_name;
          `).bind(
            r.id, r.session_id, r.session_date, r.student_id, r.student_name, r.class_id,
            r.status, r.notes, r.in_class_attitude, r.instant_stars_rewarded,
            r.marked_by_teacher_id, r.marked_by_teacher_name, r.created_at
          )
        );

        await platform.env.DB.batch(statements);
        d1SavedCount = preparedRecords.length;
      } catch (d1Err) {
        console.error('D1 attendance batch insert error:', d1Err);
        return json({
          success: false,
          error: 'Lỗi ghi cơ sở dữ liệu Cloudflare D1: ' + (d1Err.message || String(d1Err))
        }, { status: 500 });
      }
    }

    // 2. Also execute unifiedStore batch function for reactive events & bot alerts
    let savedRecords = [];
    try {
      savedRecords = saveSessionAttendanceBatch(sessionId, sessionDate, preparedRecords, teacherUser);
    } catch (storeErr) {
      console.warn('unifiedStore attendance fallback warning:', storeErr);
      savedRecords = preparedRecords;
    }

    return json({
      success: true,
      message: `Đã lưu điểm danh cho ${preparedRecords.length} học sinh thành công!`,
      d1_synced: d1SavedCount > 0,
      d1_records_count: d1SavedCount,
      records: preparedRecords,
      source: platform?.env?.DB ? 'cloudflare_d1' : 'local_store'
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
