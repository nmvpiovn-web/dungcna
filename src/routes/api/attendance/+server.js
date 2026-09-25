// src/routes/api/attendance/+server.js
import { json } from '@sveltejs/kit';
import { 
  getAllAttendanceRecords, 
  getAttendanceForSession, 
  saveSessionAttendanceBatch, 
  getAttendanceStatsForStudent,
  getAttendedStudentsForSession,
  getAllClassSessions,
  dispatchBotReport,
  addLeaderNotification
} from '../../../lib/unifiedStore.js';

export const prerender = false;

/**
 * GET /api/attendance
 * Retrieves attendance records with multi-criteria filtering.
 * Queries Cloudflare D1 first, falling back to local unifiedStore.
 */
export async function GET({ url, platform }) {
  try {
    const sessionId = url.searchParams.get('session_id');
    const date = url.searchParams.get('date') || url.searchParams.get('session_date');
    const studentId = url.searchParams.get('student_id');
    const attendedOnly = url.searchParams.get('attended_only') === 'true';

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
        if (d1Res?.results && d1Res.results.length > 0) {
          // If specific student stats requested
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
      }
    }

    // 2. Fallback to unifiedStore
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
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/attendance
 * Saves attendance roll-call batch directly into Cloudflare D1 and updates notification/bot systems.
 */
export async function POST({ request, platform }) {
  try {
    const body = await request.json();
    const sessionId = body.session_id;
    const sessionDate = body.session_date || new Date().toISOString().slice(0, 10);
    const attendanceList = body.students || []; // [{ student_id, student_name, class_id, status, notes, in_class_attitude, instant_stars_rewarded }]
    const teacherUser = body.teacher || null;

    if (!sessionId || !Array.isArray(attendanceList) || attendanceList.length === 0) {
      return json({ 
        success: false, 
        error: 'Thiếu thông tin buổi học hoặc danh sách điểm danh (cần ít nhất 1 học sinh)' 
      }, { status: 400 });
    }

    const teacherId = teacherUser?.id || 'usr_super_2';
    const teacherName = teacherUser?.name || 'Ms. Dung';
    const nowIso = new Date().toISOString();

    // Prepare standardized records
    const preparedRecords = attendanceList.map(item => {
      const studentId = item.student_id || item.id;
      const studentName = item.student_name || item.name || 'Học sinh';
      const status = item.status || 'present';
      const instantStars = Number(item.instant_stars_rewarded) !== undefined 
        ? Number(item.instant_stars_rewarded) 
        : (status === 'present' ? 5 : 0);

      return {
        id: item.id || `att_${sessionId}_${sessionDate}_${studentId}`,
        session_id: sessionId,
        session_date: sessionDate,
        student_id: studentId,
        student_name: studentName,
        class_id: item.class_id || '',
        status: status,
        notes: item.notes || '',
        in_class_attitude: item.in_class_attitude || 'Tập trung học tập tốt',
        instant_stars_rewarded: instantStars,
        marked_by_teacher_id: teacherId,
        marked_by_teacher_name: teacherName,
        created_at: item.created_at || nowIso
      };
    });

    // 1. Persist directly to Cloudflare D1 Database when running on server / edge
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
