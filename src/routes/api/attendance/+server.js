import { json } from '@sveltejs/kit';
import { 
  getAllAttendanceRecords, 
  getAttendanceForSession, 
  saveSessionAttendanceBatch, 
  getAttendanceStatsForStudent,
  getAttendedStudentsForSession
} from '$lib/unifiedStore';

export const prerender = false;

export async function GET({ url }) {
  try {
    const sessionId = url.searchParams.get('session_id');
    const date = url.searchParams.get('date');
    const studentId = url.searchParams.get('student_id');
    const attendedOnly = url.searchParams.get('attended_only') === 'true';

    if (sessionId && attendedOnly) {
      const students = getAttendedStudentsForSession(sessionId, date);
      return json({ success: true, total: students.length, students });
    }

    if (studentId) {
      const stats = getAttendanceStatsForStudent(studentId);
      return json({ success: true, stats });
    }

    if (sessionId) {
      const records = getAttendanceForSession(sessionId, date);
      return json({ success: true, total: records.length, records });
    }

    const all = getAllAttendanceRecords();
    return json({ success: true, total: all.length, records: all });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const body = await request.json();
    const sessionId = body.session_id;
    const sessionDate = body.session_date || new Date().toISOString().slice(0, 10);
    const attendanceList = body.students || []; // [{ student_id, student_name, status, notes, in_class_attitude, instant_stars_rewarded }]
    const teacherUser = body.teacher || null;

    if (!sessionId || attendanceList.length === 0) {
      return json({ success: false, error: 'Thiếu thông tin buổi học hoặc danh sách điểm danh' }, { status: 400 });
    }

    const savedRecords = saveSessionAttendanceBatch(sessionId, sessionDate, attendanceList, teacherUser);
    return json({
      success: true,
      message: `Đã lưu điểm danh cho ${savedRecords.length} học sinh thành công!`,
      records: savedRecords
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
