import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../lib/server/auth.js';

export const prerender = false;

// In-Memory store for local development & fallback
let inMemoryAssignments = [
  {
    id: 'hw_demo_g7_writing',
    session_id: 'sess_g7_mon',
    class_id: 'cls_g7',
    class_name: 'Tiếng Anh Lớp 7 - Chuyên Sâu',
    teacher_id: 'user_teacher_quynh',
    teacher_name: 'Cô Như Quỳnh',
    campus_id: 'loc_codung',
    skill_type: 'writing',
    title: 'Viết Đoạn Văn Về Lợi Ích Của Năng Lượng Tái Tạo (Renewable Energy)',
    description: 'Viết từ 80-100 từ sử dụng các từ vựng đã học trong Unit 10: solar, wind power, footprint. Chú ý cấu trúc Will / Won\'t.',
    obsidian_note_id: 'UNIT_10_ENERGY_SOURCES',
    obsidian_note_title: 'Unit 10: Energy Sources & Environmental Impact',
    assigned_date: '2026-10-05',
    deadline_date: '2026-10-08',
    deadline_time: '18:00',
    max_score: 10.0,
    star_reward_on_time: 50,
    status: 'published',
    created_at: '2026-10-05T19:30:00Z'
  },
  {
    id: 'hw_demo_g7_speaking',
    session_id: 'sess_g7_wed',
    class_id: 'cls_g7',
    class_name: 'Tiếng Anh Lớp 7 - Chuyên Sâu',
    teacher_id: 'user_teacher_quynh',
    teacher_name: 'Cô Như Quỳnh',
    campus_id: 'loc_sunshine',
    skill_type: 'speaking',
    title: 'Luyện Phát Âm & Đọc To Đoạn Hội Thoại Về Du Lịch Tương Lai',
    description: 'Học sinh ghi âm trực tiếp bằng micro trên webapp: đọc to đoạn văn mẫu 1 phút, phát âm chuẩn đuôi /s/, /es/ và ngữ điệu câu hỏi.',
    obsidian_note_id: 'PHONICS_S_ES_ENDINGS',
    obsidian_note_title: 'Chuyên Đề Ngữ Âm: Quy Tắc Phát Âm Đuôi S/ES Chuẩn Oxford',
    assigned_date: '2026-10-06',
    deadline_date: '2026-10-09',
    deadline_time: '17:30',
    max_score: 10.0,
    star_reward_on_time: 100,
    status: 'published',
    created_at: '2026-10-06T19:30:00Z'
  }
];

let inMemorySubmissions = [
  {
    id: 'sub_demo_01',
    assignment_id: 'hw_demo_g7_writing',
    student_id: 'user_student_1',
    student_name: 'Nguyễn Minh Quân',
    submission_type: 'writing',
    content_text: 'In the future, we will use more solar energy and wind power to protect our planet. It does not cause carbon footprint and helps keep our air clean.',
    audio_url: null,
    attachments_json: '[]',
    submitted_at: '2026-10-07T14:20:00Z',
    is_on_time: 1,
    graded_by_teacher_id: 'user_teacher_quynh',
    graded_by_teacher_name: 'Cô Như Quỳnh',
    graded_at: '2026-10-07T16:00:00Z',
    score: 9.5,
    teacher_feedback: 'Bài viết rất tốt, dùng đúng từ vựng Unit 10 và cấu trúc ngữ pháp chuẩn xác. Tiếp tục phát huy nhé con!',
    audio_feedback_url: null,
    stars_awarded: 50,
    star_awarded_reason: 'Hoàn thành BTVN xuất sắc và đúng hạn',
    status: 'graded'
  }
];

async function ensureTables(db) {
  if (!db) return;
  try {
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS homework_assignments (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          class_id TEXT NOT NULL,
          class_name TEXT NOT NULL,
          teacher_id TEXT NOT NULL,
          teacher_name TEXT NOT NULL,
          campus_id TEXT NOT NULL DEFAULT 'loc_codung',
          skill_type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          obsidian_note_id TEXT,
          obsidian_note_title TEXT,
          assigned_date TEXT NOT NULL,
          deadline_date TEXT NOT NULL,
          deadline_time TEXT NOT NULL,
          max_score REAL DEFAULT 10.0,
          star_reward_on_time INTEGER DEFAULT 50,
          status TEXT DEFAULT 'published',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS homework_submissions (
          id TEXT PRIMARY KEY,
          assignment_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          student_name TEXT NOT NULL,
          submission_type TEXT NOT NULL,
          content_text TEXT,
          audio_url TEXT,
          handwritten_image_url TEXT,
          attachments_json TEXT,
          submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          is_on_time INTEGER DEFAULT 1,
          graded_by_teacher_id TEXT,
          graded_by_teacher_name TEXT,
          graded_at TEXT,
          score REAL,
          teacher_feedback TEXT,
          audio_feedback_url TEXT,
          stars_awarded INTEGER DEFAULT 0,
          star_awarded_reason TEXT,
          status TEXT DEFAULT 'submitted'
        );
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS location_activity_streams (
          id TEXT PRIMARY KEY,
          campus_id TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          actor_name TEXT NOT NULL,
          actor_role TEXT NOT NULL,
          activity_type TEXT NOT NULL,
          title TEXT NOT NULL,
          detail TEXT,
          reference_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `)
    ]);
  } catch (e) {
    console.warn('Homework tables ensureTables notice:', e.message);
  }
}

export async function GET({ request, url, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }

  const user = auth.user;
  const role = user.role;
  const skillFilter = url.searchParams.get('skill') || 'all';
  const campusFilter = url.searchParams.get('campus_id') || 'all';
  const assignmentId = url.searchParams.get('id');
  const requestedChildId = url.searchParams.get('child_id') || url.searchParams.get('student_id');

  const db = platform?.env?.DB;

  if (db) {
    try {
      await ensureTables(db);

      // Single assignment requested
      if (assignmentId) {
        const aRes = await db.prepare('SELECT * FROM homework_assignments WHERE id = ?').bind(assignmentId).first();
        if (!aRes) {
          return json({ success: false, error: 'Không tìm thấy bài tập' }, { status: 404 });
        }
        const sRes = await db.prepare('SELECT * FROM homework_submissions WHERE assignment_id = ?').bind(assignmentId).all();
        return json({ success: true, assignment: aRes, submissions: sRes.results || [] });
      }

      // Query assignments with filters
      let sql = 'SELECT * FROM homework_assignments WHERE 1=1';
      let params = [];

      if (skillFilter !== 'all') {
        sql += ' AND skill_type = ?';
        params.push(skillFilter);
      }
      if (campusFilter !== 'all') {
        sql += ' AND campus_id = ?';
        params.push(campusFilter);
      }
      if (role === 'teacher') {
        sql += ' AND teacher_id = ?';
        params.push(user.id);
      }

      sql += ' ORDER BY created_at DESC LIMIT 100;';
      const assignmentsRes = await db.prepare(sql).bind(...params).all();
      const assignments = assignmentsRes.results || [];

      // Fetch submissions based on role
      let submissions = [];
      let linkedChildren = [];
      if (role === 'student') {
        const subRes = await db.prepare('SELECT * FROM homework_submissions WHERE student_id = ?').bind(user.id).all();
        submissions = subRes.results || [];
      } else if (role === 'parent') {
        // Find linked students
        const linksRes = await db.prepare(`
          SELECT psl.student_user_id, u.name as student_name, u.grade, u.avatar
          FROM parent_student_links psl
          LEFT JOIN users u ON psl.student_user_id = u.id
          WHERE psl.parent_user_id = ? AND psl.verification_status = 'verified'
        `).bind(user.id).all();
        linkedChildren = linksRes.results || [];
        const studentIds = linkedChildren.map(r => r.student_user_id).filter(Boolean);

        if (studentIds.length === 0) {
          return json({ success: true, assignments, submissions: [], linked_children: [], total: assignments.length });
        }

        if (requestedChildId && requestedChildId !== 'all') {
          if (!studentIds.includes(requestedChildId)) {
            return json({ success: false, error: 'Forbidden: Quý phụ huynh chỉ có quyền xem bài tập của con em mình' }, { status: 403 });
          }
          const subRes = await db.prepare('SELECT * FROM homework_submissions WHERE student_id = ?').bind(requestedChildId).all();
          submissions = subRes.results || [];
        } else {
          const placeholders = studentIds.map(() => '?').join(',');
          const subRes = await db.prepare(`SELECT * FROM homework_submissions WHERE student_id IN (${placeholders})`).bind(...studentIds).all();
          submissions = subRes.results || [];
        }
      } else {
        // Teacher / Leader / Superadmin: Fetch submissions for these assignments
        const subRes = await db.prepare('SELECT * FROM homework_submissions ORDER BY submitted_at DESC LIMIT 200').all();
        submissions = subRes.results || [];
      }

      return json({
        success: true,
        assignments,
        submissions,
        linked_children: linkedChildren,
        total: assignments.length
      });
    } catch (e) {
      console.error('Error fetching homework from D1:', e);
    }
  }

  // Fallback in-memory handling
  let assignments = inMemoryAssignments;
  if (skillFilter !== 'all') {
    assignments = assignments.filter(a => a.skill_type === skillFilter);
  }
  if (campusFilter !== 'all') {
    assignments = assignments.filter(a => a.campus_id === campusFilter);
  }
  if (role === 'teacher') {
    assignments = assignments.filter(a => a.teacher_id === user.id);
  }

  let submissions = inMemorySubmissions;
  if (role === 'student') {
    submissions = submissions.filter(s => s.student_id === user.id);
  } else if (role === 'parent') {
    if (requestedChildId && requestedChildId !== 'all') {
      submissions = submissions.filter(s => s.student_id === requestedChildId);
    }
  }

  return json({
    success: true,
    assignments,
    submissions,
    total: assignments.length
  });
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }

  const user = auth.user;
  const isStaff = isStaffUser(user);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Payload yêu cầu JSON hợp lệ' }, { status: 400 });
  }

  const action = body.action || '';
  const db = platform?.env?.DB;

  // ACTION 1: ASSIGN HOMEWORK (Teacher / Staff only)
  if (action === 'assign') {
    if (!isStaff) {
      return json({ success: false, error: 'Forbidden: Chỉ giáo viên hoặc quản lý mới có quyền giao BTVN' }, { status: 403 });
    }

    const {
      session_id,
      class_id,
      class_name,
      skill_type,
      title,
      description,
      obsidian_note_id,
      obsidian_note_title,
      campus_id = 'loc_codung',
      deadline_date: inputDeadlineDate,
      deadline_time: inputDeadlineTime = '18:00',
      max_score = 10.0,
      star_reward_on_time = 50
    } = body;

    if (!session_id || !class_id || !skill_type || !title) {
      return json({ success: false, error: 'Thiếu thông tin bắt buộc: session_id, class_id, skill_type, title' }, { status: 400 });
    }

    const validSkills = ['writing', 'reading', 'speaking'];
    if (!validSkills.includes(skill_type)) {
      return json({ success: false, error: `Kỹ năng không hợp lệ: '${skill_type}'. Chỉ chấp nhận 'writing', 'reading', hoặc 'speaking'` }, { status: 400 });
    }

    // Compute automatic deadline if not provided: find next session or default +3 days
    let finalDeadlineDate = inputDeadlineDate;
    let finalDeadlineTime = inputDeadlineTime;

    if (!finalDeadlineDate && db) {
      try {
        const nextSession = await db.prepare(`
          SELECT session_date, start_time 
          FROM class_sessions 
          WHERE class_id = ? AND session_date > date('now')
          ORDER BY session_date ASC LIMIT 1;
        `).bind(class_id).first();

        if (nextSession && nextSession.session_date) {
          finalDeadlineDate = nextSession.session_date;
          finalDeadlineTime = nextSession.start_time || '18:00';
        }
      } catch {}
    }

    if (!finalDeadlineDate) {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      finalDeadlineDate = d.toISOString().split('T')[0];
    }

    const assignmentId = `hw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newAssignment = {
      id: assignmentId,
      session_id,
      class_id,
      class_name: class_name || 'Lớp Học Tiếng Anh',
      teacher_id: user.id,
      teacher_name: user.name || user.username,
      campus_id,
      skill_type,
      title,
      description: description || '',
      obsidian_note_id: obsidian_note_id || null,
      obsidian_note_title: obsidian_note_title || null,
      assigned_date: new Date().toISOString().split('T')[0],
      deadline_date: finalDeadlineDate,
      deadline_time: finalDeadlineTime,
      max_score: Number(max_score) || 10.0,
      star_reward_on_time: Number(star_reward_on_time) || 50,
      status: 'published',
      created_at: new Date().toISOString()
    };

    if (db) {
      try {
        await ensureTables(db);
        await db.prepare(`
          INSERT INTO homework_assignments (
            id, session_id, class_id, class_name, teacher_id, teacher_name, campus_id,
            skill_type, title, description, obsidian_note_id, obsidian_note_title,
            assigned_date, deadline_date, deadline_time, max_score, star_reward_on_time, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `).bind(
          newAssignment.id, newAssignment.session_id, newAssignment.class_id, newAssignment.class_name,
          newAssignment.teacher_id, newAssignment.teacher_name, newAssignment.campus_id,
          newAssignment.skill_type, newAssignment.title, newAssignment.description,
          newAssignment.obsidian_note_id, newAssignment.obsidian_note_title,
          newAssignment.assigned_date, newAssignment.deadline_date, newAssignment.deadline_time,
          newAssignment.max_score, newAssignment.star_reward_on_time, newAssignment.status, newAssignment.created_at
        ).run();

        // Broadcast notifications ONLY to verified parents of students in this class
        // P1/P2 Fix: Use exact structured membership query; reject empty class_id (would broadcast to all)
        const targetClassId = newAssignment.class_id || '';
        if (!targetClassId) {
          console.warn('[HW] Skipping parent notifications: class_id is empty, refusing broadcast-all');
        } else {
          const linksRes = await db.prepare(`
            SELECT DISTINCT psl.parent_user_id 
            FROM parent_student_links psl
            JOIN users u ON u.id = psl.student_user_id
            WHERE psl.verification_status = 'verified'
              AND psl.parent_user_id IS NOT NULL
              AND (
                u.metadata LIKE '%"class_id":"' || ? || '"%'
                OR u.metadata LIKE '%"class_id": "' || ? || '"%'
              );
          `).bind(targetClassId, targetClassId).all();

          const notifSkillMap = { writing: 'Viết', reading: 'Đọc hiểu', speaking: 'Nói' };
          const notifTitle = `📚 BTVN Mới (${notifSkillMap[skill_type]}): ${title}`;
          const notifBody = `Giáo viên ${newAssignment.teacher_name} vừa giao BTVN lớp ${newAssignment.class_name}. Hạn nộp trước ${finalDeadlineTime} ngày ${finalDeadlineDate}.`;

          // Send strictly to verified parents in the target class
          const uniqueParents = [...new Set((linksRes.results || []).map(r => r.parent_user_id).filter(Boolean))];
          for (const parentId of uniqueParents) {
            const notifId = `notif_hw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            await db.prepare(`
              INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
              VALUES (?, 'parent', ?, ?, ?, 'homework', ?);
            `).bind(notifId, parentId, notifTitle, notifBody, assignmentId).run();
          }
        } // end if(targetClassId)

        // Send class-scoped notifications to students in this class (NOT a global NULL broadcast)
        // Codex P1/P2: homework for a specific class must NOT broadcast to all students system-wide
        if (targetClassId) {
          const studentRes = await db.prepare(`
            SELECT id FROM users
            WHERE role = 'student'
              AND (metadata LIKE '%"class_id":"' || ? || '"%'
                   OR metadata LIKE '%"class_id": "' || ? || '"%');
          `).bind(targetClassId, targetClassId).all();
          const classStudents = (studentRes.results || []).map(r => r.id).filter(Boolean);
          for (const studentId of classStudents) {
            const notifIdStudent = `notif_hw_s_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            await db.prepare(`
              INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
              VALUES (?, 'student', ?, ?, ?, 'homework', ?);
            `).bind(notifIdStudent, studentId, `📚 BTVN Mới: ${title}`, `Giáo viên ${newAssignment.teacher_name} vừa giao BTVN lớp ${newAssignment.class_name}.`, assignmentId).run();
          }
        }

        // Log to activity stream
        const streamId = `stm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.prepare(`
          INSERT INTO location_activity_streams (id, campus_id, actor_id, actor_name, actor_role, activity_type, title, detail, reference_id)
          VALUES (?, ?, ?, ?, 'teacher', 'homework_assigned', ?, ?, ?);
        `).bind(
          streamId, campus_id, user.id, user.name || user.username,
          `Giao BTVN: ${title}`,
          `Lớp ${class_name}`,
          assignmentId
        ).run();

      } catch (e) {
        console.error('Failed to save assignment to D1:', e);
      }
    }

    inMemoryAssignments.unshift(newAssignment);
    return json({ success: true, message: 'Đã giao bài tập về nhà thành công!', assignment: newAssignment });
  }

  // ACTION 2: SUBMIT HOMEWORK (Student)
  if (action === 'submit') {
    const { assignment_id, submission_type, content_text, audio_url, handwritten_image_url, attachments_json = '[]' } = body;
    if (!assignment_id || !submission_type) {
      return json({ success: false, error: 'Thiếu assignment_id hoặc submission_type' }, { status: 400 });
    }

    let assignment = inMemoryAssignments.find(a => a.id === assignment_id);
    if (db) {
      try {
        const d1A = await db.prepare('SELECT * FROM homework_assignments WHERE id = ?').bind(assignment_id).first();
        if (d1A) assignment = d1A;
      } catch {}
    }

    if (!assignment) {
      return json({ success: false, error: 'Bài tập không tồn tại hoặc đã bị xóa' }, { status: 404 });
    }

    // Check deadline
    const deadlineStr = `${assignment.deadline_date}T${assignment.deadline_time}:00`;
    const deadlineTime = new Date(deadlineStr).getTime();
    const nowTime = Date.now();
    const isOnTime = isNaN(deadlineTime) || nowTime <= (deadlineTime + 300000) ? 1 : 0; // 5 min grace period

    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const studentName = user.name || user.username;

    const submissionRecord = {
      id: submissionId,
      assignment_id,
      student_id: user.id,
      student_name: studentName,
      submission_type,
      content_text: content_text || '',
      audio_url: audio_url || null,
      handwritten_image_url: handwritten_image_url || null,
      attachments_json: typeof attachments_json === 'string' ? attachments_json : JSON.stringify(attachments_json),
      submitted_at: new Date().toISOString(),
      is_on_time: isOnTime,
      graded_by_teacher_id: null,
      graded_by_teacher_name: null,
      graded_at: null,
      score: null,
      teacher_feedback: null,
      audio_feedback_url: null,
      stars_awarded: 0,
      star_awarded_reason: null,
      status: 'submitted'
    };

    if (db) {
      try {
        await ensureTables(db);
        await db.prepare(`
          INSERT INTO homework_submissions (
            id, assignment_id, student_id, student_name, submission_type, content_text,
            audio_url, handwritten_image_url, attachments_json, submitted_at, is_on_time, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(assignment_id, student_id) DO UPDATE SET
            submission_type = excluded.submission_type,
            content_text = excluded.content_text,
            audio_url = excluded.audio_url,
            handwritten_image_url = excluded.handwritten_image_url,
            attachments_json = excluded.attachments_json,
            submitted_at = excluded.submitted_at,
            is_on_time = excluded.is_on_time,
            status = 'submitted';
        `).bind(
          submissionRecord.id, submissionRecord.assignment_id, submissionRecord.student_id,
          submissionRecord.student_name, submissionRecord.submission_type, submissionRecord.content_text,
          submissionRecord.audio_url, submissionRecord.handwritten_image_url, submissionRecord.attachments_json,
          submissionRecord.submitted_at, submissionRecord.is_on_time, submissionRecord.status
        ).run();

        // Notify Teacher
        const notifId = `notif_sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.prepare(`
          INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
          VALUES (?, 'teacher', ?, ?, ?, 'homework', ?);
        `).bind(
          notifId, assignment.teacher_id,
          `📝 Học Sinh Nộp Bài: ${studentName}`,
          `Học sinh ${studentName} vừa nộp bài tập '${assignment.title}' (${isOnTime ? 'Đúng hạn' : 'Nộp muộn'}).`,
          assignment_id
        ).run();

        // Stream activity
        const streamId = `stm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.prepare(`
          INSERT INTO location_activity_streams (id, campus_id, actor_id, actor_name, actor_role, activity_type, title, detail, reference_id)
          VALUES (?, ?, ?, ?, 'student', 'homework_submitted', ?, ?, ?);
        `).bind(
          streamId, assignment.campus_id || 'loc_codung', user.id, studentName,
          `Học sinh ${studentName} nộp bài ${assignment.title}`,
          `Kỹ năng: ${submission_type} • Trạng thái: ${isOnTime ? 'Đúng hạn' : 'Nộp muộn'}`,
          submissionId
        ).run();

      } catch (e) {
        console.error('Failed to save submission to D1:', e);
      }
    }

    // In-memory update
    const existingIdx = inMemorySubmissions.findIndex(s => s.assignment_id === assignment_id && s.student_id === user.id);
    if (existingIdx >= 0) {
      inMemorySubmissions[existingIdx] = submissionRecord;
    } else {
      inMemorySubmissions.unshift(submissionRecord);
    }

    return json({
      success: true,
      message: isOnTime ? 'Nộp bài thành công đúng hạn! Hãy chờ cô giáo chấm điểm nhé.' : 'Đã nộp bài (Nộp muộn hơn deadline). Hãy cố gắng nộp đúng hạn vào buổi tới con nhé!',
      submission: submissionRecord
    });
  }

  // ACTION 3: GRADE HOMEWORK (Teacher / Staff only)
  if (action === 'grade') {
    if (!isStaff) {
      return json({ success: false, error: 'Forbidden: Chỉ giáo viên mới có quyền chấm điểm BTVN' }, { status: 403 });
    }

    const { submission_id, score, teacher_feedback, audio_feedback_url } = body;
    if (!submission_id || score === undefined || score === null) {
      return json({ success: false, error: 'Thiếu submission_id hoặc score' }, { status: 400 });
    }

    const numericScore = Math.max(0, Math.min(10.0, Number(score)));
    let submission = inMemorySubmissions.find(s => s.id === submission_id);

    if (db) {
      try {
        const d1S = await db.prepare('SELECT * FROM homework_submissions WHERE id = ?').bind(submission_id).first();
        if (d1S) submission = d1S;
      } catch {}
    }

    if (!submission) {
      return json({ success: false, error: 'Không tìm thấy bài nộp' }, { status: 404 });
    }

    // Star calculation rule:
    // score == 10.0 AND is_on_time == 1 -> 100 stars
    // score >= 8.5 AND is_on_time == 1 -> 50 stars
    // otherwise 0 stars
    let starsAwarded = 0;
    let starReason = '';

    if (submission.is_on_time === 1) {
      if (numericScore >= 10.0) {
        starsAwarded = 100;
        starReason = 'Thưởng đạt điểm tuyệt đối 10/10 & nộp bài đúng hạn';
      } else if (numericScore >= 8.5) {
        starsAwarded = 50;
        starReason = 'Thưởng đạt điểm giỏi (>=8.5) & nộp bài đúng hạn';
      }
    }

    const gradedAt = new Date().toISOString();
    const teacherName = user.name || user.username;

    if (db) {
      try {
        await ensureTables(db);
        await db.prepare(`
          UPDATE homework_submissions 
          SET graded_by_teacher_id = ?,
              graded_by_teacher_name = ?,
              graded_at = ?,
              score = ?,
              teacher_feedback = ?,
              audio_feedback_url = ?,
              stars_awarded = ?,
              star_awarded_reason = ?,
              status = 'graded'
          WHERE id = ?;
        `).bind(
          user.id, teacherName, gradedAt, numericScore, teacher_feedback || '',
          audio_feedback_url || null, starsAwarded, starReason || null, submission_id
        ).run();

        // If stars awarded > 0, credit to student_stars
        if (starsAwarded > 0) {
          await db.prepare(`
            INSERT INTO student_stars (student_id, stars_balance, total_earned_stars, stars_redeemed, last_updated)
            VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
            ON CONFLICT(student_id) DO UPDATE SET
              stars_balance = stars_balance + excluded.stars_balance,
              total_earned_stars = total_earned_stars + excluded.total_earned_stars,
              last_updated = CURRENT_TIMESTAMP;
          `).bind(submission.student_id, starsAwarded, starsAwarded).run();
        }

        // Notify Student
        const notifStudentId = `notif_grade_s_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.prepare(`
          INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
          VALUES (?, 'student', ?, ?, ?, 'homework', ?);
        `).bind(
          notifStudentId, submission.student_id,
          `⭐ Kết Quả Chấm BTVN: ${numericScore} Điểm!`,
          `Cô ${teacherName} đã chấm bài tập của em: ${numericScore}/10 điểm. ${starsAwarded > 0 ? `Em được thưởng +${starsAwarded} sao! ` : ''}Lời cô: ${teacher_feedback || 'Rất đáng khen!'}`,
          submission_id
        ).run();

        // Notify Parent of this student - ONLY if verified
        const parentLinks = await db.prepare(`
          SELECT parent_user_id 
          FROM parent_student_links 
          WHERE student_user_id = ? AND verification_status = 'verified';
        `).bind(submission.student_id).all();

        for (const p of (parentLinks.results || [])) {
          if (!p.parent_user_id) continue;
          const notifParentId = `notif_grade_p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await db.prepare(`
            INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
            VALUES (?, 'parent', ?, ?, ?, 'homework', ?);
          `).bind(
            notifParentId, p.parent_user_id,
            `📊 Báo Cáo Học Tập: Bé ${submission.student_name} đạt ${numericScore} Điểm`,
            `Cô giáo ${teacherName} vừa chấm BTVN của bé ${submission.student_name}: Điểm số ${numericScore}/10.${starsAwarded > 0 ? ` Bé nhận thêm +${starsAwarded} sao tích lũy học phí!` : ''} Nhận xét: "${teacher_feedback || 'Bé làm bài rất tốt.'}"`,
            submission_id
          ).run();
        }

      } catch (e) {
        console.error('Failed to grade submission in D1:', e);
      }
    }

    // In-memory update
    submission.graded_by_teacher_id = user.id;
    submission.graded_by_teacher_name = teacherName;
    submission.graded_at = gradedAt;
    submission.score = numericScore;
    submission.teacher_feedback = teacher_feedback || '';
    submission.audio_feedback_url = audio_feedback_url || null;
    submission.stars_awarded = starsAwarded;
    submission.star_awarded_reason = starReason;
    submission.status = 'graded';

    return json({
      success: true,
      message: `Đã chấm bài thành công: ${numericScore} điểm ${starsAwarded > 0 ? `(+${starsAwarded} sao thưởng)` : ''}`,
      submission
    });
  }

  return json({ success: false, error: `Hành động không hợp lệ: '${action}'` }, { status: 400 });
}
