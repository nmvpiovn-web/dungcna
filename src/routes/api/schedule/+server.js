import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser, isManager } from '../../../lib/server/auth.js';
import { getAllClassSessions, saveClassSession, deleteClassSession, assignStudentsToClassSession } from '../../../lib/unifiedStore.js';

export const prerender = false;

export function _validateStrictGregorianDate(dateStr) {
  const str = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return { valid: false, error: 'Định dạng ngày học không hợp lệ (YYYY-MM-DD)' };
  }
  const [year, month, day] = str.split('-').map(Number);
  if (month < 1 || month > 12) {
    return { valid: false, error: 'Tháng không hợp lệ (01 - 12)' };
  }
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInMonth = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month]) {
    return { valid: false, error: 'Ngày không hợp lệ trên lịch Gregorian' };
  }
  // Gregorian day of week: Sunday = 0, Monday = 1, ..., Saturday = 6
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayOfWeek = date.getUTCDay();
  const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return {
    valid: true,
    year,
    month,
    day,
    dayOfWeek,
    dayName: dayNames[dayOfWeek]
  };
}
const validateStrictGregorianDate = _validateStrictGregorianDate;

export function _validateStrictTimeRange(startTime, endTime) {
  const start = String(startTime || '').trim();
  const end = String(endTime || '').trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start)) {
    return { valid: false, error: 'Giờ bắt đầu không hợp lệ (định dạng HH:mm từ 00:00 đến 23:59)' };
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end)) {
    return { valid: false, error: 'Giờ kết thúc không hợp lệ (định dạng HH:mm từ 00:00 đến 23:59)' };
  }
  if (start >= end) {
    return { valid: false, error: 'Giờ kết thúc phải sau giờ bắt đầu' };
  }
  return { valid: true, start, end };
}
const validateStrictTimeRange = _validateStrictTimeRange;

export const _BASE_SCHEDULE_COLUMNS = [
  'id',
  'class_name',
  'session_date',
  'start_time',
  'end_time'
];
const BASE_SCHEDULE_COLUMNS = _BASE_SCHEDULE_COLUMNS;

export function _clearClassSessionsColumnsCache() {
  // Kept as no-op for backward compatibility with tests
}
const clearClassSessionsColumnsCache = _clearClassSessionsColumnsCache;

export async function _getClassSessionsColumns(db) {
  if (!db) return new Set();
  try {
    const stmt = db.prepare('PRAGMA table_info(class_sessions)');
    const info = typeof stmt.all === 'function'
      ? await stmt.all()
      : (typeof stmt.bind === 'function' ? await stmt.bind().all() : null);
    return new Set((info?.results || []).map(r => r.name));
  } catch (err) {
    console.warn('Failed to inspect PRAGMA table_info(class_sessions):', err);
    return new Set();
  }
}
const getClassSessionsColumns = _getClassSessionsColumns;

/**
 * Dual schedule schema support:
 * Repo migrations/0001 create room/topic, production uses room_notes/subject_topic.
 * Requires base columns plus (room_notes OR room) and (subject_topic OR topic).
 * Fails closed only when neither pair/member or PRAGMA fails.
 */
export function _resolveScheduleSchema(cols) {
  if (!cols || cols.size === 0) {
    return { valid: false, error: 'Không thể kiểm tra cấu trúc bảng class_sessions qua PRAGMA' };
  }
  const missingBase = _BASE_SCHEDULE_COLUMNS.filter(c => !cols.has(c));
  if (missingBase.length > 0) {
    return { valid: false, error: `Bảng class_sessions thiếu cột cơ bản bắt buộc (${missingBase.join(', ')})` };
  }

  const hasRoomNotes = cols.has('room_notes');
  const hasRoom = cols.has('room');
  if (!hasRoomNotes && !hasRoom) {
    return { valid: false, error: 'Bảng class_sessions thiếu cột phòng học (yêu cầu room_notes hoặc room)' };
  }

  const hasSubjectTopic = cols.has('subject_topic');
  const hasTopic = cols.has('topic');
  if (!hasSubjectTopic && !hasTopic) {
    return { valid: false, error: 'Bảng class_sessions thiếu cột chuyên đề (yêu cầu subject_topic hoặc topic)' };
  }

  return {
    valid: true,
    hasRoomNotes,
    hasRoom,
    hasSubjectTopic,
    hasTopic
  };
}
const resolveScheduleSchema = _resolveScheduleSchema;

export function _validateCanonicalColumns(cols) {
  return _resolveScheduleSchema(cols);
}
const validateCanonicalColumns = _validateCanonicalColumns;

export function _formatSessionRow(row) {
  if (!row) return null;
  let studentIds = [];
  try {
    studentIds = typeof row.student_ids === 'string' ? JSON.parse(row.student_ids || '[]') : (row.student_ids || []);
  } catch {
    studentIds = [];
  }
  const subjectTopic = (row.subject_topic !== undefined && row.subject_topic !== null && String(row.subject_topic).trim() !== '')
    ? String(row.subject_topic)
    : (row.topic !== undefined && row.topic !== null ? String(row.topic) : '');
  const roomNotes = (row.room_notes !== undefined && row.room_notes !== null && String(row.room_notes).trim() !== '')
    ? String(row.room_notes)
    : (row.room !== undefined && row.room !== null ? String(row.room) : '');
  return {
    ...row,
    student_ids: studentIds,
    subject_topic: subjectTopic,
    room_notes: roomNotes,
    topic: subjectTopic,
    room: roomNotes
  };
}
const formatSessionRow = _formatSessionRow;

export async function GET({ url, request, platform }) {
  // 1. Strict Server Authentication
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({
      success: false,
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập tài khoản hợp lệ'
    }, { status: auth.status || 401 });
  }

  try {
    const classId = url.searchParams.get('class_id');
    const teacherId = url.searchParams.get('teacher_id');

    if (platform?.env?.DB) {
      let query = 'SELECT cs.* FROM class_sessions cs WHERE 1=1';
      const params = [];
      const role = String(auth.user.role || '').toLowerCase();

      // Resource scope is enforced on the server. Query parameters may narrow a
      // result set, but never widen the sessions visible to the signed-in user.
      if (!isManager(auth.user)) {
        if (role === 'teacher') {
          query += ' AND (cs.teacher_id = ? OR cs.assistant_teacher_id = ? OR cs.substitute_teacher_id = ?)';
          params.push(auth.user.id, auth.user.id, auth.user.id);
        } else if (role === 'student') {
          query += ` AND (
            cs.class_id IN (
              SELECT class_id FROM class_enrollments
              WHERE user_id = ? AND status = 'active'
            )
            OR EXISTS (
              SELECT 1 FROM json_each(CASE WHEN json_valid(cs.student_ids) THEN cs.student_ids ELSE '[]' END)
              WHERE value = ?
            )
          )`;
          params.push(auth.user.id, auth.user.id);
        } else if (role === 'parent') {
          query += ` AND (
            cs.class_id IN (
              SELECT ce.class_id
              FROM class_enrollments ce
              JOIN parent_student_links psl ON psl.student_user_id = ce.user_id
              WHERE psl.parent_user_id = ?
                AND psl.verification_status = 'verified'
                AND ce.status = 'active'
            )
            OR EXISTS (
              SELECT 1
              FROM json_each(CASE WHEN json_valid(cs.student_ids) THEN cs.student_ids ELSE '[]' END) ids
              JOIN parent_student_links psl ON psl.student_user_id = ids.value
              WHERE psl.parent_user_id = ? AND psl.verification_status = 'verified'
            )
          )`;
          params.push(auth.user.id, auth.user.id);
        } else {
          return json({ success: false, error: 'Forbidden: Vai trò này không có quyền xem thời khóa biểu' }, { status: 403 });
        }
      }
      if (classId) {
        query += ' AND cs.class_id = ?';
        params.push(classId);
      }
      if (teacherId) {
        query += ' AND (cs.teacher_id = ? OR cs.assistant_teacher_id = ? OR cs.substitute_teacher_id = ?)';
        params.push(teacherId, teacherId, teacherId);
      }
      query += ' ORDER BY cs.session_date DESC, cs.start_time ASC';

      const d1Res = await platform.env.DB.prepare(query).bind(...params).all();
      const rows = (d1Res?.results || []).map(formatSessionRow);
      return json({
        success: true,
        total: rows.length,
        sessions: rows,
        source: 'cloudflare_d1'
      });
    }

    const sessions = getAllClassSessions();
    let filtered = sessions;
    if (!isManager(auth.user)) {
      const role = String(auth.user.role || '').toLowerCase();
      if (role === 'teacher') {
        filtered = filtered.filter(s => [s.teacher_id, s.assistant_teacher_id, s.substitute_teacher_id].includes(auth.user.id));
      } else if (role === 'student') {
        filtered = filtered.filter(s => Array.isArray(s.student_ids) && s.student_ids.includes(auth.user.id));
      } else {
        // Parent links cannot be verified without D1, so fail closed instead of
        // returning another family's schedule from fixture data.
        return json({ success: false, error: 'DatabaseUnavailable: Không thể xác minh lịch của học sinh liên kết' }, { status: 503 });
      }
    }
    if (classId) filtered = filtered.filter(s => s.class_id === classId);
    if (teacherId) filtered = filtered.filter(s => s.teacher_id === teacherId || s.assistant_teacher_id === teacherId);

    return json({
      success: true,
      total: filtered.length,
      sessions: filtered,
      source: 'local_store'
    });
  } catch (err) {
    console.error('GET /api/schedule error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  // 1. Strict Server Authentication & Staff check
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({
      success: false,
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập tài khoản hợp lệ'
    }, { status: auth.status || 401 });
  }

  if (!isStaffUser(auth.user)) {
    return json({
      success: false,
      error: 'Forbidden: Chỉ Giáo viên hoặc Quản trị viên mới có quyền cập nhật thời khóa biểu'
    }, { status: 403 });
  }

  try {
    const body = await request.json();
    const action = body.action || 'save_session';

    const isMgr = isManager(auth.user);
    const db = platform?.env?.DB;

    // Ownership helper: non-managers may only touch sessions they are in charge of
    // (main / assistant / substitute teacher).
    async function assertOwnSession(sessionId) {
      if (isMgr || !db || !sessionId) return;
      const cols = await getClassSessionsColumns(db);
      const selCols = ['teacher_id'];
      if (cols.has('assistant_teacher_id')) selCols.push('assistant_teacher_id');
      if (cols.has('substitute_teacher_id')) selCols.push('substitute_teacher_id');
      const existing = await db.prepare(
        `SELECT ${selCols.join(', ')} FROM class_sessions WHERE id = ? LIMIT 1`
      ).bind(sessionId).first();
      if (existing) {
        const mine = [existing.teacher_id, existing.assistant_teacher_id, existing.substitute_teacher_id].filter(Boolean).includes(auth.user.id);
        if (!mine) {
          throw { status: 403, message: 'Forbidden: Bạn chỉ được sửa lịch mình phụ trách' };
        }
      }
    }

    if (action === 'assign_students') {
      await assertOwnSession(body.session_id);
      if (db) {
        const cols = await getClassSessionsColumns(db);
        const schemaCheck = validateCanonicalColumns(cols);
        if (!schemaCheck.valid) {
          return json({ success: false, error: schemaCheck.error }, { status: 500 });
        }
        const updateRes = await db.prepare(`
          UPDATE class_sessions SET student_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(JSON.stringify(body.student_ids || []), body.session_id).run();
        const changes = updateRes?.meta?.changes ?? updateRes?.changes;
        if (changes !== undefined && changes === 0) {
          return json({ success: false, error: 'Không tìm thấy buổi học để gán học sinh' }, { status: 404 });
        }
        return json({ success: true, session_id: body.session_id, student_ids: body.student_ids });
      } else {
        const res = assignStudentsToClassSession(body.session_id, body.student_ids);
        return json(res);
      }
    }

    if (!body.class_name || !String(body.class_name).trim()) {
      return json({ success: false, error: 'Thiếu tên lớp học' }, { status: 400 });
    }

    if (!body.start_time) {
      return json({ success: false, error: 'Thiếu giờ bắt đầu buổi học' }, { status: 400 });
    }

    if (!body.end_time) {
      return json({ success: false, error: 'Thiếu giờ kết thúc buổi học' }, { status: 400 });
    }

    // Strict Gregorian Date Validation
    if (!body.session_date) {
      return json({ success: false, error: 'Thiếu ngày học (session_date). Vui lòng chọn ngày trên lịch.' }, { status: 400 });
    }
    const dateVal = validateStrictGregorianDate(body.session_date);
    if (!dateVal.valid) {
      return json({ success: false, error: dateVal.error }, { status: 400 });
    }

    // Consistency check: weekday metadata vs actual Gregorian date
    const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    if (body.day_of_week !== undefined && body.day_of_week !== null && String(body.day_of_week).trim() !== '') {
      const requestedDow = Number(body.day_of_week);
      if (!Number.isNaN(requestedDow) && requestedDow !== dateVal.dayOfWeek) {
        return json({
          success: false,
          error: `Thứ trong tuần (${dayNames[requestedDow] || requestedDow}) không khớp với ngày học ${body.session_date} (${dateVal.dayName})`
        }, { status: 400 });
      }
    }

    // Strict Time Range Validation
    const timeVal = validateStrictTimeRange(body.start_time, body.end_time);
    if (!timeVal.valid) {
      return json({ success: false, error: timeVal.error }, { status: 400 });
    }

    await assertOwnSession(body.id);
    // Non-managers cannot create sessions assigned to other teachers
    if (!isMgr && body.teacher_id && body.teacher_id !== auth.user.id) {
      return json({ success: false, error: 'Forbidden: Bạn chỉ được tạo lịch cho chính mình' }, { status: 403 });
    }

    const roomVal = String(body.room ?? body.room_notes ?? '').trim();
    const topicVal = String(body.subject_topic ?? body.topic ?? '').trim() || 'Chuyên đề Ngữ pháp & Giao tiếp';
    const newStudentIds = Array.isArray(body.student_ids) ? body.student_ids : [];

    if (db) {
      const cols = await getClassSessionsColumns(db);
      const schemaCheck = resolveScheduleSchema(cols);
      if (!schemaCheck.valid) {
        return json({ success: false, error: schemaCheck.error }, { status: 500 });
      }

      const subCol = cols.has('substitute_teacher_id') ? ', substitute_teacher_id' : '';
      const asstCol = cols.has('assistant_teacher_id') ? ', assistant_teacher_id' : '';
      const studentCol = cols.has('student_ids') ? ', student_ids' : '';
      const roomColExpr = schemaCheck.hasRoomNotes && schemaCheck.hasRoom
        ? "COALESCE(room_notes, room, '') AS room_notes"
        : schemaCheck.hasRoomNotes
        ? "room_notes"
        : "room AS room_notes";

      const conflicts = await db.prepare(`
        SELECT id, class_name, teacher_id ${asstCol} ${subCol} ${studentCol}, ${roomColExpr}, start_time, end_time
        FROM class_sessions
        WHERE session_date = ?
          AND id != ?
          AND start_time < ?
          AND end_time > ?
          AND (status IS NULL OR status != 'cancelled')
        LIMIT 50
      `).bind(
        body.session_date,
        body.id || '',
        body.end_time,
        body.start_time
      ).all();
      const rows = conflicts?.results || [];
      const teacherIds = [
        body.teacher_id || auth.user.id,
        body.assistant_teacher_id,
        body.substitute_teacher_id
      ].filter(Boolean);

      for (const r of rows) {
        let rStudentIds = [];
        try { rStudentIds = typeof r.student_ids === 'string' ? JSON.parse(r.student_ids || '[]') : (r.student_ids || []); } catch {}
        const rTeachers = [r.teacher_id, r.assistant_teacher_id, r.substitute_teacher_id].filter(Boolean);
        const teacherOverlap = teacherIds.some(t => rTeachers.includes(t));
        const studentOverlap = newStudentIds.some(s => rStudentIds.includes(s));
        const existingRoom = r.room_notes ?? r.room ?? '';
        const roomOverlap = roomVal && existingRoom && String(roomVal).toLowerCase() === String(existingRoom).trim().toLowerCase();
        if (teacherOverlap || studentOverlap || roomOverlap) {
          const reason = teacherOverlap ? 'giáo viên' : studentOverlap ? 'học sinh' : 'phòng học';
          return json({
            success: false,
            error: `Trùng lịch ${reason} với ca "${r.class_name}" (${r.start_time}–${r.end_time} ngày ${body.session_date})`
          }, { status: 409 });
        }
      }
    }

    const id = body.id || `sess_${crypto.randomUUID()}`;
    const dayName = dateVal.dayName;
    const dayOfWeek = dateVal.dayOfWeek;
    const studentIdsStr = JSON.stringify(newStudentIds);

    let savedSession = {
      id,
      class_id: body.class_id || '',
      class_name: body.class_name.trim(),
      grade_level: body.grade_level || 'Lớp 7',
      subject_topic: topicVal,
      topic: topicVal,
      teacher_id: body.teacher_id || auth.user.id,
      teacher_name: body.teacher_name || auth.user.name || '',
      teacher_role: body.teacher_role || 'lead',
      assistant_teacher_id: body.assistant_teacher_id || null,
      assistant_teacher_name: body.assistant_teacher_name || '',
      substitute_teacher_id: body.substitute_teacher_id || null,
      substitute_teacher_name: body.substitute_teacher_name || '',
      substitute_notes: body.substitute_notes || '',
      location: body.location || 'Tại nhà Cô Dung (123 Phố Vọng, Hai Bà Trưng, Hà Nội)',
      day_of_week: dayOfWeek,
      day_name: dayName,
      session_date: body.session_date,
      start_time: body.start_time,
      end_time: body.end_time,
      notify_minutes_before: Number(body.notify_minutes_before ?? 10),
      room_notes: roomVal,
      room: roomVal,
      status: body.status || 'scheduled',
      student_ids: newStudentIds
    };

    if (platform?.env?.DB) {
      const cols = await getClassSessionsColumns(platform.env.DB);
      const schemaCheck = resolveScheduleSchema(cols);
      if (!schemaCheck.valid) {
        return json({ success: false, error: schemaCheck.error }, { status: 500 });
      }

      const isNew = !body.id;
      if (isNew) {
        const insertCols = [
          'id',
          'class_id',
          'class_name',
          'teacher_id',
          'session_date',
          'start_time',
          'end_time'
        ];
        const insertVals = [
          id,
          body.class_id || '',
          body.class_name.trim(),
          body.teacher_id || auth.user.id,
          body.session_date,
          body.start_time,
          body.end_time
        ];

        if (cols.has('teacher_name')) {
          insertCols.push('teacher_name');
          insertVals.push(body.teacher_name || auth.user.name || '');
        }

        // Dual schema support: dynamically write exact existing pair
        if (schemaCheck.hasRoomNotes) { insertCols.push('room_notes'); insertVals.push(roomVal); }
        if (schemaCheck.hasRoom) { insertCols.push('room'); insertVals.push(roomVal); }
        if (schemaCheck.hasSubjectTopic) { insertCols.push('subject_topic'); insertVals.push(topicVal); }
        if (schemaCheck.hasTopic) { insertCols.push('topic'); insertVals.push(topicVal); }

        if (cols.has('grade_level')) { insertCols.push('grade_level'); insertVals.push(body.grade_level || 'Lớp 7'); }
        if (cols.has('day_of_week')) { insertCols.push('day_of_week'); insertVals.push(dayOfWeek); }
        if (cols.has('day_name')) { insertCols.push('day_name'); insertVals.push(dayName); }
        if (cols.has('student_ids')) { insertCols.push('student_ids'); insertVals.push(studentIdsStr); }
        if (cols.has('assistant_teacher_id')) { insertCols.push('assistant_teacher_id'); insertVals.push(body.assistant_teacher_id || null); }
        if (cols.has('assistant_teacher_name')) { insertCols.push('assistant_teacher_name'); insertVals.push(body.assistant_teacher_name || ''); }
        if (cols.has('substitute_teacher_id')) { insertCols.push('substitute_teacher_id'); insertVals.push(body.substitute_teacher_id || null); }
        if (cols.has('substitute_teacher_name')) { insertCols.push('substitute_teacher_name'); insertVals.push(body.substitute_teacher_name || ''); }
        if (cols.has('substitute_notes')) { insertCols.push('substitute_notes'); insertVals.push(body.substitute_notes || ''); }
        if (cols.has('location')) { insertCols.push('location'); insertVals.push(body.location || 'Tại nhà Cô Dung (123 Phố Vọng, Hai Bà Trưng, Hà Nội)'); }
        if (cols.has('notify_minutes_before')) { insertCols.push('notify_minutes_before'); insertVals.push(Number(body.notify_minutes_before ?? 10)); }
        if (cols.has('teacher_role')) { insertCols.push('teacher_role'); insertVals.push(body.teacher_role || 'lead'); }
        if (cols.has('status')) { insertCols.push('status'); insertVals.push('scheduled'); }
        if (cols.has('updated_at')) { insertCols.push('updated_at'); insertVals.push(new Date().toISOString()); }

        const placeholders = insertCols.map(() => '?').join(', ');
        await platform.env.DB.prepare(`
          INSERT INTO class_sessions (${insertCols.join(', ')}) VALUES (${placeholders})
        `).bind(...insertVals).run();
        savedSession.status = 'scheduled';
      } else {
        // UPDATE: only touch columns the form submits.
        // Never touch substitute_* / attendance_taken / payroll_* unless explicitly submitted, and never reset status.
        const updateSets = [
          'class_id = ?',
          'class_name = ?',
          'teacher_id = ?',
          'session_date = ?',
          'start_time = ?',
          'end_time = ?'
        ];
        const updateVals = [
          body.class_id || '',
          body.class_name.trim(),
          body.teacher_id || auth.user.id,
          body.session_date,
          body.start_time,
          body.end_time
        ];

        if (cols.has('teacher_name')) {
          updateSets.push('teacher_name = ?');
          updateVals.push(body.teacher_name || auth.user.name || '');
        }

        // Dual schema support: dynamically update exact existing pair
        if (schemaCheck.hasRoomNotes) { updateSets.push('room_notes = ?'); updateVals.push(roomVal); }
        if (schemaCheck.hasRoom) { updateSets.push('room = ?'); updateVals.push(roomVal); }
        if (schemaCheck.hasSubjectTopic) { updateSets.push('subject_topic = ?'); updateVals.push(topicVal); }
        if (schemaCheck.hasTopic) { updateSets.push('topic = ?'); updateVals.push(topicVal); }

        if (cols.has('grade_level')) { updateSets.push('grade_level = ?'); updateVals.push(body.grade_level || 'Lớp 7'); }
        if (cols.has('day_of_week')) { updateSets.push('day_of_week = ?'); updateVals.push(dayOfWeek); }
        if (cols.has('day_name')) { updateSets.push('day_name = ?'); updateVals.push(dayName); }
        if (cols.has('student_ids')) { updateSets.push('student_ids = ?'); updateVals.push(studentIdsStr); }
        if (cols.has('assistant_teacher_id')) { updateSets.push('assistant_teacher_id = ?'); updateVals.push(body.assistant_teacher_id || null); }
        if (cols.has('assistant_teacher_name')) { updateSets.push('assistant_teacher_name = ?'); updateVals.push(body.assistant_teacher_name || ''); }
        if (cols.has('substitute_teacher_id')) { updateSets.push('substitute_teacher_id = ?'); updateVals.push(body.substitute_teacher_id || null); }
        if (cols.has('substitute_teacher_name')) { updateSets.push('substitute_teacher_name = ?'); updateVals.push(body.substitute_teacher_name || ''); }
        if (cols.has('substitute_notes')) { updateSets.push('substitute_notes = ?'); updateVals.push(body.substitute_notes || ''); }
        if (cols.has('location')) { updateSets.push('location = ?'); updateVals.push(body.location || 'Tại nhà Cô Dung (123 Phố Vọng, Hai Bà Trưng, Hà Nội)'); }
        if (cols.has('notify_minutes_before')) { updateSets.push('notify_minutes_before = ?'); updateVals.push(Number(body.notify_minutes_before ?? 10)); }
        if (cols.has('teacher_role')) { updateSets.push('teacher_role = ?'); updateVals.push(body.teacher_role || 'lead'); }
        if (cols.has('updated_at')) { updateSets.push('updated_at = CURRENT_TIMESTAMP'); }

        updateVals.push(id);
        const updateRes = await platform.env.DB.prepare(`
          UPDATE class_sessions SET ${updateSets.join(', ')} WHERE id = ?
        `).bind(...updateVals).run();

        const changes = updateRes?.meta?.changes ?? updateRes?.changes;
        if (changes !== undefined && changes === 0) {
          return json({ success: false, error: 'Không tìm thấy buổi học để cập nhật' }, { status: 404 });
        }

        // Keep the existing status from DB (don't reset)
        const kept = await platform.env.DB.prepare('SELECT status FROM class_sessions WHERE id = ? LIMIT 1').bind(id).first();
        if (!kept) {
          return json({ success: false, error: 'Không tìm thấy buổi học để cập nhật' }, { status: 404 });
        }
        if (kept?.status) savedSession.status = kept.status;
      }
    } else {
      // no-DB fallback only
      try {
        saveClassSession(savedSession);
      } catch {}
    }

    return json({
      success: true,
      message: `Đã lưu thời khóa biểu buổi học "${savedSession.class_name}" (${savedSession.day_name} ${savedSession.start_time})`,
      session: savedSession
    });
  } catch (err) {
    console.error('POST /api/schedule error:', err?.message || err);
    if (err && typeof err.status === 'number') {
      return json({ success: false, error: err.message }, { status: err.status });
    }
    return json({ success: false, error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE({ url, request, platform }) {
  // 1. Strict Server Authentication & Staff check
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({
      success: false,
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập tài khoản hợp lệ'
    }, { status: auth.status || 401 });
  }

  if (!isStaffUser(auth.user)) {
    return json({
      success: false,
      error: 'Forbidden: Chỉ Giáo viên hoặc Quản trị viên mới có quyền xóa buổi học'
    }, { status: 403 });
  }

  try {
    const id = url.searchParams.get('id');
    if (!id) return json({ success: false, error: 'Thiếu session ID' }, { status: 400 });

    // Non-managers can only delete sessions they are in charge of
    if (!isManager(auth.user) && platform?.env?.DB) {
      const cols = await getClassSessionsColumns(platform.env.DB);
      const selCols = ['teacher_id'];
      if (cols.has('assistant_teacher_id')) selCols.push('assistant_teacher_id');
      if (cols.has('substitute_teacher_id')) selCols.push('substitute_teacher_id');
      const existing = await platform.env.DB.prepare(
        `SELECT ${selCols.join(', ')} FROM class_sessions WHERE id = ? LIMIT 1`
      ).bind(id).first();
      if (existing) {
        const mine = [existing.teacher_id, existing.assistant_teacher_id, existing.substitute_teacher_id].filter(Boolean).includes(auth.user.id);
        if (!mine) {
          return json({ success: false, error: 'Forbidden: Bạn chỉ được xóa lịch mình phụ trách' }, { status: 403 });
        }
      }
    }

    if (platform?.env?.DB) {
      const cols = await getClassSessionsColumns(platform.env.DB);
      const schemaCheck = validateCanonicalColumns(cols);
      if (!schemaCheck.valid) {
        return json({ success: false, error: schemaCheck.error }, { status: 500 });
      }
      const delRes = await platform.env.DB.prepare('DELETE FROM class_sessions WHERE id = ?').bind(id).run();
      const changes = delRes?.meta?.changes ?? delRes?.changes;
      if (changes !== undefined && changes === 0) {
        return json({ success: false, error: 'Không tìm thấy buổi học để xóa' }, { status: 404 });
      }
    } else {
      deleteClassSession(id);
    }
    return json({ success: true, message: 'Đã xóa buổi học khỏi thời khóa biểu' });
  } catch (err) {
    console.error('DELETE /api/schedule error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
