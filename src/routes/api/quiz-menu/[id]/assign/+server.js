import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser, isManager } from '../../../../../lib/server/auth.js';
import { canManageQuiz, makeId } from '../../../../../lib/server/quizMenu.js';

export const prerender = false;

// GET: danh sách lớp học khả dụng để giao quiz (cho modal "Giao bài" của giáo viên)
export async function GET({ params, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  try {
    // Lớp học = distinct class_id/class_name từ class_sessions (nguồn thật duy nhất của lớp)
    // Manager thấy mọi lớp; teacher chỉ thấy lớp mình dạy (hoặc dạy thay)
    const role = String(auth.user.role || '').toLowerCase();
    const rows = isManager(auth.user)
      ? await db.prepare(`SELECT DISTINCT class_id, class_name FROM class_sessions ORDER BY class_name`).all()
      : await db.prepare(`SELECT DISTINCT class_id, class_name FROM class_sessions WHERE teacher_id = ? OR substitute_teacher_id = ? ORDER BY class_name`).bind(auth.user.id, auth.user.id).all();
    return json({ success: true, classes: rows.results || [] });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: giao quiz cho một lớp → tạo homework_assignments + thông báo HS/PH
export async function POST({ params, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  const quiz = await db.prepare(`SELECT id, title, description, status, created_by, time_limit_minutes FROM quizzes WHERE id = ? LIMIT 1`).bind(params.id).first();
  if (!quiz) return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
  if (!canManageQuiz(auth.user, quiz)) return json({ success: false, error: 'Forbidden: Bạn chỉ được giao quiz do mình tạo' }, { status: 403 });
  if (quiz.status !== 'published') return json({ success: false, error: 'Chỉ giao được quiz đã xuất bản', message: 'Hãy xuất bản quiz trước khi giao cho lớp.' }, { status: 409 });

  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }
  const classId = String(body.class_id || '').trim();
  const dueDate = String(body.due_date || '').trim();
  const title = String(body.title || quiz.title || '').trim().slice(0, 150);
  if (!classId) return json({ success: false, error: 'Thiếu class_id', message: 'Hãy chọn lớp để giao quiz.' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return json({ success: false, error: 'Hạn nộp không hợp lệ', message: 'Hạn nộp phải có dạng YYYY-MM-DD.' }, { status: 400 });

  // Validate lớp tồn tại (lấy class_name thật từ class_sessions)
  const cls = await db.prepare(`SELECT class_id, class_name FROM class_sessions WHERE class_id = ? LIMIT 1`).bind(classId).first();
  if (!cls) return json({ success: false, error: 'Lớp không tồn tại', message: 'Lớp đã chọn không có trong hệ thống.' }, { status: 404 });

  // Teacher thường chỉ được giao cho lớp mình dạy
  if (!isManager(auth.user)) {
    const own = await db.prepare(`SELECT 1 FROM class_sessions WHERE class_id = ? AND (teacher_id = ? OR substitute_teacher_id = ?) LIMIT 1`).bind(classId, auth.user.id, auth.user.id).first();
    if (!own) return json({ success: false, error: 'Forbidden: Bạn chỉ được giao quiz cho lớp mình dạy' }, { status: 403 });
  }

  // Chống giao trùng: cùng quiz + cùng lớp + cùng hạn → trả về bản đã có
  const existing = await db.prepare(
    `SELECT id FROM homework_assignments WHERE source_quiz_id = ? AND class_id = ? AND due_date = ? AND status = 'published' LIMIT 1`
  ).bind(quiz.id, classId, dueDate).first();
  if (existing) return json({ success: true, assignment: existing, duplicate: true, message: 'Quiz này đã được giao cho lớp với hạn nộp này.' });

  const assignmentId = makeId('hwq');
  const teacherName = String(auth.user.name || auth.user.username || 'Giáo viên').slice(0, 150);
  try {
    const statements = [db.prepare(`
      INSERT INTO homework_assignments (
        id, session_id, class_id, class_name, teacher_id, teacher_name,
        title, description, due_date, assigned_date, deadline_date,
        status, source_quiz_id, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), ?, 'published', ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      assignmentId, '', classId, cls.class_name, auth.user.id, teacherName,
      title, quiz.description || '', dueDate, dueDate,
      quiz.id, auth.user.id
    )];

    // Thông báo cho học sinh đang enrolled trong lớp
    const students = await db.prepare(`SELECT user_id FROM class_enrollments WHERE class_id = ? AND status = 'active'`).bind(classId).all();
    for (const s of students.results || []) {
      statements.push(db.prepare(`
        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
        VALUES (?, 'student', ?, ?, ?, 'homework', ?) ON CONFLICT(id) DO NOTHING
      `).bind(
        `notif_hwq_${assignmentId}_s_${s.user_id}`, s.user_id,
        `📝 Quiz mới: ${title}`,
        `Giáo viên ${teacherName} vừa giao quiz cho lớp ${cls.class_name}. Hạn nộp ${dueDate}.`,
        assignmentId
      ));
    }
    // Thông báo cho phụ huynh verified của học sinh trong lớp
    const parents = await db.prepare(`
      SELECT DISTINCT psl.parent_user_id
      FROM parent_student_links psl JOIN class_enrollments ce ON ce.user_id = psl.student_user_id
      WHERE psl.verification_status = 'verified' AND ce.class_id = ? AND ce.status = 'active'
    `).bind(classId).all();
    for (const p of parents.results || []) {
      statements.push(db.prepare(`
        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
        VALUES (?, 'parent', ?, ?, ?, 'homework', ?) ON CONFLICT(id) DO NOTHING
      `).bind(
        `notif_hwq_${assignmentId}_p_${p.parent_user_id}`, p.parent_user_id,
        `📝 Quiz mới cho con: ${title}`,
        `Giáo viên ${teacherName} vừa giao quiz cho lớp ${cls.class_name}. Hạn nộp ${dueDate}.`,
        assignmentId
      ));
    }
    await db.batch(statements);
    const assignment = await db.prepare(`SELECT * FROM homework_assignments WHERE id = ? LIMIT 1`).bind(assignmentId).first();
    return json({ success: true, assignment, message: `Đã giao quiz cho lớp ${cls.class_name}.` }, { status: 201 });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
